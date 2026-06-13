import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Profile, RgbFrame } from '../../../src/shared/types'

// Set up `self` global BEFORE importing the worker module
const mockSelf: any = {
  onmessage: null as ((e: MessageEvent) => void) | null,
  postMessage: vi.fn()
}
;(globalThis as any).self = mockSelf

// Stub the OffscreenCanvas-backed computeTextMask
vi.mock('../../../src/renderer/src/canvasTextMask', () => ({
  computeTextMask: vi.fn(() => new Array(20 * 14).fill(false))
}))

// Import worker module after mocks
const workerModule = await import('../../../src/renderer/src/workers/previewEngineWorker')
type WorkerInput = workerModule.WorkerInput
type WorkerOutput = workerModule.WorkerOutput

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p',
    name: 'P',
    activeSceneId: 's1',
    performanceMode: 'balanced',
    sampling: {
      columns: 20,
      rows: 14,
      fps: 30,
      smoothing: 0,
      brightnessLimit: 1,
      saturationBoost: 1,
      usePerformanceGuard: true,
      showGap: false
    },
    scenes: [
      {
        id: 's1',
        name: 'Scene',
        displayIds: [1],
        layers: [
          {
            id: 'L1',
            name: 'Static',
            kind: 'static',
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            parameters: { color: '#00ff00' }
          }
        ]
      }
    ],
    ...overrides
  }
}

let postedMessages: any[] = []
let postedTransfers: any[] = []

beforeEach(() => {
  postedMessages = []
  postedTransfers = []
  mockSelf.postMessage.mockClear()
  mockSelf.postMessage.mockImplementation((msg: WorkerOutput, transfer: any[]) => {
    postedMessages.push(msg)
    postedTransfers.push(transfer)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('renderer/workers/previewEngineWorker', () => {
  function fireOnMessage(input: WorkerInput): void {
    const handler = mockSelf.onmessage
    expect(handler).toBeTypeOf('function')
    handler({ data: input } as MessageEvent<WorkerInput>)
  }

  it('exposes a handler on self', () => {
    expect((globalThis as any).self.onmessage).toBeTypeOf('function')
  })

  it('posts one output per message', () => {
    fireOnMessage({ profile: makeProfile() })
    expect(postedMessages).toHaveLength(1)
  })

  it('output contains a frame with correct dimensions', () => {
    fireOnMessage({ profile: makeProfile() })
    const out = postedMessages[0]
    expect(out.frame).toBeDefined()
    expect(out.frame.columns).toBe(20)
    expect(out.frame.rows).toBe(14)
    expect(out.frame.pixels).toBeInstanceOf(Uint8ClampedArray)
  })

  it('output contains a metrics object', () => {
    fireOnMessage({ profile: makeProfile() })
    const out = postedMessages[0]
    expect(out.metrics).toBeDefined()
    expect(typeof out.metrics.workerProcessMs).toBe('number')
    expect(typeof out.metrics.renderMs).toBe('number')
    expect(typeof out.metrics.textMaskMs).toBe('number')
    expect(typeof out.metrics.roundTripMs).toBe('number')
  })

  it('transfers the pixel buffer (zero-copy)', () => {
    fireOnMessage({ profile: makeProfile() })
    expect(postedTransfers[0]).toBeDefined()
    expect(postedTransfers[0].length).toBe(1)
    expect(postedTransfers[0][0]).toBeInstanceOf(ArrayBuffer)
  })

  it('preserves previous frame for smoothing across messages', () => {
    // First message
    fireOnMessage({ profile: makeProfile() })
    const firstPixels = postedMessages[0].frame.pixels
    // Second message — the worker should reuse previousFrame internally
    fireOnMessage({ profile: makeProfile() })
    const secondPixels = postedMessages[1].frame.pixels
    // Both should be a full buffer (worker allocated internally)
    expect(firstPixels).toBeInstanceOf(Uint8ClampedArray)
    expect(secondPixels).toBeInstanceOf(Uint8ClampedArray)
  })

  it('uses postedAt to compute roundTripMs when provided', () => {
    const profile = makeProfile()
    profile.sampling.smoothing = 0
    const postedAt = performance.now() - 10
    fireOnMessage({ profile, postedAt })
    const out = postedMessages[0]
    // roundTripMs should be roughly the elapsed time (~10ms)
    expect(out.metrics.roundTripMs).toBeGreaterThanOrEqual(9)
  })

  it('uses captureMs from input when provided', () => {
    fireOnMessage({ profile: makeProfile(), captureMs: 42 })
    expect(postedMessages[0].metrics.captureMs).toBe(42)
  })

  it('uses droppedTicks from input when provided', () => {
    fireOnMessage({ profile: makeProfile(), droppedTicks: 3 })
    expect(postedMessages[0].metrics.droppedTicks).toBe(3)
  })

  it('default droppedTicks=0 when not provided', () => {
    fireOnMessage({ profile: makeProfile() })
    expect(postedMessages[0].metrics.droppedTicks).toBe(0)
  })

  it('default captureMs=0 when not provided', () => {
    fireOnMessage({ profile: makeProfile() })
    expect(postedMessages[0].metrics.captureMs).toBe(0)
  })

  it('falls back to first scene when activeSceneId not found', () => {
    const profile = makeProfile()
    profile.activeSceneId = 'nonexistent'
    fireOnMessage({ profile })
    // Should still produce a frame
    expect(postedMessages).toHaveLength(1)
  })

  it('patches ripple layer parameters when rippleBurst is provided', () => {
    const profile = makeProfile()
    profile.scenes[0].layers = [
      {
        id: 'R1',
        name: 'Ripple',
        kind: 'ripple',
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        parameters: { speed: 1 }
      }
    ]
    fireOnMessage({
      profile,
      rippleBurst: { cx: 0.3, cy: 0.7, burstAge: 0.5 }
    })
    expect(postedMessages[0]).toBeDefined()
  })

  it('does not patch ripple when rippleBurst is omitted', () => {
    const profile = makeProfile()
    profile.scenes[0].layers = [
      {
        id: 'R1',
        name: 'Ripple',
        kind: 'ripple',
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        parameters: { speed: 1 }
      }
    ]
    fireOnMessage({ profile })
    expect(postedMessages[0]).toBeDefined()
  })

  it('passes audioInput to renderPreviewFrame (no crash)', () => {
    fireOnMessage({
      profile: makeProfile(),
      audioInput: { bass: 0.8, mid: 0.5, high: 0.3, beat: 1, freqBands: new Array(32).fill(0.5) }
    })
    expect(postedMessages[0]).toBeDefined()
  })

  it('passes screenSample to renderPreviewFrame (no crash)', () => {
    const screenSample: RgbFrame = {
      columns: 20,
      rows: 14,
      pixels: new Uint8ClampedArray(20 * 14 * 3).fill(128) as Uint8ClampedArray,
      generatedAt: 0
    }
    fireOnMessage({ profile: makeProfile(), screenSample })
    expect(postedMessages[0]).toBeDefined()
  })

  it('processes static-text layer and computes text mask', async () => {
    const { computeTextMask } = await import('../../../src/renderer/src/canvasTextMask')
    const profile = makeProfile()
    profile.scenes[0].layers = [
      {
        id: 'T1',
        name: 'Static Text',
        kind: 'static',
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        parameters: { color: '#ffffff', text: 'Hello', textX: 0.5, textY: 0.5, textScale: 1, textWeight: 400 }
      }
    ]
    fireOnMessage({ profile })
    expect(vi.mocked(computeTextMask)).toHaveBeenCalled()
  })

  it('skips text mask for empty/whitespace text', async () => {
    const { computeTextMask } = await import('../../../src/renderer/src/canvasTextMask')
    const profile = makeProfile()
    profile.scenes[0].layers = [
      {
        id: 'T1',
        name: 'Static Text',
        kind: 'static',
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        parameters: { color: '#ffffff', text: '   ' }
      }
    ]
    fireOnMessage({ profile })
    expect(vi.mocked(computeTextMask)).not.toHaveBeenCalled()
  })

  it('skips text mask for disabled layers', async () => {
    const { computeTextMask } = await import('../../../src/renderer/src/canvasTextMask')
    const profile = makeProfile()
    profile.scenes[0].layers = [
      {
        id: 'T1',
        name: 'Static Text',
        kind: 'static',
        enabled: false,
        opacity: 1,
        blendMode: 'normal',
        parameters: { color: '#ffffff', text: 'Hello' }
      }
    ]
    fireOnMessage({ profile })
    expect(vi.mocked(computeTextMask)).not.toHaveBeenCalled()
  })
})
