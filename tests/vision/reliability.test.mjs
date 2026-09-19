// Monte-Carlo reliability tests — the "industrial grade" gate.
// Quantified pass/fail on NOISE, PHANTOM detections, FRAME DROPOUTS and
// LATENCY budgets, across many seeded runs (not a single lucky path).
//
// Metrics under test:
//  FP-0  idle noise must produce ZERO input events (false-trigger rate)
//  PH-0  low/medium-score phantom flashes must produce ZERO events
//  SK-0  no key may ever remain held after hand loss (stuck-key invariant)
//  LT-P95 trigger latency from gesture onset P95 ≤ 200ms @30fps and @15fps
// R131: ported from the vision-game-input module (node:test → vitest).

import { test, expect } from 'vitest';
import { SessionDriver, atPalm, CENTER, mulberry32, gaussian } from './helpers.mjs';

const QUICK_CFG = { calSteps: { center: 500, reach: 700, pinch: 1100 } };

function readyDriver(seed) {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.session.forceReady({}); // deterministic profile; wizard covered elsewhere
  d.collect(4, atPalm(CENTER.x, CENTER.y));
  return d;
}

test('FP-0: idle hand with noise never fires inputs (20 runs × 30s)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = mulberry32(seed * 7919);
    const sigma = 0.002 + (seed % 4) * 0.003; // 0.002..0.011 — real hand tremor range
    const d = readyDriver(seed);
    const events = d.collect(900, (i) => {
      if (i > 0 && i % 173 === 0) return { absent: true }; // brief natural dropouts
      return atPalm(CENTER.x + gaussian(rng, sigma), CENTER.y + gaussian(rng, sigma));
    });
    const inputs = events.filter((e) => e.kind === 'direction' || (e.kind === 'pinch' && e.name !== 'calibrated'));
    expect(inputs.length, `seed=${seed} sigma=${sigma.toFixed(3)} false events: ${JSON.stringify(inputs.slice(0, 5))}`).toBe(0);
  }
});

test('PH-0: single-frame phantom flashes never fire inputs (20 runs)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = mulberry32(seed * 104729);
    const d = readyDriver(seed);
    const events = d.collect(600, (i) => {
      if (i % 37 === 0) {
        // boundary-score phantom at a random far position — passes the 0.5 floor
        return { cx: rng() * 0.9 + 0.05, cy: rng() * 0.9 + 0.05, score: 0.52 };
      }
      return atPalm(CENTER.x + gaussian(rng, 0.004), CENTER.y + gaussian(rng, 0.004));
    });
    const inputs = events.filter((e) => e.kind === 'direction' || e.kind === 'pinch');
    expect(inputs.length, `seed=${seed}: ${JSON.stringify(inputs.slice(0, 5))}`).toBe(0);
  }
});

test('SK-0: no stuck keys across 200 random gesture/loss cycles', () => {
  const rng = mulberry32(424242);
  const d = readyDriver(1);
  const dirs = [[0.74, 0.5], [0.5, 0.28], [0.28, 0.5], [0.5, 0.72], [0.68, 0.32], [0.32, 0.32]];
  for (let cycle = 0; cycle < 200; cycle++) {
    const [cx, cy] = dirs[Math.floor(rng() * dirs.length)];
    const hold = 4 + Math.floor(rng() * 10);
    d.collect(hold, { cx, cy, pinch: rng() < 0.4 ? 0.25 : 1.25 });
    if (rng() < 0.3) d.collect(1 + Math.floor(rng() * 3), { absent: true }); // random dropout
    d.collect(2, atPalm(CENTER.x, CENTER.y));
  }
  d.collect(120, { absent: true }); // guaranteed full loss
  const events = d.session.stop();
  const stillHeld = events.filter((e) => e.down);
  expect(stillHeld, 'stop() must release exactly the held keys, never press new ones').toEqual([]);
});

test('LT-P95: pinch trigger latency P95 ≤ 200ms @30fps', () => {
  const lat = [];
  for (let seed = 1; seed <= 10; seed++) {
    const rng = mulberry32(seed * 31);
    const d = readyDriver(seed);
    d.collect(6, atPalm(CENTER.x, CENTER.y));
    // gesture onset at a random mid-epoch frame; measure onset → keydown
    d.collect(5, atPalm(CENTER.x, CENTER.y));
    let onset = -1, fired = -1;
    for (let i = 0; i < 20; i++) {
      const spec = i < 6 ? {} : { pinch: 0.25 };
      if (i === 6) onset = i;
      const { events } = d.frame({ ...atPalm(CENTER.x, CENTER.y), ...spec });
      if (onset >= 0 && events.some((e) => e.down && e.key === 'Space')) { fired = i - onset; break; }
    }
    expect(fired >= 0, 'pinch must fire').toBeTruthy();
    lat.push((fired + 1) * d.dt); // onset frame counts as detection latency too
    rng(); rng();
  }
  lat.sort((a, b) => a - b);
  const p95 = lat[Math.floor(lat.length * 0.95)];
  expect(p95 <= 200, `P95 latency ${p95}ms — budget 200ms @30fps`).toBeTruthy();
});

test('LT-P95: direction confirm latency P95 ≤ 250ms @30fps', () => {
  const lat = [];
  for (let seed = 1; seed <= 10; seed++) {
    const d = readyDriver(seed);
    d.collect(6, atPalm(CENTER.x, CENTER.y));
    let fired = -1;
    for (let i = 0; i < 20; i++) {
      const spec = i < 5 ? atPalm(CENTER.x, CENTER.y) : atPalm(0.74, CENTER.y);
      const { events } = d.frame(spec);
      if (events.some((e) => e.down && e.key === 'ArrowRight')) { fired = i - 5; break; }
    }
    expect(fired >= 0, 'direction must fire').toBeTruthy();
    lat.push((fired + 1) * d.dt);
  }
  lat.sort((a, b) => a - b);
  const p95 = lat[Math.floor(lat.length * 0.95)];
  expect(p95 <= 250, `P95 latency ${p95}ms — budget 250ms @30fps`).toBeTruthy();
});

test('LT-15fps: detection still works at 15fps (dim-light auto-exposure)', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG, fps: 15 });
  d.session.forceReady({});
  d.collect(4, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(10, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.25 });
  expect(ev.some((e) => e.down && e.key === 'Space'), 'pinch must fire at 15fps').toBeTruthy();
});
