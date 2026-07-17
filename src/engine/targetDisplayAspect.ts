/**
 * R66 root cause: even after R62/R63/R65 unified every other part of the
 * preview vs overlay rendering pipeline (backing-buffer DPR, region fit,
 * window opacity), the in-app preview's aspect ratio (and the "match display
 * ratio" grid-sizing helper in App.tsx) always computed against the PRIMARY
 * display's aspect ratio — completely ignoring which physical display the
 * user actually has an overlay open on. `overlayManager.ts` correctly sizes
 * the real overlay window from the ACTUAL target display's own `bounds`
 * (whichever display that is), so whenever the active overlay display isn't
 * the primary one (a very common setup — e.g. effects projected to a
 * secondary/dedicated monitor while the app itself runs on the laptop's main
 * screen), the preview and the real projected output end up stretching the
 * SAME frame to two DIFFERENT aspect ratios — visually distorted relative to
 * each other, even with fullscreen + opaque rendering unified on both sides.
 *
 * This module is the single source of truth for "which aspect ratio should
 * the in-app preview / grid-sizing match", used by `App.tsx`.
 */

import type { DisplayTopology } from '../shared/types'

/**
 * Resolution order:
 *   1. Linked-display mode → the virtual desktop's aspect ratio (unchanged —
 *      a linked-mode overlay's sub-frame is extracted proportionally from
 *      the virtual canvas, see `extractSubFrame()` in App.tsx).
 *   2. Exactly one non-linked overlay currently active → THAT display's own
 *      real aspect ratio — the actual, unambiguous projection target.
 *   3. Zero or multiple non-linked overlays active, or the single active
 *      overlay's display id isn't found in the topology → the primary
 *      display's aspect ratio (existing fallback; there is no single
 *      unambiguous target to prefer over it in these cases).
 */
export function resolveTargetDisplayAspect(
  topology: DisplayTopology | null,
  overlayDisplayIds: readonly number[],
  linkedDisplays: boolean
): number {
  if (!topology) return 16 / 9

  if (linkedDisplays) {
    const vb = topology.virtualBounds
    return vb.width / Math.max(1, vb.height)
  }

  if (overlayDisplayIds.length === 1) {
    const target = topology.displays.find((d) => d.id === overlayDisplayIds[0])
    if (target) return target.bounds.width / Math.max(1, target.bounds.height)
  }

  const primary = topology.displays.find((d) => d.primary) ?? topology.displays[0]
  return primary ? primary.bounds.width / Math.max(1, primary.bounds.height) : 16 / 9
}
