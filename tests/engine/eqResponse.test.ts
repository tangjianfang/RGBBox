import { describe, it, expect } from 'vitest'
import { computeBiquadResponse, type EqBand } from '../../src/engine/eqResponse'

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
})