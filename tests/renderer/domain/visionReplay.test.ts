// R306/T10: the replay player — maps a wall clock × speed onto a T1
// recording's timeline (frame pointer + event pointer), so the replay card
// can animate the skeleton and re-dispatch events exactly once each.
// node environment (pure domain).
import { describe, it, expect } from 'vitest'
import { ReplayPlayer } from '../../../src/renderer/src/domain/visionReplay'
import type { Recording } from '../../../src/renderer/src/vision/demoRecorder'

const rec = (frames: Array<{ t: number }>, events: Array<{ t: number; kind: string }>): Recording => ({
  version: 1,
  meta: { app: 'rgbbox', source: 'synthetic', startedAt: '' },
  frames: frames.map((f) => ({ t: f.t, hands: [], face: null })),
  events: events.map((e) => ({ t: e.t, kind: e.kind, key: null, down: true })),
  marks: [],
})

describe('domain/visionReplay (R306/T10)', () => {
  it('1×: tick selects the LATEST frame at/before the mapped recording time, in order', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 100 }, { t: 200 }, { t: 300 }], []))
    r.start(0)
    expect(r.tick(0).frame?.t).toBe(0)
    expect(r.tick(50).frame?.t).toBe(0) // between frames → holds the earlier one
    expect(r.tick(150).frame?.t).toBe(100)
    expect(r.tick(1000).frame?.t).toBe(300)
  })

  it('0.5×: wall time maps to HALF the recording time', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 1000 }], []), { speed: 0.5 })
    r.start(0)
    expect(r.tick(500).recT).toBe(250)
    expect(r.tick(500).frame?.t).toBe(0, 'still the first frame at half speed')
    expect(r.tick(2500).frame?.t).toBe(1000, 'recording time 1250 ≥ last frame')
  })

  it('events between ticks are delivered EXACTLY once, in recording order', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 400 }], [{ t: 100, kind: 'pinch' }, { t: 300, kind: 'pinch' }, { t: 350, kind: 'direction' }]))
    r.start(0)
    const a = r.tick(120)
    expect(a.dueEvents.map((e) => e.kind)).toEqual(['pinch'])
    const b = r.tick(400)
    expect(b.dueEvents.map((e) => e.kind)).toEqual(['pinch', 'direction'])
    const c = r.tick(1000)
    expect(c.dueEvents).toEqual([]) // nothing re-delivered
    expect(c.done).toBe(true)
  })

  it('done only after the last frame + tail; ticks clamp there and stop advancing', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 1000 }], [{ t: 1200, kind: 'pinch' }]))
    r.start(0)
    expect(r.tick(1100).done).toBe(false, 'tail (post-frame event) not reached')
    const end = r.tick(1300)
    expect(end.done).toBe(true)
    expect(end.dueEvents.map((e) => e.kind)).toEqual(['pinch'])
    expect(r.tick(99999).frame?.t).toBe(1000, 'clamped at the last frame')
  })

  it('setSpeed mid-flight rescales the remaining timeline (no jump, no stall)', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 1000 }, { t: 2000 }], []))
    r.start(0)
    r.tick(1000) // recT 1000
    r.setSpeed(0.5)
    // 1000ms more wall time at 0.5× → +500ms recording time → recT 1500
    expect(r.tick(2000).recT).toBe(1500)
    expect(r.tick(2000).frame?.t).toBe(1000)
  })

  it('pause/restart: start() resets both pointers; an empty recording is immediately done', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 500 }], [{ t: 100, kind: 'pinch' }]))
    r.start(0)
    r.tick(600)
    expect(r.tick(900).done).toBe(true) // duration = 500 + 300ms tail
    r.start(10000) // replay from scratch on a fresh clock
    const s = r.tick(10050)
    expect(s.done).toBe(false)
    expect(s.frame?.t).toBe(0)
    expect(r.tick(10110).dueEvents.map((e) => e.kind)).toEqual(['pinch'], 'events re-deliver on restart')
    const empty = new ReplayPlayer(rec([], []))
    empty.start(0)
    expect(empty.tick(0).done).toBe(true)
    expect(empty.tick(0).frame).toBeNull()
  })

  it('syncClock: a paused player resumes WITHOUT jumping across the paused wall time', () => {
    const r = new ReplayPlayer(rec([{ t: 0 }, { t: 1000 }, { t: 2000 }], []))
    r.start(0)
    r.tick(1000) // recT 1000
    // 10 seconds pass while paused, then the clock is re-synced on resume
    r.syncClock(11000)
    const t = r.tick(11050)
    expect(t.recT).toBe(1050, 'only +50ms of recording time, not +10s')
    expect(t.frame?.t).toBe(1000)
  })
})
