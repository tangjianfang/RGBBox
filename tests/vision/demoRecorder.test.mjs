// R306.2 T1: the vision demo recorder — turns a LIVE pipeline session into a
// versioned recording (landmarks/events/state ONLY, zero imagery) exportable
// as a replay-harness fixture (.jsonl frames). This is the W0 measurement
// instrument: real-camera recordings become reproducible test data and the
// input for T2's deep bench report.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DemoRecorder, parseRecording, recordingToJson, toFixtureJsonl, RECORDING_VERSION } from '../../src/renderer/src/vision/demoRecorder'
import { SyntheticSource } from '../../src/renderer/src/vision/synthetic.js'
import { replay } from './replay-harness.mjs'

/** Snapshot-shaped hands as the BroadcastChannel delivers them ({x,y,z} objects). */
const snap = (lm, handedness = 'Right', score = 0.9) => ({ landmarks: lm, handedness, score })

test('round-trip: finish → toJson → parseRecording preserves frames/events; lm is [[x,y]] ×21', () => {
  const src = new SyntheticSource({ noise: 0 })
  const r = new DemoRecorder()
  r.start(1000, { source: 'synthetic' })
  for (let i = 0; i < 10; i++) {
    const s = src.sample(i * 33, 'active')
    r.frame(1000 + i * 33, [snap(s.hand)], null)
  }
  r.event(1200, { kind: 'pinch', key: 'Space', down: true })
  r.event(1350, { kind: 'direction', key: 'ArrowUp', dir: 'up', down: true })
  const rec = r.finish()
  assert.ok(rec, 'finish returns the recording')
  assert.equal(rec.version, RECORDING_VERSION)
  assert.equal(rec.meta.source, 'synthetic')
  assert.equal(rec.frames.length, 10)
  assert.equal(rec.frames[0].t, 0, 'frame t is relative to recording start')
  const hand = rec.frames[0].hands[0]
  assert.equal(hand.lm.length, 21, '21 landmarks')
  assert.ok(hand.lm.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])), 'lm points are [x,y] pairs')
  assert.equal(rec.events.length, 2)
  assert.equal(rec.events[0].t, 200)

  const back = parseRecording(recordingToJson(rec))
  assert.deepEqual(back.frames, rec.frames)
  assert.deepEqual(back.events, rec.events)
  assert.deepEqual(back.marks, [], 'T1 emits empty marks (T2 fills them)')
})

test('fixture round-trip: a synthetic recording exports as .jsonl that drives the REAL SessionController to active + events', () => {
  const src = new SyntheticSource({ noise: 0 })
  const r = new DemoRecorder()
  r.start(0, { source: 'synthetic' })
  // mirror the calibration protocol (fast cal steps, like replay fixtures):
  // center still → reach sweep → pinch cycles → active demo
  const phases = [['center', 700], ['reach', 900], ['pinch', 1300], ['active', 5000]]
  let t = 0
  for (const [phase, dur] of phases) {
    for (let dt = 0; dt < dur; dt += 33) {
      const s = src.sample(t, phase)
      r.frame(t, [snap(s.hand)], null)
      t += 33
    }
  }
  const rec = r.finish()
  const lines = toFixtureJsonl(rec).split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  assert.equal(lines.length, rec.frames.length)
  assert.ok(lines[0].hands && Array.isArray(lines[0].hands[0].lm), 'jsonl hands shape matches replay-harness fixture')
  const run = replay({ frames: lines })
  assert.ok(run.activeFrom != null, `session reached active via the exported fixture (state=${run.state})`)
  assert.ok(run.timed.length > 0, 'engine emitted events during the replayed active phase')
})

test('parseRecording rejects bad files with clear errors', () => {
  const good = new DemoRecorder()
  good.start(0, { source: 'camera' })
  good.frame(0, [snap(new SyntheticSource().sample(0, 'active').hand)], null)
  const goodJson = recordingToJson(good.finish())
  const bad = [
    ['', 'empty'],
    ['not json', 'non-JSON'],
    [JSON.stringify({ version: 99, frames: [], events: [] }), 'unknown version'],
    [JSON.stringify({ version: 1, frames: 'x', events: [] }), 'frames not an array'],
    [goodJson.replace('"lm":[[', '"lm":[[').replace(/(,21,)/, '$1'), 'noop'],
  ]
  // malformed landmark count (20 points) + NaN t
  const short = JSON.parse(goodJson)
  short.frames[0].hands[0].lm = short.frames[0].hands[0].lm.slice(0, 20)
  bad.push([JSON.stringify(short), '20-point hand'])
  const nanT = JSON.parse(goodJson)
  nanT.frames[0].t = Number.NaN
  bad.push([JSON.stringify(nanT), 'NaN t'])
  for (const [text, why] of bad) {
    if (why === 'noop') continue
    assert.throws(() => parseRecording(text), { name: 'Error' }, `must reject: ${why}`)
  }
})

test('maxFrames cap stops accumulation; finish still returns the buffered frames', () => {
  const src = new SyntheticSource({ noise: 0 })
  const r = new DemoRecorder({ maxFrames: 3 })
  r.start(0, { source: 'synthetic' })
  for (let i = 0; i < 5; i++) r.frame(i * 33, [snap(src.sample(i * 33, 'active').hand)], null)
  assert.equal(r.size.frames, 3, 'cap holds')
  assert.ok(r.isFull(), 'recorder reports full')
  const rec = r.finish()
  assert.equal(rec.frames.length, 3)
  assert.equal(r.finish(), null, 'finish clears the live state')
})

test('privacy by construction: the serialized recording carries geometry only — no imagery fields', () => {
  const src = new SyntheticSource({ noise: 0 })
  const r = new DemoRecorder()
  r.start(0, { source: 'camera' })
  r.frame(0, [snap(src.sample(0, 'active').hand)], { jawOpen: 0.5 })
  const text = recordingToJson(r.finish())
  for (const banned of ['data:image', 'bitmap', 'framebuffer', 'imageData', 'toDataURL']) {
    assert.ok(!text.includes(banned), `recording must not contain ${banned}`)
  }
  assert.ok(text.includes('"jawOpen"'), 'face blendshapes ARE recorded (geometry-class data)')
})
