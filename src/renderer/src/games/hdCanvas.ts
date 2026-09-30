/**
 * R217: DPR-aware backing-store sizing for the games canvas.
 *
 * The four games share one canvas whose logical coordinate space is fixed
 * (WIDTH 900 × HEIGHT 520, games/td.ts). Historically the backing store was
 * set to exactly 900×520 and stretched by CSS — on HiDPI displays that is a
 * 1.5-3× upscale of the rasterized result: the "jagged / blurry" look this
 * module removes. Backing is now sized from the CSS box × clamped device
 * pixel ratio, never below the logical resolution (so a panel smaller than
 * 900 CSS px still renders at full logic resolution instead of downscaling),
 * and the game loop maps logical → physical pixels with setTransform.
 */

/** Logical resolution the game draw functions address (games/td.ts). */
export const LOGICAL_W = 900
export const LOGICAL_H = 520

/** Hard cap on the pixel-ratio multiplier — worst case 1800×1040 backing. */
export const MAX_SCALE = 2

export interface HdSize {
  /** Backing-store width in device pixels. */
  w: number
  /** Backing-store height in device pixels (locked to the 900/520 ratio). */
  h: number
  /** Uniform transform factor: logical pixels → device pixels. */
  scale: number
}

/**
 * Compute the HiDPI backing size for a canvas displayed at `cssW` CSS pixels
 * on a screen with `dpr` device pixels per CSS pixel.
 *
 * - `dpr` is clamped to (0, MAX_SCALE]; zero/NaN inputs fall back to 1.
 * - The result is never below the logical resolution (900×520): shrinking
 *   would resample an already-rasterized frame and lose detail again.
 * - Dimensions are rounded to integers; the ratio is re-derived from the
 *   rounded width so `scale` always satisfies w ≈ 900×scale.
 */
export function computeHdSize (cssW: number, dpr: number): HdSize {
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, MAX_SCALE) : 1
  const safeCss = Number.isFinite(cssW) && cssW > 0 ? cssW : LOGICAL_W
  const targetW = Math.max(LOGICAL_W, safeCss * safeDpr)
  const w = Math.round(targetW)
  const h = Math.round((w * LOGICAL_H) / LOGICAL_W)
  return { w, h, scale: w / LOGICAL_W }
}
