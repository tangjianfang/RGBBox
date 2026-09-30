import { describe, expect, it } from 'vitest'
import { LOGICAL_H, LOGICAL_W, MAX_SCALE, computeHdSize } from '../../../src/renderer/src/games/hdCanvas'

describe('R217 computeHdSize', () => {
  it('sizes backing to css width × dpr on HiDPI displays', () => {
    const hd = computeHdSize(1200, 2)
    expect(hd.w).toBe(2400)
    expect(hd.h).toBe(Math.round((2400 * LOGICAL_H) / LOGICAL_W))
    expect(hd.scale).toBeCloseTo(2400 / LOGICAL_W)
  })

  it('clamps the pixel-ratio multiplier to MAX_SCALE', () => {
    const hd = computeHdSize(1200, 3)
    expect(hd.w).toBe(1200 * MAX_SCALE)
  })

  it('never goes below the logical resolution (small panel)', () => {
    const hd = computeHdSize(600, 1)
    expect(hd.w).toBe(LOGICAL_W)
    expect(hd.h).toBe(LOGICAL_H)
    expect(hd.scale).toBe(1)
  })

  it('keeps the 900/520 aspect ratio for every result', () => {
    for (const [cssW, dpr] of [[980, 1.25], [1440, 1.5], [1920, 2], [320, 1]] as const) {
      const hd = computeHdSize(cssW, dpr)
      expect(Math.abs(hd.w / hd.h - LOGICAL_W / LOGICAL_H)).toBeLessThan(0.01)
      expect(hd.w).toBe(Math.round(hd.w))
      expect(hd.h).toBe(Math.round(hd.h))
    }
  })

  it('falls back to logical css size on degenerate css input (dpr still applies)', () => {
    expect(computeHdSize(0, 2).w).toBe(LOGICAL_W * 2)
    expect(computeHdSize(Number.NaN, 2).w).toBe(LOGICAL_W * 2)
    expect(computeHdSize(1200, 0).w).toBe(1200)
    expect(computeHdSize(1200, Number.NaN).w).toBe(1200)
  })

  it('sub-dpr (1.25) yields fractional-free integers and proportional scale', () => {
    const hd = computeHdSize(1440, 1.25)
    expect(hd.w).toBe(1800)
    expect(hd.scale * LOGICAL_W).toBeCloseTo(hd.w)
  })
})
