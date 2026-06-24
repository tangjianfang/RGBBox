import type { Rect, VideoWallFit, VideoWallLayout, VideoWallPanel } from '../shared/types'

/**
 * Video-wall stitching engine.
 *
 * Maps a single virtual canvas (normalized [0,1]² content space) onto a 2D
 * matrix of physical panels/displays, with bezel correction, per-panel rotation
 * and content-fit modes. The math is pure (no DOM / WebGL) so it can run in the
 * main process, a worker or unit tests. Typical use cases: advertising video
 * walls and large stage/show displays where many panels must show one
 * continuous image.
 */

const MAX_BEZEL = 0.49

/** Clamp a value into the inclusive [min, max] range. */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** A point in normalized content space. */
export interface CanvasUv {
  u: number
  v: number
}

/**
 * Build a uniform rows×cols matrix layout. Panels are ordered row-major
 * (row 0 left→right, then row 1, …).
 */
export function buildMatrixLayout(
  rows: number,
  cols: number,
  options: Partial<Pick<VideoWallLayout, 'bezel' | 'bezelCompensation' | 'fit'>> & {
    rotation?: number
    displayIds?: number[]
  } = {}
): VideoWallLayout {
  const safeRows = Math.max(1, Math.floor(rows))
  const safeCols = Math.max(1, Math.floor(cols))
  const rotation = options.rotation ?? 0
  const displayIds = options.displayIds ?? []

  const panels: VideoWallPanel[] = []
  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      const index = row * safeCols + col
      panels.push({
        id: `panel-${row}-${col}`,
        col,
        row,
        rotation,
        displayId: displayIds[index],
        label: `R${row + 1}C${col + 1}`
      })
    }
  }

  return {
    mode: 'matrix',
    cols: safeCols,
    rows: safeRows,
    bezel: clamp(options.bezel ?? 0, 0, MAX_BEZEL),
    bezelCompensation: options.bezelCompensation ?? true,
    fit: options.fit ?? 'cover',
    panels
  }
}

/**
 * The active (light-emitting) rectangle of a panel within the wall surface,
 * in normalized [0,1] wall coordinates. Useful for drawing layout previews.
 */
export function getPanelActiveRect(panel: VideoWallPanel, layout: VideoWallLayout): Rect {
  const cols = Math.max(1, layout.cols)
  const rows = Math.max(1, layout.rows)
  const pw = 1 / cols
  const ph = 1 / rows
  const b = clamp(layout.bezel, 0, MAX_BEZEL)
  return {
    x: panel.col * pw + b * pw,
    y: panel.row * ph + b * ph,
    width: pw * (1 - 2 * b),
    height: ph * (1 - 2 * b)
  }
}

/**
 * The region of the source content canvas that a panel's active area samples,
 * in normalized [0,1] content coordinates.
 *
 * - With bezel compensation the active area samples the inset cell, so the
 *   content "hidden" by the bezels keeps the image continuous across panels.
 * - Without compensation the active area samples the full equal cell, which is
 *   simpler but shows seams where bezels interrupt the image.
 */
export function getPanelSourceRect(panel: VideoWallPanel, layout: VideoWallLayout): Rect {
  const cols = Math.max(1, layout.cols)
  const rows = Math.max(1, layout.rows)
  const pw = 1 / cols
  const ph = 1 / rows

  if (!layout.bezelCompensation) {
    return { x: panel.col * pw, y: panel.row * ph, width: pw, height: ph }
  }
  return getPanelActiveRect(panel, layout)
}

/**
 * Rotate a normalized UV around the panel centre (0.5, 0.5) by `degrees`
 * clockwise. Exact for multiples of 90°.
 */
export function rotateUv(u: number, v: number, degrees: number): CanvasUv {
  const norm = ((degrees % 360) + 360) % 360
  const du = u - 0.5
  const dv = v - 0.5
  // Exact integer results for the common cardinal rotations.
  if (norm === 0) return { u, v }
  if (norm === 90) return { u: 0.5 - dv, v: 0.5 + du }
  if (norm === 180) return { u: 0.5 - du, v: 0.5 - dv }
  if (norm === 270) return { u: 0.5 + dv, v: 0.5 - du }
  const rad = (norm * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { u: 0.5 + du * cos - dv * sin, v: 0.5 + du * sin + dv * cos }
}

/**
 * Map a panel-local UV (0..1 across the panel's active surface) to the content
 * canvas UV it should sample. Applies the panel rotation, then projects into the
 * panel's source rectangle. The returned UV may fall outside [0,1] for rotated
 * panels; callers decide whether to clamp, wrap, or treat as transparent.
 */
export function mapPanelUvToCanvas(
  panel: VideoWallPanel,
  layout: VideoWallLayout,
  u: number,
  v: number
): CanvasUv {
  const rotated = rotateUv(u, v, panel.rotation)
  const src = getPanelSourceRect(panel, layout)
  return {
    u: src.x + rotated.u * src.width,
    v: src.y + rotated.v * src.height
  }
}

/**
 * Compute the wall's overall aspect ratio (width / height), given the physical
 * aspect ratio of a single panel. Defaults to a square panel.
 */
export function getWallAspect(layout: VideoWallLayout, panelAspect = 1): number {
  const cols = Math.max(1, layout.cols)
  const rows = Math.max(1, layout.rows)
  const height = rows
  const width = cols * Math.max(1e-6, panelAspect)
  return width / height
}

/**
 * Compute the sub-rectangle of the source content (normalized [0,1]) that should
 * be displayed so that content of `contentAspect` fits a wall of `wallAspect`
 * using the given mode:
 * - 'stretch' uses the whole canvas (distorts to fill).
 * - 'contain' shrinks content to fit fully (letterbox/pillarbox), centred.
 * - 'cover' crops content to fill the wall with no empty space, centred.
 */
export function computeContentFitRect(
  contentAspect: number,
  wallAspect: number,
  fit: VideoWallFit
): Rect {
  const full: Rect = { x: 0, y: 0, width: 1, height: 1 }
  if (fit === 'stretch' || contentAspect <= 0 || wallAspect <= 0) return full

  const ratio = contentAspect / wallAspect

  if (fit === 'cover') {
    if (ratio > 1) {
      // Content wider than wall → crop horizontally.
      const width = 1 / ratio
      return { x: (1 - width) / 2, y: 0, width, height: 1 }
    }
    // Content taller than wall → crop vertically.
    const height = ratio
    return { x: 0, y: (1 - height) / 2, width: 1, height }
  }

  // 'contain'
  if (ratio > 1) {
    // Content wider than wall → letterbox vertically.
    const height = 1 / ratio
    return { x: 0, y: (1 - height) / 2, width: 1, height }
  }
  // Content taller than wall → pillarbox horizontally.
  const width = ratio
  return { x: (1 - width) / 2, y: 0, width, height: 1 }
}

/** A short human-readable summary of a layout, handy for UI/logging. */
export function summarizeLayout(layout: VideoWallLayout): string {
  const panels = layout.cols * layout.rows
  const comp = layout.bezelCompensation ? 'bezel-corrected' : 'no-compensation'
  return `${layout.rows}×${layout.cols} matrix · ${panels} panels · ${comp} · fit=${layout.fit}`
}
