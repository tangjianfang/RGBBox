// R226.4: replay harness — feeds a recorded fixture (per-frame landmarks,
// extracted from real video via tools/vision-dataset) through the REAL
// SessionController, then scores the emitted gesture events against the
// labeled marks (recall / trigger latency / out-of-window false fires).
//
// Fixture  : <name>.jsonl        — one {t, hands:[{lm,score,h}], face} per line
// Labels   : <name>.labels.json  — { marks:[{gesture, from, to}], gates }
// gesture 词汇 = 引擎事件原语: 'pinch' | 'dir-right'|'dir-up-right'|'dir-up'|
//   'dir-up-left'|'dir-left'|'dir-down-left'|'dir-down'|'dir-down-right'
import { readFileSync, existsSync } from 'node:fs'
import { SessionController } from '../../src/renderer/src/vision/session.js'

export const T0 = 5000 // session clock offset (engine epoch, matches helpers.mjs)
export const DEFAULT_GATES = { recall: 0.8, falseMax: 4, latencyMaxMs: 500 }
/** an event may fire this long after the mark window closes and still count */
export const GRACE_MS = 400

export function loadFixture (base) {
  const frames = readFileSync(`${base}.jsonl`, 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  if (!frames.length) throw new Error(`empty fixture: ${base}.jsonl`)
  const labelsPath = `${base}.labels.json`
  const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : { marks: [] }
  return { base, frames, marks: labels.marks ?? [], gates: { ...DEFAULT_GATES, ...(labels.gates ?? {}) } }
}

/** Replay frames through a real SessionController; returns timed events. */
export function replay ({ frames }) {
  // requireFace:false mirrors the product's games pipeline (faceModel:null —
  // the extraction tool records hands only, exactly like the real consumer).
  const session = new SessionController({ calSteps: { center: 500, reach: 700, pinch: 1100 }, requireFace: false })
  session.start(T0)
  const timed = []
  let activeFrom = null
  for (const f of frames) {
    const { events, snapshot } = session.onFrame({
      nowMs: T0 + f.t,
      hands: (f.hands ?? []).map((h) => ({ landmarks: h.lm.map(([x, y]) => ({ x, y })), score: h.score ?? 0.9, handedness: h.h ?? 'Right' })),
      face: f.face ?? null,
    })
    const state = snapshot?.state ?? session.state
    if (state === 'active') {
      if (activeFrom == null) activeFrom = f.t
      // count events only while ACTIVE — the wizard's own calibration motions
      // (reach sweep / pinch cycles) legitimately fire engine events pre-active,
      // but no consumer sees gestures before activation.
      for (const ev of events) timed.push({ ...ev, t: f.t })
    }
  }
  session.stop?.()
  return { timed, activeFrom, state: session.state }
}

const matches = (ev, gesture) =>
  gesture === 'pinch'
    ? ev.kind === 'pinch' && ev.down === true
    : ev.kind === 'direction' && ev.down === true && ev.dir === gesture.slice(4)

/** post-activation settle grace — the recording protocol's trailing calibration
 * motions (a user naturally keeps cycling a beat after the wizard completes)
 * must not count as false fires */
export const SETTLE_MS = 800

/** Score timed events against marks → per-gesture + overall metrics. */
export function score ({ timed, marks, activeFrom = 0 }) {
  const byGesture = {}
  const used = new Set()
  for (const m of marks) {
    const g = byGesture[m.gesture] ??= { windows: 0, hits: 0, latencies: [] }
    g.windows++
    const from = m.from - 100
    const to = m.to + GRACE_MS
    const hit = timed.find((ev, i) => !used.has(i) && matches(ev, m.gesture) && ev.t >= from && ev.t <= to)
    if (hit) {
      used.add(timed.indexOf(hit))
      g.hits++
      g.latencies.push(Math.max(0, hit.t - m.from))
    }
  }
  const falseFires = timed.filter((ev, i) => {
    if (used.has(i) || ev.down !== true) return false
    if (activeFrom != null && ev.t < activeFrom + SETTLE_MS) return false // post-activation settle
    if (ev.kind === 'pinch') return !marks.some((m) => m.gesture === 'pinch' && ev.t >= m.from - 100 && ev.t <= m.to + GRACE_MS)
    if (ev.kind === 'direction') return !marks.some((m) => m.gesture === `dir-${ev.dir}` && ev.t >= m.from - 100 && ev.t <= m.to + GRACE_MS)
    return false
  })
  const gestures = Object.entries(byGesture).map(([name, g]) => ({
    name, windows: g.windows, hits: g.hits,
    recall: g.windows ? g.hits / g.windows : 1,
    latencyP50: pct(g.latencies, 0.5), latencyP95: pct(g.latencies, 0.95),
  }))
  const windows = gestures.reduce((s, g) => s + g.windows, 0)
  const hits = gestures.reduce((s, g) => s + g.hits, 0)
  return { gestures, recall: windows ? hits / windows : 1, falseFires: falseFires.length, falseEvents: falseFires }
}

const pct = (arr, p) => arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null

/** Replay + score + gate verdict for one fixture base path. */
export function evaluate (base) {
  const fixture = loadFixture(base)
  const run = replay(fixture)
  const metrics = score({ timed: run.timed, marks: fixture.marks, activeFrom: run.activeFrom })
  const failures = []
  if (fixture.marks.length && run.activeFrom == null) failures.push('session never reached active (calibration motions missing/broken?)')
  if (metrics.recall < fixture.gates.recall) failures.push(`recall ${metrics.recall.toFixed(2)} < gate ${fixture.gates.recall}`)
  if (metrics.falseFires > fixture.gates.falseMax) failures.push(`false fires ${metrics.falseFires} > gate ${fixture.gates.falseMax}`)
  const slow = metrics.gestures.filter((g) => g.latencyP50 != null && g.latencyP50 > fixture.gates.latencyMaxMs)
  if (slow.length) failures.push(`latency gate breached: ${slow.map((g) => `${g.name}@${g.latencyP50}ms`).join(', ')}`)
  return { base, run, metrics, gates: fixture.gates, ok: failures.length === 0, failures }
}
