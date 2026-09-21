// R147 P1: extracted verbatim from App.tsx module scope (overlay frame
// distribution). Window-dependent (calls window.rgbbox) but pure in its
// routing decision — fully testable with a stubbed rgbbox bridge.
import { extractWallPanelFrame } from '../../../engine/videoWallFrame'
import type { DisplayTopology, OverlayConfig, RgbFrame, Scene } from '../../../shared/types'

/**
 * Extract the sub-region of a virtual-canvas frame that corresponds to a given display's
 * physical position in the virtual desktop. Used in linked-display mode so each overlay
 * only shows its own portion of the full virtual canvas.
 */
export function extractSubFrame(
  virtualFrame: RgbFrame,
  displayId: number,
  topology: DisplayTopology
): RgbFrame | null {
  const display = topology.displays.find((d) => d.id === displayId)
  if (!display) return null
  const vb = topology.virtualBounds
  if (vb.width === 0 || vb.height === 0) return null

  const offsetX = Math.round((display.bounds.x - vb.x) / vb.width * virtualFrame.columns)
  const offsetY = Math.round((display.bounds.y - vb.y) / vb.height * virtualFrame.rows)
  const dispCols = Math.round(display.bounds.width / vb.width * virtualFrame.columns)
  const dispRows = Math.round(display.bounds.height / vb.height * virtualFrame.rows)

  if (dispCols <= 0 || dispRows <= 0) return null

  const pixels = new Uint8ClampedArray(dispCols * dispRows * 3)
  for (let y = 0; y < dispRows; y++) {
    for (let x = 0; x < dispCols; x++) {
      const srcI = ((offsetY + y) * virtualFrame.columns + Math.min(virtualFrame.columns - 1, offsetX + x)) * 3
      const dstI = (y * dispCols + x) * 3
      pixels[dstI]     = virtualFrame.pixels[srcI]
      pixels[dstI + 1] = virtualFrame.pixels[srcI + 1]
      pixels[dstI + 2] = virtualFrame.pixels[srcI + 2]
    }
  }
  return { columns: dispCols, rows: dispRows, pixels, generatedAt: virtualFrame.generatedAt, showGap: virtualFrame.showGap, renderStyle: virtualFrame.renderStyle }
}

/**
 * Physical aspect ratio (width/height) of a display, used by video-wall content
 * fitting. Falls back to 1 (square) when the display is unknown or degenerate.
 */
export function displayAspect(displayId: number, topology: DisplayTopology | null): number {
  const display = topology?.displays.find((d) => d.id === displayId)
  if (!display || display.bounds.height <= 0) return 1
  return display.bounds.width / display.bounds.height
}

/**
 * R63: whether an overlay's own {@link OverlayConfig} region calls for the
 * "contain" (letterboxed, aspect-preserving) render fit instead of the
 * default "stretch" fit. Only `fullscreen` (or no config at all) keeps
 * 'stretch' — its window aspect already matches the frame's content. Every
 * other preset region ('top-third', 'custom', ...) has a window aspect ratio
 * unrelated to the frame's own aspect ratio, so stretching would distort the
 * whole effect; those get 'contain' so the COMPLETE effect stays visible and
 * undistorted (an earlier fix attempt instead cropped a sub-region, which
 * was wrong — a region window should still show the whole effect, not part
 * of it).
 */
export function regionFitFor(config: OverlayConfig | undefined): 'stretch' | 'contain' {
  return config && config.region !== 'fullscreen' ? 'contain' : 'stretch'
}

/**
 * Stamp the render fit for a specific overlay onto a (possibly shared) base
 * frame. Returns the SAME frame instance when 'stretch' applies (the common
 * case) to avoid a per-overlay allocation; only clones (shallow — the pixel
 * buffer is NOT copied) when the overlay needs 'contain'.
 */
export function frameForOverlay(baseFrame: RgbFrame, config: OverlayConfig | undefined): RgbFrame {
  const regionFit = regionFitFor(config)
  if (regionFit === 'stretch') return baseFrame
  return { ...baseFrame, regionFit }
}

/**
 * Distribute a freshly rendered virtual-canvas frame to the open overlay
 * windows. Selection order:
 *  1. `scene.videoWall` present → stitch each panel via {@link extractWallPanelFrame}
 *     and push to the panel's mapped physical display (R21). Overlays without a
 *     matching panel fall back to {@link extractSubFrame} (or are skipped).
 *  2. `scene.linkedDisplays` with >1 display → per-display equal-width sub-frame.
 *  3. otherwise → broadcast the full frame to every overlay.
 *
 * R63: after computing the per-display base frame above, each overlay's own
 * {@link OverlayConfig} region additionally selects a render FIT via
 * {@link frameForOverlay} — 'stretch' for fullscreen overlays (unchanged),
 * 'contain' (letterboxed) for any preset-third/custom region, so those
 * windows show the COMPLETE effect undistorted instead of the whole frame
 * squished into an arbitrary window aspect ratio. This does NOT crop the
 * frame's pixel content — an earlier fix attempt did, which was wrong (a
 * region window should show the whole effect, not a zoomed-in slice of it).
 */
export function distributeFrameToOverlays(
  frame: RgbFrame,
  scene: Scene | null,
  topology: DisplayTopology | null,
  overlayIds: number[],
  overlayConfigs: Record<number, OverlayConfig>
): void {
  if (overlayIds.length === 0) return

  const wall = scene?.videoWall
  if (wall && wall.panels.length > 0) {
    for (const displayId of overlayIds) {
      const config = overlayConfigs[displayId]
      const panel = wall.panels.find((p) => p.displayId === displayId)
      if (panel) {
        const panelFrame = extractWallPanelFrame(frame, panel, wall, {
          panelAspect: displayAspect(displayId, topology)
        })
        window.rgbbox.pushFrameToDisplay(displayId, frameForOverlay(panelFrame, config))
        continue
      }
      // No panel mapped to this overlay: degrade gracefully rather than blanking.
      const fallback = topology ? extractSubFrame(frame, displayId, topology) : null
      if (fallback) window.rgbbox.pushFrameToDisplay(displayId, frameForOverlay(fallback, config))
    }
    return
  }

  if (scene?.linkedDisplays && topology && topology.displays.length > 1) {
    // Linked-display mode: each overlay gets only its sub-region of the virtual canvas
    for (const displayId of overlayIds) {
      const subFrame = extractSubFrame(frame, displayId, topology)
      if (subFrame) window.rgbbox.pushFrameToDisplay(displayId, frameForOverlay(subFrame, overlayConfigs[displayId]))
    }
    return
  }

  // Simple single-frame case: if every active overlay uses the plain
  // fullscreen region, broadcast once (fast path, unchanged from before R63).
  // Otherwise at least one overlay needs its own 'contain' fit stamped, so
  // push per-display instead.
  const needsPerDisplayFit = overlayIds.some((id) => regionFitFor(overlayConfigs[id]) === 'contain')
  if (!needsPerDisplayFit) {
    window.rgbbox.pushFrameToOverlays(frame)
    return
  }
  for (const displayId of overlayIds) {
    window.rgbbox.pushFrameToDisplay(displayId, frameForOverlay(frame, overlayConfigs[displayId]))
  }
}
