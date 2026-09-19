// VisionPipeline unit tests (R136) — the detection→session pipeline with an
// INJECTED fake landmarker: mirror-toggle direction mapping, sensitivity
// presets, synthetic mode, and the profile-save proxy.

import { test, expect } from 'vitest'
import { VisionPipeline, PIPELINE_SENSITIVITY } from '../../src/renderer/src/vision/pipeline.js'
import { atPalm, CENTER, makeHand } from './helpers.mjs'

const QUICK = { calSteps: { center: 500, reach: 700, pinch: 1100 }, requireFace: false }

/**
 * Fake landmarker whose detections place the palm at the scripted (selfie-space)
 * positions; the pipeline's mirror flag decides the raw→selfie x transform.
 */
function makePipeline(palmTrack, { mirror = true, sensitivity } = {}) {
  let i = 0
  const pipeline = new VisionPipeline({
    loadLandmarkers: async () => ({
      hand: {
        detectForVideo: (_bitmap, _ts) => {
          const want = palmTrack[Math.min(i, palmTrack.length - 1)]
          i++
          // ALWAYS the same RAW camera image (selfie-flipped source); the
          // pipeline's mirror flag alone decides the interpreted position
          const rawX = 1 - want.x
          const { cx, cy } = atPalm(rawX, want.y)
          return {
            landmarks: [makeHand({ cx, cy, pinchGap: want.pinch ?? 1.2 })],
            handedness: [[{ categoryName: 'Right', score: 0.95 }]],
          }
        },
      },
      face: null,
    }),
    onEvents: () => {},
    onSnapshot: () => {},
    onStatus: () => {},
    onProfileSave: () => {},
  })
  return { pipeline, cfg: { sessionCfg: QUICK, mirror, sensitivity } }
}

function calibrateTrack({ reachR = 0.2, cycles = 8 } = {}) {
  const track = []
  const push = (x, y, pinch) => track.push({ x, y, pinch })
  for (let i = 0; i < 18; i++) push(CENTER.x, CENTER.y)
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180
    for (let j = 0; j < 3; j++) push(CENTER.x + Math.cos(deg) * reachR, CENTER.y - Math.sin(deg) * reachR)
  }
  for (let i = 0; i < cycles * 2 * 3; i++) push(CENTER.x, CENTER.y, i % 2 ? 1.25 : 0.22)
  return track
}

async function drive(pipeline, track, { t0 = 5000, dt = 33 } = {}) {
  let t = t0
  const events = []
  for (let i = 0; i < track.length; i++) {
    const r = pipeline.processFrame(t += dt, { source: {} })
    events.push(...(r.events ?? []))
  }
  return events
}

test('mirror ON (selfie): a right sweep fires ArrowRight (R136 direction mapping)', async () => {
  const track = [...calibrateTrack()]
  for (let i = 0; i < 10; i++) track.push({ x: 0.74, y: CENTER.y }) // decisive hold right
  const { pipeline, cfg } = makePipeline(track, { mirror: true })
  await pipeline.init(cfg)
  pipeline.start(5000)
  const events = await drive(pipeline, track)
  expect(events.some((e) => e.kind === 'direction' && e.down && e.key === 'ArrowRight')).toBe(true)
  expect(events.some((e) => e.kind === 'direction' && e.down && e.key === 'ArrowLeft')).toBe(false)
})

test('mirror OFF: the SAME camera image flips to ArrowLeft — the toggle is the fix', async () => {
  // identical raw track; with mirror off the calibration center AND the sweep
  // both read mirrored, so the same physical sweep classifies as LEFT
  const track = [...calibrateTrack()]
  for (let i = 0; i < 10; i++) track.push({ x: 0.74, y: CENTER.y })
  const { pipeline, cfg } = makePipeline(track, { mirror: false })
  await pipeline.init(cfg)
  pipeline.start(5000)
  const events = await drive(pipeline, track)
  expect(events.some((e) => e.kind === 'direction' && e.down && e.key === 'ArrowLeft')).toBe(true)
})

test('sensitivity presets map to confirmMs and reach the session (R136.3)', async () => {
  expect(PIPELINE_SENSITIVITY.standard.confirmMs).toBe(90)
  expect(PIPELINE_SENSITIVITY.fast.confirmMs).toBe(45)
  expect(PIPELINE_SENSITIVITY.sport.confirmMs).toBe(0)
  const track = calibrateTrack()
  const { pipeline, cfg } = makePipeline(track, { sensitivity: 'sport' })
  await pipeline.init(cfg)
  expect(pipeline.session.handEngine.direction.cfg.confirmMs).toBe(0)
  pipeline.applySettings({ confirmMs: PIPELINE_SENSITIVITY.fast.confirmMs })
  expect(pipeline.session.handEngine.direction.cfg.confirmMs).toBe(45)
})

test('sport mode fires direction immediately (latency knob, no confirm window)', async () => {
  const track = [...calibrateTrack()]
  track.push({ x: CENTER.x, y: CENTER.y })
  for (let i = 0; i < 6; i++) track.push({ x: 0.74, y: CENTER.y })
  const { pipeline, cfg } = makePipeline(track, { sensitivity: 'sport' })
  await pipeline.init(cfg)
  pipeline.start(5000)
  const events = await drive(pipeline, track)
  const fire = events.find((e) => e.kind === 'direction' && e.down)
  expect(fire).toBeTruthy()
  expect(fire.key).toBe('ArrowRight')
})

test('profile-save is proxied exactly once on calibration completion', async () => {
  const saves = []
  const track = calibrateTrack()
  let i = 0
  const pipeline = new VisionPipeline({
    loadLandmarkers: async () => ({
      hand: { detectForVideo: () => {
        const want = track[Math.min(i, track.length - 1)]
        i++
        const { cx, cy } = atPalm(1 - want.x, want.y)
        return { landmarks: [makeHand({ cx, cy, pinchGap: want.pinch ?? 1.2 })], handedness: [[{ categoryName: 'Right', score: 0.95 }]] }
      } },
      face: null,
    }),
    onEvents: () => {},
    onSnapshot: () => {},
    onStatus: () => {},
    onProfileSave: (p) => saves.push(p),
  })
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  pipeline.start(5000)
  await drive(pipeline, track)
  expect(pipeline.session.state).toBe('active')
  expect(saves.length).toBe(1)
  expect(saves[0].center.x).toBeGreaterThan(0)
})

test('synthetic mode drives the identical pipeline to active (worker self-timer equivalent)', async () => {
  const pipeline = new VisionPipeline({
    loadLandmarkers: async () => ({ hand: null, face: null }),
    onEvents: () => {},
    onSnapshot: () => {},
    onStatus: () => {},
    onProfileSave: () => {},
  })
  await pipeline.init({ sessionCfg: QUICK, mirror: true })
  await pipeline.startSynthetic()
  let t = 5000
  const events = []
  for (let i = 0; i < 600; i++) {
    const r = pipeline.processFrame(t += 33, {})
    if (r.events) events.push(...r.events)
  }
  expect(pipeline.session.state).toBe('active')
  expect(events.some((e) => e.down && e.key)).toBe(true)
  pipeline.stop()
})
