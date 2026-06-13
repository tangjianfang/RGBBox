import { describe, it, expect } from 'vitest'
import { getTextMask } from '../../src/engine/textRenderer'

describe('engine/textRenderer', () => {
  describe('getTextMask basic shape', () => {
    it('returns a flat boolean array of cols*rows', () => {
      const mask = getTextMask('A', 10, 7, 0.5, 0.5, 1)
      expect(mask).toHaveLength(10 * 7)
    })

    it('empty string → all-false mask', () => {
      const mask = getTextMask('', 10, 7, 0.5, 0.5, 1)
      expect(mask.every((v) => v === false)).toBe(true)
    })

    it('"A" in the centre has at least some pixels lit', () => {
      const mask = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const lit = mask.filter((v) => v === true).length
      expect(lit).toBeGreaterThan(0)
    })

    it('space character produces no lit pixels', () => {
      const mask = getTextMask(' ', 20, 14, 0.5, 0.5, 1)
      expect(mask.every((v) => v === false)).toBe(true)
    })

    it('lowercase letters map to uppercase (same number of lit pixels)', () => {
      const upper = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const lower = getTextMask('a', 20, 14, 0.5, 0.5, 1)
      expect(lower.filter((v) => v).length).toBe(upper.filter((v) => v).length)
    })

    it('unknown character falls back to "?" glyph', () => {
      // Use a low Unicode point that is definitely not in the font
      const mask = getTextMask('ÿ', 20, 14, 0.5, 0.5, 1)
      const question = getTextMask('?', 20, 14, 0.5, 0.5, 1)
      expect(mask).toEqual(question)
    })
  })

  describe('getTextMask anchor positions', () => {
    it('xNorm=0 (left) puts text near left edge', () => {
      const mask = getTextMask('A', 30, 7, 0, 0.5, 1)
      // Find the leftmost lit column
      const cols = 30
      let leftmost = cols
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          leftmost = Math.min(leftmost, i % cols)
          break
        }
      }
      expect(leftmost).toBeLessThanOrEqual(2) // within 2 cells of left edge
    })

    it('xNorm=1 (right) puts text near right edge', () => {
      const mask = getTextMask('A', 30, 7, 1, 0.5, 1)
      const cols = 30
      let rightmost = -1
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) rightmost = i % cols
      }
      expect(rightmost).toBeGreaterThanOrEqual(cols - 3)
    })

    it('yNorm=0 (top) puts text near top edge', () => {
      const mask = getTextMask('A', 20, 20, 0.5, 0, 1)
      const cols = 20
      let topmost = mask.length
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) {
          topmost = Math.min(topmost, Math.floor(i / cols))
          break
        }
      }
      expect(topmost).toBeLessThanOrEqual(2)
    })
  })

  describe('getTextMask scale', () => {
    it('scale=2 produces 2x more lit pixels than scale=1', () => {
      const s1 = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const s2 = getTextMask('A', 20, 14, 0.5, 0.5, 2)
      const lit1 = s1.filter((v) => v).length
      const lit2 = s2.filter((v) => v).length
      // Roughly 4x but allow some boundary differences
      expect(lit2).toBeGreaterThan(lit1 * 3)
    })

    it('scale < 1 is rounded up to 1', () => {
      const s1 = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const s05 = getTextMask('A', 20, 14, 0.5, 0.5, 0.5)
      expect(s05).toEqual(s1)
    })

    it('scale=0 is rounded up to 1', () => {
      const s1 = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const s0 = getTextMask('A', 20, 14, 0.5, 0.5, 0)
      expect(s0).toEqual(s1)
    })
  })

  describe('getTextMask multi-character', () => {
    it('"AB" produces a wider mask than "A"', () => {
      const a = getTextMask('A', 30, 7, 0.5, 0.5, 1)
      const ab = getTextMask('AB', 30, 7, 0.5, 0.5, 1)
      const width = (mask: boolean[], cols: number): number => {
        let min = cols
        let max = -1
        for (let i = 0; i < mask.length; i++) {
          if (mask[i]) {
            const col = i % cols
            min = Math.min(min, col)
            max = Math.max(max, col)
          }
        }
        return max - min
      }
      expect(width(ab, 30)).toBeGreaterThan(width(a, 30))
    })
  })

  describe('getTextMask cache', () => {
    it('returns identical array for identical inputs (cache hit)', () => {
      const a = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const b = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      expect(a).toBe(b) // same reference
    })

    it('different xNorm produces a different array', () => {
      const a = getTextMask('A', 20, 14, 0.5, 0.5, 1)
      const b = getTextMask('A', 20, 14, 0.6, 0.5, 1)
      expect(a).not.toBe(b)
    })
  })

  describe('getTextMask edge cases', () => {
    it('cols=1, rows=1 does not throw', () => {
      expect(() => getTextMask('A', 1, 1, 0.5, 0.5, 1)).not.toThrow()
    })

    it('very small grid clips all pixels', () => {
      const mask = getTextMask('A', 1, 1, 0.5, 0.5, 1)
      expect(mask).toHaveLength(1)
    })
  })
})
