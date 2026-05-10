import type { EngineMetrics, FrameMetrics } from '../../../shared/types'

const MAX_SAMPLES = 180

export class MetricsCollector {
  private samples: FrameMetrics[] = []
  private totalDroppedTicks = 0

  add(sample: FrameMetrics): EngineMetrics {
    this.samples.push(sample)
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
    this.totalDroppedTicks += sample.droppedTicks
    return this.snapshot()
  }

  snapshot(): EngineMetrics {
    if (this.samples.length === 0) {
      return {
        frameCount: 0,
        avgFrameMs: 0,
        p95FrameMs: 0,
        lastFrameMs: 0,
        workerProcessMs: 0,
        captureMs: 0,
        outputMs: 0,
        droppedTicks: this.totalDroppedTicks
      }
    }

    const frameTimes = this.samples.map((sample) => sample.roundTripMs).sort((a, b) => a - b)
    const latest = this.samples[this.samples.length - 1]
    return {
      frameCount: this.samples.length,
      avgFrameMs: avg(this.samples.map((sample) => sample.roundTripMs)),
      p95FrameMs: frameTimes[Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * 0.95))] ?? 0,
      lastFrameMs: latest.roundTripMs,
      workerProcessMs: latest.workerProcessMs,
      captureMs: latest.captureMs,
      outputMs: latest.outputMs,
      droppedTicks: this.totalDroppedTicks
    }
  }
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}