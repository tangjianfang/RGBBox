// R237 / TASK-UNIVERSE F2: synthetic landmark VARIANTS — the 972-cell
// recognition-boundary grid (6 gestures × 3 scale × 3 noise × 3 dropout ×
// 2 occlusion × 3 speed). Every cell is a real regression lock on the
// engine's decision boundaries; this factory applies the transforms to the
// canonical makeHand() shapes from helpers.mjs.
import { makeHand, mulberry32, gaussian } from './helpers.mjs'

export const VOCAB = ['dir8', 'pinch', 'palm', 'chord-menu', 'chord-light', 'double-pinch']
export const SCALES = [0.12, 0.18, 0.24]
export const NOISES = [0.004, 0.008, 0.016]
export const DROPS = [0, 0.1, 0.25]
export const OCCLUSIONS = ['none', 'partial']
export const SPEEDS = ['slow', 'normal', 'fast']

/** all 972 cells (stable order: vocab-major) */
export function allCells() {
  const cells = []
  for (const v of VOCAB) for (const s of SCALES) for (const n of NOISES)
    for (const d of DROPS) for (const o of OCCLUSIONS) for (const sp of SPEEDS)
      cells.push({ vocab: v, scale: s, noise: n, dropout: d, occlusion: o, speed: sp })
  return cells
}

export function cellId(c) {
  return `${c.vocab}|${c.scale}|${c.noise}|${c.dropout}|${c.occlusion}|${c.speed}`
}

/** deterministic per-cell rng */
export function cellRng(c) { return mulberry32(hash(cellId(c))) }
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

/**
 * One variant frame: canonical hand at (cx,cy,pinchGap) transformed by the
 * cell's scale/noise/dropout/occlusion. "low-light" = max noise + any
 * dropout (score degradation proxy lives in the driver, not here).
 */
export function variantHand(c, rng, { cx = 0.5, cy = 0.5, pinchGap = 1.2, fingerOverride = null } = {}) {
  const lm = makeHand({ cx, cy, pinchGap, scale: c.scale })
  const pts = fingerOverride ? applyFingers(lm, c, fingerOverride) : lm
  const out = pts.map((p, i) => {
    if (c.dropout > 0 && rng() < c.dropout) {
      // dropped detection: collapse toward palm center (degenerate but finite)
      return { x: cx + (p.x - cx) * 0.3, y: cy + (p.y - cy) * 0.3 }
    }
    if (c.occlusion === 'partial' && (i === 4 || i === 8)) {
      // thumb/index tip occluded: degrade TOWARD the PIP joint but keep ~35% of
      // the tip displacement — real occlusion drifts landmarks, it does not
      // teleport them (snapping outright deleted the pinch-gap signal)
      const pip = pts[i === 4 ? 2 : 6]
      return { x: pip.x + (p.x - pip.x) * 0.35, y: pip.y + (p.y - pip.y) * 0.35 }
    }
    return { x: clamp01(p.x + gaussian(rng, c.noise)), y: clamp01(p.y + gaussian(rng, c.noise)) }
  })
  return out
}

/** finger-extension overrides for chord shapes: indices are tip landmarks */
function applyFingers(lm, c, fingers) {
  // fingers: { thumb:boolean, index:..., middle:..., ring:..., pinky:... } —
  // fold an extended finger by pulling its chain toward the palm
  const pts = lm.map((p) => ({ ...p }))
  const fold = (tip, pip) => {
    if (!fingers.folded?.[tipName(tip)]) return
    pts[tip] = { x: pts[pip].x + (pts[0].x - pts[pip].x) * 0.25, y: pts[pip].y + (pts[0].y - pts[pip].y) * 0.25 }
  }
  // simplified: caller passes folded/extended sets by name
  for (const name of fingers.folded ?? []) {
    const map = { thumb: [4, 2], index: [8, 6], middle: [12, 10], ring: [16, 14], pinky: [20, 18] }
    const [tip, pip] = map[name] ?? []
    if (tip != null) pts[tip] = { x: pts[pip].x + (pts[0].x - pts[pip].x) * 0.25, y: pts[pip].y + (pts[0].y - pts[pip].y) * 0.25 }
  }
  // canonical makeHand parks the thumb tip near the pinky MCP (pinch-ready),
  // which the extension heuristic reads as FOLDED — the thumb-led 'light'
  // chord needs an explicit extended thumb, clearly lateral of the palm
  if (fingers.extended?.includes('thumb')) {
    const cx = pts[0].x, cy = pts[0].y, sc = Math.hypot(pts[9].x - pts[0].x, pts[9].y - pts[0].y)
    pts[4] = { x: cx - sc * 0.9, y: cy - sc * 1.05 }
  }
  return pts
}
const tipName = () => ''

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** frame cadence per speed (ms between frames at nominal 30fps timing) */
export function speedFrames(c, n) {
  const step = c.speed === 'slow' ? 3 : c.speed === 'fast' ? 1 : 2 // frames per posture
  const out = []
  for (let i = 0; i < n; i++) out.push(Math.floor(i / step))
  return out
}

/** "low light" proxy: heavy noise + any dropout */
export function isLowLight(c) { return c.noise >= 0.016 && c.dropout > 0 }
