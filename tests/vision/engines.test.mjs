// Engine unit tests — state machines, hysteresis, time-based confirmation,
// mirror semantics, calibration-driven thresholds. Runs on `node --test`.

import { test } from 'vitest';
import assert from 'node:assert/strict'; // works under vitest node env
import { HandEngine, handGeometry, sectorOfAngle, SECTORS } from '../../src/renderer/src/vision/gesture_engine.js';
import { FaceEngine } from '../../src/renderer/src/vision/face_engine.js';
import { OneEuroFilter, OneEuroVec2 } from '../../src/renderer/src/vision/one_euro.js';
import { makeHand, CENTER } from './helpers.mjs';

let clockMs = 5000;
const dt = 33;
function tick(n = 1) { clockMs += n * dt; return clockMs; }

function feedHand(engine, frames) {
  const all = [];
  frames.forEach((f) => {
    all.push(...engine.update(makeHand(f), tick() / 1000, clockMs));
  });
  return all;
}

test('handGeometry: pinch is scale-normalized and distance-invariant', () => {
  assert.ok(handGeometry(makeHand({ pinchGap: 0.3 })).pinch < 0.4);
  const g2 = handGeometry(makeHand({ pinchGap: 1.6 })).pinch;
  assert.ok(g2 > 1.0);
  const g3 = handGeometry(makeHand({ cx: 0.2, cy: 0.8, pinchGap: 1.6 })).pinch;
  assert.ok(Math.abs(g3 - g2) < 0.01, `${g3} vs ${g2}`);
});

test('sector mapping covers all 8 directions', () => {
  assert.equal(sectorOfAngle(0), 0);
  assert.equal(sectorOfAngle(45), 1);
  assert.equal(sectorOfAngle(90), 2);
  assert.equal(sectorOfAngle(135), 3);
  assert.equal(sectorOfAngle(180), 4);
  assert.equal(sectorOfAngle(-135), 5);
  assert.equal(sectorOfAngle(-90), 6);
  assert.equal(sectorOfAngle(-45), 7);
  assert.equal(SECTORS[1].name, 'up-right');
  assert.deepEqual(SECTORS[1].keys, ['ArrowUp', 'ArrowRight']);
  assert.equal(sectorOfAngle(80, 4), 2);
  assert.equal(sectorOfAngle(-80, 4), 6);
  assert.equal(sectorOfAngle(170, 4), 4);
});

test('direction: rest produces no events', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  const ev = feedHand(eng, [{ cx: 0.5, cy: 0.5 }, { cx: 0.5, cy: 0.5 }]);
  assert.equal(ev.length, 0);
});

test('direction: decisive sweep engages, hold keeps, center releases', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  let ev = feedHand(eng, [{ cx: 0.56 }, { cx: 0.60 }, { cx: 0.64 }, { cx: 0.68 }, { cx: 0.72 }, { cx: 0.74 }, { cx: 0.74 }, { cx: 0.74 }, { cx: 0.74 }]);
  const down = ev.find((e) => e.kind === 'direction' && e.down);
  assert.equal(down?.key, 'ArrowRight');
  assert.ok(!ev.some((e) => !e.down));

  ev = feedHand(eng, [{ cx: 0.60 }, { cx: 0.64 }, { cx: 0.60 }, { cx: 0.64 }]);
  assert.equal(ev.length, 0, `boundary jitter must not toggle: ${JSON.stringify(ev)}`);

  ev = feedHand(eng, [{ cx: 0.52 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }]);
  const up = ev.find((e) => !e.down && e.kind === 'direction');
  assert.equal(up?.key, 'ArrowRight');
});

test('direction: 8-way diagonal holds both keys', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  const ev = feedHand(eng, [{ cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }]);
  assert.ok(ev.some((e) => e.down && e.key === 'ArrowUp'));
  assert.ok(ev.some((e) => e.down && e.key === 'ArrowRight'));
});

test('direction: sector transition diffs key sets (↗→→ releases only ↑)', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }]);
  const ev = feedHand(eng, [{ cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].key, 'ArrowUp');
  assert.equal(ev[0].down, false);
});

test('direction: shallow 30° neighbor angle never switches (angular hysteresis)', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }]);
  const ev = feedHand(eng, Array(10).fill({ cx: 0.66, cy: 0.438 }));
  assert.equal(ev.length, 0, JSON.stringify(ev));
});

test('direction: decisive 60° does switch to up-right', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }]);
  const ev = feedHand(eng, Array(8).fill({ cx: 0.66, cy: 0.284 }));
  assert.ok(ev.some((e) => e.down && e.key === 'ArrowUp' && e.dir === 'up-right'), JSON.stringify(ev));
});

test('pinch: glitch ignored, sustained fires, release works, cooldown gates chatter', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  assert.equal(feedHand(eng, [{ pinchGap: 1.2 }, { pinchGap: 1.2 }]).length, 0);
  assert.equal(feedHand(eng, [{ pinchGap: 0.3 }, { pinchGap: 1.2 }, { pinchGap: 1.2 }]).length, 0);

  // median-of-3 adds ~1 frame of group delay → 5 frames guarantees the fire
  let ev = feedHand(eng, [{ pinchGap: 0.3 }, { pinchGap: 0.25 }, { pinchGap: 0.25 }, { pinchGap: 0.25 }, { pinchGap: 0.25 }]);
  assert.equal(ev.find((e) => e.down)?.key, 'Space');

  ev = feedHand(eng, [{ pinchGap: 0.25 }, { pinchGap: 1.4 }, { pinchGap: 1.4 }, { pinchGap: 1.4 }]);
  assert.ok(ev.some((e) => !e.down && e.key === 'Space'));

  ev = feedHand(eng, [{ pinchGap: 0.2 }, { pinchGap: 0.2 }]);
  assert.ok(!ev.some((e) => e.down), 'cooldown must block instant re-trigger');
});

test('tracking loss releases everything exactly once', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  // hold right decisively, then a sustained pinch (median needs 3+ frames)
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }]);
  const ev = eng.onLost();
  assert.equal(ev.filter((e) => !e.down).length, 2);
  assert.equal(eng.onLost().length, 0);
});

test('face: neutral silent, sustained jaw triggers, calibration retunes thresholds', () => {
  const eng = new FaceEngine();
  const bs = (jaw = 0.05, brow = 0.03, smileL = 0.02, smileR = 0.02) => ({
    jawOpen: jaw, browInnerUp: brow, mouthSmileLeft: smileL, mouthSmileRight: smileR,
  });
  let ev = [...eng.update(bs(), tick()), ...eng.update(bs(), tick())];
  assert.equal(ev.length, 0);

  ev = [];
  for (let i = 0; i < 4; i++) ev.push(...eng.update(bs(0.85), tick()));
  const d = ev.find((e) => e.down && e.name === 'jawOpen');
  assert.equal(d?.key, 'KeyE');

  ev = [];
  for (const j of [0.1, 0.05, 0.05, 0.05]) ev.push(...eng.update(bs(j), tick()));
  const up = ev.find((e) => !e.down && e.name === 'jawOpen');
  assert.ok(up, 'jaw release must fire');
  assert.equal(up.key, 'KeyE', 'release MUST carry the key (stuck-key regression guard)');

  const eng2 = new FaceEngine();
  eng2.setNeutral({ jawOpen: 0.35, browInnerUp: 0.02, mouthSmileLeft: 0.02, mouthSmileRight: 0.02 });
  const ev2 = [];
  for (let i = 0; i < 6; i++) ev2.push(...eng2.update(bs(0.35), tick()));
  assert.ok(!ev2.some((e) => e.down));
  const ev3 = [];
  for (let i = 0; i < 4; i++) ev3.push(...eng2.update(bs(0.85), tick()));
  assert.ok(ev3.some((e) => e.down));

  // settings: neutralOffset slider changes effective trigger threshold
  const eng3 = new FaceEngine({ neutralOffset: 0.12 });
  eng3.setNeutral({ jawOpen: 0.3 });
  const ev4 = [];
  for (let i = 0; i < 5; i++) ev4.push(...eng3.update(bs(0.44), tick()));
  assert.ok(ev4.some((e) => e.down && e.name === 'jawOpen'), 'lower offset = more sensitive');
});

test('one euro filter converges, tracks steps, tolerates NaN/gaps', () => {
  const f = new OneEuroFilter({ minCutoff: 1.2, beta: 0.05 });
  let t = 0, out = 0;
  for (let i = 0; i < 100; i++) out = f.filter(1.0 + Math.sin(i) * 0.02, (t += 1 / 30));
  assert.ok(Math.abs(out - 1.0) < 0.05);

  const f2 = new OneEuroFilter({ minCutoff: 1.2, beta: 0.05 });
  let lag = 0;
  for (let i = 0; i < 30; i++) lag = f2.filter(i < 15 ? 0 : 1.0, (i + 1) / 30);
  assert.ok(lag > 0.85);

  const v = new OneEuroVec2();
  const p = v.filter(0.5, 0.5, 1.0);
  assert.equal(p.x, 0.5);
  assert.equal(typeof v.filter(NaN, 0.5, 1.033).x, 'number');
});

test('pinch median-of-3: single-frame spike never even becomes a candidate', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  feedHand(eng, [{ pinchGap: 1.2 }, { pinchGap: 1.2 }]);
  // one glitch frame at 0.2 sandwiched by normal frames: the median hides it
  feedHand(eng, [{ pinchGap: 0.2 }]);
  assert.equal(eng.pinch.candidateSince, null, 'glitch must not start a candidate');
  const ev = feedHand(eng, [{ pinchGap: 1.2 }, { pinchGap: 1.2 }]);
  assert.equal(ev.length, 0);
  // a real sustained pinch still fires normally through the median
  const ev2 = feedHand(eng, Array(6).fill({ pinchGap: 0.25 }));
  assert.ok(ev2.some((e) => e.down && e.key === 'Space'));
});

test('low-quality frames freeze state machines instead of feeding noise', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  let t = 5000;
  const q = (spec, quality) => { t += 33; return eng.update(makeHand(spec), t / 1000, t, quality); };

  // borderline frame mid-hold-right: no events, no state advance, no release
  for (let i = 0; i < 8; i++) q({ cx: 0.74, cy: 0.5 }, 1);   // hold right → ArrowRight
  const ev = q({ cx: 0.2, cy: 0.9 }, 0.6);                    // garbage + low quality
  assert.equal(ev.length, 0, 'frozen frame emits nothing');
  assert.equal(eng.direction.active, 0, 'still holding right');

  // 8 consecutive borderline frames → treated as loss → keys released
  let evLoss = [];
  for (let i = 0; i < 8; i++) evLoss.push(...q({ cx: 0.5, cy: 0.5 }, 0.6));
  assert.ok(evLoss.some((e) => !e.down && e.key === 'ArrowRight'), 'sustained low quality releases');

  // quality recovers → normal operation resumes immediately
  const ev2 = [];
  for (let i = 0; i < 8; i++) ev2.push(...q({ cx: 0.74, cy: 0.5 }, 0.92));
  assert.ok(ev2.some((e) => e.down && e.key === 'ArrowRight'), 're-engages after quality recovers');
});

test('CENTER constant matches geometry palm (mirror/calibration invariant)', () => {
  const g = handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm;
  assert.ok(Math.abs(g.x - CENTER.x) < 1e-6 && Math.abs(g.y - CENTER.y) < 1e-6);
});

test('drift recovery: posture drift self-corrects, left stays pure left', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  // hand drifts 0.05 UP from the calibrated center and rests there ~5s:
  // dead-zone recentering must absorb the drift…
  feedHand(eng, Array(150).fill({ cy: 0.45 }));
  const cyAfterRest = eng.direction.center.y;
  assert.ok(cyAfterRest < 0.545 - 0.02, `center crept toward palm: ${cyAfterRest.toFixed(4)}`);
  // …so a leftward sweep now classifies as PURE left (no up contamination).
  // Before recentering existed, this exact scenario fired up-left diagonals
  // or nothing at all — the reported "往左检测不到" regression.
  const ev = feedHand(eng, [{ cx: 0.44, cy: 0.45 }, { cx: 0.42, cy: 0.45 }, { cx: 0.40, cy: 0.45 }, { cx: 0.38, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }, { cx: 0.36, cy: 0.45 }]);
  assert.ok(ev.some((e) => e.down && e.key === 'ArrowLeft'), JSON.stringify(ev));
  assert.ok(!ev.some((e) => e.down && e.key === 'ArrowUp'), 'no up contamination');
});

test('recenter never fights a deliberate hold (direction held ≠ drift)', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  const before = { ...eng.direction.center };
  feedHand(eng, Array(90).fill({ cx: 0.74, cy: 0.5 })); // hold right 3s (r > deadZone)
  const after = eng.direction.center;
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9, 'center frozen while holding');
});
