import { describe, expect, it } from 'vitest'
import { PARAM_META } from '../../../src/renderer/src/domain/paramMeta'

// R147 P1 原位于 quickDimensions.test.ts；R330 quick 维度链删除后独立成文。
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
