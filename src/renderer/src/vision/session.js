// SessionController — ALL session logic, zero browser dependencies, so the
// full pipeline (state machine, calibration wizard, score filtering, adaptive
// throttle) is unit/integration/Monte-Carlo testable in Node.
// VisionInput (browser glue) feeds it per-frame observations and dispatches
// its events; nothing visual lives here.
//
// Deterministic session lifecycle (the "fixed flow"):
//   searching ──hand+face seen──▶ calibrating ──3 quality-gated steps──▶ active
//      ▲                            │ (retry step on bad data)            │
//      └── lost ≥ handLostRecalFrames ◀── lost ≥ release frames ──────────┘

import { HandEngine, OffHandEngine, GapEngine, handGeometry } from './gesture_engine.js';
import { FaceEngine, blendshapeMap } from './face_engine.js';

export const DEFAULT_SESSION_CFG = {
  minHandScore: 0.5,
  calSteps: { center: 1500, reach: 2600, pinch: 3600 },
  handLostReleaseFrames: 5,
  handLostRecalFrames: 45,
  faceLostReleaseFrames: 10,
  faceEveryN: 1,
  // RGBBox (R132): the games integration runs the faceless pipeline
  // (faceModel:null — expressions are reserved, not consumed). false skips
  // the two face gates: calibration entry (searching needs hand+face) and
  // the center-step faceN check. Default true keeps upstream behavior.
  requireFace: true,
  // dual-hand: primary hand drives direction+pinch, off hand drives secondary
  // actions. handedness labels come from MediaPipe ('Left'/'Right', selfie
  // convention); if a device reports them swapped, set swapHands: true.
  dualHand: {
    enabled: false,
    primaryHand: 'Right',   // 'Right' | 'Left'
    swapHands: false,       // some cameras report mirrored handedness
    offPinchKey: 'KeyF',    // off-hand pinch → this key
    gapOpen: 1.6,           // two-hand spread gesture (hand-scale units)
    gapClose: 1.05,
    offLostReleaseFrames: 5,
  },
  // quality gates (industrial rule: reject bad calibration, never ship it —
  // but extend the window BEFORE retrying; see _gate)
  maxCenterJitter: 0.038,    // normalized std of palm at rest (real-hand allowance)
  minReach: 0.12,            // p90 radius required from center step
  minSectorsCovered: 4,      // of 8, during reach step (cardinals suffice)
  minPinchSeparation: 0.25,  // p90(open) - p10(closed)
  storage: null,             // optional {getItem,setItem} (localStorage in browser)
};

export const CAL_STEPS = [
  { id: 'center', ms: 1500, hint: '手自然张开,停在画面中央,保持不动' },
  { id: 'reach', ms: 2600, hint: '以中心为原点,轮流向 8 个方向缓慢伸展' },
  { id: 'pinch', ms: 3600, hint: '拇指食指反复「捏合-松开」约 5 次' },
];

export const STATE_LABELS = {
  idle: '未启动',
  searching: '未检测到手 — 抬手进入画面',
  active: '已激活',
  paused: '已暂停',
};

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return NaN;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))];
}

function std(samples) {
  if (samples.length < 2) return 0;
  const m = samples.reduce((s, v) => s + v, 0) / samples.length;
  return Math.sqrt(samples.reduce((s, v) => s + (v - m) ** 2, 0) / samples.length);
}

export class SessionController {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULT_SESSION_CFG, ...cfg };
    this.cfg.dualHand = { ...DEFAULT_SESSION_CFG.dualHand, ...(cfg.dualHand || {}) };
    this.handEngine = new HandEngine({ pinch: this.cfg.pinch, direction: this.cfg.direction });
    this.offEngine = new OffHandEngine({
      pinchKey: this.cfg.dualHand.offPinchKey,
      pinch: this.cfg.pinch,
    });
    this.gap = new GapEngine({ open: this.cfg.dualHand.gapOpen, close: this.cfg.dualHand.gapClose });
    this.faceEngine = new FaceEngine({ bindings: this.cfg.faceBindings });
    this.state = 'idle';
    this.paused = false;
    this.score = 0;
    this.handLost = 0;
    this.faceLost = 0;
    this.offLost = 0;
    this._gapNorm = null;
    this.faceEveryN = this.cfg.faceEveryN;
    this.frameCount = 0;
    this.profile = null;
    this.cal = null;       // active calibration accumulator
    this.calStepIdx = 0;
    this.calStartMs = 0;
    this._geom = null;
    this._faceBlend = null;
    this.status = '';
  }

  label() {
    if (this.state === 'calibrating') {
      const step = CAL_STEPS[this.calStepIdx];
      return `校准 ${this.calStepIdx + 1}/3:${step.hint}`;
    }
    return STATE_LABELS[this.state];
  }

  // ---- lifecycle ---------------------------------------------------------

  start(nowMs) {
    this.loadProfile(); // restore last calibration before the flow begins
    this._enterSearching();
  }

  stop() {
    return this._releaseAll('idle', 'stopped');
  }

  setPaused(p) {
    this.paused = p;
    if (p) {
      const events = this._releaseAll('paused', STATE_LABELS.paused);
      return events;
    }
    if (this.state === 'paused') this._enterSearching();
    return [];
  }

  recalibrate() {
    if (this.state === 'active' || this.state === 'calibrating') this._enterSearching();
  }

  /** Test/demo hook: skip the wizard and inject a known-good profile. */
  forceReady(profile = {}) {
    this._applyProfile({
      center: { x: 0.5072, y: 0.545 },
      reach: 0.24, jitter: 0.006,
      pinchOn: 0.55, pinchOff: 0.85,
      neutral: {},
      ...profile,
    });
    this.state = 'active';
    this.status = STATE_LABELS.active;
  }

  _releaseAll(state, status) {
    const events = [
      ...this.handEngine.onLost(),
      ...this.offEngine.releaseAll(),
      ...this.gap.releaseAll(),
      ...this.faceEngine.releaseAll(),
    ];
    this.state = state;
    this.handLost = this.faceLost = this.offLost = 0;
    this.cal = null;
    this.status = status;
    return events;
  }

  _enterSearching() {
    return this._releaseAll('searching', STATE_LABELS.searching);
  }

  // ---- calibration wizard ------------------------------------------------

  _startCalibration(nowMs) {
    this.state = 'calibrating';
    this.calStepIdx = 0;
    this.calStartMs = nowMs;
    this.cal = this._newStepAcc('center');
    this.status = this.label();
  }

  _newStepAcc(id) {
    const acc = {
      id,
      stepMs: this.cfg.calSteps[id], // doubled once by the extend mechanism
      extended: false,
      frames: 0,        // all frames of this step (hand seen or not)
      palm: { x: 0, y: 0 }, palmN: 0, xs: [], ys: [], radii: [], sectors: new Set(),
      pinchSamples: [], pinchCycles: 0, pinchWasClosed: false,
      faceN: 0, faceSums: {},
    };
    if (id !== 'center') acc.palm = { ...this.profile.center }; // measure relative to center
    return acc;
  }

  _stepMs() { return this.cal?.stepMs ?? this.cfg.calSteps[CAL_STEPS[this.calStepIdx].id]; }

  /**
   * Quality gate with a GRACEFUL path: when the window expires without
   * sufficient data, extend the window once (KEEPING all samples) and tell
   * the user exactly what is missing; only a second failure retries the step.
   * Real-camera feedback: hard-restarting on insufficient data mid-gesture
   * trapped users in an endless "捏合次数太少" retry loop.
   */
  _gate(ok, shortReason, retryReason, acc) {
    if (ok) return null;
    if (!acc.extended) {
      acc.extended = true;
      acc.stepMs *= 2;
      this.status = `继续采样 — ${shortReason}`;
      return [{ kind: 'face', key: null, down: false, name: 'cal-extend', value: shortReason }];
    }
    return this._retryStep(retryReason);
  }

  _finishStep(nowMs) {
    const acc = this.cal;
    const stepId = acc.id;
    if (stepId === 'center') {
      const handSeen = acc.frames ? acc.palmN / acc.frames : 0;
      if (handSeen < 0.5) {
        return this._gate(false,
          `手可见率仅 ${Math.round(handSeen * 100)}%,请正对摄像头、手保持在画面中央`,
          '手部检测不稳定,请改善光线/角度后重试', acc);
      }
      if (acc.palmN < 15) {
        return this._gate(false, '还没看到稳定的手,请把手张开停在画面中央', '中心采样不足,重试', acc);
      }
      const jitter = Math.max(std(acc.xs), std(acc.ys));
      if (jitter > this.cfg.maxCenterJitter) {
        return this._gate(false,
          `手抖动较大(σ=${jitter.toFixed(3)}),请支撑手肘后放松`,
          `手抖动过大(σ=${jitter.toFixed(3)}),请支撑手肘重试`, acc);
      }
      if (this.cfg.requireFace !== false && acc.faceN < 8) {
        return this._gate(false, '未检测到面部,请正对摄像头', '未检测到面部,请正对摄像头重试', acc);
      }
      const neutral = {};
      for (const [k, v] of Object.entries(acc.faceSums)) neutral[k] = v / acc.faceN;
      this.profile = {
        center: { x: acc.palm.x / acc.palmN, y: acc.palm.y / acc.palmN },
        jitter, neutral,
        reach: 0, sectors: 0, pinchOn: this.handEngine.pinch.cfg.on, pinchOff: this.handEngine.pinch.cfg.off,
      };
      this._applyProfile(this.profile);
    } else if (stepId === 'reach') {
      const sorted = [...acc.radii].sort((a, b) => a - b);
      const reach = percentile(sorted, 0.9);
      if (!(reach >= this.cfg.minReach)) {
        return this._gate(false,
          `伸展幅度还差一点(p90=${reach.toFixed(2)}/${this.cfg.minReach}),继续向 8 个方向伸展`,
          '伸展幅度太小,请移到手肘支撑允许的最大范围重试', acc);
      }
      if (acc.sectors.size < this.cfg.minSectorsCovered) {
        return this._gate(false,
          `已覆盖 ${acc.sectors.size}/${this.cfg.minSectorsCovered} 个方向,继续轮流伸展`,
          `只覆盖了 ${acc.sectors.size}/8 个方向,请轮流伸展 8 个方向重试`, acc);
      }
      this.profile.reach = reach;
      this.profile.sectors = acc.sectors.size;
      // auto-sensitivity from the user's measured comfortable range
      const az = Math.min(0.28, Math.max(0.12, reach * 0.62));
      this._applyProfile({ activeZone: az, deadZone: az * 0.55 });
    } else if (stepId === 'pinch') {
      const sorted = [...acc.pinchSamples].sort((a, b) => a - b);
      // PRIMARY gate = distribution separability, NOT raw frame coverage.
      // 24 samples (~0.8s @30fps) across 2+ pinch cycles give stable p10/p90;
      // demanding 50% coverage of the whole window was unachievable on real
      // cameras (detection quality dips while the fingers are together).
      if (sorted.length < 24) {
        return this._gate(false,
          `已采样 ${sorted.length}/24 帧,请继续有节奏地捏合-张开(手保持在画面内)`,
          '捏合采样不足,请保持手在画面内重复捏合重试', acc);
      }
      const p10 = percentile(sorted, 0.10);
      const p90 = percentile(sorted, 0.90);
      const sep = p90 - p10;
      if (sep < this.cfg.minPinchSeparation) {
        return this._gate(false,
          `开/合区分度 ${sep.toFixed(2)}(需 ≥${this.cfg.minPinchSeparation}),捏紧一点、张开一点`,
          '捏合幅度区分度不够,请加大捏合深度重试', acc);
      }
      const on = Math.min(0.6, Math.max(0.3, p10 + sep * 0.18));
      const off = Math.min(1.2, Math.max(on + 0.15, p90 - sep * 0.10));
      this.profile.pinchOn = on;
      this.profile.pinchOff = off;
      this.profile.pinchSeparation = sep;
      this.profile.pinchCycles = acc.pinchCycles;
      this._applyProfile({ pinchOn: on, pinchOff: off });
    }
    // next step or finish
    if (this.calStepIdx < CAL_STEPS.length - 1) {
      this.calStepIdx++;
      this.cal = this._newStepAcc(CAL_STEPS[this.calStepIdx].id);
      this.calStartMs = nowMs;
      this.status = this.label();
      return [{ kind: 'face', key: null, down: false, name: `cal-step:${this.calStepIdx}` }];
    }
    this.state = 'active';
    this.cal = null;
    this.status = STATE_LABELS.active;
    this._saveProfile();
    return [{ kind: 'face', key: null, down: false, name: 'calibrated' }];
  }

  _retryStep(reason) {
    // industrial rule: bad data is rejected, the SAME step restarts
    this.cal = this._newStepAcc(CAL_STEPS[this.calStepIdx].id);
    this.calStartMs = this._nowMs;
    this.status = `重试 — ${reason}`;
    return [{ kind: 'face', key: null, down: false, name: 'cal-retry', value: reason }];
  }

  /** Apply (possibly partial) profile to live engines + persist. */
  _applyProfile(p) {
    this.profile = { ...(this.profile || {}), ...p };
    const d = this.handEngine.direction;
    if (p.center) d.setCenter(p.center);
    if (p.activeZone != null) d.cfg.activeZone = p.activeZone;
    if (p.deadZone != null) d.cfg.deadZone = Math.min(p.deadZone, d.cfg.activeZone * 0.8);
    if (p.gainX != null) d.cfg.gainX = p.gainX;
    if (p.gainY != null) d.cfg.gainY = p.gainY;
    if (p.dirs != null) d.cfg.dirs = p.dirs;
    if (p.confirmMs != null) d.cfg.confirmMs = p.confirmMs;
    const ps = this.handEngine.pinch;
    if (p.pinchOn != null) ps.cfg.on = p.pinchOn;
    if (p.pinchOff != null) ps.cfg.off = Math.max(p.pinchOn ?? ps.cfg.on ?? 0, p.pinchOff);
    if (p.neutral) this.faceEngine.setNeutral(p.neutral);
    if (p.faceOffset != null) this.faceEngine.cfg.neutralOffset = p.faceOffset;
  }

  /** Public: settings-panel hook (live tuning). */
  applySettings(patch) {
    this._applyProfile(patch);
    this._saveProfile();
  }

  _saveProfile() {
    try {
      this.cfg.storage?.setItem('vgi-profile-v2', JSON.stringify(this.profile));
    } catch { /* private mode etc. — non-fatal */ }
  }

  loadProfile() {
    try {
      const raw = this.cfg.storage?.getItem('vgi-profile-v2');
      if (raw) this._applyProfile(JSON.parse(raw));
    } catch { /* corrupt profile → defaults */ }
  }

  // ---- per-frame ---------------------------------------------------------

  /**
   * @param {object} obs { nowMs, hands:[{landmarks(selfie-space), score}],
   *                       face: blendshapeMap|null }
   * @returns {{events:Array, snapshot:object}}
   */
  onFrame(obs) {
    const { nowMs } = obs;
    this._nowMs = nowMs;
    this.frameCount++;
    const events = [];
    const tSec = nowMs / 1000;

    if (this.paused || this.state === 'idle' || this.state === 'paused') {
      // paused: keep watching the off hand for the open-palm resume gesture
      const events = [];
      if (this.state === 'paused') {
        const { secondary } = this._pickHands(obs.hands);
        if (secondary) {
          events.push(...this.offEngine.palm.update(handOpenness(secondary.landmarks), nowMs));
        } else {
          this.offEngine.palm.since = null;
        }
      }
      return { events, snapshot: this._snapshot(null, 0) };
    }

    const { primary, secondary } = this._pickHands(obs.hands);
    this._picked = { primary, secondary };
    const faceMap = obs.face ?? null;

    if (this.state === 'searching') {
      // RGBBox (R132): requireFace:false enters calibration on hand alone
      if (primary && (faceMap != null || this.cfg.requireFace === false)) {
        this._startCalibration(nowMs);
      } else {
        this._geom = null;
      }
      if (faceMap) this._faceBlend = faceMap;
    } else if (this.state === 'calibrating') {
      events.push(...this._calibrateFrame(primary, faceMap, nowMs, tSec));
    } else if (this.state === 'active') {
      events.push(...this._activeFrame(primary, secondary, faceMap, nowMs, tSec));
    }
    // (_activeFrame may re-enter searching on long hand loss; its release
    // events are already included in the returned array.)

    for (const ev of events) if (ev.name === 'cal-retry') this.status = `重试 — ${ev.value}`;
    return { events, snapshot: this._snapshot(primary, obs.inferMs ?? 0) };
  }

  /**
   * Assign detections to primary/off hands.
   * - dualHand disabled → best hand is primary (old behaviour)
   * - dualHand enabled  → primary = best hand on cfg.dualHand.primaryHand side;
   *   off = best hand on the other side. A single visible hand is treated
   *   according to its side (off hand alone still drives off-hand actions).
   * @returns {{primary:object|null, secondary:object|null}}
   */
  _pickHands(hands) {
    const valid = (hands || []).filter((h) => h && h.landmarks && h.score >= this.cfg.minHandScore);
    if (!valid.length) return { primary: null, secondary: null };
    const prev = this._geom?.palm;
    const rank = (h) => {
      const g = handGeometry(h.landmarks);
      const jump = prev ? Math.hypot(g.palm.x - prev.x, g.palm.y - prev.y) : 0;
      return h.score - jump * 0.5; // continuity: prefer the tracked hand
    };
    const dual = this.cfg.dualHand.enabled;
    if (!dual) {
      const best = [...valid].sort((a, b) => rank(b) - rank(a))[0];
      return { primary: best, secondary: null };
    }
    const want = this.cfg.dualHand.primaryHand;
    const sideOf = (h) => {
      let side = h.handedness || 'unknown';
      if (this.cfg.dualHand.swapHands) side = side === 'Left' ? 'Right' : side === 'Right' ? 'Left' : side;
      return side;
    };
    const primary = valid.filter((h) => sideOf(h) === want).sort((a, b) => rank(b) - rank(a))[0] ?? null;
    const secondary = valid.filter((h) => sideOf(h) !== want).sort((a, b) => rank(b) - rank(a))[0] ?? null;
    return { primary, secondary };
  }

  /** Normalized two-hand gap (in hand-scale units, depth invariant). */
  _handGap(a, b) {
    const ga = handGeometry(a);
    const gb = handGeometry(b);
    const scale = (ga.scale + gb.scale) / 2 || 1e-6;
    return Math.hypot(ga.palm.x - gb.palm.x, ga.palm.y - gb.palm.y) / scale;
  }

  _calibrateFrame(picked, faceMap, nowMs, tSec) {
    const acc = this.cal;
    acc.frames++;
    if (picked) {
      const g = handGeometry(picked.landmarks);
      acc.palm.x += g.palm.x; acc.palm.y += g.palm.y; acc.palmN++;
      if (acc.id === 'center') { acc.xs.push(g.palm.x); acc.ys.push(g.palm.y); }
      if (acc.id === 'reach' && this.profile?.center) {
        const dx = (g.palm.x - this.profile.center.x) * (this.cfg.direction?.gainX ?? 1.4);
        const dy = -(g.palm.y - this.profile.center.y) * (this.cfg.direction?.gainY ?? 1.6);
        const r = Math.hypot(dx, dy);
        acc.radii.push(r);
        if (r > this.handEngine.direction.cfg.deadZone * 1.4) {
          acc.sectors.add(sectorOfDeg(Math.atan2(dy, dx) * 180 / Math.PI));
        }
      }
      if (acc.id === 'pinch') {
        acc.pinchSamples.push(g.pinch);
        // live pinch-cycle counter (midpoint crossing): user feedback + quality
        const closed = g.pinch < (this.handEngine.pinch.cfg.on + this.handEngine.pinch.cfg.off) / 2;
        if (closed && !acc.pinchWasClosed) acc.pinchCycles++;
        acc.pinchWasClosed = closed;
      }
      this._geom = g;
      this.score = picked.score;
    }
    if (faceMap) {
      acc.faceN++;
      for (const [k, v] of Object.entries(faceMap)) acc.faceSums[k] = (acc.faceSums[k] || 0) + v;
      this._faceBlend = faceMap;
    }
    // live progress feedback so the user sees the system counting their moves
    if (!this.status.startsWith('重试') && !this.status.startsWith('继续采样')) {
      if (acc.id === 'pinch' && acc.pinchSamples.length > 4) {
        this.status = `捏合校准:已检测 ${acc.pinchCycles} 次捏合`;
      } else if (acc.id === 'reach' && acc.sectors.size > 0) {
        this.status = `行程校准:已覆盖 ${acc.sectors.size}/8 个方向`;
      }
    }
    if (nowMs - this.calStartMs >= acc.stepMs) {
      return this._finishStep(nowMs);
    }
    return [];
  }

  _activeFrame(primary, secondary, faceMap, nowMs, tSec) {
    const events = [];
    const dual = this.cfg.dualHand.enabled;

    // ---- primary hand: direction + main pinch ----
    if (primary) {
      this.handLost = 0;
      this.score = primary.score;
      const geom = handGeometry(primary.landmarks);
      this._geom = geom;
      events.push(...this.handEngine.update(primary.landmarks, tSec, nowMs, primary.score ?? 1));
    } else {
      this.handLost++;
      if (this.handLost >= this.cfg.handLostReleaseFrames) events.push(...this.handEngine.onLost());
      if (this.handLost >= this.cfg.handLostRecalFrames) {
        events.push(...this._enterSearching()); // release + back to searching
        return events;
      }
      this._geom = null;
    }

    // ---- off hand: secondary pinch + open-palm pause (dual-hand mode only) ----
    if (dual) {
      if (secondary) {
        this.offLost = 0;
        this.score = Math.max(this.score, secondary.score);
        events.push(...this.offEngine.update(secondary.landmarks, tSec, nowMs, secondary.score ?? 1));
      } else {
        this.offLost = (this.offLost ?? 0) + 1;
        if (this.offLost >= this.cfg.dualHand.offLostReleaseFrames) events.push(...this.offEngine.onLost());
      }
      // ---- two-hand gap gesture ----
      if (primary && secondary) {
        const gap = this._handGap(primary.landmarks, secondary.landmarks);
        this._gapNorm = gap;
        events.push(...this.gap.update(gap, tSec));
      } else if (this.gap.state) {
        events.push(...this.gap.releaseAll()); // a hand vanished → force 'together'
        this._gapNorm = null;
      }
    }

    if (faceMap) {
      this.faceLost = 0;
      events.push(...this.faceEngine.update(faceMap, nowMs));
      this._faceBlend = faceMap;
    } else {
      this.faceLost++;
      if (this.faceLost >= this.cfg.faceLostReleaseFrames) events.push(...this.faceEngine.releaseAll());
    }
    return events;
  }

  _snapshot(picked, inferMs) {
    return {
      state: this.state,
      label: this.label(),
      // RGBBox (R135): the DirectionRing's LIVE center — recenter drift-healing
      // only updates the ring's internal center, so profile.center (the
      // calibration snapshot) goes stale; analog consumers must read this.
      // Cloned: recenter mutates the ring's object in place, and snapshots
      // must not alias live engine state.
      ringCenter: this.handEngine.direction.center ? { ...this.handEngine.direction.center } : null,
      stepIdx: this.calStepIdx,
      stepId: this.state === 'calibrating' ? CAL_STEPS[this.calStepIdx].id : null,
      stepProgress: this.state === 'calibrating'
        ? Math.min(1, (this._nowMs - this.calStartMs) / this._stepMs())
        : 0,
      score: this.score,
      pickedLandmarks: picked?.landmarks ?? null,
      allHands: [
        this._picked?.primary ? { landmarks: this._picked.primary.landmarks, role: 'primary', handedness: this._picked.primary.handedness } : null,
        this._picked?.secondary ? { landmarks: this._picked.secondary.landmarks, role: 'off', handedness: this._picked.secondary.handedness } : null,
      ].filter(Boolean),
      gapNorm: this._gapNorm,
      offHeld: this.offEngine.pinch.state === 'PRESSED',
      geom: this._geom,
      faceBlend: this._faceBlend,
      provisionalCenter: this.state === 'calibrating' && this.cal?.palmN > 2
        ? { x: this.cal.palm.x / this.cal.palmN, y: this.cal.palm.y / this.cal.palmN }
        : null,
      profile: this.profile,
      status: this.status,
      faceEveryN: this.faceEveryN,
    };
  }
}

export function sectorOfDeg(deg) {
  return Math.floor(((((deg + 22.5) % 360) + 360) % 360) / 45);
}

/** Adaptive face throttle — budget guard for the <100ms envelope. */
export function adaptFaceRate(faceEveryN, inferP95) {
  if (inferP95 > 55 && faceEveryN < 3) return faceEveryN + 1;
  if (inferP95 > 40 && faceEveryN < 2) return faceEveryN + 1;
  if (inferP95 < 22 && faceEveryN > 1) return faceEveryN - 1;
  return faceEveryN;
}
