import { describe, it, expect } from 'vitest'
import { resampleTo16k, synthTestTone, TARGET_RATE } from '../../../src/renderer/src/tools/pcm'

describe('resampleTo16k (R90.9 L1)', () => {
  it('identity when the input is already 16kHz', () => {
    const pcm = new Float32Array([0, 0.25, 0.5, 0.75, 1])
    const out = resampleTo16k(pcm, 16000)
    expect(out.length).toBe(5)
    expect([...out]).toEqual([...pcm])
  })

  it('halves length for 32kHz input and preserves waveform values', () => {
    // 32k ramp 0,1,2,3,... → 16k picks every 2nd sample (integer ratio, no interpolation needed)
    const pcm = new Float32Array([0, 99, 1, 99, 2, 99, 3, 99])
    const out = resampleTo16k(pcm, 32000)
    expect(out.length).toBe(4)
    expect([...out]).toEqual([0, 1, 2, 3])
  })

  it('48kHz sine stays a sine: output length and peak frequency preserved', () => {
    // 440Hz @48k for 1s → 440Hz @16k for 1s; count zero crossings ≈ 2*440
    const sec = 1
    const pcm = new Float32Array(48000 * sec)
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((2 * Math.PI * 440 * i) / 48000)
    const out = resampleTo16k(pcm, 48000)
    expect(out.length).toBe(16000)
    let crossings = 0
    for (let i = 1; i < out.length; i++) {
      if ((out[i - 1] <= 0 && out[i] > 0) || (out[i - 1] >= 0 && out[i] < 0)) crossings++
    }
    // 440 cycles → ~880 crossings; tolerate resampler smoothing
    expect(crossings).toBeGreaterThan(840)
    expect(crossings).toBeLessThan(920)
  })

  it('rejects non-positive rates with a clear error', () => {
    expect(() => resampleTo16k(new Float32Array(10), 0)).toThrow(/rate/i)
  })
})

describe('synthTestTone (R90.9 L1)', () => {
  it('returns the requested duration at the target rate with alternating tone/silence', () => {
    const pcm = synthTestTone(4) // 4s: tone, silence, tone, silence
    expect(pcm.length).toBe(TARGET_RATE * 4)
    const rms = (from: number, to: number): number => {
      let s = 0
      for (let i = from; i < to; i++) s += pcm[i] * pcm[i]
      return Math.sqrt(s / (to - from))
    }
    expect(rms(0, TARGET_RATE)).toBeGreaterThan(0.2)      // 1st second: tone
    expect(rms(TARGET_RATE, TARGET_RATE * 2)).toBeLessThan(0.001) // 2nd: silence
    expect(rms(TARGET_RATE * 2, TARGET_RATE * 3)).toBeGreaterThan(0.2) // 3rd: tone
  })

  it('tone bursts are band-limited to ~440Hz (peak detection)', () => {
    const pcm = synthTestTone(1)
    // zero-crossing count in the first second ≈ 2*440
    let crossings = 0
    for (let i = 1; i < pcm.length; i++) {
      if ((pcm[i - 1] <= 0 && pcm[i] > 0) || (pcm[i - 1] >= 0 && pcm[i] < 0)) crossings++
    }
    expect(crossings).toBeGreaterThan(840)
    expect(crossings).toBeLessThan(920)
  })
})
