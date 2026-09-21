// R149: dual-hand role assignment — the lone-hand promotion semantics.
// A lone LEFT hand must be PRIMARY (pre-R149 it was pinned to the off role
// when primaryHand='Right', leaving it inert for every primary capability —
// the vision bench's "only the right hand can be tested" report).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { SessionController } from '../../src/renderer/src/vision/session.js';

function ctrl(primaryHand = 'Right') {
  return new SessionController({
    requireFace: false,
    dualHand: { enabled: true, primaryHand, offPinchKey: 'KeyF' },
  });
}
const hand = (handedness) => ({ handedness, score: 0.9, landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })) });

test('R149: a lone LEFT hand is promoted to primary (was off-role only)', () => {
  const c = ctrl('Right');
  const { primary, secondary } = c._pickHands([hand('Left')]);
  assert.equal(primary?.handedness, 'Left');
  assert.equal(secondary, null);
});

test('R149: a lone RIGHT hand stays primary; two hands split by side', () => {
  const c = ctrl('Right');
  const lone = c._pickHands([hand('Right')]);
  assert.equal(lone.primary?.handedness, 'Right');
  assert.equal(lone.secondary, null);

  const both = c._pickHands([hand('Left'), hand('Right')]);
  assert.equal(both.primary?.handedness, 'Right');
  assert.equal(both.secondary?.handedness, 'Left');
});

test('R149: primaryHand role is switchable (left-handed configuration)', () => {
  const c = ctrl('Left');
  const both = c._pickHands([hand('Left'), hand('Right')]);
  assert.equal(both.primary?.handedness, 'Left');
  assert.equal(both.secondary?.handedness, 'Right');
  // and a lone right hand is still promoted rather than sidelined
  const lone = c._pickHands([hand('Right')]);
  assert.equal(lone.primary?.handedness, 'Right');
});
