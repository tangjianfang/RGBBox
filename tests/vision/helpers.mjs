// Shared test helpers: synthetic landmark builder + a frame driver that feeds
// SessionController without any camera/model (VMosue fixture-testing pattern).

import { SessionController } from '../../src/renderer/src/vision/session.js';
import { handGeometry } from '../../src/renderer/src/vision/gesture_engine.js';

export const CENTER = { x: 0.5072, y: 0.545 }; // palm of makeHand(.5,.5) — engine must never hardcode this

export function makeHand({ cx = 0.5, cy = 0.5, pinchGap = 1.2, scale = 0.18 } = {}) {
  const lm = new Array(21).fill(null).map(() => ({ x: cx, y: cy }));
  lm[0] = { x: cx, y: cy + scale };
  lm[9] = { x: cx, y: cy };
  lm[5] = { x: cx - scale * 0.45, y: cy + scale * 0.1 };
  lm[17] = { x: cx + scale * 0.45, y: cy + scale * 0.1 };
  lm[13] = { x: cx + scale * 0.2, y: cy + scale * 0.05 };
  const gap = pinchGap * scale;
  lm[8] = { x: cx - gap / 2, y: cy - scale * 0.9 };
  lm[4] = { x: cx + gap / 2, y: cy - scale * 0.75 };
  return lm;
}

export const NEUTRAL_FACE = { jawOpen: 0.03, browInnerUp: 0.02, mouthSmileLeft: 0.02, mouthSmileRight: 0.02 };

/** convert a desired palm position to the hand-builder cx/cy (palm has a +.045y offset) */
export function atPalm(px, py) {
  return { cx: +(px - 0.0072).toFixed(4), cy: +(py - 0.045).toFixed(4) };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng, sigma) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

/** Drives a SessionController on a fixed-fps clock. */
export class SessionDriver {
  constructor({ cfg = {}, fps = 30, t0 = 5000 } = {}) {
    // NOTE: no deep-copy here — cfg may carry function-valued deps (storage)
    this.session = new SessionController({ ...cfg });
    this.session.start(t0);
    this.fps = fps;
    this.dt = 1000 / fps;
    this.t = t0;
  }

  /** frame spec: {cx,cy,pinch,score,face,absent} — defaults = resting open hand + neutral face */
  frame(spec = {}) {
    if (spec.absent) {
      return this.session.onFrame({ nowMs: (this.t += this.dt), hands: [], face: null });
    }
    const h = makeHand({ cx: spec.cx ?? 0.5, cy: spec.cy ?? 0.5, pinchGap: spec.pinch ?? 1.2 });
    return this.session.onFrame({
      nowMs: (this.t += this.dt),
      hands: [{ landmarks: h, score: spec.score ?? 0.92 }],
      face: spec.face === undefined ? { ...NEUTRAL_FACE } : spec.face,
    });
  }

  frames(n, spec = {}) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.frame(typeof spec === 'function' ? spec(i) : spec));
    return out;
  }

  collect(n, spec) {
    const events = [];
    for (let i = 0; i < n; i++) {
      const { events: ev } = this.frame(typeof spec === 'function' ? spec(i) : spec);
      events.push(...ev);
    }
    return events;
  }

  /** Run the 3-step wizard with clean, decisive data. Returns profile. */
  calibrate({ reachR = 0.20, cycles = 6 } = {}) {
    this.collect(18, atPalm(CENTER.x, CENTER.y));           // step 1: center
    for (let k = 0; k < 8; k++) {                            // step 2: reach, 8 directions
      const deg = (k * 45 * Math.PI) / 180;
      const px = CENTER.x + Math.cos(deg) * reachR;
      const py = CENTER.y - Math.sin(deg) * reachR;
      this.collect(3, atPalm(px, py));
    }
    for (let i = 0; i < cycles * 2; i++) {                   // step 3: pinch cycles
      this.collect(3, { ...atPalm(CENTER.x, CENTER.y), pinch: i % 2 ? 1.25 : 0.22 });
    }
    return this.session.profile;
  }
}

export function heldKeys(session) {
  const held = [];
  const d = session.handEngine.direction;
  if (d.active != null) held.push(...(SECTORS_SAFE(d.active)));
  if (session.handEngine.pinch.state === 'PRESSED') held.push('Space');
  for (const b of session.faceEngine.bindings) if (b.state) held.push(b.key);
  return held;
}

// lazy import avoidance: SECTORS lives in gesture_engine
import { SECTORS } from '../../src/renderer/src/vision/gesture_engine.js';
function SECTORS_SAFE(idx) {
  return SECTORS[idx]?.keys ?? [];
}

export { handGeometry };
