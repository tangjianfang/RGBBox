// R142-L2: palm prediction — an EMA of palm velocity extrapolated 50ms ahead
// rides every snapshot (geomPredicted) so continuous consumers (analog axis,
// pad dot, future cursor) lead the detection cadence instead of lagging it.
// Discrete events stay confirm-gated — prediction is for continuous signals only.

import { test, expect } from 'vitest'
import { VisionPipeline } from '../../src/renderer/src/vision/pipeline.js'
import { atPalm, CENTER, makeHand } from './helpers.mjs'

const QUICK = { calSteps: { center: 500, reach: 700, pinch: 1100 }, requireFace: false }

function movingPipeline(track) {
  let i = 0
  const snapshots = []
  const pipeline = new VisionPipeline({
    loadLandmarkers: async () => ({
      hand: {
        detectForVideo: () => {
          const want = track[Math.min(i, track.length - 1)]
          i++
          const { cx, cy } = atPalm(1 - want.x, want.y) // mirror-on convention
          return { landmarks: [makeHand({ cx, cy, pinchGap: want.pinch ?? 1.2 })], handedness: [[{ categoryName: 'Right', score: 0.95 }]] }
        },
      },
      face: null,
    }),
    onEvents: () => {},
    onSnapshot: (s) => snapshots.push(s),
    onStatus: () => {},
    onProfileSave: () => {},
  })
  return { pipeline, snapshots }
}

function calibrateThenMove({ move, frames = 12 }) {
  const track = []
  for (let i = 0; i < 18; i++) track.push({ x: CENTER.x, y: CENTER.y })
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180
    for (let j = 0; j < 3; j++) track.push({ x: CENTER.x + Math.cos(deg) * 0.2, y: CENTER.y - Math.sin(deg) * 0.2 })
  }
  // pinch window is 1100ms ≈ 33 frames @33ms — the separability gate needs
  // ≥24 samples, so alternate every frame for 36 frames
  for (let i = 0; i < 36; i++) track.push({ x: CENTER.x, y: CENTER.y, pinch: i % 2 ? 1.25 : 0.22 })
  for (let i = 0; i < frames; i++) track.push(move(i))
  return track
}

test('geomPredicted LEADS the palm in the direction of movement (moving right)', async () => {
  const track = calibrateThenMove({ move: (i) => ({ x: CENTER.x + 0.01 * (i + 1), y: CENTER.y }), frames: 12 })
  const { pipeline } = movingPipeline(track)
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  pipeline.start(5000)
  let t = 5000
  let last = null
  for (let i = 0; i < track.length; i++) {
    last = pipeline.processFrame(t += 33, { source: {} })
  }
  const geom = last.snapshot.geom
  const pred = last.snapshot.geomPredicted
  expect(pred).toBeTruthy()
  expect(pred.palm.x).toBeGreaterThan(geom.palm.x) // velocity carries it ahead
})

test('geomPredicted converges to the palm when the hand stops', async () => {
  const track = calibrateThenMove({ move: () => ({ x: CENTER.x + 0.12, y: CENTER.y }), frames: 14 })
  const { pipeline } = movingPipeline(track)
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  pipeline.start(5000)
  let t = 5000
  let last = null
  for (let i = 0; i < track.length; i++) last = pipeline.processFrame(t += 33, { source: {} })
  // held still for many frames → EMA velocity decays to ~0 → pred ≈ geom
  expect(Math.abs(last.snapshot.geomPredicted.palm.x - last.snapshot.geom.palm.x)).toBeLessThan(0.01)
})

test('hand loss clears geomPredicted and resets the velocity state', async () => {
  const track = calibrateThenMove({ move: (i) => ({ x: CENTER.x + 0.01 * (i + 1), y: CENTER.y }), frames: 10 })
  const { pipeline } = movingPipeline(track)
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  pipeline.start(5000)
  let t = 5000
  for (let i = 0; i < track.length; i++) pipeline.processFrame(t += 33, { source: {} })
  // a handless frame: the fake keeps returning the last track frame, so drive
  // loss through the pipeline API instead — feed a hand with score 0 (filtered)
  const before = pipeline.predVel.x
  expect(before).toBeGreaterThan(0)
  // synthetic loss: stop frames (snapshot without geom comes via absent hand)
  // simplest: flip mirror of detection off-screen by checking predLast reset
  // through a handless pipeline frame — use a track that ends far away is
  // still seen; so emulate by calling with an empty source repeatedly after
  // replacing the fake's output with no landmarks:
  // (covered practically: loss path sets geomPredicted=null via snapshot.geom=null)
  const stopped = pipeline.processFrame(t += 33, {}) // no source → no detect
  expect(stopped.snapshot.geomPredicted).toBeNull()
  expect(pipeline.predVel.x).toBe(0)
})

test('snapshots carry hostNowMs for channel-latency measurement', async () => {
  const track = calibrateThenMove({ move: () => ({ x: CENTER.x, y: CENTER.y }), frames: 2 })
  const { pipeline } = movingPipeline(track)
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  pipeline.start(5000)
  let t = 5000
  let last = null
  for (let i = 0; i < track.length; i++) last = pipeline.processFrame(t += 33, { source: {} })
  expect(last.snapshot.hostNowMs).toBe(t)
})
