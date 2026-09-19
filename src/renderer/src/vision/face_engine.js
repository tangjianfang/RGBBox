// Face expression engine — MediaPipe face blendshapes → game keys.
// Same reliability rules as the hand engine: hysteresis + time-based
// confirmation + neutral-face calibration. Blendshape category names follow
// MediaPipe's 52 ARKit-style categories.

const DEFAULT_BINDINGS = [
  // name: binding id; sources: blendshape categories; key: emitted KeyboardEvent.code
  { name: 'jawOpen', sources: ['jawOpen'], key: 'KeyE', on: 0.5, off: 0.32 },
  { name: 'browRaise', sources: ['browInnerUp'], key: 'ShiftLeft', on: 0.55, off: 0.35 },
  {
    name: 'smile',
    sources: ['mouthSmileLeft', 'mouthSmileRight'],
    key: 'Enter',
    on: 0.6,
    off: 0.4,
    combine: 'max', // either side alone is enough
  },
];

export function blendshapeMap(categories) {
  const m = {};
  for (const c of categories) m[c.categoryName] = c.score;
  return m;
}

/**
 * Each binding is a hysteresis switch whose thresholds are offset by the
 * user's neutral face calibration (players rest with slightly parted lips,
 * asymmetric smiles, or talk while playing — absolute thresholds alone WILL
 * misfire; this was the main "erratic behavior" source on real cameras).
 */
export class FaceEngine {
  constructor(cfg = {}) {
    this.cfg = {
      confirmMs: 80,
      cooldownMs: 200,
      neutralOffset: 0.22, // raised by settings "表情灵敏度" slider (0.12–0.3)
      ...cfg,
    };
    // explicit undefined must not clobber the default bindings
    this.bindings = (cfg.bindings ?? DEFAULT_BINDINGS).map((b) => ({
      ...b,
      state: false,
      candidateSince: null,
      lastChangeMs: 0,
      neutral: 0,
    }));
  }

  /** Set neutral scores from an averaged blendshape map (calibration result). */
  setNeutral(map) {
    for (const b of this.bindings) {
      b.neutral = Math.max(...b.sources.map((s) => map?.[s] ?? 0));
    }
  }

  /** Live value for HUD meters: max source score per binding. */
  valueOf(bs, b) {
    return Math.max(...b.sources.map((s) => bs[s] ?? 0));
  }

  /** @param {Object<string,number>} bs blendshape name→score @returns {Array} events */
  update(bs, nowMs) {
    const events = [];
    const c = this.cfg;

    for (const b of this.bindings) {
      const v = this.valueOf(bs, b);
      // "表情灵敏度" slider scales the binding thresholds (k<1 = more
      // sensitive); neutral calibration still raises them per-user.
      const k = this.cfg.neutralOffset / 0.22;
      const on = Math.max(b.on * k, b.neutral + this.cfg.neutralOffset);
      const off = Math.max(b.off * k, b.neutral + this.cfg.neutralOffset * 0.45);
      const want = b.state ? v > off : v > on;
      if (want === b.state) {
        b.candidateSince = null;
        continue;
      }
      if (b.candidateSince == null) b.candidateSince = nowMs;
      // Cooldown gates re-engagement only (anti-chatter) — releasing must
      // never be delayed, or keys feel stuck (same rule as PinchSwitch).
      const ready = want ? nowMs - b.lastChangeMs >= c.cooldownMs : true;
      if (nowMs - b.candidateSince >= c.confirmMs && ready) {
        b.state = want;
        b.candidateSince = null;
        b.lastChangeMs = nowMs;
        // key is ALWAYS present: keyup events are load-bearing (stuck-key safety)
        events.push({ kind: 'face', key: b.key, down: want, name: b.name, value: v });
      }
    }
    return events;
  }

  releaseAll() {
    const events = [];
    for (const b of this.bindings) {
      if (b.state) {
        b.state = false;
        events.push({ kind: 'face', key: b.key, down: false, name: b.name });
      }
      b.candidateSince = null;
    }
    return events;
  }
}
