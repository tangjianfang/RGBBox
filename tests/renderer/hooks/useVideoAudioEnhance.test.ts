// @vitest-environment happy-dom
// R310f (evolve #12): denoise overload telemetry — the R310d shed stream
// (queue-full errors) surfaces to the user after ≥4 sheds in 10s instead of
// the audio silently fading; non-overload batch errors surface their own
// code; the count decays across windows.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideoAudioEnhance } from '../../../src/renderer/src/components/video/useVideoAudioEnhance'
import { setupRendererMocks } from '../_helpers'

type ErrCb = (payload: { id: number; message: string }) => void
let errSubs: ErrCb[] = []
let framesSubs: Array<(p: { id: number; blocks: Float32Array[] }) => void> = []

beforeEach(() => {
  errSubs = []
  framesSubs = []
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.onDenoiseFramesError = (cb: ErrCb) => { errSubs.push(cb); return () => { errSubs = errSubs.filter((c) => c !== cb) } }
  rgbbox.onDenoiseFrames = (cb: (p: { id: number; blocks: Float32Array[] }) => void) => { framesSubs.push(cb); return () => { framesSubs = framesSubs.filter((c) => c !== cb) } }
  rgbbox.denoiseStart = vi.fn().mockResolvedValue({ ok: true })
  rgbbox.denoiseStop = vi.fn().mockResolvedValue({ ok: true })
  // AudioWorkletNode/ctx not needed for the telemetry path (subscription is
  // mount-level, not enable-level)
})
afterEach(() => { vi.restoreAllMocks() })

function fireErr(message: string): void {
  // wrapped in act so the callback's setState flushes synchronously
  act(() => { for (const cb of [...errSubs]) cb({ id: 1, message }) })
}

describe('video/useVideoAudioEnhance overload telemetry (R310f)', () => {
  it('4 queue-full sheds in one window surface DENOISE_OVERLOAD; 3 do not', async () => {
    const { result } = renderHook(() => useVideoAudioEnhance({ current: null }))
    expect(result.current.denoiseMessage).toBe('')
    fireErr('denoise queue full')
    fireErr('denoise queue full')
    fireErr('denoise queue full')
    expect(result.current.denoiseMessage).toBe('', '3 sheds stay silent')
    fireErr('denoise queue full')
    expect(result.current.denoiseMessage).toBe('DENOISE_OVERLOAD')
  })

  it('non-overload batch errors surface DENOISE_BATCH_ERRORS', () => {
    const { result } = renderHook(() => useVideoAudioEnhance({ current: null }))
    fireErr('denoise queue full'); fireErr('denoise queue full'); fireErr('denoise queue full')
    fireErr('ort shape mismatch')
    expect(result.current.denoiseMessage).toBe('DENOISE_BATCH_ERRORS')
  })

  it('the window decays: 2 sheds + 2 sheds after 10s never cross the threshold', () => {
    const t0 = Date.now()
    const nowSpy = vi.spyOn(Date, 'now')
    const { result } = renderHook(() => useVideoAudioEnhance({ current: null }))
    fireErr('denoise queue full'); fireErr('denoise queue full')
    nowSpy.mockReturnValue(t0 + 11_000)
    fireErr('denoise queue full'); fireErr('denoise queue full')
    expect(result.current.denoiseMessage).toBe('', 'two separate half-windows never trigger')
  })
})
