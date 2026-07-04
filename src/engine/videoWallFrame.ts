import type { RgbFrame, VideoWallLayout, VideoWallPanel } from '../shared/types'
import { computeContentFitRect, getWallAspect, mapPanelUvToCanvas } from './videoWall'

/**
 * Video-wall frame extraction glue.
 *
 * Bridges the pure stitching math in {@link ./videoWall} to concrete
 * {@link RgbFrame} pixel buffers used by the live render loop. For a single
 * panel it samples the virtual content canvas through the panel's
 * bezel-corrected / rotated source mapping and the wall's content-fit rect,
 * producing the {@link RgbFrame} that should be pushed to that panel's physical
 * display overlay.
 */

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export interface ExtractWallPanelFrameOptions {
  /** Output frame width in cells. Defaults to `floor(virtualFrame.columns / layout.cols)` (min 1). */
  outCols?: number
  /** Output frame height in cells. Defaults to `floor(virtualFrame.rows / layout.rows)` (min 1). */
  outRows?: number
  /** Physical aspect ratio (w/h) of a single panel, used for content fit. Defaults to 1 (square). */
  panelAspect?: number
}

/**
 * Extract the {@link RgbFrame} for one panel of a video wall by sampling the
 * virtual content canvas.
 *
 * Pipeline per output pixel:
 * 1. panel-local UV (pixel centre) → wall-content UV via {@link mapPanelUvToCanvas}
 *    (applies the panel rotation and projects into its bezel-corrected source rect);
 * 2. wall-content UV → source-content UV via the {@link computeContentFitRect}
 *    rectangle (stretch / contain / cover);
 * 3. nearest-neighbour sample from the virtual frame.
 *
 * UVs are clamped to [0,1]; rotated panels whose mapping falls outside the wall
 * sample the nearest edge rather than wrapping.
 */
export function extractWallPanelFrame(
  virtualFrame: RgbFrame,
  panel: VideoWallPanel,
  layout: VideoWallLayout,
  options: ExtractWallPanelFrameOptions = {}
): RgbFrame {
  const cols = Math.max(1, layout.cols)
  const rows = Math.max(1, layout.rows)
  const outCols = Math.max(1, Math.floor(options.outCols ?? virtualFrame.columns / cols))
  const outRows = Math.max(1, Math.floor(options.outRows ?? virtualFrame.rows / rows))

  const srcCols = Math.max(1, virtualFrame.columns)
  const srcRows = Math.max(1, virtualFrame.rows)
  const contentAspect = srcCols / srcRows
  const wallAspect = getWallAspect(layout, options.panelAspect ?? 1)
  const fit = computeContentFitRect(contentAspect, wallAspect, layout.fit)

  const pixels = new Uint8ClampedArray(outCols * outRows * 3)
  for (let y = 0; y < outRows; y += 1) {
    const v = (y + 0.5) / outRows
    for (let x = 0; x < outCols; x += 1) {
      const u = (x + 0.5) / outCols
      const wall = mapPanelUvToCanvas(panel, layout, u, clamp01(v))
      // Project the wall-content UV into the fitted sub-rectangle of the source.
      const su = clamp01(fit.x + clamp01(wall.u) * fit.width)
      const sv = clamp01(fit.y + clamp01(wall.v) * fit.height)
      const sx = Math.min(srcCols - 1, Math.floor(su * srcCols))
      const sy = Math.min(srcRows - 1, Math.floor(sv * srcRows))
      const srcI = (sy * srcCols + sx) * 3
      const dstI = (y * outCols + x) * 3
      pixels[dstI] = virtualFrame.pixels[srcI]
      pixels[dstI + 1] = virtualFrame.pixels[srcI + 1]
      pixels[dstI + 2] = virtualFrame.pixels[srcI + 2]
    }
  }

  return {
    columns: outCols,
    rows: outRows,
    pixels,
    generatedAt: virtualFrame.generatedAt,
    showGap: virtualFrame.showGap,
    renderStyle: virtualFrame.renderStyle
  }
}
