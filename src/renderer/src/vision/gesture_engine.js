// Hand gesture engine — state machines ported from the VMosue project.
// Key principles carried over:
//  - never trigger from a single frame: time-based confirmation + hysteresis + cooldown
//  - press-hold semantics (keydown on engage, keyup on release) so games can
//    naturally support charge/drag actions
//  - confirmations are measured in MILLISECONDS, not frames: webcam frame
//    rate drops in dim light (auto-exposure), frame-count confirmations would
//    silently double their latency and make behavior feel erratic
//  - all thresholds configurable + calibratable

import { OneEuroVec2 } from './one_euro.js';

// MediaPipe hand landmark indices
export const HAND_LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9, // palm center reference
  RING_MCP: 13,
  PINKY_MCP: 17,
};

export function dist2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Geometric features from one hand's landmarks (normalized image coords).
 * pinch is normalized by hand scale (wrist→middle-MCP) so it is
 * distance-to-camera invariant — the most reliable single-camera click
 * signal (VMosue conclusion: pinch > air-click for reliability).
 */
export function handGeometry(lm) {
  const scale = dist2d(lm[HAND_LM.WRIST], lm[HAND_LM.MIDDLE_MCP]) || 1e-6;
  const palm = {
    x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
    y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
  };
  const pinch = dist2d(lm[HAND_LM.THUMB_TIP], lm[HAND_LM.INDEX_TIP]) / scale;
  return { palm, pinch, scale };
}

// 8-direction compass (Snake-style full-plane movement).
// Sector 0 is centered on 0° (= screen right); each sector is 45° wide.
// Diagonals hold TWO arrow keys at once (↗ = ArrowUp + ArrowRight).
export const SECTORS = [
  { name: 'right', keys: ['ArrowRight'] },
  { name: 'up-right', keys: ['ArrowUp', 'ArrowRight'] },
  { name: 'up', keys: ['ArrowUp'] },
  { name: 'up-left', keys: ['ArrowUp', 'ArrowLeft'] },
  { name: 'left', keys: ['ArrowLeft'] },
  { name: 'down-left', keys: ['ArrowDown', 'ArrowLeft'] },
  { name: 'down', keys: ['ArrowDown'] },
  { name: 'down-right', keys: ['ArrowDown', 'ArrowRight'] },
];

export function wrap180(deg) {
  return (((deg + 180) % 360) + 360) % 360 - 180;
}

/** Map an angle (0°=screen right, CCW positive) to a sector index. */
export function sectorOfAngle(deg, dirs = 8) {
  if (dirs === 4) {
    const idx = ((Math.round(deg / 90) % 4) + 4) % 4; // right, up, left, down
    return [0, 2, 4, 6][idx];
  }
  return Math.floor(((((deg + 22.5) % 360) + 360) % 360) / 45);
}

/**
 * Direction ring: palm displacement from calibrated center → 8-direction
 * virtual D-pad (360° plane). Layers of anti-flicker, each measured in
 * MILLISECONDS or DEGREES (never frames — webcams drop fps in dim light):
 *   1. radial hysteresis  — dead zone vs active zone ring
 *   2. angular hysteresis — sector switches need sectorMarginDeg inside the new sector
 *   3. time confirmation  — candidate must persist confirmMs
 * Emits per-key {key, down} events with hold semantics; sector transitions
 * diff the key sets so shared keys (↗→→) never double-fire.
 */
export class DirectionRing {
  constructor(cfg = {}) {
    this.cfg = {
      deadZone: 0.09,        // no direction inside this radius (norm. units)
      activeZone: 0.17,      // enter a direction beyond this (> deadZone = hysteresis band)
      confirmMs: 90,         // candidate must persist this long before switching
      sectorMarginDeg: 10,   // angular penetration required to switch sectors
      dirs: 8,               // 8 = full plane; 4 = cardinals only (diagonals snap)
      gainX: 1.4,            // horizontal sensitivity multiplier
      gainY: 1.6,            // vertical usually needs more gain (camera FOV crops vertically)
      recenterPerSec: 0.25,  // drift self-healing: while resting inside the dead
                             // zone the center creeps toward the palm at this
                             // rate (per second) so posture drift never
                             // permanently skews direction classification
      ...cfg,
    };
    this.center = null;          // calibrated rest palm position
    this.active = null;          // currently held sector index or null
    this.candidate = null;
    this.candidateSince = 0;
    this.lastT = null;
    this.smooth = new OneEuroVec2({ minCutoff: 2.5, beta: 0.5 });
  }

  setCenter(p) {
    this.center = { x: p.x, y: p.y };
    this.smooth.reset();
    this.active = this.candidate = null;
    this.lastT = null;
  }

  /** key-set diff between two sectors: release removed, press added. */
  _sectorTransition(prevIdx, nextIdx) {
    const events = [];
    const prevKeys = prevIdx == null ? [] : SECTORS[prevIdx].keys;
    const nextKeys = nextIdx == null ? [] : SECTORS[nextIdx].keys;
    for (const k of prevKeys) {
      if (!nextKeys.includes(k)) events.push({ kind: 'direction', key: k, down: false, dir: SECTORS[prevIdx].name });
    }
    for (const k of nextKeys) {
      if (!prevKeys.includes(k)) events.push({ kind: 'direction', key: k, down: true, dir: SECTORS[nextIdx].name });
    }
    return events;
  }

  /** @returns {Array<{key, down, kind:'direction', dir}>} */
  update(palm, tSec) {
    const events = [];
    if (!this.center) return events;

    const p = this.smooth.filter(palm.x, palm.y, tSec);
    const dx = (p.x - this.center.x) * this.cfg.gainX;
    const dy = -(p.y - this.center.y) * this.cfg.gainY; // invert: up in camera = up on screen
    const r = Math.hypot(dx, dy);
    const deg = Math.atan2(dy, dx) * (180 / Math.PI);

    // drift self-healing: a RESTING hand (inside the dead zone) slowly pulls
    // the center toward itself so minutes of posture drift never accumulate
    // and skew classification. Deliberate holds live outside the dead zone
    // and are never affected.
    const dt = this.lastT == null ? 0 : Math.min(0.5, tSec - this.lastT);
    this.lastT = tSec;
    if (r <= this.cfg.deadZone && this.cfg.recenterPerSec > 0 && dt > 0) {
      const k = 1 - Math.exp(-this.cfg.recenterPerSec * dt);
      this.center.x += (p.x - this.center.x) * k;
      this.center.y += (p.y - this.center.y) * k;
    }

    let want = null;
    if (r >= this.cfg.activeZone) {
      want = sectorOfAngle(deg, this.cfg.dirs);
      // angular hysteresis: near a sector boundary, keep the current sector
      const ref = this.active ?? this.candidate;
      if (ref != null && ref !== want) {
        const penetration = 22.5 - Math.abs(wrap180(deg - want * 45));
        if (penetration < this.cfg.sectorMarginDeg) want = ref;
      }
    } else if (r <= this.cfg.deadZone && this.active != null) {
      want = null;
    } else if (this.active != null) {
      want = this.active; // in the radial hysteresis band: keep current
    }

    // time-based confirmation before any change (fps-independent anti-flicker)
    if (want === this.active) {
      this.candidate = null;
    } else if (want === this.candidate) {
      if ((tSec - this.candidateSince) * 1000 >= this.cfg.confirmMs) {
        events.push(...this._sectorTransition(this.active, want));
        this.active = want;
        this.candidate = null;
      }
    } else {
      this.candidate = want;
      this.candidateSince = tSec;
    }
    return events;
  }

  /** Force-release on tracking loss (VMosue rule: never leave keys stuck). */
  releaseAll() {
    const events = this._sectorTransition(this.active, null);
    this.active = this.candidate = null;
    this.smooth.reset();
    return events;
  }
}

/**
 * Pinch switch: thumb-index pinch as a press-hold button.
 * IDLE →(pinch < on, held ≥ confirmMs)→ PRESSED →(pinch > off)→ cooldown → IDLE
 */
export class PinchSwitch {
  constructor(cfg = {}) {
    this.cfg = {
      on: 0.55,          // engage when normalized pinch distance < on
      off: 0.85,         // release when > off (hysteresis gap = anti-jitter)
      confirmMs: 60,     // ≈2 frames @30fps, 4 frames @60fps
      cooldownMs: 150,
      key: 'Space',
      ...cfg,
    };
    this.state = 'IDLE';
    this.candidateSince = null;
    this.lastChangeMs = 0;
  }

  /** @returns {Array<{key, down, kind:'pinch'}>} */
  update(pinch, nowMs) {
    const events = [];
    const c = this.cfg;
    switch (this.state) {
      case 'IDLE':
        if (pinch < c.on) {
          if (this.candidateSince == null) this.candidateSince = nowMs;
          if (nowMs - this.candidateSince >= c.confirmMs && nowMs - this.lastChangeMs >= c.cooldownMs) {
            this.state = 'PRESSED';
            this.lastChangeMs = nowMs;
            this.candidateSince = null;
            events.push({ kind: 'pinch', key: c.key, down: true });
          }
        } else {
          this.candidateSince = null;
        }
        break;
      case 'PRESSED':
        if (pinch > c.off) {
          this.state = 'IDLE';
          this.lastChangeMs = nowMs;
          this.candidateSince = null;
          events.push({ kind: 'pinch', key: c.key, down: false });
        }
        break;
    }
    return events;
  }

  releaseAll() {
    const events = [];
    if (this.state === 'PRESSED') events.push({ kind: 'pinch', key: this.cfg.key, down: false });
    this.state = 'IDLE';
    this.candidateSince = null;
    return events;
  }
}

/** 3-frame sliding median — kills single-frame spikes before they reach a switch. */
export class Median3 {
  constructor() { this.buf = []; }
  push(v) {
    this.buf.push(v);
    if (this.buf.length > 3) this.buf.shift();
    const s = [...this.buf].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  reset() { this.buf = []; }
}

/** Full hand pipeline for one frame.
 *  Accuracy stack (outermost → innermost):
 *    1. score floor (session)        — phantom detections never enter
 *    2. low-quality frame gating      — borderline frames freeze all state
 *       machines instead of feeding them noise (below)
 *    3. median-of-3 on pinch         — single-frame spikes removed (below)
 *    4. hysteresis + confirmMs + cooldown (switches)
 *    5. tracking-loss release          (onLost)
 *    6. dead-zone recentering          (DirectionRing drift self-healing) */
export class HandEngine {
  constructor(cfg = {}) {
    this.cfg = {
      lowQualityFrames: 8,   // consecutive borderline frames treated as loss (~260ms @30fps)
      ...cfg,
    };
    this.direction = new DirectionRing(cfg.direction);
    this.pinch = new PinchSwitch(cfg.pinch);
    this.pinchMedian = new Median3();
    this.lostFrames = 0;
    this._lastGoodPalm = null;
  }

  setCenter(palm) {
    this.direction.setCenter(palm);
  }

  /**
   * @param {Array} landmarks 21 points
   * @param {number} quality 0..1 detector confidence for THIS frame
   * @returns {Array} events
   */
  update(landmarks, tSec, nowMs, quality = 1) {
    // borderline-confidence frame: freeze every state machine (candidates keep
    // their timers; nothing new triggers, nothing false-releases). MediaPipe
    // detection quality dips transiently during fast motion and pinch closes —
    // acting on those frames was a measurable misfire source on real cameras.
    if (quality < 0.7) {
      this.lostFrames++;
      if (this.lostFrames === this.cfg.lowQualityFrames) {
        return [...this.direction.releaseAll(), ...this.pinch.releaseAll()];
      }
      return [];
    }
    this.lostFrames = 0;
    const g = handGeometry(landmarks);
    const pinch = this.pinchMedian.push(g.pinch);
    return [...this.direction.update(g.palm, tSec), ...this.pinch.update(pinch, nowMs)];
  }

  onLost() {
    this.lostFrames++;
    if (this.lostFrames === 1) {
      this.pinchMedian.reset();
      // release held keys on the first lost frame; require re-detection to re-engage
      return [...this.direction.releaseAll(), ...this.pinch.releaseAll()];
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Dual-hand support: off-hand engine (secondary actions) + two-hand gap gesture.
// VMosue heritage: 右手主控、左手辅助;双手张开保持 = 暂停。

/** Count extended fingers (index/middle/ring/pinky): tip farther from wrist than PIP joint. */
export function handOpenness(lm) {
  const wrist = lm[0];
  const extended = [[8, 6], [12, 10], [16, 14], [20, 18]];
  let count = 0;
  for (const [tip, pip] of extended) {
    if (dist2d(lm[tip], wrist) > dist2d(lm[pip], wrist)) count++;
  }
  return count; // 0..4
}

/** Open-palm hold: palm kept open ≥ holdMs fires one pause request, edge-triggered. */
export class OpenPalmHold {
  constructor(cfg = {}) {
    this.cfg = { holdMs: 800, minOpen: 4, minRelease: 2, ...cfg };
    this.fired = false;
    this.since = null;
  }

  /** @returns {Array<{kind:'offhand', name:'pause', down:true}>} */
  update(openCount, nowMs) {
    const c = this.cfg;
    if (openCount >= c.minOpen) {
      if (this.since == null) this.since = nowMs;
      if (!this.fired && nowMs - this.since >= c.holdMs) {
        this.fired = true;
        return [{ kind: 'offhand', name: 'pause', down: true }];
      }
    } else {
      this.since = null;
      if (openCount <= c.minRelease) this.fired = false; // must relax to re-arm
    }
    return [];
  }
}

/** Off-hand pipeline: secondary pinch key + open-palm pause hold. */
export class OffHandEngine {
  constructor(cfg = {}) {
    this.cfg = {
      pinchKey: 'KeyF',
      pinch: { on: 0.55, off: 0.85, confirmMs: 60, cooldownMs: 200 },
      openPalm: { holdMs: 800 },
      lostReleaseFrames: 5,
      lowQualityFrames: 8,
      ...cfg,
    };
    this.pinch = new PinchSwitch({ ...this.cfg.pinch, key: this.cfg.pinchKey });
    this.palm = new OpenPalmHold(this.cfg.openPalm);
    this.pinchMedian = new Median3();
    this.lostFrames = 0;
  }

  update(landmarks, tSec, nowMs, quality = 1) {
    if (quality < 0.7) {
      this.lostFrames++;
      if (this.lostFrames === this.cfg.lowQualityFrames) return this.releaseAll();
      return [];
    }
    this.lostFrames = 0;
    const g = handGeometry(landmarks);
    const open = handOpenness(landmarks);
    const pinch = this.pinchMedian.push(g.pinch);
    return [
      ...this.pinch.update(pinch, nowMs).map((e) => ({ ...e, kind: 'offhand', name: 'pinch' })),
      ...this.palm.update(open, nowMs),
    ];
  }

  onLost() {
    this.lostFrames++;
    if (this.lostFrames === 1) return this.releaseAll();
    return [];
  }

  releaseAll() {
    return [...this.pinch.releaseAll().map((e) => ({ ...e, kind: 'offhand', name: 'pinch' }))];
  }
}

/** Two-hand gap: hands spreading apart / closing together, normalized by hand scale. */
export class GapEngine {
  constructor(cfg = {}) {
    this.cfg = {
      open: 1.6,        // fire 'apart' when gap > open (in hand-scale units)
      close: 1.05,      // back under close → 'together' (hysteresis)
      confirmMs: 100,
      ...cfg,
    };
    this.state = false; // true = apart
    this.candidate = null;
    this.candidateSince = 0;
  }

  update(gapNorm, tSec) {
    const c = this.cfg;
    let want = this.state;
    if (!this.state && gapNorm > c.open) want = true;
    else if (this.state && gapNorm < c.close) want = false;
    // inside the hysteresis band: keep current state

    if (want === this.state) {
      this.candidate = null;
      return [];
    }
    if (want === this.candidate) {
      if ((tSec - this.candidateSince) * 1000 >= c.confirmMs) {
        this.state = want;
        this.candidate = null;
        return [{ kind: 'hands', name: want ? 'apart' : 'together', down: want, value: gapNorm }];
      }
      return [];
    }
    this.candidate = want;
    this.candidateSince = tSec;
    return [];
  }

  releaseAll() {
    const events = this.state ? [{ kind: 'hands', name: 'together', down: false }] : [];
    this.state = false;
    this.candidate = null;
    return events;
  }
}
