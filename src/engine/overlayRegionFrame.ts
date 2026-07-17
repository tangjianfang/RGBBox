/**
 * Pure math for mapping an overlay's {@link OverlayConfig} region (a preset
 * third of the display, or a custom drag-selected rectangle) to a normalised
 * (0..1) rectangle.
 *
 * R63 root cause: `computeRegionBounds()` in `src/main/overlayManager.ts` uses
 * these same region fractions to size/position the overlay BrowserWindow on
 * the physical display, but the renderer side previously always pushed the
 * FULL, uncropped virtual-canvas frame to every overlay (`pushFrameToOverlays`)
 * — regardless of that window's region/size — and `PreviewGl` always
 * stretched whatever frame it received to fill its own canvas edge-to-edge
 * (R30.1). A non-fullscreen overlay (e.g. a small "custom region" window, or
 * a "top-third" strip) therefore showed the ENTIRE effect squished into its
 * own odd aspect ratio.
 *
 * R63 revision (2026-07-18, per user feedback): the first fix attempt made
 * non-fullscreen overlays CROP a sub-region of the virtual canvas instead —
 * but that is also wrong: a region window should still show the COMPLETE
 * effect, not a zoomed-in slice of it. The correct fix is a rendering-layer
 * one (see `src/renderer/src/gl/previewGl.ts`'s `computeContainLayout()` /
 * `PreviewGl#setFit('contain')`): non-fullscreen overlays render the full,
 * uncropped frame using a "contain" (letterboxed, aspect-preserving) layout
 * instead of "stretch to fill", so the whole effect is visible undistorted
 * inside whatever window size/aspect the region maps to. This module now
 * only provides the region→normalised-rectangle math shared with
 * `overlayManager.ts`'s window sizing — it does NOT crop frame content.
 */

import type { OverlayConfig, OverlayRegionCustom } from '../shared/types'

const FULL_RECT: OverlayRegionCustom = { x: 0, y: 0, width: 1, height: 1 }

/** Normalised (0..1) rectangle, relative to the display bounds, that a region config maps to. */
export function regionToNormalizedRect(config?: OverlayConfig): OverlayRegionCustom {
  if (!config) return FULL_RECT
  switch (config.region) {
    case 'top-third':    return { x: 0,     y: 0,     width: 1,     height: 1 / 3 }
    case 'middle-third': return { x: 0,     y: 1 / 3, width: 1,     height: 1 / 3 }
    case 'bottom-third': return { x: 0,     y: 2 / 3, width: 1,     height: 1 / 3 }
    case 'left-third':   return { x: 0,     y: 0,     width: 1 / 3, height: 1 }
    case 'center-third': return { x: 1 / 3, y: 0,     width: 1 / 3, height: 1 }
    case 'right-third':  return { x: 2 / 3, y: 0,     width: 1 / 3, height: 1 }
    case 'custom':       return config.custom ?? FULL_RECT
    case 'fullscreen':
    default:
      return FULL_RECT
  }
}

/**
 * R65: whether an overlay's region config makes it cover the ENTIRE target
 * display (no part of the physical screen behind it is ever visible). Matches
 * the exact same `'fullscreen'`-or-unknown-region default-case fallback used
 * by {@link regionToNormalizedRect} / `overlayManager.ts#computeRegionBounds`
 * — a window with an unrecognised region string already falls back to the
 * full display bounds there, so it should also be treated as fullscreen here
 * (single source of truth, avoids the two functions silently disagreeing).
 *
 * Used by `overlayManager.ts` to decide whether the overlay `BrowserWindow`
 * needs to be transparent at all: a fullscreen overlay's content always
 * covers 100% of its own window (see R30.1's "always stretch to fill"), so
 * there is nothing behind it that ever needs to show through — it can use
 * the exact same OPAQUE rendering path as the in-app "RGB 画布预览"
 * (`PreviewGl(overlay=false)`), instead of the transparent/alpha-blended path
 * that only non-fullscreen regions (letterboxed via R63) actually need.
 */
export function isFullscreenRegion(config?: OverlayConfig): boolean {
  if (!config) return true
  switch (config.region) {
    case 'top-third':
    case 'middle-third':
    case 'bottom-third':
    case 'left-third':
    case 'center-third':
    case 'right-third':
    case 'custom':
      return false
    case 'fullscreen':
    default:
      return true
  }
}

