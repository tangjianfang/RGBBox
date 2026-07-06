import { describe, it, expect } from 'vitest'
import { computeBiquadResponse, logFreqPoints, type EqBand } from '../../src/engine/eqResponse'

const SR = 48000
// 20Hz..20kHz 对数 256 点
const freqs = Array.from({ length: 256 }, (_, i) => 20 * Math.pow(1000, i / 255))

describe('computeBiquadResponse', () => {
  it('flat（gain=0）→ 所有点 0 dB', () => {
    const band: EqBand = { id: 'b1', type: 'peaking', freq: 1000, gain: 0, Q: 1.41 }
    const db = computeBiquadResponse([band], SR, freqs)
    db.forEach(v => expect(Math.abs(v)).toBeLessThan(1e-9))
  })

  it('peaking +6dB @1kHz Q=1.41 → 1kHz 处 ≈ +6dB', () => {
    const band: EqBand = { id: 'b1', type: 'peaking', freq: 1000, gain: 6, Q: 1.41 }
    const db = computeBiquadResponse([band], SR, freqs)
    const idx = freqs.reduce((best, f, i) =>
      Math.abs(f - 1000) < Math.abs(freqs[best] - 1000) ? i : best, 0)
    expect(db[idx]).toBeGreaterThan(5.9)
    expect(db[idx]).toBeLessThan(6.1)
  })

  it('lowshelf +6dB → 20Hz 处 ≈ +6dB，20kHz 处 ≈ 0dB', () => {
    const band: EqBand = { id: 'b1', type: 'lowshelf', freq: 200, gain: 6, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(db[0]).toBeGreaterThan(5.8)
    expect(db[db.length - 1]).toBeLessThan(0.5)
  })

  it('highpass @200Hz Q=0.7 → 20Hz 远低于 -20dB，20kHz ≈ 0dB', () => {
    const band: EqBand = { id: 'b1', type: 'highpass', freq: 200, gain: 0, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(db[0]).toBeLessThan(-20)
    expect(db[db.length - 1]).toBeGreaterThan(-0.5)
  })

  it('notch @50Hz Q=5 → 50Hz 处 ≤ -20dB', () => {
    const band: EqBand = { id: 'b1', type: 'notch', freq: 50, gain: 0, Q: 5 }
    const db = computeBiquadResponse([band], SR, freqs)
    const idx = freqs.reduce((best, f, i) =>
      Math.abs(f - 50) < Math.abs(freqs[best] - 50) ? i : best, 0)
    expect(db[idx]).toBeLessThan(-20)
  })

  it('多段串联 = 各段 dB 之和（peaking +6 @1k 与 +3 @2k → 1k 处 ≈6, 2k 处 ≈3+残余）', () => {
    const bands: EqBand[] = [
      { id: 'b1', type: 'peaking', freq: 1000, gain: 6, Q: 1.41 },
      { id: 'b2', type: 'peaking', freq: 2000, gain: 3, Q: 1.41 },
    ]
    const db = computeBiquadResponse(bands, SR, freqs)
    const idx1k = freqs.reduce((best, f, i) =>
      Math.abs(f - 1000) < Math.abs(freqs[best] - 1000) ? i : best, 0)
    expect(db[idx1k]).toBeGreaterThan(5.5) // 6 为主，2k 段在 1k 残余很小
  })

  it('highshelf +6dB @4kHz → 20kHz 处 ≈ +6dB，20Hz 处 ≈ 0dB', () => {
    const band: EqBand = { id: 'b1', type: 'highshelf', freq: 4000, gain: 6, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(db[db.length - 1]).toBeGreaterThan(5.8)   // 20kHz ≈ +6
    expect(db[0]).toBeLessThan(0.5)                  // 20Hz ≈ 0
  })

  it('bandpass @1kHz Q=1 → 1kHz 处 ≈ 0dB，2kHz 处 ≤ -5dB', () => {
    const band: EqBand = { id: 'b1', type: 'bandpass', freq: 1000, gain: 0, Q: 1 }
    const db = computeBiquadResponse([band], SR, freqs)
    const idx = freqs.reduce((best, f, i) =>
      Math.abs(f - 1000) < Math.abs(freqs[best] - 1000) ? i : best, 0)
    expect(Math.abs(db[idx])).toBeLessThan(1)         // 中心 ≈ 0dB
    const idx2k = freqs.reduce((best, f, i) =>
      Math.abs(f - 2000) < Math.abs(freqs[best] - 2000) ? i : best, 0)
    expect(db[idx2k]).toBeLessThan(-5)               // 2k 衰减
  })

  it('lowpass @200Hz Q=0.7 → 20Hz ≈ 0dB，200Hz ≈ -3dB，20kHz 深衰减', () => {
    const band: EqBand = { id: 'b1', type: 'lowpass', freq: 200, gain: 0, Q: 0.7 }
    const db = computeBiquadResponse([band], SR, freqs)
    expect(Math.abs(db[0])).toBeLessThan(0.5)        // 20Hz 通带
    const idx200 = freqs.reduce((best, f, i) =>
      Math.abs(f - 200) < Math.abs(freqs[best] - 200) ? i : best, 0)
    expect(db[idx200]).toBeLessThan(-2.5)             // 截止 ≈ -3dB
    expect(db[idx200]).toBeGreaterThan(-3.5)
    expect(db[db.length - 1]).toBeLessThan(-20)        // 20kHz 深衰减
  })

  it('logFreqPoints(n) 返回 n 个对数点，端点为 20 与 20000', () => {
    const pts = logFreqPoints(3)
    expect(pts).toHaveLength(3)
    expect(pts[0]).toBeCloseTo(20, 5)
    expect(pts[2]).toBeCloseTo(20000, 3)
    // 中点 ≈ 20 * 1000^0.5 = 632.46
    expect(pts[1]).toBeCloseTo(632.4555, 2)
  })

  it('空 bands → 全 0 dB（UI flat line 基线）', () => {
    const db = computeBiquadResponse([], SR, freqs)
    db.forEach(v => expect(Math.abs(v)).toBeLessThan(1e-9))
  })
})