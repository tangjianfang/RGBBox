// Latency / FPS instrumentation — mirrors VMosue's ProfileGuard (P50/P95 per stage).
// Verifying "<100ms end-to-end" starts with measuring each stage separately.

export class LatencyMeter {
  constructor(size = 300) {
    this.samples = [];
    this.size = size;
  }
  push(ms) {
    if (!(ms >= 0) || ms > 5000) return; // ignore outliers/clock artifacts
    this.samples.push(ms);
    if (this.samples.length > this.size) this.samples.shift();
  }
  stats() {
    const n = this.samples.length;
    if (n === 0) return { n: 0, p50: NaN, p95: NaN, mean: NaN };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
    return {
      n,
      p50: q(0.5),
      p95: q(0.95),
      mean: sorted.reduce((s, v) => s + v, 0) / n,
    };
  }
}

export class FpsCounter {
  constructor() {
    this.count = 0;
    this.windowStart = null;
    this.fps = 0;
  }
  tick(tMs) {
    if (this.windowStart == null) this.windowStart = tMs;
    this.count++;
    const dt = tMs - this.windowStart;
    if (dt >= 1000) {
      this.fps = (this.count * 1000) / dt;
      this.count = 0;
      this.windowStart = tMs;
    }
  }
}
