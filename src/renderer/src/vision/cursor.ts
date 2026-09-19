// R142-L3: relative cursor — trackpad semantics for mid-air pointing.
//
// Why relative: absolute hand→screen mapping carries every calibration sin
// (camera FOV vs screen aspect, mirror, mounting offset) straight into
// pointer error — the 25-50-DPI figure in the research matrix belongs to
// ABSOLUTE mapping. Relative per-frame deltas + a clutch (open-palm hold =
// lift the mouse) are insensitive to all three, and speed-dependent dynamic
// gain (slow = pixel-precise, fast = traverse) is the validated fix for the
// speed/precision trade-off (VR pointing literature: +29-60% over raycast).
//
// Pure state machine — no DOM, fully unit-testable.

export interface CursorConfig {
  /** per-frame palm deltas below this are tremor, not intent (normalized units) */
  tremorDeadZone: number
  /** gain at zero speed (cursor px per palm unit at 1000px screen ≈ multiplier) */
  gainBase: number
  /** extra gain per unit of palm speed (units/s), capped */
  gainPerSpeed: number
  gainCap: number
  /** open-palm sustained this long → clutch (cursor frozen, hand repositions) */
  clutchMs: number
}

export const DEFAULT_CURSOR_CONFIG: CursorConfig = {
  tremorDeadZone: 0.0025,
  gainBase: 1.6,
  gainPerSpeed: 0.5,
  gainCap: 4.2,
  clutchMs: 220,
}

export interface CursorState {
  /** screen-space cursor, normalized 0..1 */
  x: number
  y: number
  /** previous palm position (normalized) for per-frame deltas */
  prevPalmX: number
  prevPalmY: number
  prevPalmT: number
  /** clutch (open-palm) tracking */
  openSince: number | null
  frozen: boolean
}

export function createCursorState(x = 0.5, y = 0.5): CursorState {
  return { x, y, prevPalmX: NaN, prevPalmY: NaN, prevPalmT: NaN, openSince: null, frozen: false }
}

/**
 * Advance the cursor one frame.
 * @param s      mutable state (createCursorState)
 * @param palm   predicted palm position (normalized 0..1) or null when unseen
 * @param openPalm true while the pinch distance is above release threshold
 * @param nowMs  performance.now() at this frame
 * @returns the updated state (same object)
 */
export function cursorStep(s: CursorState, palm: { x: number; y: number } | null, openPalm: boolean, nowMs: number, cfg: CursorConfig = DEFAULT_CURSOR_CONFIG): CursorState {
  // clutch: sustained open palm freezes the cursor while the hand relocates
  if (openPalm) {
    s.openSince ??= nowMs
    if (nowMs - s.openSince >= cfg.clutchMs) s.frozen = true
  } else {
    s.openSince = null
    s.frozen = false
  }
  if (!palm) {
    // hand lost → keep the cursor where it is; reset delta baseline
    s.prevPalmX = NaN
    return s
  }
  if (Number.isNaN(s.prevPalmX)) {
    s.prevPalmX = palm.x
    s.prevPalmY = palm.y
    s.prevPalmT = nowMs
    return s
  }
  const dx = palm.x - s.prevPalmX
  const dy = palm.y - s.prevPalmY
  const dt = Math.max(1, nowMs - s.prevPalmT) / 1000
  s.prevPalmX = palm.x
  s.prevPalmY = palm.y
  s.prevPalmT = nowMs
  if (s.frozen) return s
  const dist = Math.hypot(dx, dy)
  if (dist < cfg.tremorDeadZone) return s
  // dynamic gain: speed-dependent pointer acceleration
  const speed = dist / dt
  const gain = Math.min(cfg.gainCap, cfg.gainBase + cfg.gainPerSpeed * Math.min(speed, 6))
  s.x = clamp01(s.x + dx * gain)
  s.y = clamp01(s.y + dy * gain)
  return s
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Pure hit-test: which rect (if any) contains the cursor. Used by the
 * overlay to highlight + click — kept pure so geometry is unit-testable
 * without a DOM layout.
 */
export function hitTest<T>(cursor: { x: number; y: number }, rects: Array<{ item: T; x: number; y: number; w: number; h: number }>): T | null {
  for (const r of rects) {
    if (cursor.x >= r.x && cursor.x <= r.x + r.w && cursor.y >= r.y && cursor.y <= r.y + r.h) return r.item
  }
  return null
}
