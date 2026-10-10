// R254 / F14: the gesture→action decision matrix contract.
import { test, expect } from 'vitest'
import assert from 'node:assert/strict'
import { ACTIONS, GESTURES, SCENES, GESTURE_SCENE_MAP, validateGestureSceneMap } from '../../src/renderer/src/vision/gestureActions.js'

test('R254: closed action registry (10) + full 6×8 matrix shape', () => {
  assert.equal(ACTIONS.length, 10)
  assert.equal(GESTURES.length, 6) // mirrors USER_VOCAB — the learning surface
  assert.equal(SCENES.length, 8)
  for (const g of GESTURES) for (const s of SCENES) assert.ok(GESTURE_SCENE_MAP[g][s], `${g}×${s}`)
})

test('R254: default table validates clean (closed-set, live cells only)', () => {
  assert.deepEqual(validateGestureSceneMap(), [])
})

test('R254: live consumers only — chord-light opens the ring in non-game scenes; everything else none', () => {
  for (const s of ['workspace', 'effects', 'audio', 'video', 'ai', 'settings']) {
    assert.equal(GESTURE_SCENE_MAP['chord-light'][s].action, 'openMenu')
    assert.equal(GESTURE_SCENE_MAP['chord-light'][s].guard, 'explicit-mode')
    assert.equal(GESTURE_SCENE_MAP['chord-light'][s].cooldownMs, 800)
  }
  // games scene: the games input source owns its own mapping (R131 table) —
  // the matrix must NOT double-bind there
  assert.equal(GESTURE_SCENE_MAP['chord-light'].games.action, 'none')
  let liveCells = 0
  for (const g of GESTURES) for (const s of SCENES) if (GESTURE_SCENE_MAP[g][s].action !== 'none') liveCells++
  assert.equal(liveCells, 6, 'exactly the 6 live light-ring cells')
})

test('R254: validator catches unknown actions, bad guards, missing cells', () => {
  const broken = { ...GESTURE_SCENE_MAP, pinch: { ...GESTURE_SCENE_MAP.pinch, workspace: { action: 'explode', cooldownMs: 0, guard: 'always' } } }
  const errs = validateGestureSceneMap(broken)
  assert.ok(errs.some((e) => /unknown action "explode"/.test(e)))
  const noGuard = { ...GESTURE_SCENE_MAP, palm: { ...GESTURE_SCENE_MAP.palm, audio: { action: 'none', cooldownMs: -1, guard: 'sometimes' } } }
  const errs2 = validateGestureSceneMap(noGuard)
  assert.ok(errs2.some((e) => /bad cooldown/.test(e)) && errs2.some((e) => /bad guard/.test(e)))
  assert.ok(validateGestureSceneMap({ pinch: {} }).some((e) => /missing/.test(e)))
})
