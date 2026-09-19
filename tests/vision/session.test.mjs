// SessionController integration tests — lifecycle, calibration wizard with
// quality gates, score filtering, loss/reacquire, pause, profile persistence.
// R131: ported from the vision-game-input module (node:test → vitest).

import { test, expect } from 'vitest';
import { SessionDriver, heldKeys, atPalm, CENTER, mulberry32, gaussian } from './helpers.mjs';
import { adaptFaceRate } from '../../src/renderer/src/vision/session.js';

const QUICK_CFG = { calSteps: { center: 500, reach: 700, pinch: 1100 } };

test('lifecycle: searching → calibrating → active via the 3-step wizard', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.session.start(5000);
  expect(d.session.state).toBe('searching');
  const profile = d.calibrate();
  expect(d.session.state, `status: ${d.session.status}`).toBe('active');
  expect(profile.center.x > 0 && profile.center.y > 0).toBeTruthy();
});

test('wizard step 1 (center): auto-derives direction center', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(18, atPalm(CENTER.x, CENTER.y));
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2));
  }
  for (let i = 0; i < 15; i++) d.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
  expect(d.session.state).toBe('active');
  expect(Math.abs(d.session.profile.center.x - CENTER.x) < 0.01, JSON.stringify(d.session.profile.center)).toBeTruthy();
});

test('wizard step 2 (reach): auto-derives trigger radius from measured range', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate({ reachR: 0.26 });
  const az = d.session.handEngine.direction.cfg.activeZone;
  expect(az >= 0.12 && az <= 0.28, `activeZone=${az}`).toBeTruthy();
  expect(d.session.profile.reach >= 0.14).toBeTruthy();
  expect(d.session.profile.sectors >= 5, `sectors=${d.session.profile.sectors}`).toBeTruthy();
});

test('wizard step 3 (pinch): auto-derives thresholds with separation gate', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate({ cycles: 8 });
  const { pinchOn, pinchOff, pinchSeparation } = d.session.profile;
  expect(pinchOn >= 0.3 && pinchOn <= 0.6, `on=${pinchOn}`).toBeTruthy();
  expect(pinchOff > pinchOn, `off=${pinchOff} on=${pinchOn}`).toBeTruthy();
  expect(pinchSeparation >= 0.25, `sep=${pinchSeparation}`).toBeTruthy();
  // the derived thresholds must actually work for THIS user's pinch range
  d.session.forceReady(d.session.profile);
  d.collect(5, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(6, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.3 });
  expect(ev.some((e) => e.down && e.key === 'Space'), 'pinch within user range fires').toBeTruthy();
});

test('quality gate: jittery hand at center triggers retry, not garbage calibration', () => {
  const rng = mulberry32(1234);
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(24, (i) => {
    const g = gaussian(rng, 0.06);
    return atPalm(CENTER.x + g, CENTER.y + gaussian(rng, 0.06));
  });
  expect(d.session.state, 'must stay in calibration').toBe('calibrating');
  expect(d.session.status.includes('重试'), d.session.status).toBeTruthy();
  // clean data recovers the flow — the first full CLEAN window passes the gate
  // (a retry window containing residual noise is expected to re-retry)
  d.collect(30, atPalm(CENTER.x, CENTER.y));
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2));
  }
  for (let i = 0; i < 12; i++) d.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
  expect(d.session.state, `status: ${d.session.status}`).toBe('active');
});

test('quality gate: missing face during center step forces retry', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(5, atPalm(CENTER.x, CENTER.y));            // enters calibration
  d.collect(16, { ...atPalm(CENTER.x, CENTER.y), face: null }); // step ends faceless
  expect(d.session.state).toBe('calibrating');
  expect(d.session.status.includes('面部'), d.session.status).toBeTruthy();
});

test('phantom hand below score floor never starts calibration', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(30, { score: 0.45 });
  expect(d.session.state).toBe('searching');
});

test('low-score frames in active state are ignored entirely', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(4, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(8, { ...atPalm(0.75, 0.3), score: 0.3 });
  expect(ev.length).toBe(0);
  expect(d.session.state).toBe('active');
});

test('hand loss: keys release at grace, full recalibration after long loss', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(6, atPalm(0.72, CENTER.y));                // decisive hold → ArrowRight
  const ev = d.collect(8, { absent: true });
  expect(ev.some((e) => !e.down), 'grace loss must release keys').toBeTruthy();
  expect(d.session.state, '8 frames (<1.5s) stays active').toBe('active');
  d.collect(45, { absent: true });
  expect(d.session.state, '1.5s of loss returns to searching').toBe('searching');
  // hand returns → calibration restarts, not instant activation
  d.collect(3, atPalm(CENTER.x, CENTER.y));
  expect(d.session.state).toBe('calibrating');
});

test('pause releases keys and blocks events; resume re-enters flow', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(6, atPalm(0.72, CENTER.y));                // decisive hold → ArrowRight
  const ev = d.session.setPaused(true);
  expect(ev.some((e) => !e.down), 'pause releases held keys').toBeTruthy();
  expect(d.session.state).toBe('paused');
  const ev2 = d.collect(5, atPalm(0.3, 0.3));
  expect(ev2.length, 'no events while paused').toBe(0);
  d.session.setPaused(false);
  expect(d.session.state).toBe('searching');
});

test('forceReady hook: profile injection skips wizard (demo/tests)', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.session.forceReady({ pinchOn: 0.5, pinchOff: 0.8 });
  expect(d.session.state).toBe('active');
  d.collect(3, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(6, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.3 });
  expect(ev.some((e) => e.down && e.key === 'Space')).toBeTruthy();
});

test('profile persistence round-trips through storage', () => {
  const store = new Map();
  const d1 = new SessionDriver({ cfg: { ...QUICK_CFG, storage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) } } });
  d1.calibrate();
  const saved = d1.session.profile;
  const d2 = new SessionDriver({ cfg: { ...QUICK_CFG, storage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) } } });
  expect(d2.session.profile, 'profile restored on boot').toBeTruthy();
  expect(Math.abs(d2.session.profile.center.x - saved.center.x) < 1e-9).toBeTruthy();
  expect(Math.abs(d2.session.handEngine.direction.cfg.activeZone - saved.activeZone) < 1e-9).toBeTruthy();
});

test('adaptive face rate escalates under budget pressure and recovers', () => {
  expect(adaptFaceRate(1, 60)).toBe(2);
  expect(adaptFaceRate(2, 60)).toBe(3);
  expect(adaptFaceRate(3, 99)).toBe(3);
  expect(adaptFaceRate(2, 20)).toBe(1);
  expect(adaptFaceRate(1, 30)).toBe(1);
});

test('heldKeys invariant after force-release', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(3, atPalm(0.72, CENTER.y));
  d.collect(2, { ...atPalm(0.72, CENTER.y), pinch: 0.2, pinchGap: undefined });
  d.session.stop();
  expect(heldKeys(d.session)).toEqual([]);
});
