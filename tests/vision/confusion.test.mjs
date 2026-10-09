// R237 / TASK-UNIVERSE F2: the recognition-boundary CONFUSION GATE.
// Sampled cells run in the default suite (seconds); FULL_CONFUSION=1 runs all
// 972 (yarn vision:confusion wraps it and writes the ledger).
import { test, expect } from 'vitest'
import { allCells, cellId, cellRng, variantHand, isLowLight } from './variantFactory.mjs'
import { SessionDriver, CENTER } from './helpers.mjs'
import { ChordEngine } from '../../src/renderer/src/vision/fingerChords.js'

const QUICK_CFG = {
  calSteps: { center: 500, reach: 700, pinch: 1100 },
  requireFace: false, // faceless pipeline = the product's games/assistant path
  dualHand: { enabled: true, primaryHand: 'Right', offPinchKey: 'KeyF' },
}

/** dir8 / pinch / palm / double-pinch drive a full session; chords drive ChordEngine directly. */
function runCell(c) {
  if (c.vocab === 'chord-menu' || c.vocab === 'chord-light') return runChordCell(c)
  const rng = cellRng(c)
  const d = new SessionDriver({ cfg: QUICK_CFG })
  d.calibrate()
  const events = []
  // feed VARIANT landmarks directly (SessionDriver.frame() would rebuild its
  // own canonical hand and discard the transforms — the F2 point is the variants)
  const feed = (hands) => { d.t += d.dt; const r = d.session.onFrame({ nowMs: d.t, hands, face: null }); events.push(...r.events); return r }
  const variant = (cx, cy, pinch = 1.2) => [{ landmarks: variantHand(c, rng, { cx, cy, pinchGap: pinch }), score: 0.9, handedness: 'Right' }]
  const twoHands = (cx1, cx2, pg, pg2) => [
    { landmarks: variantHand(c, rng, { cx: cx1, cy: 0.5, pinchGap: pg }), score: 0.9, handedness: 'Right' },
    { landmarks: variantHand(c, rng, { cx: cx2, cy: 0.5, pinchGap: pg2 }), score: 0.9, handedness: 'Left' },
  ]

  if (c.vocab === 'dir8') {
    // staged approach (ring-internal settle) then decisive hold at 'up'
    // (screen-up = SMALLER y — the engine inverts camera y)
    for (let i = 0; i < 10; i++) feed(variant(CENTER.x, CENTER.y - 0.24))
    for (let i = 0; i < 4; i++) feed(variant(CENTER.x, CENTER.y - 0.12))
    for (let i = 0; i < 16; i++) feed(variant(CENTER.x, CENTER.y - 0.24))
    const hit = events.some((e) => e.kind === 'direction' && e.down && e.dir === 'up')
    const wrong = events.filter((e) => e.kind === 'direction' && e.down && e.dir && e.dir !== 'up')
    return { hit, wrong: wrong.length }
  }
  if (c.vocab === 'pinch') {
    for (let i = 0; i < 8; i++) feed(variant(CENTER.x, CENTER.y, 1.25))
    for (let i = 0; i < 14; i++) feed(variant(CENTER.x, CENTER.y, 0.22))
    for (let i = 0; i < 8; i++) feed(variant(CENTER.x, CENTER.y, 1.25))
    return { hit: events.some((e) => e.kind === 'pinch' && e.down), wrong: 0 }
  }
  if (c.vocab === 'palm') {
    let seen = 0
    for (let i = 0; i < 20; i++) { feed(variant(CENTER.x, CENTER.y)); if (d.session.state === 'active') seen++ }
    return { hit: seen >= 15, wrong: 0 }
  }
  // double-pinch: primary + off hand pinch together (Space + KeyF)
  for (let i = 0; i < 8; i++) feed(twoHands(0.4, 0.6, 1.25, 1.25))
  for (let i = 0; i < 14; i++) feed(twoHands(0.4, 0.6, 0.22, 0.22))
  const held = events.some((e) => e.kind === 'pinch' && e.down && e.key === 'Space')
  const off = events.some((e) => e.down && e.key === 'KeyF') // off-hand pinch rides kind 'offhand'
  return { hit: held && off, wrong: 0 }
}

function runChordCell(c) {
  const rng = cellRng(c)
  const eng = new ChordEngine()
  // menu = index+middle+ring extended (fold thumb+pinky); light = thumb+index+middle (fold ring+pinky)
  const isMenu = c.vocab === 'chord-menu'
  const fingers = isMenu
    ? { folded: ['thumb', 'pinky'] }                          // index+middle+ring
    : { folded: ['ring', 'pinky'], extended: ['thumb'] }      // thumb+index+middle
  const hold = c.speed === 'slow' ? 14 : c.speed === 'fast' ? 8 : 10
  const mk = () => variantHand(c, rng, { cx: 0.5, cy: 0.55, pinchGap: 1.2, fingerOverride: fingers })
  const evs = []
  for (let i = 0; i < hold; i++) evs.push(...eng.update(mk()))
  // release to a FIST (0 fingers = neutral): commit fires on relaxing toward
  // FEWER extended fingers — releasing to an open palm (5) would NOT commit
  const fist = ['thumb', 'index', 'middle', 'ring', 'pinky']
  for (let i = 0; i < 6; i++) evs.push(...eng.update(variantHand(c, rng, { cx: 0.5, cy: 0.55, pinchGap: 0.1, fingerOverride: { folded: fist } })))
  const want = c.vocab === 'chord-menu' ? 'menu' : 'light'
  const hit = evs.some((e) => e.kind === 'chord' && e.name === want)
  return { hit, wrong: 0 } // orthogonal-fire gate = DIRECTION cross-fires only
}

// ── the gate ────────────────────────────────────────────────────────────────
const cells = allCells()
const sampled = cells.filter((_, i) => i % 6 === 0) // 162 cells in CI
const active = process.env.FULL_CONFUSION === '1' ? cells : sampled

test(`R237 confusion gate: ${active.length} cells — diagonal ≥90%, low-light ≥80%, zero orthogonal fire`, () => {
  expect(active.length).toBeGreaterThanOrEqual(160)
  const results = active.map((c) => {
    const { hit, wrong } = runCell(c)
    return { id: cellId(c), hit, wrong, low: isLowLight(c) }
  })
  const pass = results.filter((r) => r.hit).length
  const passRate = pass / results.length
  const low = results.filter((r) => r.low)
  const lowRate = low.length ? low.filter((r) => r.hit).length / low.length : 1
  const orthogonalFires = results.reduce((s, r) => s + r.wrong, 0)
  const fails = results.filter((r) => !r.hit).map((r) => r.id)
  if (passRate < 0.9 || lowRate < 0.8 || orthogonalFires > 0) {
    const byVocab = {}
    for (const r of results) if (!r.hit) byVocab[r.id.split('|')[0]] = (byVocab[r.id.split('|')[0]] ?? 0) + 1
    throw new Error(`confusion gate FAIL: pass=${(passRate * 100).toFixed(1)}% low=${(lowRate * 100).toFixed(1)}% orthFires=${orthogonalFires} | fail-by-vocab: ${JSON.stringify(byVocab)} | sample: ${fails.slice(0, 4).join(' ; ')}`)
  }
})
