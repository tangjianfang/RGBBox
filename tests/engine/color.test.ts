import { describe, it, expect } from 'vitest'
import {
  adjustSaturationAndContrast,
  applyBrightness,
  clampByte,
  clampUnit,
  hexToRgb,
  hslToRgb,
  lerpColor,
  mixColors,
} from '../../src/engine/color'
import type { RgbColor } from '../../src/shared/types'

describe('engine/color', () => {
  describe('clampByte', () => {
    it.each([-1, 0, 100, 255, 256, 1000, -1000])('clamps %i into [0,255]', (v) => {
      const r = clampByte(v)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(255)
    })

    it('rounds fractional values to nearest int', () => {
      expect(clampByte(127.4)).toBe(127)
      expect(clampByte(127.6)).toBe(128)
      expect(clampByte(0.4)).toBe(0)
      expect(clampByte(0.6)).toBe(1)
    })
  })

  describe('clampUnit', () => {
    it.each([-0.5, 0, 0.5, 1, 1.5])('clamps %f into [0,1]', (v) => {
      const r = clampUnit(v)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    })

    it('preserves precision (no rounding)', () => {
      expect(clampUnit(0.123456789)).toBe(0.123456789)
    })
  })

  describe('hexToRgb', () => {
    it('parses 6-digit hex with #', () => {
      expect(hexToRgb('#ff0000')).toEqual<RgbColor>({ r: 255, g: 0, b: 0 })
      expect(hexToRgb('#00ff00')).toEqual<RgbColor>({ r: 0, g: 255, b: 0 })
      expect(hexToRgb('#0000ff')).toEqual<RgbColor>({ r: 0, g: 0, b: 255 })
    })

    it('parses 6-digit hex without #', () => {
      expect(hexToRgb('ffaa00')).toEqual<RgbColor>({ r: 255, g: 170, b: 0 })
    })

    it('parses uppercase hex', () => {
      expect(hexToRgb('#ABCDEF')).toEqual<RgbColor>({ r: 0xab, g: 0xcd, b: 0xef })
    })

    it('returns white fallback for invalid length', () => {
      const white: RgbColor = { r: 255, g: 255, b: 255 }
      expect(hexToRgb('#fff')).toEqual(white)
      expect(hexToRgb('')).toEqual(white)
      expect(hexToRgb('#')).toEqual(white)
      expect(hexToRgb('#1234567')).toEqual(white)
    })

    it('returns white fallback for non-hex characters', () => {
      expect(hexToRgb('#zzzzzz')).toEqual<RgbColor>({ r: 255, g: 255, b: 255 })
      expect(hexToRgb('xx')).toEqual<RgbColor>({ r: 255, g: 255, b: 255 })
    })
  })

  describe('hslToRgb', () => {
    it('red primary: hue=0 sat=1 light=0.5', () => {
      expect(hslToRgb(0, 1, 0.5)).toEqual<RgbColor>({ r: 255, g: 0, b: 0 })
    })

    it('green primary: hue=120 sat=1 light=0.5', () => {
      expect(hslToRgb(120, 1, 0.5)).toEqual<RgbColor>({ r: 0, g: 255, b: 0 })
    })

    it('blue primary: hue=240 sat=1 light=0.5', () => {
      expect(hslToRgb(240, 1, 0.5)).toEqual<RgbColor>({ r: 0, g: 0, b: 255 })
    })

    it('wraps hue > 360', () => {
      expect(hslToRgb(360, 1, 0.5)).toEqual(hslToRgb(0, 1, 0.5))
      expect(hslToRgb(480, 1, 0.5)).toEqual(hslToRgb(120, 1, 0.5))
    })

    it('wraps negative hue', () => {
      expect(hslToRgb(-120, 1, 0.5)).toEqual(hslToRgb(240, 1, 0.5))
      expect(hslToRgb(-360, 1, 0.5)).toEqual(hslToRgb(0, 1, 0.5))
    })

    it('saturation=0 → grayscale (all channels equal)', () => {
      for (const hue of [0, 60, 120, 180, 240, 300]) {
        const c = hslToRgb(hue, 0, 0.5)
        expect(c.r).toBe(c.g)
        expect(c.g).toBe(c.b)
      }
    })

    it('returns channels in [0,255] for arbitrary inputs', () => {
      const inputs: Array<[number, number, number]> = [
        [45, 0.3, 0.4],
        [200, 0.8, 0.7],
        [333, 0.5, 0.2],
      ]
      for (const [h, s, l] of inputs) {
        const c = hslToRgb(h, s, l)
        for (const k of ['r', 'g', 'b'] as const) {
          expect(c[k]).toBeGreaterThanOrEqual(0)
          expect(c[k]).toBeLessThanOrEqual(255)
        }
      }
    })
  })

  describe('mixColors', () => {
    const red: RgbColor = { r: 255, g: 0, b: 0 }
    const blue: RgbColor = { r: 0, g: 0, b: 255 }

    it('opacity=0, normal → base unchanged', () => {
      expect(mixColors(red, blue, 0, 'normal')).toEqual(red)
    })

    it('opacity=1, normal → overlay wins', () => {
      expect(mixColors(red, blue, 1, 'normal')).toEqual(blue)
    })

    it('add mode adds channels', () => {
      expect(mixColors(red, blue, 1, 'add')).toEqual<RgbColor>({ r: 255, g: 0, b: 255 })
    })

    it('multiply mode multiplies channels', () => {
      expect(mixColors(red, blue, 1, 'multiply')).toEqual<RgbColor>({ r: 0, g: 0, b: 0 })
      expect(mixColors({ r: 255, g: 128, b: 64 }, { r: 128, g: 128, b: 128 }, 1, 'multiply')).toEqual<RgbColor>({
        r: 128,
        g: 64,
        b: 32,
      })
    })

    it('screen mode inverts-multiplies-inverts', () => {
      expect(mixColors(red, blue, 1, 'screen')).toEqual<RgbColor>({ r: 255, g: 0, b: 255 })
    })

    it('clamps to 255 in add mode', () => {
      const result = mixColors({ r: 200, g: 100, b: 50 }, { r: 100, g: 200, b: 50 }, 1, 'add')
      expect(result.r).toBe(255)
      expect(result.g).toBe(255)
      expect(result.b).toBe(100)
    })

    it('unknown blend mode falls back to normal', () => {
      expect(mixColors(red, blue, 1, 'unknown' as 'normal')).toEqual(blue)
    })
  })

  describe('applyBrightness', () => {
    it('gain=1 → pass-through', () => {
      expect(applyBrightness({ r: 100, g: 150, b: 200 }, 1)).toEqual<RgbColor>({ r: 100, g: 150, b: 200 })
    })

    it('gain=0.5 → dim', () => {
      expect(applyBrightness({ r: 200, g: 200, b: 200 }, 0.5)).toEqual<RgbColor>({ r: 100, g: 100, b: 100 })
    })

    it('gain=2 → amplify + clamp to 255', () => {
      expect(applyBrightness({ r: 200, g: 200, b: 200 }, 2)).toEqual<RgbColor>({ r: 255, g: 255, b: 255 })
    })

    it('gain=0 → all black', () => {
      expect(applyBrightness({ r: 100, g: 200, b: 50 }, 0)).toEqual<RgbColor>({ r: 0, g: 0, b: 0 })
    })
  })

  describe('adjustSaturationAndContrast', () => {
    it('grey with sat=1 contrast=1 is identity (within rounding)', () => {
      const c = adjustSaturationAndContrast({ r: 128, g: 128, b: 128 }, 1, 1)
      expect(c.r).toBe(128)
      expect(c.g).toBe(128)
      expect(c.b).toBe(128)
    })

    it('sat=0 → grayscale using luminance', () => {
      const c = adjustSaturationAndContrast({ r: 255, g: 0, b: 0 }, 0, 1)
      // luminance = 255 * 0.2126 = 54.213 → 54
      expect(c.r).toBe(54)
      expect(c.g).toBe(54)
      expect(c.b).toBe(54)
    })

    it('contrast=0 → mid-grey (128)', () => {
      const c = adjustSaturationAndContrast({ r: 200, g: 100, b: 50 }, 1, 0)
      expect(c.r).toBe(128)
      expect(c.g).toBe(128)
      expect(c.b).toBe(128)
    })

    it('contrast=2 doubles deviation from 128', () => {
      const c = adjustSaturationAndContrast({ r: 200, g: 200, b: 200 }, 1, 2)
      expect(c.r).toBe(255)
      expect(c.g).toBe(255)
      expect(c.b).toBe(255)
    })
  })

  describe('lerpColor', () => {
    const red: RgbColor = { r: 255, g: 0, b: 0 }
    const blue: RgbColor = { r: 0, g: 0, b: 255 }

    it('amount=0 → from', () => {
      expect(lerpColor(red, blue, 0)).toEqual(red)
    })

    it('amount=1 → to', () => {
      expect(lerpColor(red, blue, 1)).toEqual(blue)
    })

    it('amount=0.5 → middle', () => {
      expect(lerpColor(red, blue, 0.5)).toEqual<RgbColor>({ r: 128, g: 0, b: 128 })
    })

    it('clamps amount to [0,1]', () => {
      expect(lerpColor(red, blue, -0.5)).toEqual(red)
      expect(lerpColor(red, blue, 1.5)).toEqual(blue)
    })
  })
})
