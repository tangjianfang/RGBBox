// @vitest-environment happy-dom
/**
 * R269: first batch of DIRECT tests for the engine tick-loop hook
 * (previously zero direct coverage — REVIEW-shell-loop T1 / REVIEW-shared #1
 * both flagged the runtime's most critical piece as untested).
 *
 * Covered behaviours:
 *   1. consumption gating (R42/R43): nobody watching → no worker tick
 *   2. single-flight backpressure: tickPending latched → no new post
 *   3. a normal worker reply clears the gate (loop keeps ticking)
 *   4. worker failures — structured error reply, 'error' event, and silent
 *      death (watchdog) — must reset the gate instead of freezing the
 *      engine forever, with degraded retry throttling after repeated
 *      failures and self-healing on the first successful frame.
 *
 * The worker is faked with a minimal EventTarget-shaped class injected
 * through the hook's existing workerRef seam — no vi.mock of the worker
 * module needed (default behaviour untouched).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useEngineLoop } from '../../../src/renderer/src/hooks/useEngineLoop'
import type {
  WorkerErrorOutput,
  WorkerInput,
  WorkerOutput
} from '../../../src/renderer/src/workers/previewEngineWorker'
import { MetricsCollector } from '../../../src/renderer/src/engine/metricsCollector'
import type { AudioData } from '../../../src/renderer/src/hooks/useAudioAnalyzer'
import type { View } from '../../../src/renderer/src/hooks/tabNavigation'
import type { FrameMetrics, Profile, RgbFrame } from '../../../src/shared/types'

const FPS = 30
/** Mirrors scheduleNext: Math.max(16, floor(1000/fps)) = 33ms at 30fps. */
const HOP_MS = Math.max(16, Math.floor(1000 / FPS))

// ── Fake worker (EventTarget-shaped) ──────────────────────────────────────

type FakeListener = (e: { data?: unknown; message?: string }) => void

class FakeWorker {
  readonly posted: Array<{ msg: WorkerInput; transfer?: Transferable[] }> = []
  private readonly listeners = new Map<string, Set<FakeListener>>()

  addEventListener(type: string, listener: FakeListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  postMessage(msg: WorkerInput, transfer?: Transferable[]): void {
    this.posted.push({ msg, transfer })
  }

  /** Simulates the worker replying with a rendered frame. */
  reply(output: WorkerOutput): void {
    this.emit('message', { data: output })
  }

  /** Simulates the worker's R269 catch path replying with an error. */
  replyError(message: string): void {
    const output: WorkerErrorOutput = { type: 'error', message }
    this.emit('message', { data: output })
  }

  /** Simulates a hard worker crash ('error' event on the Worker object). */
  emitError(message: string): void {
    this.emit('error', { message })
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0
  }

  private emit(type: string, event: { data?: unknown; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeProfile(): Profile {
  return {
    id: 'p1',
    name: 'loop-test',
    activeSceneId: 's1',
    performanceMode: 'balanced',
    sampling: {
      columns: 8,
      rows: 4,
      fps: FPS,
      smoothing: 0,
      brightnessLimit: 1,
      saturationBoost: 1,
      usePerformanceGuard: false,
      showGap: false
    },
    scenes: [
      {
        id: 's1',
        name: 'Scene',
        displayIds: [],
        layers: [
          {
            id: 'L1',
            name: 'Layer',
            kind: 'breathing',
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            parameters: {}
          }
        ]
      }
    ]
  }
}

function makeFrame(): RgbFrame {
  return {
    columns: 8,
    rows: 4,
    pixels: new Uint8ClampedArray(8 * 4 * 3).fill(200),
    generatedAt: 1234
  }
}

function makeMetrics(): FrameMetrics {
  return {
    timestamp: Date.now(),
    workerProcessMs: 1,
    textMaskMs: 0,
    renderMs: 1,
    captureMs: 0,
    roundTripMs: 2,
    outputMs: 0,
    droppedTicks: 0
  }
}

type EngineLoopArgs = Parameters<typeof useEngineLoop>[0]

function renderEngineLoop(overrides: Partial<EngineLoopArgs> = {}) {
  const worker = new FakeWorker()
  const profile = makeProfile()
  const audio: AudioData = {
    active: false,
    bass: 0,
    mid: 0,
    high: 0,
    level: 0,
    beat: 0,
    freqBands: new Array(32).fill(0)
  }
  const args: EngineLoopArgs = {
    profile,
    running: true,
    workerRef: { current: worker as unknown as Worker },
    engineConfigRef: {
      current: {
        profile,
        selectedLayerId: 'L1',
        automationEnabled: false,
        automationMode: 'sine',
        automatedParams: [],
        previewOverride: null
      }
    },
    audioRef: { current: audio },
    overlayIdsRef: { current: [] },
    overlayConfigsRef: { current: {} },
    topologyRef: { current: null },
    activeViewRef: { current: 'workspace' as View },
    windowVisibleRef: { current: true },
    frameRef: { current: null },
    ledColorsRef: { current: new Uint8Array(0) },
    metricsCollectorRef: { current: new MetricsCollector() },
    rippleBurstRef: { current: null },
    ...overrides
  }
  const rendered = renderHook((p: EngineLoopArgs) => useEngineLoop(p), { initialProps: args })
  return { worker, args, ...rendered }
}

/** Advances the fake clock by exactly one tick hop (flushing microtasks). */
async function tickOnce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(HOP_MS + 1)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('renderer/hooks/useEngineLoop', () => {
  beforeEach(() => {
    // 'performance' is faked explicitly: the R269 degrade cooldown compares
    // performance.now() stamps, which must advance with the fake clock.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance']
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  // ── 1. consumption gating (R42/R43) ─────────────────────────────────────

  it('ticks the worker when the workspace preview is visible', async () => {
    const { worker } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted.length).toBeGreaterThanOrEqual(1)
    expect(worker.posted[0].msg.profile).toBeDefined()
  })

  it('does not tick when the window is hidden and no overlay consumes frames', async () => {
    const { worker } = renderEngineLoop({ windowVisibleRef: { current: false } })
    await act(async () => {
      vi.advanceTimersByTime(HOP_MS * 20)
    })
    expect(worker.posted).toHaveLength(0)
  })

  it('does not tick when the active view is not the workspace and no overlay is open', async () => {
    const { worker } = renderEngineLoop({ activeViewRef: { current: 'effects' as View } })
    await act(async () => {
      vi.advanceTimersByTime(HOP_MS * 20)
    })
    expect(worker.posted).toHaveLength(0)
  })

  it('does not tick while not running (effect never arms the loop)', async () => {
    const { worker } = renderEngineLoop({ running: false })
    await act(async () => {
      vi.advanceTimersByTime(HOP_MS * 20)
    })
    expect(worker.posted).toHaveLength(0)
  })

  it('keeps ticking for overlays even when the main window is hidden (R38)', async () => {
    const { worker } = renderEngineLoop({
      windowVisibleRef: { current: false },
      overlayIdsRef: { current: [7] }
    })
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
  })

  // ── 2. single-flight backpressure ───────────────────────────────────────

  it('posts at most one in-flight tick while no reply has arrived', async () => {
    const { worker } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
    // No reply: every further hop must be dropped (backpressure), not posted.
    await act(async () => {
      vi.advanceTimersByTime(HOP_MS * 10)
    })
    expect(worker.posted).toHaveLength(1)
  })

  // ── 3. normal reply clears the gate ─────────────────────────────────────

  it('clears the gate on a normal worker reply and stores the frame in refs', async () => {
    const { worker, args } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
    act(() => {
      worker.reply({ frame: makeFrame(), metrics: makeMetrics() })
    })
    expect(args.frameRef.current).not.toBeNull()
    expect(args.frameRef.current?.columns).toBe(8)
    expect(args.ledColorsRef.current).toHaveLength(8 * 4 * 3)
    // Gate cleared → the next hop posts a fresh tick.
    await tickOnce()
    expect(worker.posted).toHaveLength(2)
  })

  // ── 3b. hover previewOverride reaches the worker (R164.2 S2) ────────────

  it('applies the hover previewOverride to the profile sent to the worker', async () => {
    const { worker, args } = renderEngineLoop()
    args.engineConfigRef.current.previewOverride = { kind: 'rainbow', parameters: { speed: 9 } }
    await tickOnce()
    const sent = worker.posted[0].msg.profile
    const layer = sent.scenes[0].layers.find((l) => l.id === 'L1')
    expect(layer?.kind).toBe('rainbow')
    expect(layer?.parameters.speed).toBe(9)
    // Only the selected layer is swapped; the rest of the profile is intact.
    expect(sent.sampling.fps).toBe(FPS)
  })

  // ── 4. worker failures must not freeze the loop (R269) ──────────────────

  it('resets the gate when the worker replies with a structured error message', async () => {
    const { worker, args } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
    act(() => {
      worker.replyError('renderPreviewFrame exploded')
    })
    // An error reply carries no frame — nothing may enter the frame refs.
    expect(args.frameRef.current).toBeNull()
    // ...but it IS a reply: the gate must reset and the loop must continue.
    await tickOnce()
    expect(worker.posted).toHaveLength(2)
  })

  it('resets the gate when the worker fires an error event (hard crash)', async () => {
    const { worker } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
    act(() => {
      worker.emitError('Uncaught TypeError in worker')
    })
    await tickOnce()
    expect(worker.posted).toHaveLength(2)
  })

  it('resets the gate via the watchdog when the worker silently never replies', async () => {
    const { worker } = renderEngineLoop()
    await tickOnce()
    expect(worker.posted).toHaveLength(1)
    // Silence for longer than the reply watchdog → forced gate reset.
    await act(async () => {
      vi.advanceTimersByTime(2000 + HOP_MS * 2)
    })
    expect(worker.posted.length).toBeGreaterThanOrEqual(2)
  })

  it('throttles retries after repeated failures and self-heals on success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { worker } = renderEngineLoop()
      // Three consecutive failed cycles (post → error reply) enter degrade mode.
      for (let i = 0; i < 3; i++) {
        await tickOnce()
        expect(worker.posted).toHaveLength(i + 1)
        act(() => {
          worker.replyError('poison profile')
        })
      }
      // Degraded: within the retry cooldown window, hops post NOTHING
      // (instead of spamming the failing worker at full FPS).
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(worker.posted).toHaveLength(3)
      // After the cooldown elapses, exactly one retry goes out…
      await act(async () => {
        vi.advanceTimersByTime(1100)
      })
      expect(worker.posted).toHaveLength(4)
      // …and keeps throttling until a reply succeeds.
      await act(async () => {
        vi.advanceTimersByTime(500)
      })
      expect(worker.posted).toHaveLength(4)
      // First successful frame clears the degrade flag: full cadence resumes.
      act(() => {
        worker.reply({ frame: makeFrame(), metrics: makeMetrics() })
      })
      await tickOnce()
      expect(worker.posted).toHaveLength(5)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('removes both message and error listeners on teardown', async () => {
    const { worker, unmount } = renderEngineLoop()
    await tickOnce()
    expect(worker.listenerCount('message')).toBe(1)
    expect(worker.listenerCount('error')).toBe(1)
    unmount()
    expect(worker.listenerCount('message')).toBe(0)
    expect(worker.listenerCount('error')).toBe(0)
  })
})
