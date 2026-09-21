import { describe, expect, it } from 'vitest'
import {
  QUICK_MOTION_OPTIONS,
  applyQuickDimensionParameters,
  opacityForQuickEnergy,
} from '../../../src/renderer/src/domain/quickDimensions'
import { PARAM_META } from '../../../src/renderer/src/domain/paramMeta'

describe('domain/quickDimensions applyQuickDimensionParameters (R147 P1)', () => {
  it('motion: surge writes speed/scanSpeed/wind plus the _quickMotion marker', () => {
    const out = applyQuickDimensionParameters({ speed: 0.1, scanSpeed: 0.2, wind: 0 }, 'motion', 'surge')
    expect(out._quickMotion).toBe('surge')
    expect(out.speed).toBe(1.15)
    expect(out.scanSpeed).toBe(2.15)
    expect(out.wind).toBe(0.28)
  })

  it('motion: params the layer does not have are NOT invented', () => {
    const out = applyQuickDimensionParameters({ speed: 0.1 }, 'motion', 'slow')
    expect(out.speed).toBe(0.18)
    expect('scanSpeed' in out).toBe(false)
    expect('wind' in out).toBe(false)
  })

  it('motion: unknown option falls back to the flow defaults', () => {
    const out = applyQuickDimensionParameters({ speed: 0, scanSpeed: 0, wind: 0 }, 'motion', 'warp')
    expect(out.speed).toBe(0.38)
    expect(out.scanSpeed).toBe(1.0)
  })

  it('energy: vivid drives intensity and the derived brightness/shimmer', () => {
    const out = applyQuickDimensionParameters(
      { intensity: 0.1, baseBrightness: 0.1, shimmerIntensity: 0.1, sparks: 0 }, 'energy', 'vivid'
    )
    expect(out.intensity).toBe(0.88)
    expect(out.baseBrightness).toBeCloseTo(Math.max(0.08, 0.88 * 0.22))
    expect(out.shimmerIntensity).toBeCloseTo(Math.min(1, 0.88 * 0.72))
    expect(out._quickEnergy).toBe('vivid')
  })

  it('detail: dense writes the density family', () => {
    const out = applyQuickDimensionParameters(
      { density: 0, frequency: 1, spread: 0, gridDensity: 0, scanWidth: 0, colorSpread: 0, glitchAmount: 0, particleIntensity: 0 },
      'detail', 'dense'
    )
    expect(out.density).toBe(0.90)
    expect(out.frequency).toBe(8.0)
    expect(out.particleIntensity).toBeCloseTo(Math.max(0.35, 0.9 * 1.35))
  })

  it('palette: cool writes hues, #colors (incl. textColor following color)', () => {
    const out = applyQuickDimensionParameters(
      { hueShift: 0, baseHue: 0, color: '#000000', textColor: '#000000', colorLow: '#000000', colorHigh: '#000000' },
      'palette', 'cool'
    )
    expect(out.hueShift).toBe(190)
    expect(out.baseHue).toBe(182)
    expect(out.color).toBe('#38bdf8')
    expect(out.textColor).toBe('#38bdf8')
    expect(out.colorLow).toBe('#14f1ff')
    expect(out.colorHigh).toBe('#7c3cff')
  })

  it('exposes the four motion options in display order', () => {
    expect(QUICK_MOTION_OPTIONS.map((o) => o.id)).toEqual(['slow', 'flow', 'active', 'surge'])
  })
})

describe('domain/quickDimensions opacityForQuickEnergy (R147 P1)', () => {
  it('maps each energy option to its opacity', () => {
    expect(opacityForQuickEnergy('soft')).toBe(0.46)
    expect(opacityForQuickEnergy('balanced')).toBe(0.68)
    expect(opacityForQuickEnergy('vivid')).toBe(0.86)
    expect(opacityForQuickEnergy('max')).toBe(1.0)
    expect(opacityForQuickEnergy('anything-else')).toBe(0.68)
  })
})

describe('domain/paramMeta PARAM_META integrity (R147 P1)', () => {
  it('every entry has a sane range and step', () => {
    for (const [name, meta] of Object.entries(PARAM_META)) {
      expect(meta.min, `${name}.min`).toBeLessThan(meta.max)
      expect(meta.step, `${name}.step`).toBeGreaterThan(0)
    }
  })

  it('carries the key tunable params used across effects', () => {
    for (const key of ['speed', 'intensity', 'hueShift', 'angle', 'scanSpeed', 'density', 'textScale']) {
      expect(PARAM_META[key], key).toBeDefined()
    }
  })
})
