import { describe, it, expect } from 'vitest'
import {
  clampByte,
  clampUnit,
  hexToRgb,
  hslToRgb,
  mixColors,
  applyBrightness,
  adjustSaturationAndContrast,
  lerpColor
} from '../src/engine/color'

describe('clampByte', () => {
  it('returns 0 for negative values', () => {
    expect(clampByte(-10)).toBe(0)
  })

  it('returns 255 for values above 255', () => {
    expect(clampByte(300)).toBe(255)
  })

  it('rounds to nearest integer', () => {
    expect(clampByte(127.6)).toBe(128)
    expect(clampByte(127.4)).toBe(127)
  })

  it('passes through valid values', () => {
    expect(clampByte(100)).toBe(100)
    expect(clampByte(0)).toBe(0)
    expect(clampByte(255)).toBe(255)
  })
})

describe('clampUnit', () => {
  it('clamps values below 0 to 0', () => {
    expect(clampUnit(-0.5)).toBe(0)
  })

  it('clamps values above 1 to 1', () => {
    expect(clampUnit(1.5)).toBe(1)
  })

  it('passes through values in [0, 1]', () => {
    expect(clampUnit(0.5)).toBe(0.5)
    expect(clampUnit(0)).toBe(0)
    expect(clampUnit(1)).toBe(1)
  })
})

describe('hexToRgb', () => {
  it('converts valid 6-digit hex to RGB', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 })
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('handles hex without # prefix', () => {
    expect(hexToRgb('ff8000')).toEqual({ r: 255, g: 128, b: 0 })
  })

  it('returns white fallback for invalid hex', () => {
    expect(hexToRgb('#xyz')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#12')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('returns white fallback for non-numeric hex string of correct length', () => {
    expect(hexToRgb('#gggggg')).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('hslToRgb', () => {
  it('converts pure red (hue=0)', () => {
    const result = hslToRgb(0, 1, 0.5)
    expect(result.r).toBe(255)
    expect(result.g).toBe(0)
    expect(result.b).toBe(0)
  })

  it('converts pure green (hue=120)', () => {
    const result = hslToRgb(120, 1, 0.5)
    expect(result.r).toBe(0)
    expect(result.g).toBe(255)
    expect(result.b).toBe(0)
  })

  it('converts pure blue (hue=240)', () => {
    const result = hslToRgb(240, 1, 0.5)
    expect(result.r).toBe(0)
    expect(result.g).toBe(0)
    expect(result.b).toBe(255)
  })

  it('converts white (lightness=1)', () => {
    const result = hslToRgb(0, 0, 1)
    expect(result.r).toBe(255)
    expect(result.g).toBe(255)
    expect(result.b).toBe(255)
  })

  it('converts black (lightness=0)', () => {
    const result = hslToRgb(0, 1, 0)
    expect(result.r).toBe(0)
    expect(result.g).toBe(0)
    expect(result.b).toBe(0)
  })

  it('handles hue wrapping (negative and >360)', () => {
    const r1 = hslToRgb(360, 1, 0.5)
    const r2 = hslToRgb(0, 1, 0.5)
    expect(r1).toEqual(r2)

    const r3 = hslToRgb(-60, 1, 0.5)
    const r4 = hslToRgb(300, 1, 0.5)
    expect(r3).toEqual(r4)
  })
})

describe('mixColors', () => {
  const red = { r: 255, g: 0, b: 0 }
  const blue = { r: 0, g: 0, b: 255 }
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  it('normal mode with full opacity replaces base', () => {
    const result = mixColors(red, blue, 1, 'normal')
    expect(result).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('normal mode with zero opacity keeps base', () => {
    const result = mixColors(red, blue, 0, 'normal')
    expect(result).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('normal mode with 0.5 opacity blends 50/50', () => {
    const result = mixColors(red, blue, 0.5, 'normal')
    expect(result.r).toBe(128)
    expect(result.b).toBe(128)
  })

  it('add mode adds channels', () => {
    const result = mixColors(red, blue, 1, 'add')
    expect(result).toEqual({ r: 255, g: 0, b: 255 })
  })

  it('add mode clamps to 255', () => {
    const result = mixColors(white, white, 1, 'add')
    expect(result.r).toBe(255)
    expect(result.g).toBe(255)
    expect(result.b).toBe(255)
  })

  it('multiply mode multiplies channels', () => {
    const result = mixColors(white, white, 1, 'multiply')
    expect(result).toEqual({ r: 255, g: 255, b: 255 })

    const result2 = mixColors(white, black, 1, 'multiply')
    expect(result2).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('screen mode screens channels', () => {
    const result = mixColors(black, black, 1, 'screen')
    expect(result).toEqual({ r: 0, g: 0, b: 0 })

    const result2 = mixColors(white, white, 1, 'screen')
    expect(result2).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('applyBrightness', () => {
  it('gain=1 is pass-through', () => {
    const color = { r: 100, g: 150, b: 200 }
    expect(applyBrightness(color, 1)).toEqual(color)
  })

  it('gain=0 produces black', () => {
    const color = { r: 100, g: 150, b: 200 }
    expect(applyBrightness(color, 0)).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('gain=0.5 dims by half', () => {
    const color = { r: 200, g: 100, b: 50 }
    const result = applyBrightness(color, 0.5)
    expect(result.r).toBe(100)
    expect(result.g).toBe(50)
    expect(result.b).toBe(25)
  })

  it('gain>1 amplifies and clamps', () => {
    const color = { r: 200, g: 100, b: 50 }
    const result = applyBrightness(color, 2)
    expect(result.r).toBe(255) // clamped from 400
    expect(result.g).toBe(200)
    expect(result.b).toBe(100)
  })
})

describe('adjustSaturationAndContrast', () => {
  it('saturation=1 and contrast=1 is identity', () => {
    const color = { r: 100, g: 150, b: 200 }
    const result = adjustSaturationAndContrast(color, 1, 1)
    expect(result).toEqual(color)
  })

  it('saturation=0 produces grayscale', () => {
    const color = { r: 255, g: 0, b: 0 }
    const result = adjustSaturationAndContrast(color, 0, 1)
    // All channels should be equal (luminance value)
    expect(result.r).toBe(result.g)
    expect(result.g).toBe(result.b)
  })

  it('high contrast pushes values apart from 128', () => {
    const color = { r: 200, g: 200, b: 200 }
    const result = adjustSaturationAndContrast(color, 1, 2)
    // Values above 128 should get pushed higher
    expect(result.r).toBeGreaterThan(200)
  })
})

describe('lerpColor', () => {
  const red = { r: 255, g: 0, b: 0 }
  const blue = { r: 0, g: 0, b: 255 }

  it('amount=0 returns from color', () => {
    expect(lerpColor(red, blue, 0)).toEqual(red)
  })

  it('amount=1 returns to color', () => {
    expect(lerpColor(red, blue, 1)).toEqual(blue)
  })

  it('amount=0.5 blends evenly', () => {
    const result = lerpColor(red, blue, 0.5)
    expect(result.r).toBe(128)
    expect(result.b).toBe(128)
  })

  it('clamps amount to [0, 1]', () => {
    expect(lerpColor(red, blue, -1)).toEqual(red)
    expect(lerpColor(red, blue, 2)).toEqual(blue)
  })
})
