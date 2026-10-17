// R306.2 T1: the vision demo recorder — the W0 measurement instrument.
// A LIVE pipeline session becomes a versioned recording (landmarks,
// blendshapes, engine events and session state ONLY — zero imagery by
// construction) that exports as a replay-harness fixture (.jsonl), so:
//   - a real-camera recording drops straight into tests/vision/fixtures-replay
//   - T2's deep bench scores real-machine recall/latency against it
//   - T10 plays recordings back camera-free (synthetic injection path)
//
// Pure module — no DOM/Electron; node-testable (tests/vision/demoRecorder.test.mjs).
// The fixture shape mirrors replay-harness.mjs exactly:
//   <name>.jsonl — one {t, hands:[{lm:[[x,y]…×21], score, h}], face} per line.

export const RECORDING_VERSION = 1

/** ~5 minutes at 60fps — the memory cap for a single recording. */
export const DEFAULT_MAX_FRAMES = 18000

export interface RecordedHand {
  /** 21 landmark points as [x,y] (normalized selfie-space, post-mirror) */
  lm: number[][]
  score: number
  /** handedness label ('Left' | 'Right' | '', selfie convention) */
  h: string
}

export interface RecordedFrame {
  /** ms since recording start (fixture clock) */
  t: number
  hands: RecordedHand[]
  face: Record<string, number> | null
}

export interface RecordedEvent {
  t: number
  kind: string
  name?: string
  dir?: string
  key?: string | null
  down: boolean
}

export interface RecordedMark {
  gesture: string
  from: number
  to: number
}

export interface Recording {
  version: number
  meta: {
    app: 'rgbbox'
    source: 'camera' | 'synthetic'
    /** wall-clock ISO stamp of the recording start */
    startedAt: string
  }
  frames: RecordedFrame[]
  events: RecordedEvent[]
  /** T2 (deep bench) fills gesture marks; a raw recording ships none. */
  marks: RecordedMark[]
}

/** The pipeline-side hand shape (snapshot.allHands / pickedLandmarks). */
export interface PipelineHand {
  landmarks: Array<{ x: number; y: number; z?: number }>
  handedness?: string
  score?: number
}

export class DemoRecorder {
  private readonly maxFrames: number
  private startMs: number | null = null
  private meta: Recording['meta'] | null = null
  private frames: RecordedFrame[] = []
  private events: RecordedEvent[] = []

  constructor(cfg: { maxFrames?: number } = {}) {
    this.maxFrames = cfg.maxFrames ?? DEFAULT_MAX_FRAMES
  }

  start(nowMs: number, meta: { source: 'camera' | 'synthetic'; startedAt?: string }): void {
    this.startMs = nowMs
    this.meta = { app: 'rgbbox', source: meta.source, startedAt: meta.startedAt ?? new Date().toISOString() }
    this.frames = []
    this.events = []
  }

  get recording(): boolean {
    return this.startMs != null
  }

  get size(): { frames: number; events: number } {
    return { frames: this.frames.length, events: this.events.length }
  }

  isFull(): boolean {
    return this.frames.length >= this.maxFrames
  }

  /** One processed frame. `scoreFallback` fills per-hand score when the
   *  snapshot carries a single session-level score (snapshot.score). */
  frame(nowMs: number, hands: PipelineHand[], face: Record<string, number> | null, scoreFallback = 0.9): void {
    if (this.startMs == null || this.isFull()) return
    const t = Math.max(0, Math.round(nowMs - this.startMs))
    this.frames.push({
      t,
      hands: hands.map((h) => ({
        lm: h.landmarks.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5)]),
        score: Number.isFinite(h.score) ? (h.score as number) : scoreFallback,
        h: h.handedness ?? '',
      })),
      face: face ? { ...face } : null,
    })
  }

  /** One 'vision-input' bus event, timestamped on the same clock. */
  event(nowMs: number, ev: { kind: string; name?: string; dir?: string; key?: string | null; down: boolean }): void {
    if (this.startMs == null) return
    // optional keys only when defined — the in-memory shape must equal the
    // JSON-round-trip shape (undefined keys would vanish in serialization)
    const e: RecordedEvent = {
      t: Math.max(0, Math.round(nowMs - this.startMs)),
      kind: ev.kind,
      key: ev.key ?? null,
      down: ev.down,
    }
    if (ev.name !== undefined) e.name = ev.name
    if (ev.dir !== undefined) e.dir = ev.dir
    this.events.push(e)
  }

  /** Ends the session and returns the recording; null when not recording. */
  finish(): Recording | null {
    if (this.startMs == null || this.meta == null) return null
    const rec: Recording = { version: RECORDING_VERSION, meta: this.meta, frames: this.frames, events: this.events, marks: [] }
    this.startMs = null
    this.meta = null
    this.frames = []
    this.events = []
    return rec
  }
}

export function recordingToJson(rec: Recording): string {
  return JSON.stringify(rec)
}

function bad(msg: string): never {
  throw new Error(`invalid vision recording: ${msg}`)
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parseRecording(text: string): Recording {
  if (!text || !text.trim()) bad('empty file')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    bad('not valid JSON')
  }
  const rec = raw as Partial<Recording>
  if (rec == null || typeof rec !== 'object') bad('root is not an object')
  if (rec.version !== RECORDING_VERSION) bad(`unsupported version ${String(rec.version)} (expected ${RECORDING_VERSION})`)
  if (rec.meta == null || (rec.meta.source !== 'camera' && rec.meta.source !== 'synthetic')) bad('meta.source missing/invalid')
  if (!Array.isArray(rec.frames)) bad('frames is not an array')
  if (!Array.isArray(rec.events)) bad('events is not an array')
  for (const f of rec.frames) {
    if (f == null || typeof f !== 'object' || !isFiniteNumber(f.t)) bad('frame.t missing/NaN')
    if (!Array.isArray(f.hands)) bad('frame.hands is not an array')
    for (const h of f.hands) {
      if (!Array.isArray(h.lm) || h.lm.length !== 21) bad(`hand lm must hold 21 points (got ${h?.lm?.length})`)
      for (const p of h.lm) {
        if (!Array.isArray(p) || p.length !== 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) bad('hand lm point is not [x,y]')
      }
      if (!isFiniteNumber(h.score)) bad('hand.score is not a finite number')
      if (typeof h.h !== 'string') bad('hand.h is not a string')
    }
    if (f.face != null && typeof f.face !== 'object') bad('frame.face is neither null nor object')
  }
  for (const e of rec.events) {
    if (e == null || typeof e !== 'object' || !isFiniteNumber(e.t)) bad('event.t missing/NaN')
    if (typeof e.kind !== 'string' || e.kind === '') bad('event.kind missing')
    if (typeof e.down !== 'boolean') bad('event.down is not a boolean')
  }
  return {
    version: RECORDING_VERSION,
    meta: { app: 'rgbbox', source: rec.meta!.source, startedAt: rec.meta!.startedAt ?? '' },
    frames: rec.frames as RecordedFrame[],
    events: rec.events as RecordedEvent[],
    marks: Array.isArray(rec.marks) ? (rec.marks as RecordedMark[]) : [],
  }
}

/** Export the frames as replay-harness fixture lines ({t,hands,face} per line). */
export function toFixtureJsonl(rec: Recording): string {
  return rec.frames.map((f) => JSON.stringify({ t: f.t, hands: f.hands, face: f.face })).join('\n') + '\n'
}
