/**
 * R226.4: generate the committed synthetic sample replay fixture — proves the
 * whole replay chain (jsonl → SessionController → scored events vs marks) in
 * CI without camera/wasm. Mirrors the recording protocol real videos follow:
 * calibration motions first (center → 8-dir reach → pinch cycles), then
 * labeled gesture segments.
 *
 *   node scripts/vision-gen-sample-replay.mjs
 * → tests/vision/fixtures-replay/sample-synthetic.{jsonl,labels.json}
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeHand, atPalm, CENTER } from '../tests/vision/helpers.mjs'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/vision/fixtures-replay')
const FPS = 30
const DT = 1000 / FPS
const R4 = (v) => Math.round(v * 10000) / 10000

const frames = []
const marks = []
let t = 0

function push ({ cx, cy, pinch = 1.2, absent = false }) {
  const hands = absent ? [] : [{
    lm: makeHand({ cx, cy, pinchGap: pinch }).map((p) => [R4(p.x), R4(p.y)]),
    score: 0.92,
    h: 'Right',
  }]
  frames.push({ t: Math.round(t), hands, face: null })
  t += DT
}

const at = (deg, r) => atPalm(CENTER.x + Math.cos(deg) * r, CENTER.y - Math.sin(deg) * r)

// ── recording protocol: calibration motions (session auto-runs the wizard) ─
for (let i = 0; i < 18; i++) push(atPalm(CENTER.x, CENTER.y))                       // step 1 center
for (let k = 0; k < 8; k++) {                                                       // step 2 reach, 8 dirs
  const deg = (k * 45 * Math.PI) / 180
  for (let i = 0; i < 4; i++) push(at(deg, 0.20))
}
// step 3 pinch cycles — 12 phases ≈ 1200ms, just past the 1100ms gate like
// helpers.calibrate(cycles:6); MORE cycles here would keep firing pinch events
// after activation → out-of-window false fires in the replay scorer.
for (let i = 0; i < 12; i++)
  for (let j = 0; j < 3; j++) push({ ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 })
for (let i = 0; i < 40; i++) push(atPalm(CENTER.x, CENTER.y))                       // settle active (open palm)

// ── labeled gesture segments ───────────────────────────────────────────────
function pinchCycle () {
  for (let i = 0; i < 14; i++) push(atPalm(CENTER.x, CENTER.y))                     // open
  const from = Math.round(t)
  for (let i = 0; i < 10; i++) push({ ...atPalm(CENTER.x, CENTER.y), pinch: 0.22 }) // held pinch
  marks.push({ gesture: 'pinch', from, to: Math.round(t - DT) })
  for (let i = 0; i < 12; i++) push(atPalm(CENTER.x, CENTER.y))                     // release
}

function directionHold (name, deg) {
  for (let i = 0; i < 20; i++) push(atPalm(CENTER.x, CENTER.y))                     // rest
  // stage inside the ring first so the OneEuro filter settles ANGULARLY below
  // activeZone — the radial push-out then crosses the ring at a stable angle
  // (a center→sector jump curves through neighbouring sectors and fires them).
  const mid = at(deg, 0.12)
  for (let i = 0; i < 8; i++) push(mid)
  const from = Math.round(t)
  const p = at(deg, 0.24)                                                           // inside the calibrated ring
  for (let i = 0; i < 30; i++) push(p)                                              // decisive hold
  marks.push({ gesture: `dir-${name}`, from, to: Math.round(t - DT) })
  for (let i = 0; i < 8; i++) push(mid)                                             // staged return
}

for (let i = 0; i < 3; i++) pinchCycle()
directionHold('up', Math.PI / 2)
directionHold('right', 0)
directionHold('down-left', (225 * Math.PI) / 180)
directionHold('up-right', Math.PI / 4)
for (let i = 0; i < 12; i++) push(atPalm(CENTER.x, CENTER.y))

// ── write fixture + labels ─────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/sample-synthetic.jsonl`, frames.map((f) => JSON.stringify(f)).join('\n') + '\n')
writeFileSync(`${OUT_DIR}/sample-synthetic.labels.json`, JSON.stringify({
  source: 'synthetic (makeHand — proves the replay chain, NOT detection quality)',
  fps: FPS,
  marks,
  // synthetic data is clean by construction: demand perfection
  gates: { recall: 1, falseMax: 0, latencyMaxMs: 400 },
}, null, 2) + '\n')
console.log(`sample fixture: ${frames.length} frames, ${marks.length} marks → ${OUT_DIR}/sample-synthetic.{jsonl,labels.json}`)
