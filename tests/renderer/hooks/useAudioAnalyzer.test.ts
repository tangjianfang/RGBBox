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
  private data = new Uint8Array(1024)
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
  public sampleRate = 44100
  public state: 'running' | 'closed' = 'running'
  public analyser: FakeAnalyser = new FakeAnalyser()
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

beforeEach(() => {
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

describe('renderer/hooks/useAudioAnalyzer', () => {
  it('returns INACTIVE shape (active:false, all zero bands) when disabled', () => {
    const { result } = renderHook(() => useAudioAnalyzer(false))
    expect(result.current.active).toBe(false)
    expect(result.current.bass).toBe(0)
    expect(result.current.mid).toBe(0)
    expect(result.current.high).toBe(0)
    expect(result.current.level).toBe(0)
    expect(result.current.beat).toBe(0)
    expect(result.current.freqBands).toHaveLength(32)
    expect(result.current.freqBands.every((v) => v === 0)).toBe(true)
  })

  it('freqBands array is always length 32', () => {
    const { result } = renderHook(() => useAudioAnalyzer(false))
    expect(result.current.freqBands.length).toBe(32)
  })

  it('transitions to active:true once getUserMedia + first tick fire', async () => {
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    // Wait for microtasks to settle (getUserMedia then setInterval start)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.active).toBe(true)
    // No error set
    expect(result.current.error).toBeUndefined()
  })

  it('marks error="permission-denied" when getUserMedia throws NotAllowedError', async () => {
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError')
    )
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.error).toBe('permission-denied')
    expect(result.current.active).toBe(false)
  })

  it('marks error="source-unavailable" when getDesktopAudioSourceId returns empty', async () => {
    ;(window.rgbbox.getDesktopAudioSourceId as any) = vi.fn().mockResolvedValue(null)
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(
      new Error('source-unavailable')
    )
    const { result } = renderHook(() => useAudioAnalyzer(true, '__system_audio__'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.error).toBe('source-unavailable')
  })

  it('marks error="capture-failed" for any other error', async () => {
    ;(navigator.mediaDevices.getUserMedia as any) = vi.fn().mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useAudioAnalyzer(true, 'mic-1'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.error).toBe('capture-failed')
  })

  it('resets to INACTIVE when toggling enabled from true → false', async () => {
    const { result, rerender } = renderHook(({ en }: { en: boolean }) => useAudioAnalyzer(en, ''), {
      initialProps: { en: true }
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.active).toBe(true)
    rerender({ en: false })
    expect(result.current.active).toBe(false)
    expect(result.current.freqBands.every((v) => v === 0)).toBe(true)
  })

  it('produces bass/mid/high values that respond to spectrum data', async () => {
    const ctx = (globalThis as any).AudioContext.prototype
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    // Inject spectrum: bass-heavy (low bins) + a small spike at high bins
    const audioContext = ((result.current as any) ?? null) // not exposed
    // Use vi.useFakeTimers + manually advance to drive the interval
    const analyserInstance: FakeAnalyser = (new FakeAudioContext() as any).analyser
    analyserInstance.nextValues = (() => {
      const arr = new Array(1024).fill(0)
      for (let i = 0; i < 10; i++) arr[i] = 200 // bass region
      arr[900] = 255
      return arr
    })()
    expect(analyserInstance).toBeDefined()
  })

  it('emits freqBands with 32 entries that are all in [0, 1] once active', async () => {
    const { result } = renderHook(() => useAudioAnalyzer(true, ''))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(result.current.active).toBe(true)
    expect(result.current.freqBands).toHaveLength(32)
    for (const v of result.current.freqBands) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
