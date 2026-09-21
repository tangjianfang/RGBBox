// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioAnalyzer, type AudioData } from '../../../src/renderer/src/hooks/useAudioAnalyzer'

// ─── mocks ──────────────────────────────────────────────────────────────────
// Provide a controllable AudioContext + MediaStream + getUserMedia so the
// hook can run deterministically without real audio hardware.

class FakeAnalyser {
  public fftSize = 2048
  public smoothingTimeConstant = 0.45
  public frequencyBinCount = 1024
  // Latest values to emit on next getByteFrequencyData call
  public nextValues: number[] | null = null

  getByteFrequencyData(arr: Uint8Array) {
    if (this.nextValues) {
      for (let i = 0; i < arr.length; i++) arr[i] = this.nextValues[i] ?? 0
    } else {
      arr.fill(0)
    }
  }

  connect() { /* noop */ }
}

class FakeMediaStreamSource {
  public mediaStream: MediaStream
  constructor(stream: MediaStream) { this.mediaStream = stream }
  connect(analyser: FakeAnalyser) { analyser.connect() }
}

class FakeAudioContext {
  /** Last instance created — lets tests inject spectrum data into the exact
   * analyser the hook is actually running on. */
  static last: FakeAudioContext | null = null
  public sampleRate = 44100
  public state: 'running' | 'closed' = 'running'
  public analyser: FakeAnalyser = new FakeAnalyser()
  constructor() { FakeAudioContext.last = this }
  createMediaStreamSource(stream: MediaStream) {
    return new FakeMediaStreamSource(stream)
  }
  createAnalyser() { return this.analyser }
  close() { this.state = 'closed'; return Promise.resolve() }
}

const fakeStream = (): MediaStream => {
  const tracks: any[] = [{ stop: vi.fn() }]
  return { getTracks: () => tracks, getVideoTracks: () => [], removeTrack: vi.fn() } as any
}

const settle = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

beforeEach(() => {
  FakeAudioContext.last = null
  // happy-dom doesn't ship AudioContext by default
  ;(globalThis as any).AudioContext = FakeAudioContext
  ;(globalThis as any).navigator = {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(fakeStream()),
      enumerateDevices: vi.fn().mockResolvedValue([])
    }
  }
  ;(globalThis as any).window.rgbbox = {
    getDesktopAudioSourceId: vi.fn().mockResolvedValue(null)
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('renderer/hooks/useAudioAnalyzer (R147 P2 dual-channel)', () => {
  it('returns INACTIVE ref + inactive status when disabled', () => {
    const { result } = renderHook(() => useAudioAnalyzer(false))
    expect(result.current.status.active).toBe(false)
    const d = result.current.ref.current
    expect(d.bass).toBe(0)
    expect(d.mid).toBe(0)
    expect(d.high).toBe(0)
    expect(d.level).toBe(0)
    expect(d.beat).toBe(0)
    expect(d.freqBands).toHaveLength(32)
    expect(d.freqBands.every((v) => v === 0)).toBe(true)
  })

  it('transitions status to active once getUserMedia + first tick fire', async () => {
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await settle(150)
    expect(result.current.status.active).toBe(true)
    expect(result.current.status.error).toBeUndefined()
    expect(result.current.ref.current.freqBands).toHaveLength(32)
    for (const v of result.current.ref.current.freqBands) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('ref carries live analysis values (bass-heavy spectrum → high bass, low high)', async () => {
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await settle(50)
    const ctx = FakeAudioContext.last!
    const arr = new Array(1024).fill(0)
    for (let i = 0; i < 10; i++) arr[i] = 220 // bass region
    ctx.analyser.nextValues = arr
    await settle(100)
    const d: AudioData = result.current.ref.current
    expect(d.active).toBe(true)
    expect(d.bass).toBeGreaterThan(0.5)
    expect(d.high).toBeLessThan(0.05)
  })

  it('subscribe() streams per-tick data and unsubscribes cleanly', async () => {
    const seen: number[] = []
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await settle(50)
    let unsub: (() => void) | null = null
    act(() => { unsub = result.current.subscribe((d) => seen.push(d.bass)) })
    await settle(150)
    expect(unsub!).toBeInstanceOf(Function)
    const countWhileSubscribed = seen.length
    expect(countWhileSubscribed).toBeGreaterThanOrEqual(5) // ~60Hz channel
    unsub!()
    await settle(100)
    expect(seen.length - countWhileSubscribed).toBe(0) // no more deliveries
  })

  it('ZERO React re-renders while analysis data flows (R147 P2 core)', async () => {
    let hookRenders = 0
    const { result } = renderHook(() => {
      hookRenders += 1
      return useAudioAnalyzer(true, '')
    })
    await settle(50)
    const afterActivation = hookRenders
    expect(result.current.status.active).toBe(true)
    // Let ~60Hz data flow for another 250ms — the old implementation
    // re-rendered ~20x/sec for this; the dual-channel one must not re-render.
    await settle(250)
    expect(hookRenders).toBe(afterActivation)
  })

  it('marks error="permission-denied" when getUserMedia throws NotAllowedError', async () => {
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await settle(50)
    expect(result.current.status.error).toBe('permission-denied')
    expect(result.current.status.active).toBe(false)
  })

  it('marks error="source-unavailable" when getDesktopAudioSourceId returns empty', async () => {
    ;(window.rgbbox.getDesktopAudioSourceId as any) = vi.fn().mockResolvedValue(null)
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(
      new Error('source-unavailable')
    )
    const { result } = renderHook(() => useAudioAnalyzer(true, '__system_audio__'))
    await settle(50)
    expect(result.current.status.error).toBe('source-unavailable')
  })

  it('marks error="capture-failed" for any other error', async () => {
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAudioAnalyzer(true, 'mic-1'))
    await settle(50)
    expect(result.current.status.error).toBe('capture-failed')
  })

  it('resets to INACTIVE when toggling enabled from true → false', async () => {
    const { result, rerender } = renderHook(({ en }: { en: boolean }) => useAudioAnalyzer(en, ''), {
      initialProps: { en: true }
    })
    await settle(150)
    expect(result.current.status.active).toBe(true)
    rerender({ en: false })
    expect(result.current.status.active).toBe(false)
    expect(result.current.ref.current.freqBands.every((v) => v === 0)).toBe(true)
  })
})
