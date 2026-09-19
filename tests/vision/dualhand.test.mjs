// Dual-hand tests: left/right distinction (handedness), off-hand secondary
// actions, two-hand gap gesture, open-palm pause, and single-hand fallback.

import { test } from 'vitest';
import assert from 'node:assert/strict'; // works under vitest node env
import { SessionDriver, heldKeys, atPalm, CENTER, makeHand } from './helpers.mjs';
import { OpenPalmHold, GapEngine, handOpenness } from '../../src/renderer/src/vision/gesture_engine.js';

const DUAL_CFG = {
  calSteps: { center: 500, reach: 700, pinch: 1100 },
  dualHand: { enabled: true, primaryHand: 'Right', offPinchKey: 'KeyF' },
};

test('dual disabled (default): two hands behave exactly like before (best = primary)', () => {
  const d = new SessionDriver({});
  d.session.forceReady({});
  d.collect(3, atPalm(CENTER.x, CENTER.y));
  // left hand pinching in frame — must NOT produce off-hand events
  const ev = d.collect(8, {
    ...atPalm(0.72, CENTER.y),
    hand2: { cx: 0.3, cy: 0.5, pinch: 0.2 },
  });
  assert.ok(ev.some((e) => e.down && e.key === 'Space'), 'primary pinch still works');
  assert.ok(!ev.some((e) => e.kind === 'offhand'), 'no off-hand events when dual disabled');
});

test('dual enabled: right hand drives direction, left pinch fires KeyF', () => {
  const d = new SessionDriver({ cfg: DUAL_CFG });
  d.session.forceReady({});
  d.collect(3, { ...atPalm(CENTER.x, CENTER.y), hand2: { cx: 0.3, cy: 0.5 } });
  const ev = d.collect(10, {
    cx: 0.74, cy: 0.5,
    hand2: { cx: 0.3, cy: 0.5, pinch: 0.2 },
  });
  assert.ok(ev.some((e) => e.kind === 'direction' && e.down && e.key === 'ArrowRight'), JSON.stringify(ev));
  const kf = ev.find((e) => e.kind === 'offhand' && e.name === 'pinch' && e.down);
  assert.equal(kf?.key, 'KeyF');
});

test('dual enabled: off hand alone drives only off-hand actions', () => {
  const d = new SessionDriver({ cfg: DUAL_CFG });
  d.session.forceReady({});
  d.collect(3, { ...atPalm(CENTER.x, CENTER.y), hand2: { cx: 0.3, cy: 0.5 } });
  // primary gone; left hand alone pinches
  const ev = d.collect(12, { handedness: 'Left', cx: 0.3, cy: 0.5, pinch: 0.2 });
  assert.ok(!ev.some((e) => e.kind === 'direction'), 'no direction without primary hand');
  assert.ok(ev.some((e) => e.kind === 'offhand' && e.name === 'pinch' && e.down), JSON.stringify(ev));
});

test('handedness swap flag mirrors primary/off assignment', () => {
  const d = new SessionDriver({ cfg: { ...DUAL_CFG, dualHand: { ...DUAL_CFG.dualHand, primaryHand: 'Right', swapHands: true } } });
  d.session.forceReady({});
  // camera reports the physical right hand as 'Left' (swapped device)
  const ev = d.collect(10, { cx: 0.74, cy: 0.5, handedness: 'Left', hand2: { cx: 0.3, cy: 0.5, pinch: 0.2, handedness: 'Right' } });
  assert.ok(ev.some((e) => e.kind === 'direction' && e.down && e.key === 'ArrowRight'), 'swapped label still drives direction');
});

test('two-hand gap: spread fires apart, close fires together', () => {
  const d = new SessionDriver({ cfg: DUAL_CFG });
  d.session.forceReady({});
  d.collect(4, { cx: 0.5, cy: 0.5, hand2: { cx: 0.56, cy: 0.5 } }); // gap ≈ 0.33 → together, no event
  const ev1 = d.collect(10, { cx: 0.5, cy: 0.5, hand2: { cx: 0.95, cy: 0.5 } }); // gap ≈ 2.5 → apart
  assert.ok(ev1.some((e) => e.kind === 'hands' && e.name === 'apart'), JSON.stringify(ev1));
  const ev2 = d.collect(10, { cx: 0.5, cy: 0.5, hand2: { cx: 0.56, cy: 0.5 } }); // back under close
  assert.ok(ev2.some((e) => e.kind === 'hands' && e.name === 'together'), JSON.stringify(ev2));
});

test('gap hysteresis: mid-band oscillation does not toggle', () => {
  const d = new SessionDriver({ cfg: DUAL_CFG });
  d.session.forceReady({});
  d.collect(4, { cx: 0.5, cy: 0.5, hand2: { cx: 0.56, cy: 0.5 } });
  // band between close(1.05) and open(1.6) hand-scales ≈ 0.19..0.29 normalized
  const ev = d.collect(12, { cx: 0.5, cy: 0.5, hand2: { cx: 0.73, cy: 0.5 } });
  assert.equal(ev.length, 0, JSON.stringify(ev));
});

test('open-palm hold fires pause once, re-arms only after relaxing', () => {
  const hold = new OpenPalmHold({ holdMs: 200 });
  let t = 1000;
  let fired = 0;
  for (let i = 0; i < 20; i++) fired += hold.update(4, (t += 33)).length; // held open
  assert.equal(fired, 1, 'fires exactly once while held');
  for (let i = 0; i < 20; i++) fired += hold.update(4, (t += 33)).length;
  assert.equal(fired, 1, 'no re-fire without relaxing');
  for (let i = 0; i < 5; i++) fired += hold.update(1, (t += 33)).length; // relax re-arms
  for (let i = 0; i < 10; i++) fired += hold.update(4, (t += 33)).length;
  assert.equal(fired, 2, 're-armed and fires again');
});

test('gap engine unit: hysteresis + confirmation timing (tSec in SECONDS)', () => {
  const g = new GapEngine({ open: 1.6, close: 1.05, confirmMs: 100 });
  let t = 0; // seconds — matches SessionController's tSec convention
  assert.equal(g.update(1.8, (t += 0.033)).length, 0, 'first frame only candidate');
  assert.equal(g.update(1.8, (t += 0.033)).length, 0, '33ms < confirm');
  assert.equal(g.update(1.8, (t += 0.033)).length, 0, '66ms < confirm');
  assert.equal(g.update(1.8, (t += 0.033)).length, 0, '99ms < confirm');
  assert.equal(g.update(1.8, (t += 0.033)).length, 1, '132ms ≥ confirm → apart');
  assert.equal(g.update(1.2, (t += 0.033)).length, 0, 'mid-band keeps apart');
  assert.equal(g.update(0.9, (t += 0.033)).length, 0, '33ms < confirm');
  assert.equal(g.update(0.9, (t += 0.033)).length, 0, '66ms < confirm');
  assert.equal(g.update(0.9, (t += 0.033)).length, 0, '99ms < confirm');
  assert.equal(g.update(0.9, (t += 0.033)).length, 0, '132ms... still under? no — 132 ≥ 100 fires next');
  assert.equal(g.update(0.9, (t += 0.033)).length, 1, '165ms → together');
});

test('handOpenness: default builder hand is open (4 fingers)', () => {
  assert.ok(handOpenness(makeHand({})) >= 4);
});
