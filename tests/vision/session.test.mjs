// SessionController integration tests — lifecycle, calibration wizard with
// quality gates, score filtering, loss/reacquire, pause, profile persistence.

import { test } from 'vitest';
import assert from 'node:assert/strict'; // works under vitest node env
import { SessionDriver, heldKeys, atPalm, CENTER, mulberry32, gaussian } from './helpers.mjs';
import { adaptFaceRate } from '../../src/renderer/src/vision/session.js';

const QUICK_CFG = { calSteps: { center: 500, reach: 700, pinch: 1100 } };

test('lifecycle: searching → calibrating → active via the 3-step wizard', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.session.start(5000);
  assert.equal(d.session.state, 'searching');
  const profile = d.calibrate();
  assert.equal(d.session.state, 'active', `status: ${d.session.status}`);
  assert.ok(profile.center.x > 0 && profile.center.y > 0);
});

test('wizard step 1 (center): auto-derives direction center', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(18, atPalm(CENTER.x, CENTER.y));
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2));
  }
  for (let i = 0; i < 15; i++) d.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
  assert.equal(d.session.state, 'active');
  assert.ok(Math.abs(d.session.profile.center.x - CENTER.x) < 0.01, JSON.stringify(d.session.profile.center));
});

test('wizard step 2 (reach): auto-derives trigger radius from measured range', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate({ reachR: 0.26 });
  const az = d.session.handEngine.direction.cfg.activeZone;
  assert.ok(az >= 0.12 && az <= 0.28, `activeZone=${az}`);
  assert.ok(d.session.profile.reach >= 0.14);
  assert.ok(d.session.profile.sectors >= 5, `sectors=${d.session.profile.sectors}`);
});

test('wizard step 3 (pinch): auto-derives thresholds with separation gate', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate({ cycles: 8 });
  const { pinchOn, pinchOff, pinchSeparation } = d.session.profile;
  assert.ok(pinchOn >= 0.3 && pinchOn <= 0.6, `on=${pinchOn}`);
  assert.ok(pinchOff > pinchOn, `off=${pinchOff} on=${pinchOn}`);
  assert.ok(pinchSeparation >= 0.25, `sep=${pinchSeparation}`);
  // the derived thresholds must actually work for THIS user's pinch range
  d.session.forceReady(d.session.profile);
  d.collect(5, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(6, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.3 });
  assert.ok(ev.some((e) => e.down && e.key === 'Space'), 'pinch within user range fires');
});

test('quality gate: jitter first EXTENDS, then passes once clean data dominates', () => {
  const rng = mulberry32(1234);
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(24, (i) => {
    const g = gaussian(rng, 0.06);
    return atPalm(CENTER.x + g, CENTER.y + gaussian(rng, 0.06));
  });
  // window expired with σ too high → extend (samples kept), NOT a hard retry
  assert.equal(d.session.state, 'calibrating');
  assert.ok(d.session.status.includes('继续采样'), d.session.status);
  // clean data keeps flowing → σ dilutes below the gate → step passes
  d.collect(36, atPalm(CENTER.x, CENTER.y));
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2));
  }
  for (let i = 0; i < 12; i++) d.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
  assert.equal(d.session.state, 'active', `status: ${d.session.status}`);
});

test('quality gate: persistent jitter retries after the extension is exhausted', () => {
  const rng = mulberry32(5678);
  const d = new SessionDriver({ cfg: QUICK_CFG });
  const jittery = () => atPalm(CENTER.x + gaussian(rng, 0.08), CENTER.y + gaussian(rng, 0.08));
  // the cycle must be extend → retry → extend → … (hard retries DO happen for
  // persistently bad data; the final phase just alternates between them)
  let retried = false;
  for (let i = 0; i < 60; i++) {
    const { events } = d.frame(jittery());
    if (events.some((e) => e.name === 'cal-retry')) retried = true;
  }
  assert.ok(retried, 'persistent jitter must eventually hard-retry');
  assert.equal(d.session.state, 'calibrating', 'still in calibration, never ships garbage');
});

test('extend keeps collected pinch samples (no restart from zero)', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(18, atPalm(CENTER.x, CENTER.y));     // center step
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2));
  }
  // reach step done → now in pinch step; feed only 10 samples then let it expire
  d.collect(10, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.3 });
  d.collect(40, { absent: true });               // burn the window handless
  assert.ok(d.session.status.includes('继续采样'), d.session.status);
  const kept = d.session.cal.pinchSamples.length;
  assert.ok(kept >= 10, `samples preserved across extend: ${kept}`);
  // user resumes pinching → passes with the retained samples counted in
  for (let i = 0; i < 10; i++) d.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
  d.collect(30, { absent: true });               // burn remaining window
  assert.equal(d.session.state, 'active', `status: ${d.session.status}`);
});

test('quality gate: missing face during center step forces retry', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(5, atPalm(CENTER.x, CENTER.y));            // enters calibration
  d.collect(16, { ...atPalm(CENTER.x, CENTER.y), face: null }); // step ends faceless
  assert.equal(d.session.state, 'calibrating');
  assert.ok(d.session.status.includes('面部'), d.session.status);
});

test('phantom hand below score floor never starts calibration', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.collect(30, { score: 0.45 });
  assert.equal(d.session.state, 'searching');
});

test('low-score frames in active state are ignored entirely', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(4, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(8, { ...atPalm(0.75, 0.3), score: 0.3 });
  assert.equal(ev.length, 0);
  assert.equal(d.session.state, 'active');
});

test('hand loss: keys release at grace, full recalibration after long loss', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(6, atPalm(0.72, CENTER.y));                // decisive hold → ArrowRight
  const ev = d.collect(8, { absent: true });
  assert.ok(ev.some((e) => !e.down), 'grace loss must release keys');
  assert.equal(d.session.state, 'active', '8 frames (<1.5s) stays active');
  d.collect(45, { absent: true });
  assert.equal(d.session.state, 'searching', '1.5s of loss returns to searching');
  // hand returns → calibration restarts, not instant activation
  d.collect(3, atPalm(CENTER.x, CENTER.y));
  assert.equal(d.session.state, 'calibrating');
});

test('pause releases keys and blocks events; resume re-enters flow', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(6, atPalm(0.72, CENTER.y));                // decisive hold → ArrowRight
  const ev = d.session.setPaused(true);
  assert.ok(ev.some((e) => !e.down), 'pause releases held keys');
  assert.equal(d.session.state, 'paused');
  const ev2 = d.collect(5, atPalm(0.3, 0.3));
  assert.equal(ev2.length, 0, 'no events while paused');
  d.session.setPaused(false);
  assert.equal(d.session.state, 'searching');
});

test('forceReady hook: profile injection skips wizard (demo/tests)', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.session.forceReady({ pinchOn: 0.5, pinchOff: 0.8 });
  assert.equal(d.session.state, 'active');
  d.collect(3, atPalm(CENTER.x, CENTER.y));
  const ev = d.collect(6, { ...atPalm(CENTER.x, CENTER.y), pinch: 0.3 });
  assert.ok(ev.some((e) => e.down && e.key === 'Space'));
});

test('profile persistence round-trips through storage', () => {
  const store = new Map();
  const d1 = new SessionDriver({ cfg: { ...QUICK_CFG, storage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) } } });
  d1.calibrate();
  const saved = d1.session.profile;
  const d2 = new SessionDriver({ cfg: { ...QUICK_CFG, storage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) } } });
  assert.ok(d2.session.profile, 'profile restored on boot');
  assert.ok(Math.abs(d2.session.profile.center.x - saved.center.x) < 1e-9);
  assert.ok(Math.abs(d2.session.handEngine.direction.cfg.activeZone - saved.activeZone) < 1e-9);
});

test('adaptive face rate escalates under budget pressure and recovers', () => {
  assert.equal(adaptFaceRate(1, 60), 2);
  assert.equal(adaptFaceRate(2, 60), 3);
  assert.equal(adaptFaceRate(3, 99), 3);
  assert.equal(adaptFaceRate(2, 20), 1);
  assert.equal(adaptFaceRate(1, 30), 1);
});

test('heldKeys invariant after force-release', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  d.collect(3, atPalm(0.72, CENTER.y));
  d.collect(2, { ...atPalm(0.72, CENTER.y), pinch: 0.2, pinchGap: undefined });
  d.session.stop();
  assert.deepEqual(heldKeys(d.session), []);
});

// RGBBox (R132): the games integration runs faceless (faceModel:null) —
// requireFace:false must unlock both face gates: calibration entry and the
// center-step faceN check. Upstream default keeps enforcing them.
test('requireFace:false calibrates and plays fully faceless (RGBBox games path)', () => {
  const d = new SessionDriver({ cfg: { calSteps: { center: 500, reach: 700, pinch: 1100 }, requireFace: false } });
  const faceless = (spec) => ({ ...spec, face: null });
  // searching → calibrating without any face frame
  d.collect(18, faceless(atPalm(CENTER.x, CENTER.y)));
  assert.equal(d.session.state, 'calibrating');
  // center step passes the (skipped) face gate; reach + pinch complete faceless
  for (let k = 0; k < 8; k++) {
    const deg = (k * 45 * Math.PI) / 180;
    d.collect(3, faceless(atPalm(CENTER.x + Math.cos(deg) * 0.2, CENTER.y - Math.sin(deg) * 0.2)));
  }
  for (let i = 0; i < 15; i++) d.collect(3, faceless({ ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 }));
  assert.equal(d.session.state, 'active', `status: ${d.session.status}`);
  // gestures still fire with zero face input
  const ev = d.collect(6, faceless(atPalm(0.72, CENTER.y)));
  assert.ok(ev.some((e) => e.down && e.key === 'ArrowRight'), 'faceless direction must fire');
});

test('requireFace default still enforces the center-step face gate', () => {
  const d = new SessionDriver({ cfg: { calSteps: { center: 500, reach: 700, pinch: 1100 } } });
  d.collect(5, atPalm(CENTER.x, CENTER.y));                     // enters calibration
  d.collect(16, { ...atPalm(CENTER.x, CENTER.y), face: null }); // step ends faceless
  assert.equal(d.session.state, 'calibrating');
  assert.ok(d.session.status.includes('面部') || d.session.status.includes('采样'), d.session.status);
});

// RGBBox (R135): the snapshot must expose the DirectionRing's LIVE center —
// recenter drift-healing only updates the ring, profile.center goes stale,
// and the analog movement path reads ringCenter.
test('snapshot exposes the ring live center (ringCenter) and recenter moves it', () => {
  const d = new SessionDriver({ cfg: QUICK_CFG });
  d.calibrate();
  const first = d.frame({ ...atPalm(CENTER.x, CENTER.y) }).snapshot;
  assert.ok(first.ringCenter, 'ringCenter present after calibration');
  assert.ok(Math.abs(first.ringCenter.x - CENTER.x) < 0.02, `center=${JSON.stringify(first.ringCenter)}`);
  // resting frames inside the dead zone pull the live center toward the palm
  d.collect(90, atPalm(CENTER.x + 0.02, CENTER.y));
  const after = d.frame({ ...atPalm(CENTER.x + 0.02, CENTER.y) }).snapshot;
  assert.ok(after.ringCenter.x > first.ringCenter.x, 'recenter must move the live center');
});
