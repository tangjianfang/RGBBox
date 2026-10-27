// R306/T2: the deep-bench planner + scorer — the W0 measurement instrument's
// reporting half. T1 records a session; THIS module walks the user through a
// FIXED-TIMELINE plan over the six USER_VOCAB words and scores the recording
// against it: per-word recall / confirm latency / top confusion pairs, with
// the R237 synthetic baseline alongside (「你的环境 vs 实验室基线」).
//
// Matching semantics (single source: the engine + product rules):
//   pinch        ← {kind:'pinch', down:true}
//   dir8         ← {kind:'direction', down:true} (any sector — one word, R231)
//   chord-menu   ← {kind:'chord', name:'menu', down:true}
//   chord-light  ← {kind:'chord', name:'light', down:true}
//   double-pinch ← {kind:'hands', down:true} (apart OR together — one cycle)
//   palm         ← FRAME-derived: geom.pinch > 0.85 sustained ≥700ms
//                  (MiniGamesView R138 open-palm-hold params; no engine event
//                  exists for 张掌 — it is a state, not an edge)
//
// Pure domain — no DOM/Electron. Latency is measured from prompt onset, so
// it includes human reaction (~250-400ms); the gates reflect that.
import { USER_VOCAB } from '../vision/hostProtocol'
import { handGeometry } from '../vision/gesture_engine'
import type { RecordedEvent, RecordedFrame, RecordedMark } from '../vision/demoRecorder'

export type { RecordedEvent as RecordedEventLike, RecordedFrame as RecordedFrameLike } from '../vision/demoRecorder'

export const BENCH_WORDS: ReadonlyArray<{ id: string; zh: string; en: string }> = USER_VOCAB

/** Per-word on-screen prompt copy for the bench walk (self-contained so the
 *  bench never depends on the CAPS catalog's row ids). */
export const WORD_HINTS: Record<string, { zh: string; en: string }> = {
  'dir8': { zh: '手掌平移到任意方向并保持', en: 'Move your palm to any direction and hold' },
  'pinch': { zh: '拇指与食指捏合', en: 'Pinch thumb and index together' },
  'palm': { zh: '张开手掌保持约 1 秒', en: 'Hold your hand open for ~1 second' },
  'chord-menu': { zh: '伸开 食指+中指+无名指', en: 'Extend index + middle + ring fingers' },
  'chord-light': { zh: '伸开 拇指+食指+中指', en: 'Extend thumb + index + middle fingers' },
  'double-pinch': { zh: '双手张开，再并拢', en: 'Spread both hands apart, then bring them together' },
}

/** R237 lab baseline (docs/QUALITY-MATRIX.md): full synthetic matrix run hit
 *  100% diagonal (162 cells per gesture) against the ≥90% gate. */
const LAB_BASELINE = Object.freeze({ recall: 1, cells: 162, gate: 0.9 })

export interface BenchOpts {
  /** prompted attempts per word (default 3) */
  windowsPerWord?: number
  /** how long each prompted attempt stays open, ms (default 3000) */
  windowMs?: number
  /** gap between attempts, ms (default 1500) */
  restMs?: number
  /** get-ready lead before the first prompt, ms (default 2000) */
  leadMs?: number
}

interface BenchPlanStep {
  word: string
  round: number
  from: number
  to: number
}

export interface BenchPlan {
  steps: BenchPlanStep[]
  marks: RecordedMark[]
  totalMs: number
  opts: Required<BenchOpts>
}

/** A deterministic walk over the six words — the marks double as the label
 *  set T1 reserved (`Recording.marks`), so an exported bench recording is
 *  self-describing test data. */
export function planBench(opts: BenchOpts = {}): BenchPlan {
  const o = {
    windowsPerWord: opts.windowsPerWord ?? 3,
    windowMs: opts.windowMs ?? 3000,
    restMs: opts.restMs ?? 1500,
    leadMs: opts.leadMs ?? 2000,
  }
  const steps: BenchPlanStep[] = []
  const marks: RecordedMark[] = []
  let t = o.leadMs
  for (const w of BENCH_WORDS) {
    for (let round = 1; round <= o.windowsPerWord; round++) {
      steps.push({ word: w.id, round, from: t, to: t + o.windowMs })
      marks.push({ gesture: w.id, from: t, to: t + o.windowMs })
      t += o.windowMs + o.restMs
    }
  }
  return { steps, marks, totalMs: t - o.restMs, opts: o }
}

interface BenchGates {
  recall: number
  /** prompt-onset → event, reaction-inclusive (default 1000) */
  latencyMaxMs: number
  extraMax: number
}
export const DEFAULT_BENCH_GATES: BenchGates = { recall: 0.9, latencyMaxMs: 1000, extraMax: 2 }

/** an event may land this long after the window closes and still count (same
 *  grace as the replay harness) */
export const GRACE_MS = 400
/** trailing settle grace after the LAST window before stray events count as
 *  extra fires (the user naturally finishes a motion past the prompt) */
export const SETTLE_MS = 800

interface WordScore {
  word: string
  windows: number
  hits: number
  recall: number
  latencyMean: number | null
  latencyMax: number | null
  /** wrong-word events that fired inside this word's missed windows */
  confusions: { fired: string; count: number }[]
  baseline: { recall: number; cells: number; gate: number }
}

export interface BenchReport {
  words: WordScore[]
  overall: { recall: number; latencyMean: number | null }
  /** stray word-events after the bench settled (root-level for direct UI reads) */
  extraFires: number
  gates: BenchGates
  pass: boolean
  failures: string[]
}

/** Which bench word (if any) an event IS — the matcher table above. */
function eventWord(e: RecordedEvent): string | null {
  if (e.down !== true) return null
  switch (e.kind) {
    case 'pinch': return 'pinch'
    case 'direction': return 'dir8'
    case 'hands': return 'double-pinch' // apart or together — either edge is the cycle
    case 'chord': return e.name === 'menu' ? 'chord-menu' : e.name === 'light' ? 'chord-light' : null
    default: return null
  }
}

/** Earliest sustain-completion time of an open palm inside [from, to+grace]:
 *  geom.pinch > openRatio held ≥ sustainMs. Returns null when never held. */
function palmConfirm(frames: RecordedFrame[], from: number, to: number, openRatio: number, sustainMs: number): number | null {
  let runStart: number | null = null
  for (const f of frames) {
    const open = f.hands.length > 0 && handGeometry(f.hands[0].lm.map(([x, y]) => ({ x, y }))).pinch > openRatio
    if (open) {
      if (runStart == null) runStart = f.t
      if (f.t - runStart >= sustainMs && runStart <= to + GRACE_MS) {
        const confirm = runStart + sustainMs
        if (confirm >= from && confirm <= to + GRACE_MS) return confirm
        if (confirm > to + GRACE_MS) return null
      }
    } else {
      runStart = null
    }
  }
  return null
}

export function scoreBench(input: {
  frames: RecordedFrame[]
  events: RecordedEvent[]
  marks: RecordedMark[]
  gates?: Partial<BenchGates>
  palm?: { openRatio?: number; sustainMs?: number }
}): BenchReport {
  const gates = { ...DEFAULT_BENCH_GATES, ...(input.gates ?? {}) }
  const openRatio = input.palm?.openRatio ?? 0.85 // engine default pinchOff (session.js)
  const sustainMs = input.palm?.sustainMs ?? 700 // R138 open-palm hold
  const marks = input.marks
  const lastTo = marks.length ? Math.max(...marks.map((m) => m.to)) : 0
  const settleEnd = lastTo + SETTLE_MS

  const used = new Set<number>()
  const perWord = new Map<string, { windows: number; hits: number; latencies: number[]; confusion: Map<string, number> }>()
  for (const m of marks) {
    const w = perWord.get(m.gesture) ?? { windows: 0, hits: 0, latencies: [], confusion: new Map<string, number>() }
    w.windows++
    let hitT: number | null = null
    if (m.gesture === 'palm') {
      hitT = palmConfirm(input.frames, m.from, m.to, openRatio, sustainMs)
    } else {
      for (let i = 0; i < input.events.length; i++) {
        if (used.has(i)) continue
        const e = input.events[i]
        if (eventWord(e) !== m.gesture) continue
        if (e.t >= m.from - 100 && e.t <= m.to + GRACE_MS) { hitT = e.t; used.add(i); break }
      }
    }
    if (hitT != null) {
      w.hits++
      w.latencies.push(Math.max(0, hitT - m.from))
    } else {
      // confusion: what DID fire in the missed window (wrong-word down events)
      for (const e of input.events) {
        const fired = eventWord(e)
        if (fired != null && fired !== m.gesture && e.t >= m.from && e.t <= m.to + GRACE_MS) {
          w.confusion.set(fired, (w.confusion.get(fired) ?? 0) + 1)
        }
      }
    }
    perWord.set(m.gesture, w)
  }

  // stray events after the bench settles — nothing left to react to
  const extraFires = input.events.filter((e) => eventWord(e) != null && e.t > settleEnd).length

  const words: WordScore[] = BENCH_WORDS.map(({ id }) => {
    const w = perWord.get(id) ?? { windows: 0, hits: 0, latencies: [], confusion: new Map<string, number>() }
    const mean = w.latencies.length ? Math.round(w.latencies.reduce((s, v) => s + v, 0) / w.latencies.length) : null
    const max = w.latencies.length ? Math.max(...w.latencies) : null
    return {
      word: id,
      windows: w.windows,
      hits: w.hits,
      recall: w.windows ? w.hits / w.windows : 1,
      latencyMean: mean,
      latencyMax: max,
      confusions: [...w.confusion.entries()].map(([fired, count]) => ({ fired, count })).sort((a, b) => b.count - a.count),
      baseline: LAB_BASELINE,
    }
  })

  const windows = words.reduce((s, w) => s + w.windows, 0)
  const hits = words.reduce((s, w) => s + w.hits, 0)
  const allLat = words.flatMap((w) => (w.latencyMean != null && w.windows ? Array.from({ length: w.hits }, () => w.latencyMean!) : []))
  const latencyMean = allLat.length ? Math.round(allLat.reduce((s, v) => s + v, 0) / allLat.length) : null

  const failures: string[] = []
  const recall = windows ? hits / windows : 1
  if (recall < gates.recall) failures.push(`recall ${(recall * 100).toFixed(0)}% < gate ${(gates.recall * 100).toFixed(0)}%`)
  if (latencyMean != null && latencyMean > gates.latencyMaxMs) failures.push(`latency ${latencyMean}ms > gate ${gates.latencyMaxMs}ms`)
  if (extraFires > gates.extraMax) failures.push(`extra fires ${extraFires} > gate ${gates.extraMax}`)

  return { words, overall: { recall, latencyMean }, extraFires, gates, pass: failures.length === 0, failures }
}
