import { describe, it, expect } from 'vitest'
import {
  buildMatrixLayout,
  computeContentFitRect,
  getPanelActiveRect,
  getPanelSourceRect,
  getWallAspect,
  mapPanelUvToCanvas,
  rotateUv,
  summarizeLayout
} from '../../src/engine/videoWall'

const approx = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps

describe('engine/videoWall', () => {
  describe('buildMatrixLayout', () => {
    it('creates rows*cols panels in row-major order', () => {
      const layout = buildMatrixLayout(2, 3)
      expect(layout.panels).toHaveLength(6)
      expect(layout.cols).toBe(3)
      expect(layout.rows).toBe(2)
      expect(layout.panels.map((p) => p.id)).toEqual([
        'panel-0-0', 'panel-0-1', 'panel-0-2',
        'panel-1-0', 'panel-1-1', 'panel-1-2'
      ])
    })

    it('clamps invalid sizes to at least 1', () => {
      const layout = buildMatrixLayout(0, -4)
      expect(layout.rows).toBe(1)
      expect(layout.cols).toBe(1)
      expect(layout.panels).toHaveLength(1)
    })

    it('clamps bezel into [0, 0.49] and applies options', () => {
      const layout = buildMatrixLayout(1, 1, { bezel: 5, bezelCompensation: false, fit: 'contain' })
      expect(layout.bezel).toBeCloseTo(0.49)
      expect(layout.bezelCompensation).toBe(false)
      expect(layout.fit).toBe('contain')
    })

    it('maps provided displayIds onto panels', () => {
      const layout = buildMatrixLayout(1, 2, { displayIds: [11, 22] })
      expect(layout.panels[0].displayId).toBe(11)
      expect(layout.panels[1].displayId).toBe(22)
    })
  })

  describe('getPanelActiveRect', () => {
    it('tiles edge-to-edge with zero bezel', () => {
      const layout = buildMatrixLayout(1, 2, { bezel: 0 })
      expect(getPanelActiveRect(layout.panels[0], layout)).toEqual({ x: 0, y: 0, width: 0.5, height: 1 })
      expect(getPanelActiveRect(layout.panels[1], layout)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 })
    })

    it('insets the active area by the bezel fraction', () => {
      const layout = buildMatrixLayout(1, 1, { bezel: 0.1 })
      const rect = getPanelActiveRect(layout.panels[0], layout)
      expect(rect).toEqual({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
    })
  })

  describe('getPanelSourceRect', () => {
    it('uses the full equal cell when compensation is off', () => {
      const layout = buildMatrixLayout(1, 2, { bezel: 0.2, bezelCompensation: false })
      expect(getPanelSourceRect(layout.panels[1], layout)).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 })
    })

    it('uses the inset cell when compensation is on (seamless)', () => {
      const layout = buildMatrixLayout(1, 2, { bezel: 0.1, bezelCompensation: true })
      const rect = getPanelSourceRect(layout.panels[0], layout)
      expect(rect.x).toBeCloseTo(0.05)
      expect(rect.width).toBeCloseTo(0.4)
      expect(rect.y).toBeCloseTo(0.1)
      expect(rect.height).toBeCloseTo(0.8)
    })
  })

  describe('rotateUv', () => {
    it('returns the input unchanged at 0°', () => {
      expect(rotateUv(0.2, 0.7, 0)).toEqual({ u: 0.2, v: 0.7 })
    })

    it('rotates 90° clockwise around the centre', () => {
      // top-left (0,0) → top-right (1,0) for clockwise rotation
      const r = rotateUv(0, 0, 90)
      expect(approx(r.u, 1)).toBe(true)
      expect(approx(r.v, 0)).toBe(true)
    })

    it('rotates 180° around the centre', () => {
      const r = rotateUv(0, 0, 180)
      expect(approx(r.u, 1)).toBe(true)
      expect(approx(r.v, 1)).toBe(true)
    })

    it('rotates 270° clockwise around the centre', () => {
      const r = rotateUv(0, 0, 270)
      expect(approx(r.u, 0)).toBe(true)
      expect(approx(r.v, 1)).toBe(true)
    })

    it('normalizes negative and large angles', () => {
      expect(rotateUv(0, 0, -90)).toEqual(rotateUv(0, 0, 270))
      expect(rotateUv(0.3, 0.8, 450)).toEqual(rotateUv(0.3, 0.8, 90))
    })

    it('handles arbitrary angles via trig', () => {
      const r = rotateUv(1, 0.5, 45)
      // (0.5,0) offset rotated 45° clockwise → (0.5/√2, 0.5/√2)
      expect(approx(r.u, 0.5 + 0.5 * Math.SQRT1_2)).toBe(true)
      expect(approx(r.v, 0.5 + 0.5 * Math.SQRT1_2)).toBe(true)
    })
  })

  describe('mapPanelUvToCanvas', () => {
    it('maps a panel UV into its source rect (no rotation)', () => {
      const layout = buildMatrixLayout(1, 2, { bezel: 0, bezelCompensation: true })
      const c = mapPanelUvToCanvas(layout.panels[1], layout, 0.5, 0.5)
      expect(c.u).toBeCloseTo(0.75)
      expect(c.v).toBeCloseTo(0.5)
    })

    it('combines rotation with the source-rect projection', () => {
      const layout = buildMatrixLayout(1, 1, { bezel: 0, bezelCompensation: true })
      const panel = { ...layout.panels[0], rotation: 90 }
      const c = mapPanelUvToCanvas(panel, layout, 0, 0)
      // single full-canvas panel: 90° clockwise sends (0,0) → (1,0)
      expect(c.u).toBeCloseTo(1)
      expect(c.v).toBeCloseTo(0)
    })

    it('keeps adjacent panel seams continuous with compensation', () => {
      const layout = buildMatrixLayout(1, 2, { bezel: 0.1, bezelCompensation: true })
      // right edge of left panel and left edge of right panel sample the same
      // content coordinate when bezel correction is active.
      const leftEdge = mapPanelUvToCanvas(layout.panels[0], layout, 1, 0.5)
      const rightEdge = mapPanelUvToCanvas(layout.panels[1], layout, 0, 0.5)
      expect(leftEdge.u).toBeCloseTo(0.45)
      expect(rightEdge.u).toBeCloseTo(0.55)
    })
  })

  describe('getWallAspect', () => {
    it('computes aspect from cols/rows and panel aspect', () => {
      const layout = buildMatrixLayout(2, 4)
      expect(getWallAspect(layout, 1)).toBeCloseTo(2) // 4 wide / 2 tall
      expect(getWallAspect(layout, 16 / 9)).toBeCloseTo((4 * 16) / 9 / 2)
    })
  })

  describe('computeContentFitRect', () => {
    it('returns the full canvas for stretch', () => {
      expect(computeContentFitRect(2, 1, 'stretch')).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    })

    it('cover crops the wider axis of content wider than the wall', () => {
      const rect = computeContentFitRect(2, 1, 'cover')
      expect(rect.width).toBeCloseTo(0.5)
      expect(rect.height).toBeCloseTo(1)
      expect(rect.x).toBeCloseTo(0.25)
    })

    it('contain letterboxes content wider than the wall', () => {
      const rect = computeContentFitRect(2, 1, 'contain')
      expect(rect.height).toBeCloseTo(0.5)
      expect(rect.width).toBeCloseTo(1)
      expect(rect.y).toBeCloseTo(0.25)
    })

    it('contain pillarboxes content taller than the wall', () => {
      const rect = computeContentFitRect(0.5, 1, 'contain')
      expect(rect.width).toBeCloseTo(0.5)
      expect(rect.x).toBeCloseTo(0.25)
    })

    it('falls back to full canvas on degenerate aspect', () => {
      expect(computeContentFitRect(0, 1, 'cover')).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    })
  })

  describe('summarizeLayout', () => {
    it('describes the matrix configuration', () => {
      const layout = buildMatrixLayout(2, 3, { bezelCompensation: true, fit: 'cover' })
      expect(summarizeLayout(layout)).toBe('2×3 matrix · 6 panels · bezel-corrected · fit=cover')
    })
  })
})
