// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { ENHANCE_PRESETS, clampEnhanceGain, isPlanActive, type EnhancePresetId } from '../../../src/renderer/src/components/video/audioEnhance'

describe('video/audioEnhance (R91.3)', () => {
  it('off is a true bypass: no bands, neutral compressor', () => {
    const off = ENHANCE_PRESETS.off
    expect(off.bands).toHaveLength(0)
    expect(off.compressor.ratio).toBe(1)
    expect(isPlanActive(off)).toBe(false)
  })

  it('movie: gentle 40Hz highpass + 8kHz shelf', () => {
    const m = ENHANCE_PRESETS.movie
    expect(isPlanActive(m)).toBe(true)
    expect(m.bands[0]).toMatchObject({ type: 'highpass', freq: 40 })
    expect(m.bands[1]).toMatchObject({ type: 'highshelf', freq: 8000, gain: 2 })
    expect(m.compressor.ratio).toBe(1) // no compression
  })

  it('dialog: 100Hz rumble cut + ~2.8kHz presence boost + light compression', () => {
    const d = ENHANCE_PRESETS.dialog
    expect(d.bands[0]).toMatchObject({ type: 'highpass', freq: 100 })
    expect(d.bands[1]).toMatchObject({ type: 'peaking', freq: 2800, gain: 4.5 })
    expect(d.compressor.ratio).toBeGreaterThan(1)
    expect(d.compressor.ratio).toBeLessThan(4)
  })

  it('night: dialog filtering + heavy compression (loud scenes tamed)', () => {
    const n = ENHANCE_PRESETS.night
    expect(n.compressor.ratio).toBeGreaterThanOrEqual(6)
    expect(n.compressor.threshold).toBeLessThanOrEqual(-35)
  })

  it('every preset id resolves and gain clamps to ±12dB', () => {
    for (const id of ['off', 'movie', 'dialog', 'night'] as EnhancePresetId[]) {
      expect(ENHANCE_PRESETS[id]).toBeDefined()
    }
    expect(clampEnhanceGain(0)).toBe(0)
    expect(clampEnhanceGain(99)).toBe(12)
    expect(clampEnhanceGain(-99)).toBe(-12)
    expect(clampEnhanceGain(6.5)).toBe(6.5)
  })
})
