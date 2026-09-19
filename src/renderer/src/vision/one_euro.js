// One Euro filter — low-latency adaptive smoothing for tracking signals.
// Ported from the VMosue project pattern (LandmarkSmoother / util/OneEuroFilter):
// stable when slow, responsive when fast. No large-window averaging (that adds latency).

export class LowPass {
  constructor() {
    this.init = false;
    this.y = 0;
  }
  filter(x, alpha) {
    if (!this.init) {
      this.init = true;
      this.y = x;
    } else {
      this.y = alpha * x + (1 - alpha) * this.y;
    }
    return this.y;
  }
  reset() {
    this.init = false;
  }
}

export class OneEuroFilter {
  /**
   * @param {object} opts
   * @param {number} opts.minCutoff low-speed cutoff (Hz). Lower = smoother at rest.
   * @param {number} opts.beta      speed coefficient. Higher = more responsive to fast motion.
   * @param {number} opts.dCutoff   derivative cutoff (Hz).
   */
  constructor({ minCutoff = 1.2, beta = 0.08, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPass();
    this.dxFilter = new LowPass();
    this.lastT = null;
    this.lastX = null;
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastT = null;
    this.lastX = null;
  }

  #alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** @param {number} x signal value @param {number} tSec timestamp in seconds */
  filter(x, tSec) {
    let dt = this.lastT == null ? null : tSec - this.lastT;
    if (dt == null || dt <= 0 || dt > 0.5) {
      // first sample, clock glitch or long gap (e.g. tab was hidden): re-seed
      this.reset();
      this.lastT = tSec;
      this.lastX = x;
      this.xFilter.filter(x, 1);
      this.dxFilter.filter(0, 1);
      return x;
    }
    const dx = (x - this.lastX) / dt;
    this.lastT = tSec;
    this.lastX = x;
    const edx = this.dxFilter.filter(dx, this.#alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, this.#alpha(cutoff, dt));
  }
}

/** 2D convenience wrapper — filters x/y independently. */
export class OneEuroVec2 {
  constructor(opts = {}) {
    this.fx = new OneEuroFilter(opts);
    this.fy = new OneEuroFilter(opts);
  }
  reset() {
    this.fx.reset();
    this.fy.reset();
  }
  filter(x, y, tSec) {
    return { x: this.fx.filter(x, tSec), y: this.fy.filter(y, tSec) };
  }
}
