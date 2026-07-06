import { describe, it, expect } from 'vitest'
import {
  peakFrequency, rmsLevel, dominantFrequency,
  lufsShortEstimate, estimateBPM,
} from '../../src/engine/audioMetrics'

// 合成正弦 Float32Array（幅度 amp，频率 fHz，采样率 sr，样本数 n）
function sine(amp: number, fHz: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * fHz * i) / sr)
  return out
}

// 由时域正弦合成对应的 Uint8Array 频谱（只在目标 bin 放峰值，其余近 0）
function fakeSpectrum(peakBin: number, bins: number, peakValue = 240): Uint8Array {
  const out = new Uint8Array(bins)
  out[peakBin] = peakValue
  if (peakBin + 1 < bins) out[peakBin + 1] = Math.floor(peakValue * 0.4)
  if (peakBin - 1 >= 0) out[peakBin - 1] = Math.floor(peakValue * 0.4)
  return out
}

describe('peakFrequency', () => {
  it('440Hz 正弦 → 峰值频率约 440Hz', () => {
    const sr = 48000, fft = 2048
    const bin = Math.round((440 * fft) / sr) // ≈19
    const freq = fakeSpectrum(bin, fft / 2)
    const r = peakFrequency(freq, sr, fft)
    expect(r.freqHz).toBeGreaterThan(380)
    expect(r.freqHz).toBeLessThan(500)
    expect(r.db).toBeLessThan(0) // 0..255 → dB 为负
  })
  it('静音 → 频率 0', () => {
    const r = peakFrequency(new Uint8Array(1024), 48000, 2048)
    expect(r.freqHz).toBe(0)
    expect(r.db).toBeLessThanOrEqual(-96)
  })
})

describe('rmsLevel', () => {
  it('幅度 1 的正弦 → RMS ≈ 0.707', () => {
    const x = sine(1, 440, 48000, 4800)
    expect(rmsLevel(x)).toBeCloseTo(1 / Math.SQRT2, 1)
  })
  it('静音 → 0', () => {
    expect(rmsLevel(new Float32Array(100))).toBe(0)
  })
})

describe('dominantFrequency', () => {
  it('单峰频谱 → 主导频率接近该 bin', () => {
    const sr = 48000, fft = 2048
    const bin = Math.round((1000 * fft) / sr) // ≈43
    const freq = fakeSpectrum(bin, fft / 2)
    const f = dominantFrequency(freq, sr, fft)
    expect(f).toBeGreaterThan(900)
    expect(f).toBeLessThan(1100)
  })
})

describe('lufsShortEstimate', () => {
  it('全刻度正弦 → 接近 0 dBFS（允许 -3..0 区间）', () => {
    const x = sine(1, 1000, 48000, 4800)
    const l = lufsShortEstimate(x)
    expect(l).toBeGreaterThan(-3.5)
    expect(l).toBeLessThan(0.5)
  })
  it('静音 → ≤ -60', () => {
    expect(lufsShortEstimate(new Float32Array(4800))).toBeLessThanOrEqual(-60)
  })
  it('rms≈0.001 → 约 -60（floor 钳制单调）', () => {
    // 构造 rms ≈ 0.001 的低幅信号：幅度 sqrt(2)*0.001 的正弦
    const x = sine(Math.SQRT2 * 0.001, 1000, 48000, 4800)
    const l = lufsShortEstimate(x)
    expect(l).toBeGreaterThanOrEqual(-61)
    expect(l).toBeLessThanOrEqual(-59)
  })
})

describe('estimateBPM', () => {
  it('120 BPM 脉冲列（每 0.5s 一个脉冲）→ 约 120', () => {
    const sr = 48000, seconds = 3
    const n = sr * seconds
    const x = new Float32Array(n)
    // 每 0.5s 放一个短脉冲
    for (let t = 0; t < seconds * 1000; t += 500) {
      const start = Math.floor((t / 1000) * sr)
      for (let k = 0; k < 50 && start + k < n; k++) x[start + k] = 0.9
    }
    const bpm = estimateBPM(x, sr)
    // 允许 ±10% 误差（120 BPM 脉冲列 → 期望 120）
    expect(bpm).toBeGreaterThanOrEqual(108)
    expect(bpm).toBeLessThanOrEqual(132)
  })
  it('过短输入（<0.5s）→ 0', () => {
    const x = new Float32Array(12000) // 0.25s @ 48000
    expect(estimateBPM(x, 48000)).toBe(0)
  })
  it('静音 → 0', () => {
    const x = new Float32Array(48000 * 2) // 2s 静音
    expect(estimateBPM(x, 48000)).toBe(0)
  })
})