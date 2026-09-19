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
      gainY: 1.8,            // vertical usually needs more gain (camera FOV crops vertically)
      ...cfg,
    };
    this.center = null;          // calibrated rest palm position
    this.active = null;          // currently held sector index or null
    this.candidate = null;
    this.candidateSince = 0;
    this.smooth = new OneEuroVec2({ minCutoff: 2.5, beta: 0.5 });
  }

  setCenter(p) {
    this.center = { x: p.x, y: p.y };
    this.smooth.reset();
    this.active = this.candidate = null;
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

/** Full hand pipeline for one frame. */
export class HandEngine {
  constructor(cfg = {}) {
    this.direction = new DirectionRing(cfg.direction);
    this.pinch = new PinchSwitch(cfg.pinch);
    this.lostFrames = 0;
  }

  setCenter(palm) {
    this.direction.setCenter(palm);
  }

  /** @param {Array} landmarks 21 points @returns {Array} events */
  update(landmarks, tSec, nowMs) {
    const g = handGeometry(landmarks);
    this.lostFrames = 0;
    return [...this.direction.update(g.palm, tSec), ...this.pinch.update(g.pinch, nowMs)];
  }

  onLost() {
    this.lostFrames++;
    if (this.lostFrames === 1) {
      // release held keys on the first lost frame; require re-detection to re-engage
      return [...this.direction.releaseAll(), ...this.pinch.releaseAll()];
    }
    return [];
  }
}
