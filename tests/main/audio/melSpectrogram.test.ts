import { describe, it, expect } from 'vitest'
import { astMelSpectrogram, AST_MEL_MEAN, AST_MEL_STD, buildMelFilterBank, MEL_FRAMES, MEL_BINS } from '../../../src/main/audio/melSpectrogram'

const SR = 16000

describe('astMelSpectrogram (R90 P1)', () => {
  it('outputs [1024*128] finite values for a valid signal', () => {
    const pcm = new Float32Array(SR) // 1s of silence
    const out = astMelSpectrogram(pcm, SR)
    expect(out.length).toBe(MEL_FRAMES * MEL_BINS)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('silence: real frames normalize from log(1e-6); pad frames are norm(0) (post-log zero fill)', { timeout: 20000 }, () => {
    // 20s timeout: pure-JS FFT starves under full-suite parallel workers (passes in <1s alone)
    const out = astMelSpectrogram(new Float32Array(SR / 2), SR)
    const realFrame = (Math.log(1e-6) - AST_MEL_MEAN) / (AST_MEL_STD * 2)
    const padFrame = (0 - AST_MEL_MEAN) / (AST_MEL_STD * 2)
    // 0.5s → 29 full frames (kaldi snip_edges), the rest are zero-padded
    const fullFrames = 1 + Math.floor((SR / 2 - 400) / 160)
    for (let f = 0; f < fullFrames; f++) {
      for (let b = 0; b < 128; b++) expect(Math.abs(out[f * 128 + b] - realFrame)).toBeLessThan(1e-4)
    }
    for (let f = fullFrames; f < 1024; f++) {
      expect(Math.abs(out[f * 128] - padFrame)).toBeLessThan(1e-4)
    }
  })

  it('a 440Hz tone concentrates energy in low mel bands, not high ones', { timeout: 20000 }, () => {
    const sec = 2
    const pcm = new Float32Array(SR * sec)
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR)
    const out = astMelSpectrogram(pcm, SR)
    // compare only REAL frames — pad frames are a positive constant that would drown the signal
    const realFrames = 1 + Math.floor((SR * sec - 400) / 160)
    const band = (b0: number, b1: number): number => {
      let s = 0
      for (let f = 0; f < Math.min(realFrames, 100); f++) for (let b = b0; b < b1; b++) s += out[f * MEL_BINS + b]
      return s
    }
    const low = band(0, 40)
    const high = band(88, 128)
    expect(low).toBeGreaterThan(high * 10)
  })

  it('input longer than the 1024-frame window is truncated, not rejected', { timeout: 20000 }, () => {
    const out = astMelSpectrogram(new Float32Array(SR * 5), SR)
    expect(out.length).toBe(MEL_FRAMES * MEL_BINS)
  })

  it('mel filter bank is row-stochastic-ish and correct shape', () => {
    const fb = buildMelFilterBank(128, 512, SR)
    expect(fb.length).toBe(128)
    expect(fb[0].length).toBe(257) // n_fft/2 + 1
    for (const row of fb) expect(row.every((w) => Number.isFinite(w) && w >= 0)).toBe(true)
  })
})
