import type { EngineMetrics, FrameMetrics } from '../../../shared/types'

const MAX_SAMPLES = 180

export class MetricsCollector {
  private samples: FrameMetrics[] = []
  private totalDroppedTicks = 0
  // R276(V1): 真实帧到达间隔——dashFps 原用 avgFrameMs(worker 耗时)倒数,
  // 处理 5ms 显示 200fps 而实际 tick 30fps(高估误导)。帧率=到达间隔倒数。
  private lastFrameAt = 0
  private frameRate = 0

  /** R276: 帧到达打点(帧率=真实间隔倒数,与处理耗时解耦)。 */
  recordFrameArrival(now: number): void {
    if (this.lastFrameAt > 0 && now > this.lastFrameAt) {
      const intervalMs = now - this.lastFrameAt
      const instant = 1000 / intervalMs
      // EMA 平滑(瞬时抖动不跳数)
      this.frameRate = this.frameRate === 0 ? instant : this.frameRate * 0.8 + instant * 0.2
    }
    this.lastFrameAt = now
  }

  /** R276: 当前真实帧率估计(无数据 0)。 */
  get estimatedFps(): number {
    return Math.round(this.frameRate)
  }

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

    // R276: p95 改 nearest-rank(ceil(0.95n)-1,标准口径;原 floor 偏低一档)
    const frameTimes = this.samples.map((sample) => sample.roundTripMs).sort((a, b) => a - b)
    const latest = this.samples[this.samples.length - 1]
    return {
      frameCount: this.samples.length,
      avgFrameMs: avg(this.samples.map((sample) => sample.roundTripMs)),
      p95FrameMs: frameTimes[Math.min(frameTimes.length - 1, Math.ceil(frameTimes.length * 0.95) - 1)] ?? 0,
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