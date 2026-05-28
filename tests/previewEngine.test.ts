import { describe, it, expect } from 'vitest'
import { computeZoneMaskWeight } from '../src/engine/previewEngine'

describe('computeZoneMaskWeight', () => {
  const cols = 10
  const rows = 10

  describe('top zone', () => {
    it('returns high weight for top-row pixels', () => {
      const weight = computeZoneMaskWeight(5, 0, cols, rows, 'top')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for bottom-row pixels', () => {
      const weight = computeZoneMaskWeight(5, 9, cols, rows, 'top')
      expect(weight).toBeLessThan(0.5)
    })
  })

  describe('bottom zone', () => {
    it('returns high weight for bottom-row pixels', () => {
      const weight = computeZoneMaskWeight(5, 9, cols, rows, 'bottom')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for top-row pixels', () => {
      const weight = computeZoneMaskWeight(5, 0, cols, rows, 'bottom')
      expect(weight).toBeLessThan(0.5)
    })
  })

  describe('left zone', () => {
    it('returns high weight for left-column pixels', () => {
      const weight = computeZoneMaskWeight(0, 5, cols, rows, 'left')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for right-column pixels', () => {
      const weight = computeZoneMaskWeight(9, 5, cols, rows, 'left')
      expect(weight).toBeLessThan(0.5)
    })
  })

  describe('right zone', () => {
    it('returns high weight for right-column pixels', () => {
      const weight = computeZoneMaskWeight(9, 5, cols, rows, 'right')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for left-column pixels', () => {
      const weight = computeZoneMaskWeight(0, 5, cols, rows, 'right')
      expect(weight).toBeLessThan(0.5)
    })
  })

  describe('center zone', () => {
    it('returns high weight for center pixels', () => {
      const weight = computeZoneMaskWeight(5, 5, cols, rows, 'center')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for corner pixels', () => {
      const weight = computeZoneMaskWeight(0, 0, cols, rows, 'center')
      expect(weight).toBeLessThan(0.3)
    })
  })

  describe('corners zone', () => {
    it('returns high weight for corner pixels', () => {
      const weight = computeZoneMaskWeight(0, 0, cols, rows, 'corners')
      expect(weight).toBeGreaterThan(0.5)
    })

    it('returns low weight for center pixels', () => {
      const weight = computeZoneMaskWeight(5, 5, cols, rows, 'corners')
      expect(weight).toBeLessThan(0.5)
    })
  })

  describe('edge cases', () => {
    it('handles 1x1 grid', () => {
      const weight = computeZoneMaskWeight(0, 0, 1, 1, 'top')
      expect(weight).toBeGreaterThanOrEqual(0)
      expect(weight).toBeLessThanOrEqual(1)
    })

    it('all weights are between 0 and 1', () => {
      const zones = ['top', 'bottom', 'left', 'right', 'center', 'corners']
      for (const zone of zones) {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const w = computeZoneMaskWeight(x, y, cols, rows, zone)
            expect(w).toBeGreaterThanOrEqual(0)
            expect(w).toBeLessThanOrEqual(1)
          }
        }
      }
    })

    it('unknown zone defaults to full weight (1)', () => {
      const weight = computeZoneMaskWeight(5, 5, cols, rows, 'nonexistent')
      // Default case in switch returns 1 (full / passthrough)
      expect(weight).toBe(1)
    })
  })
})
