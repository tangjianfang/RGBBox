// Engine unit tests — state machines, hysteresis, time-based confirmation,
// mirror semantics, calibration-driven thresholds.
// R131: ported from the vision-game-input module (node:test → vitest).

import { test, expect } from 'vitest';
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
  expect(handGeometry(makeHand({ pinchGap: 0.3 })).pinch < 0.4).toBeTruthy();
  const g2 = handGeometry(makeHand({ pinchGap: 1.6 })).pinch;
  expect(g2 > 1.0).toBeTruthy();
  const g3 = handGeometry(makeHand({ cx: 0.2, cy: 0.8, pinchGap: 1.6 })).pinch;
  expect(Math.abs(g3 - g2) < 0.01, `${g3} vs ${g2}`).toBeTruthy();
});

test('sector mapping covers all 8 directions', () => {
  expect(sectorOfAngle(0)).toBe(0);
  expect(sectorOfAngle(45)).toBe(1);
  expect(sectorOfAngle(90)).toBe(2);
  expect(sectorOfAngle(135)).toBe(3);
  expect(sectorOfAngle(180)).toBe(4);
  expect(sectorOfAngle(-135)).toBe(5);
  expect(sectorOfAngle(-90)).toBe(6);
  expect(sectorOfAngle(-45)).toBe(7);
  expect(SECTORS[1].name).toBe('up-right');
  expect(SECTORS[1].keys).toEqual(['ArrowUp', 'ArrowRight']);
  expect(sectorOfAngle(80, 4)).toBe(2);
  expect(sectorOfAngle(-80, 4)).toBe(6);
  expect(sectorOfAngle(170, 4)).toBe(4);
});

test('direction: rest produces no events', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  const ev = feedHand(eng, [{ cx: 0.5, cy: 0.5 }, { cx: 0.5, cy: 0.5 }]);
  expect(ev.length).toBe(0);
});

test('direction: decisive sweep engages, hold keeps, center releases', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  let ev = feedHand(eng, [{ cx: 0.56 }, { cx: 0.60 }, { cx: 0.64 }, { cx: 0.68 }, { cx: 0.72 }, { cx: 0.74 }, { cx: 0.74 }, { cx: 0.74 }, { cx: 0.74 }]);
  const down = ev.find((e) => e.kind === 'direction' && e.down);
  expect(down?.key).toBe('ArrowRight');
  expect(ev.some((e) => !e.down)).toBe(false);

  ev = feedHand(eng, [{ cx: 0.60 }, { cx: 0.64 }, { cx: 0.60 }, { cx: 0.64 }]);
  expect(ev.length, `boundary jitter must not toggle: ${JSON.stringify(ev)}`).toBe(0);

  ev = feedHand(eng, [{ cx: 0.52 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }, { cx: 0.50 }]);
  const up = ev.find((e) => !e.down && e.kind === 'direction');
  expect(up?.key).toBe('ArrowRight');
});

test('direction: 8-way diagonal holds both keys', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  const ev = feedHand(eng, [{ cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }]);
  expect(ev.some((e) => e.down && e.key === 'ArrowUp')).toBeTruthy();
  expect(ev.some((e) => e.down && e.key === 'ArrowRight')).toBeTruthy();
});

test('direction: sector transition diffs key sets (↗→→ releases only ↑)', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }, { cx: 0.68, cy: 0.35 }]);
  const ev = feedHand(eng, [{ cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }, { cx: 0.70, cy: 0.5 }]);
  expect(ev.length).toBe(1);
  expect(ev[0].key).toBe('ArrowUp');
  expect(ev[0].down).toBe(false);
});

test('direction: shallow 30° neighbor angle never switches (angular hysteresis)', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }]);
  const ev = feedHand(eng, Array(10).fill({ cx: 0.66, cy: 0.438 }));
  expect(ev.length, JSON.stringify(ev)).toBe(0);
});

test('direction: decisive 60° does switch to up-right', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm);
  feedHand(eng, [{ cx: 0.5, cy: 0.5 }]);
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }]);
  const ev = feedHand(eng, Array(8).fill({ cx: 0.66, cy: 0.284 }));
  expect(ev.some((e) => e.down && e.key === 'ArrowUp' && e.dir === 'up-right'), JSON.stringify(ev)).toBeTruthy();
});

test('pinch: glitch ignored, sustained fires, release works, cooldown gates chatter', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  expect(feedHand(eng, [{ pinchGap: 1.2 }, { pinchGap: 1.2 }]).length).toBe(0);
  expect(feedHand(eng, [{ pinchGap: 0.3 }, { pinchGap: 1.2 }, { pinchGap: 1.2 }]).length).toBe(0);

  let ev = feedHand(eng, [{ pinchGap: 0.3 }, { pinchGap: 0.25 }, { pinchGap: 0.25 }]);
  expect(ev.find((e) => e.down)?.key).toBe('Space');

  ev = feedHand(eng, [{ pinchGap: 0.25 }, { pinchGap: 1.4 }, { pinchGap: 1.4 }]);
  expect(ev.some((e) => !e.down && e.key === 'Space')).toBeTruthy();

  ev = feedHand(eng, [{ pinchGap: 0.2 }, { pinchGap: 0.2 }]);
  expect(ev.some((e) => e.down), 'cooldown must block instant re-trigger').toBe(false);
});

test('tracking loss releases everything exactly once', () => {
  const eng = new HandEngine();
  eng.setCenter(handGeometry(makeHand({})).palm);
  feedHand(eng, [{ cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, cy: 0.5 }, { cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }, { cx: 0.7, pinchGap: 0.2 }]);
  const ev = eng.onLost();
  expect(ev.filter((e) => !e.down).length).toBe(2);
  expect(eng.onLost().length).toBe(0);
});

test('face: neutral silent, sustained jaw triggers, calibration retunes thresholds', () => {
  const eng = new FaceEngine();
  const bs = (jaw = 0.05, brow = 0.03, smileL = 0.02, smileR = 0.02) => ({
    jawOpen: jaw, browInnerUp: brow, mouthSmileLeft: smileL, mouthSmileRight: smileR,
  });
  let ev = [...eng.update(bs(), tick()), ...eng.update(bs(), tick())];
  expect(ev.length).toBe(0);

  ev = [];
  for (let i = 0; i < 4; i++) ev.push(...eng.update(bs(0.85), tick()));
  const d = ev.find((e) => e.down && e.name === 'jawOpen');
  expect(d?.key).toBe('KeyE');

  ev = [];
  for (const j of [0.1, 0.05, 0.05, 0.05]) ev.push(...eng.update(bs(j), tick()));
  const up = ev.find((e) => !e.down && e.name === 'jawOpen');
  expect(up, 'jaw release must fire').toBeTruthy();
  expect(up.key, 'release MUST carry the key (stuck-key regression guard)').toBe('KeyE');

  const eng2 = new FaceEngine();
  eng2.setNeutral({ jawOpen: 0.35, browInnerUp: 0.02, mouthSmileLeft: 0.02, mouthSmileRight: 0.02 });
  const ev2 = [];
  for (let i = 0; i < 6; i++) ev2.push(...eng2.update(bs(0.35), tick()));
  expect(ev2.some((e) => e.down)).toBe(false);
  const ev3 = [];
  for (let i = 0; i < 4; i++) ev3.push(...eng2.update(bs(0.85), tick()));
  expect(ev3.some((e) => e.down)).toBeTruthy();

  // settings: neutralOffset slider changes effective trigger threshold
  const eng3 = new FaceEngine({ neutralOffset: 0.12 });
  eng3.setNeutral({ jawOpen: 0.3 });
  const ev4 = [];
  for (let i = 0; i < 5; i++) ev4.push(...eng3.update(bs(0.44), tick()));
  expect(ev4.some((e) => e.down && e.name === 'jawOpen'), 'lower offset = more sensitive').toBeTruthy();
});

test('one euro filter converges, tracks steps, tolerates NaN/gaps', () => {
  const f = new OneEuroFilter({ minCutoff: 1.2, beta: 0.05 });
  let t = 0, out = 0;
  for (let i = 0; i < 100; i++) out = f.filter(1.0 + Math.sin(i) * 0.02, (t += 1 / 30));
  expect(Math.abs(out - 1.0) < 0.05).toBeTruthy();

  const f2 = new OneEuroFilter({ minCutoff: 1.2, beta: 0.05 });
  let lag = 0;
  for (let i = 0; i < 30; i++) lag = f2.filter(i < 15 ? 0 : 1.0, (i + 1) / 30);
  expect(lag > 0.85).toBeTruthy();

  const v = new OneEuroVec2();
  const p = v.filter(0.5, 0.5, 1.0);
  expect(p.x).toBe(0.5);
  expect(typeof v.filter(NaN, 0.5, 1.033).x).toBe('number');
});

test('CENTER constant matches geometry palm (mirror/calibration invariant)', () => {
  const g = handGeometry(makeHand({ cx: 0.5, cy: 0.5 })).palm;
  expect(Math.abs(g.x - CENTER.x) < 1e-6 && Math.abs(g.y - CENTER.y) < 1e-6).toBeTruthy();
});
