// R242 / TASK-UNIVERSE F7: landmark-injection robustness — 21 points × 5
// malformation classes (nan / negative / oversized / frozen / dropped). The
// pipeline must DROP structurally-invalid hands and count them; a frozen
// (finite, constant) point is structurally VALID and passes. No class may
// throw or poison subsequent good frames.
import { test, expect } from 'vitest'
import assert from 'node:assert/strict'
import { VisionPipeline } from '../../src/renderer/src/vision/pipeline.js'
import { makeHand, atPalm, CENTER } from './helpers.mjs'

const IDX = Array.from({ length: 21 }, (_, i) => i)
const MALFORM = ['nan', 'negative', 'oversized', 'frozen', 'dropped']
// structurally invalid → must be dropped + counted; frozen is finite → passes
const EXPECT_REJECT = { nan: true, negative: true, oversized: true, frozen: false, dropped: true }

function malformedHand(kind, idx) {
  const lm = makeHand({ ...atPalm(CENTER.x, CENTER.y) })
  switch (kind) {
    case 'nan': lm[idx] = { x: NaN, y: lm[idx].y }; break
    case 'negative': lm[idx] = { x: -0.5, y: lm[idx].y }; break
    case 'oversized': lm[idx] = { x: 5, y: 5 }; break
    case 'frozen': lm[idx] = { x: 0.5, y: 0.5 }; break
    case 'dropped': lm.splice(idx, 1); break // 20 points
  }
  return lm
}

function pipelineReturning(hands) {
  return new VisionPipeline({
    loadLandmarkers: async () => ({ hand: { detectForVideo: () => ({ landmarks: hands.map((lm) => ({ landmarks: lm })), handedness: [] }) }, face: null }),
    onEvents: () => {}, onSnapshot: () => {}, onStatus: () => {}, onProfileSave: () => {},
  })
}

test('R242/F7: 105-cell landmark malformation grid — no throw, correct rejects, good frames survive', async () => {
  let cells = 0
  for (const idx of IDX) {
    for (const kind of MALFORM) {
      cells++
      const p = pipelineReturning([malformedHand(kind, idx)])
      p.session = { // minimal stand-in: we are testing the GUARD, not the engine
        state: 'active',
        onFrame: ({ hands }) => ({ events: [], snapshot: { fed: hands.length } }),
        faceEveryN: 1,
        cfg: { dualHand: { primaryHand: 'Right' } },
      }
      p.running = true
      p.hand = { detectForVideo: () => ({ landmarks: [malformedHand(kind, idx)], handedness: [] }) }
      p.mirror = false
      let threw = null
      let fedDuringBad = -1
      for (let f = 0; f < 10; f++) {
        try {
          const r = p.processFrame(5000 + f * 33, { source: {} })
          if (f === 0) fedDuringBad = r.snapshot?.fed ?? -1
        } catch (e) { threw = e }
      }
      assert.ok(!threw, `lm#${idx} ${kind} threw: ${threw && threw.message}`)
      const expectReject = EXPECT_REJECT[kind]
      const rejects = p.stats().landmarkRejects ?? 0
      if (expectReject) assert.equal(rejects, 10, `lm#${idx} ${kind}: expected 10 rejects, got ${rejects}`)
      else assert.equal(rejects, 0, `lm#${idx} ${kind}: frozen must pass structurally`)
      if (expectReject) assert.equal(fedDuringBad, 0, `lm#${idx} ${kind}: bad hand must not reach the session`)
      // good frames survive — no poisoning
      p.hand = { detectForVideo: () => ({ landmarks: [makeHand({ ...atPalm(CENTER.x, CENTER.y) })], handedness: [] }) }
      const good = p.processFrame(9999, { source: {} })
      assert.equal(good.snapshot?.fed, 1, `lm#${idx} ${kind}: good frame poisoned after bad run`)
    }
  }
  expect(cells).toBe(105)
}, 120000)
