// R306/T10: the replay player — the pure timeline engine behind the replay
// card. A wall clock × speed maps onto the recording's timeline; each tick
// reports the frame to show (latest at/before the recording time), the
// events that fell since the previous tick (delivered exactly once), and
// whether the run is over. The card owns canvas + the window bus dispatch.
//
// Pure domain — no DOM/timers; the caller feeds its own clock.
import type { Recording, RecordedEvent, RecordedFrame } from '../vision/demoRecorder'

export interface ReplayTick {
  /** recording time mapped so far (ms) */
  recT: number
  frame: RecordedFrame | null
  dueEvents: RecordedEvent[]
  done: boolean
}

/** done once past the last frame AND the last event (+ a small tail so the
 *  final frame visibly lingers before the card flips to its done state) */
const TAIL_MS = 300

export class ReplayPlayer {
  private readonly rec: Recording
  private readonly lastFrameT: number
  private readonly lastEventT: number
  private speed: number
  private lastWall: number | null = null
  private recT = 0
  private frameIdx = 0
  private eventIdx = 0

  constructor(rec: Recording, opts: { speed?: number } = {}) {
    this.rec = rec
    this.speed = opts.speed ?? 1
    this.lastFrameT = rec.frames.length ? rec.frames[rec.frames.length - 1].t : -1
    this.lastEventT = rec.events.length ? Math.max(...rec.events.map((e) => e.t)) : -1
  }

  /** (Re)start from recording time 0 on a fresh clock. */
  start(wallNowMs: number): void {
    this.lastWall = wallNowMs
    this.recT = 0
    this.frameIdx = 0
    this.eventIdx = 0
  }

  /** Mid-flight speed change: the timeline stays continuous (the next tick
   *  advances from the current recording time at the NEW rate). */
  setSpeed(speed: number): void {
    if (speed > 0) this.speed = speed
  }

  /** Re-anchor the wall clock WITHOUT advancing (resume after a pause —
   *  the paused wall time must not count as playback time). */
  syncClock(wallNowMs: number): void {
    this.lastWall = wallNowMs
  }

  get playbackSpeed(): number {
    return this.speed
  }

  /** Total recording span for progress readouts: frames define the visual
   *  timeline (+ tail so the final frame lingers); events-only recordings
   *  fall back to the last event; an empty recording is instantly done. */
  get durationMs(): number {
    if (this.rec.frames.length) return this.lastFrameT + TAIL_MS
    return this.lastEventT > -1 ? this.lastEventT + TAIL_MS : 0
  }

  /** Advance to a wall clock; returns what to render/dispatch for THIS tick. */
  tick(wallNowMs: number): ReplayTick {
    const last = this.lastWall ?? wallNowMs
    this.lastWall = wallNowMs
    this.recT = Math.min(this.durationMs, this.recT + Math.max(0, wallNowMs - last) * this.speed)
    // advance the frame pointer to the latest frame at/before recT
    while (this.frameIdx < this.rec.frames.length - 1 && this.rec.frames[this.frameIdx + 1].t <= this.recT) {
      this.frameIdx++
    }
    // events that fell inside (previous recT, this recT] — exactly once
    const dueEvents: RecordedEvent[] = []
    while (this.eventIdx < this.rec.events.length && this.rec.events[this.eventIdx].t <= this.recT) {
      dueEvents.push(this.rec.events[this.eventIdx])
      this.eventIdx++
    }
    const frame = this.rec.frames.length && this.rec.frames[this.frameIdx].t <= this.recT
      ? this.rec.frames[this.frameIdx]
      : this.rec.frames.length && this.frameIdx === 0 && this.rec.frames[0].t > this.recT
        ? this.rec.frames[0] // before the first frame stamp (t=0 lead) → hold the first
        : null
    const done = this.recT >= this.durationMs
    return { recT: this.recT, frame, dueEvents, done }
  }
}
