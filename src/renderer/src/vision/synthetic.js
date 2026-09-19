// Synthetic landmark source — camera-free pipeline exercise, adapted from
// VMosue's synthetic-landmark fixture approach (tests/fixtures/*.json).
// Phase-aware: it cooperates with the calibration wizard (holds still for the
// center step, sweeps for the reach step, pinches for the pinch step), then
// goes full-demo once active — exactly what a well-behaved player does.

const TAU = Math.PI * 2;

function band(tMs, period, start, dur) {
  const phase = tMs % period;
  const x = (phase - start) / dur;
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) : 0;
}

/** 21 landmarks consistent with the engine's geometry (same builder as tests).
 *  curl: 0 = open palm, 1 = fist (middle/ring/pinky fold toward the palm). */
export function makeLandmarks({ cx = 0.5, cy = 0.5, pinchGap = 1.2, scale = 0.18, noise = 0, curl = 0 } = {}) {
  const n = () => (noise ? (Math.random() - 0.5) * noise : 0);
  const ext = 1 - curl * 1.35; // finger extension multiplier (curl=1 → folded into palm)
  const fy = (base) => cy - scale * base * ext + (curl > 0 ? scale * curl * 0.15 : 0);
  const fx = (base) => cx + scale * base * (1 - curl * 0.6);
  const lm = new Array(21).fill(null).map(() => ({ x: cx, y: cy, z: 0 }));
  lm[0] = { x: cx + n(), y: cy + scale + n(), z: 0 };
  lm[9] = { x: cx + n(), y: cy + n(), z: 0 };
  lm[5] = { x: cx - scale * 0.45, y: cy + scale * 0.1, z: 0 };
  lm[17] = { x: cx + scale * 0.45, y: cy + scale * 0.1, z: 0 };
  lm[13] = { x: cx + scale * 0.2, y: cy + scale * 0.05, z: 0 };
  const gap = pinchGap * scale;
  lm[8] = { x: cx - gap / 2, y: cy - scale * 0.9 * ext, z: 0 };
  lm[4] = { x: cx + gap / 2, y: cy - scale * 0.75 * ext, z: 0 };
  lm[10] = { x: fx(0), y: fy(0.45), z: 0 };
  lm[11] = { x: fx(0), y: fy(0.75), z: 0 };
  lm[12] = { x: fx(0), y: fy(1.05), z: 0 };
  lm[14] = { x: fx(0.22), y: fy(0.35), z: 0 };
  lm[15] = { x: fx(0.24), y: fy(0.65), z: 0 };
  lm[16] = { x: fx(0.26), y: fy(0.9), z: 0 };
  lm[18] = { x: fx(0.5), y: fy(0.2), z: 0 };
  lm[19] = { x: fx(0.52), y: fy(0.45), z: 0 };
  lm[20] = { x: fx(0.55), y: fy(0.65), z: 0 };
  return lm;
}

export class SyntheticSource {
  constructor({ noise = 0.004, twoHands = false } = {}) {
    this.noise = noise;
    this.twoHands = twoHands;
  }

  /**
   * @param {string} phase 'center' | 'reach' | 'pinch' | 'active'
   * @returns {{hand, hand2?, faceBlend}}
   */
  sample(tMs, phase = 'active') {
    let cx, cy, pinch = 1.25;
    if (phase === 'center') {
      cx = 0.5; cy = 0.5;                          // rest: calibration step 1
    } else if (phase === 'reach') {
      // wide figure-eight: measures reach + covers all 8 sectors
      cx = 0.5 + 0.24 * Math.sin((tMs / 1200) * TAU);
      cy = 0.5 + 0.20 * Math.sin((tMs / 600) * TAU);
    } else if (phase === 'pinch') {
      cx = 0.5; cy = 0.5;                          // pinch cycles: step 3
      pinch = 1.25 - 1.0 * band(tMs, 1000, 100, 380);
    } else {                                        // active: full demo
      cx = 0.5 + 0.24 * Math.sin((tMs / 6000) * TAU);
      cy = 0.5 + 0.20 * Math.sin((tMs / 3000) * TAU);
      pinch = 1.25 - 1.0 * band(tMs, 4000, 1000, 350);
    }
    const hand = makeLandmarks({ cx, cy, pinchGap: pinch, noise: this.noise });

    // optional second (off) hand resting at screen-left: curled fist with a
    // slow pinch cycle (demos the KeyF action; never triggers open-palm pause)
    let hand2;
    if (this.twoHands) {
      hand2 = makeLandmarks({
        cx: 0.727, cy: 0.5,
        pinchGap: 1.25 - 1.0 * band(tMs, 3000, 800, 350),
        curl: 1, noise: this.noise,
      });
    }

    const active = phase === 'active';
    const faceBlend = {
      _neutral: 1,
      jawOpen: 0.04 + 0.75 * band(tMs, 6000, 500, 400) * (active ? 1 : 0),
      browInnerUp: 0.03 + 0.7 * band(tMs, 6000, 2500, 400) * (active ? 1 : 0),
      mouthSmileLeft: 0.02 + 0.65 * band(tMs, 6000, 4000, 500) * (active ? 1 : 0),
      mouthSmileRight: 0.02 + 0.65 * band(tMs, 6000, 4000, 500) * (active ? 1 : 0),
    };
    return { hand, hand2, faceBlend };
  }
}
