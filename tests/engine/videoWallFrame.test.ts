import { describe, it, expect } from 'vitest'
import type { RgbFrame } from '../../src/shared/types'
import { buildMatrixLayout } from '../../src/engine/videoWall'
import { extractWallPanelFrame } from '../../src/engine/videoWallFrame'

/** Build a frame whose pixel colour is computed from its (x, y) cell position. */
function makeFrame(cols: number, rows: number, fn: (x: number, y: number) => [number, number, number]): RgbFrame {
  const pixels = new Uint8ClampedArray(cols * rows * 3)
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const [r, g, b] = fn(x, y)
      const i = (y * cols + x) * 3
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
    }
  }
  return { columns: cols, rows, pixels, generatedAt: 123, showGap: false }
}

function pixelAt(frame: RgbFrame, x: number, y: number): [number, number, number] {
  const i = (y * frame.columns + x) * 3
  return [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2]]
}

describe('engine/videoWallFrame', () => {
  describe('extractWallPanelFrame', () => {
    it('passes the whole canvas through for a 1×1 stretch wall (identity)', () => {
      const src = makeFrame(4, 4, (x, y) => [x * 10, y * 10, 0])
      const layout = buildMatrixLayout(1, 1, { bezel: 0, bezelCompensation: false, fit: 'stretch' })
      const out = extractWallPanelFrame(src, layout.panels[0], layout, { outCols: 4, outRows: 4 })
      expect(out.columns).toBe(4)
      expect(out.rows).toBe(4)
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          expect(pixelAt(out, x, y)).toEqual([x * 10, y * 10, 0])
        }
      }
    })

    it('preserves generatedAt and showGap from the source frame', () => {
      const src = makeFrame(2, 2, () => [1, 2, 3])
      src.showGap = true
      const layout = buildMatrixLayout(1, 1, { fit: 'stretch' })
      const out = extractWallPanelFrame(src, layout.panels[0], layout)
      expect(out.generatedAt).toBe(123)
      expect(out.showGap).toBe(true)
    })

    it('defaults output resolution to floor(src / matrix size)', () => {
      const src = makeFrame(8, 6, () => [0, 0, 0])
      const layout = buildMatrixLayout(2, 4, { fit: 'stretch' }) // rows=2, cols=4
      const out = extractWallPanelFrame(src, layout.panels[0], layout)
      expect(out.columns).toBe(2) // floor(8 / 4)
      expect(out.rows).toBe(3) // floor(6 / 2)
    })

    it('splits a 2×2 wall so each panel samples its own quadrant', () => {
      // 4×4 frame with four distinct solid quadrants.
      const src = makeFrame(4, 4, (x, y) => {
        const right = x >= 2
        const bottom = y >= 2
        if (!right && !bottom) return [10, 0, 0] // top-left
        if (right && !bottom) return [0, 20, 0] // top-right
        if (!right && bottom) return [0, 0, 30] // bottom-left
        return [40, 40, 40] // bottom-right
      })
      const layout = buildMatrixLayout(2, 2, { bezel: 0, bezelCompensation: false, fit: 'stretch' })
      const [tl, tr, bl, br] = layout.panels // row-major order
      const opts = { outCols: 2, outRows: 2 }
      expect(pixelAt(extractWallPanelFrame(src, tl, layout, opts), 0, 0)).toEqual([10, 0, 0])
      expect(pixelAt(extractWallPanelFrame(src, tr, layout, opts), 0, 0)).toEqual([0, 20, 0])
      expect(pixelAt(extractWallPanelFrame(src, bl, layout, opts), 0, 0)).toEqual([0, 0, 30])
      expect(pixelAt(extractWallPanelFrame(src, br, layout, opts), 0, 0)).toEqual([40, 40, 40])
    })

    it('applies 180° panel rotation (top-left output samples bottom-right source)', () => {
      const src = makeFrame(4, 4, (x, y) => [x * 10, y * 10, 0])
      const layout = buildMatrixLayout(1, 1, { bezel: 0, bezelCompensation: false, fit: 'stretch' })
      const rotated = { ...layout.panels[0], rotation: 180 }
      const out = extractWallPanelFrame(src, rotated, layout, { outCols: 4, outRows: 4 })
      // Output (0,0) should map to source (3,3); output (3,3) to source (0,0).
      expect(pixelAt(out, 0, 0)).toEqual([30, 30, 0])
      expect(pixelAt(out, 3, 3)).toEqual([0, 0, 0])
    })

    it('bezel compensation samples the inset (central) region of the cell', () => {
      // Frame: central 2×2 block is bright, border is dark.
      const src = makeFrame(4, 4, (x, y) => {
        const central = x >= 1 && x <= 2 && y >= 1 && y <= 2
        return central ? [200, 200, 200] : [0, 0, 0]
      })
      const layout = buildMatrixLayout(1, 1, { bezel: 0.25, bezelCompensation: true, fit: 'stretch' })
      // Active rect for a 1×1 wall with bezel 0.25 → samples [0.25,0.75]² = central block.
      const out = extractWallPanelFrame(src, layout.panels[0], layout, { outCols: 2, outRows: 2 })
      expect(pixelAt(out, 0, 0)).toEqual([200, 200, 200])
      expect(pixelAt(out, 1, 1)).toEqual([200, 200, 200])
    })

    it('without bezel compensation samples the full cell (edges included)', () => {
      const src = makeFrame(4, 4, (x, y) => {
        const central = x >= 1 && x <= 2 && y >= 1 && y <= 2
        return central ? [200, 200, 200] : [0, 0, 0]
      })
      const layout = buildMatrixLayout(1, 1, { bezel: 0.25, bezelCompensation: false, fit: 'stretch' })
      const out = extractWallPanelFrame(src, layout.panels[0], layout, { outCols: 4, outRows: 4 })
      // Full-cell sampling reaches the dark border corners.
      expect(pixelAt(out, 0, 0)).toEqual([0, 0, 0])
    })

    it('clamps degenerate output sizes to at least 1×1', () => {
      const src = makeFrame(1, 1, () => [5, 6, 7])
      const layout = buildMatrixLayout(1, 1, { fit: 'stretch' })
      const out = extractWallPanelFrame(src, layout.panels[0], layout, { outCols: 0, outRows: -3 })
      expect(out.columns).toBe(1)
      expect(out.rows).toBe(1)
      expect(pixelAt(out, 0, 0)).toEqual([5, 6, 7])
    })
  })
})
