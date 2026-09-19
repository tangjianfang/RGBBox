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
  /** R143: clutch = FIST sustained (open palm is the natural rest — it must
   * NOT clutch, or a relaxed hand freezes the cursor permanently) */
  fistSince: number | null
  frozen: boolean
  /** R143.1: client-side prediction — local velocity integrated at display
   * rate; snapshots re-anchor gently instead of snapping (netcode style) */
  velX: number
  velY: number
  /** where the authoritative snapshot says we should be (re-anchor target) */
  anchorX: number
  anchorY: number
}

export function createCursorState(x = 0.5, y = 0.5): CursorState {
  return { x, y, prevPalmX: NaN, prevPalmY: NaN, prevPalmT: NaN, fistSince: null, frozen: false, velX: 0, velY: 0, anchorX: x, anchorY: y }
}

/**
 * Feed an authoritative snapshot (palm from the pipeline). Runs at inference
 * rate; updates the local velocity + re-anchor target.
 */
export function cursorSnapshot(s: CursorState, palm: { x: number; y: number } | null, fist: boolean, nowMs: number, cfg: CursorConfig = DEFAULT_CURSOR_CONFIG): void {
  // clutch: sustained FIST freezes the cursor while the hand relocates
  if (fist) {
    s.fistSince ??= nowMs
    if (nowMs - s.fistSince >= cfg.clutchMs) {
      s.frozen = true
      s.velX = 0
      s.velY = 0
    }
  } else {
    s.fistSince = null
    s.frozen = false
  }
  if (!palm) {
    s.prevPalmX = NaN
    s.velX = 0
    s.velY = 0
    return
  }
  if (Number.isNaN(s.prevPalmX)) {
    s.prevPalmX = palm.x
    s.prevPalmY = palm.y
    s.prevPalmT = nowMs
    return
  }
  const dx = palm.x - s.prevPalmX
  const dy = palm.y - s.prevPalmY
  const dt = Math.max(1, nowMs - s.prevPalmT) / 1000
  s.prevPalmX = palm.x
  s.prevPalmY = palm.y
  s.prevPalmT = nowMs
  if (s.frozen) return
  const dist = Math.hypot(dx, dy)
  if (dist < cfg.tremorDeadZone) return
  const speed = dist / dt
  const gain = Math.min(cfg.gainCap, cfg.gainBase + cfg.gainPerSpeed * Math.min(speed, 6))
  // authoritative target: cursor + gained delta; the integrator chases it
  s.anchorX = clamp01(s.x + dx * gain)
  s.anchorY = clamp01(s.y + dy * gain)
  // velocity toward the anchor, expressed per display-second
  s.velX = (s.anchorX - s.x) / Math.max(0.008, dt)
  s.velY = (s.anchorY - s.y) / Math.max(0.008, dt)
}

/**
 * Display-rate integrator (R143.1): advance EVERY frame with the local
 * velocity, gently pulling toward the anchor. Called from rAF at 60fps —
 * this is what makes the cursor feel directly attached despite a 100ms+
 * pipeline behind it.
 */
export function cursorIntegrate(s: CursorState, dtSec: number): void {
  if (s.frozen) return
  const nx = clamp01(s.x + s.velX * dtSec)
  const ny = clamp01(s.y + s.velY * dtSec)
  // gentle re-anchor pull (≈12% per frame @60fps) kills drift without snap
  const pull = 1 - Math.exp(-7.5 * dtSec)
  s.x = nx + (s.anchorX - nx) * pull
  s.y = ny + (s.anchorY - ny) * pull
  // velocity decays toward zero as we approach the anchor
  s.velX *= 1 - Math.min(0.9, 6 * dtSec)
  s.velY *= 1 - Math.min(0.9, 6 * dtSec)
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
