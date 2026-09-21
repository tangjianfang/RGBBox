import { describe, expect, it } from 'vitest'
import { effectPresets } from '../../../src/shared/defaultProfile'
import {
  COLOR_PALETTES,
  DEFAULT_FAVORITE_EFFECTS,
  parseStoredEffectKinds,
  parseStoredParameterLocks,
  randomizeLayerParameters,
  randomizeNumberParameter,
} from '../../../src/renderer/src/domain/randomizer'
import type { EffectLayer } from '../../../src/shared/types'

describe('domain/randomizer parseStoredEffectKinds (R147 P1)', () => {
  it('returns the default favorites for null / non-array / broken JSON', () => {
    expect(parseStoredEffectKinds(null)).toEqual(DEFAULT_FAVORITE_EFFECTS)
    expect(parseStoredEffectKinds('{"a":1}')).toEqual(DEFAULT_FAVORITE_EFFECTS)
    expect(parseStoredEffectKinds('not json')).toEqual(DEFAULT_FAVORITE_EFFECTS)
  })

  it('keeps only valid effect kinds, dedupes and caps at 12', () => {
    expect(parseStoredEffectKinds('["rainbow","rainbow","fire"]')).toEqual(['rainbow', 'fire'])
    expect(parseStoredEffectKinds('["rainbow","made-up-kind",42]')).toEqual(['rainbow'])
    const thirteenDistinct = JSON.stringify(effectPresets.slice(0, 13).map((p) => p.kind))
    expect(parseStoredEffectKinds(thirteenDistinct)).toHaveLength(12)
  })
})

describe('domain/randomizer parseStoredParameterLocks (R147 P1)', () => {
  it('parses, filters non-strings and dedupes', () => {
    expect(parseStoredParameterLocks(null)).toEqual([])
    expect(parseStoredParameterLocks('nope')).toEqual([])
    expect(parseStoredParameterLocks('["speed","speed",7,"hueShift"]')).toEqual(['speed', 'hueShift'])
  })
})

describe('domain/randomizer randomizeNumberParameter (R147 P1)', () => {
  it('subtle stays within ±28% span of the current value', () => {
    // speed range 0..2 → span 0.56 around base 1 → [0.44, 1.56]
    for (let i = 0; i < 50; i++) {
      const v = randomizeNumberParameter('speed', 1, 'subtle')
      expect(v).toBeGreaterThanOrEqual(0.44 - 1e-9)
      expect(v).toBeLessThanOrEqual(1.56 + 1e-9)
    }
  })

  it('calm biases speed low and energy biases speed high', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomizeNumberParameter('speed', 1, 'calm')).toBeLessThanOrEqual(0.45 + 1e-9)
      expect(randomizeNumberParameter('speed', 1, 'energy')).toBeGreaterThanOrEqual(0.55 - 1e-9)
    }
  })

  it('bold uses the full param range', () => {
    for (let i = 0; i < 50; i++) {
      const v = randomizeNumberParameter('hueShift', 0, 'bold')
      expect(v).toBeGreaterThanOrEqual(-180)
      expect(v).toBeLessThanOrEqual(180)
    }
  })
})

describe('domain/randomizer randomizeLayerParameters (R147 P1)', () => {
  const layer = {
    id: 'L1', name: 'l1', kind: 'rainbow', enabled: true,
    parameters: { speed: 1, color: '#ffffff', label: 'keep', _secret: 9, flag: true },
    opacity: 1, blendMode: 'normal',
  } as unknown as EffectLayer

  it('never touches underscore-prefixed, locked, plain-string params; numbers reroll in place', () => {
    const out = randomizeLayerParameters(layer, 'subtle', new Set(['color']))
    expect(out._secret).toBe(9) // _ prefix
    expect(out.color).toBe('#ffffff') // locked
    expect(out.label).toBe('keep')
    expect(typeof out.speed).toBe('number')
  })

  it('rerolls #colors from the mode palette', () => {
    const out = randomizeLayerParameters(layer, 'calm', new Set())
    expect(COLOR_PALETTES.calm).toContain(out.color)
  })

  it('only bold may flip booleans', () => {
    expect(randomizeLayerParameters(layer, 'calm', new Set()).flag).toBe(true)
    const flips = [...Array(20)].map(() => randomizeLayerParameters(layer, 'bold', new Set()).flag)
    expect(new Set(flips).size).toBe(2)
  })
})
