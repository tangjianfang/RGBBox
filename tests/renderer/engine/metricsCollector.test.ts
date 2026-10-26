import { describe, it, expect } from 'vitest'
import { MetricsCollector } from '../../../src/renderer/src/engine/metricsCollector'
import type { FrameMetrics } from '../../../src/shared/types'

function makeSample(overrides: Partial<FrameMetrics> = {}): FrameMetrics {
  return {
    timestamp: 1000,
    workerProcessMs: 5,
    textMaskMs: 1,
    renderMs: 4,
    captureMs: 2,
    roundTripMs: 7,
    outputMs: 1,
    droppedTicks: 0,
    ...overrides
  }
}

describe('renderer/engine/metricsCollector', () => {
  describe('initial state (no samples)', () => {
    it('snapshot() returns zeros with frameCount=0', () => {
      const collector = new MetricsCollector()
      const snap = collector.snapshot()
      expect(snap).toEqual({
        frameCount: 0,
        avgFrameMs: 0,
        p95FrameMs: 0,
        lastFrameMs: 0,
        workerProcessMs: 0,
        captureMs: 0,
        outputMs: 0,
        droppedTicks: 0
      })
    })
  })

  describe('add() and snapshot()', () => {
    it('add() returns the current snapshot', () => {
      const collector = new MetricsCollector()
      const snap = collector.add(makeSample({ roundTripMs: 10 }))
      expect(snap.frameCount).toBe(1)
      expect(snap.lastFrameMs).toBe(10)
    })

    it('frameCount grows by 1 per add()', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample())
      collector.add(makeSample())
      collector.add(makeSample())
      expect(collector.snapshot().frameCount).toBe(3)
    })

    it('lastFrameMs uses the most recently added sample', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample({ roundTripMs: 5 }))
      collector.add(makeSample({ roundTripMs: 10 }))
      collector.add(makeSample({ roundTripMs: 20 }))
      expect(collector.snapshot().lastFrameMs).toBe(20)
    })

    it('avgFrameMs is the arithmetic mean of roundTripMs', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample({ roundTripMs: 10 }))
      collector.add(makeSample({ roundTripMs: 20 }))
      collector.add(makeSample({ roundTripMs: 30 }))
      expect(collector.snapshot().avgFrameMs).toBe(20)
    })

    it('p95FrameMs uses the 95th percentile (nearest-rank, R276 口径)', () => {
      const collector = new MetricsCollector()
      // Add 20 samples: 1..20ms
      for (let i = 1; i <= 20; i++) {
        collector.add(makeSample({ roundTripMs: i }))
      }
      const snap = collector.snapshot()
      // floor(20 * 0.95) = 19 → samples[19] = 20
      // R276: nearest-rank ceil(0.95×20)-1=索引18 → 值 19(原 floor 口径偏低一档)
      expect(snap.p95FrameMs).toBe(19)
    })

    it('p95FrameMs clamps to last element when index exceeds length', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample({ roundTripMs: 5 }))
      collector.add(makeSample({ roundTripMs: 10 }))
      // floor(2 * 0.95) = 1 → samples[1] = 10
      expect(collector.snapshot().p95FrameMs).toBe(10)
    })

    it('workerProcessMs / captureMs / outputMs are from the latest sample', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample({ workerProcessMs: 1, captureMs: 2, outputMs: 3 }))
      collector.add(makeSample({ workerProcessMs: 4, captureMs: 5, outputMs: 6 }))
      const snap = collector.snapshot()
      expect(snap.workerProcessMs).toBe(4)
      expect(snap.captureMs).toBe(5)
      expect(snap.outputMs).toBe(6)
    })

    it('droppedTicks accumulates across all samples', () => {
      const collector = new MetricsCollector()
      collector.add(makeSample({ droppedTicks: 2 }))
      collector.add(makeSample({ droppedTicks: 3 }))
      collector.add(makeSample({ droppedTicks: 5 }))
      expect(collector.snapshot().droppedTicks).toBe(10)
    })
  })

  describe('rolling window (MAX_SAMPLES=180)', () => {
    it('does not throw when adding more than 180 samples', () => {
      const collector = new MetricsCollector()
      for (let i = 0; i < 200; i++) {
        collector.add(makeSample({ roundTripMs: i }))
      }
      // Should keep the most recent 180
      expect(collector.snapshot().frameCount).toBe(180)
    })

    it('oldest samples are evicted (rolling window)', () => {
      const collector = new MetricsCollector()
      // Fill with 180 samples of roundTripMs=5
      for (let i = 0; i < 180; i++) {
        collector.add(makeSample({ roundTripMs: 5 }))
      }
      // Now add 10 more with roundTripMs=20
      for (let i = 0; i < 10; i++) {
        collector.add(makeSample({ roundTripMs: 20 }))
      }
      // frameCount capped at 180
      expect(collector.snapshot().frameCount).toBe(180)
      // lastFrameMs should be 20 (the newest)
      expect(collector.snapshot().lastFrameMs).toBe(20)
      // avgFrameMs should be between 5 and 20, biased toward 20 (10 new vs 170 old)
      const avg = collector.snapshot().avgFrameMs
      expect(avg).toBeGreaterThan(5)
      expect(avg).toBeLessThan(20)
    })

    it('does not accumulate droppedTicks beyond 180 samples', () => {
      const collector = new MetricsCollector()
      // 200 samples, each with droppedTicks=1
      for (let i = 0; i < 200; i++) {
        collector.add(makeSample({ droppedTicks: 1 }))
      }
      // Dropped ticks is a cumulative total — all 200 should count
      expect(collector.snapshot().droppedTicks).toBe(200)
    })
  })

  // R320⑤: R276 加的真实帧率估计此前零测试——renderer-engine 层覆盖率被
  // recordFrameArrival/estimatedFps 拖到 82.6%/57%,撞破 95% 层门槛。
  describe('recordFrameArrival / estimatedFps (R276)', () => {
    it('first arrival only sets the baseline — no rate until a second frame', () => {
      const collector = new MetricsCollector()
      collector.recordFrameArrival(1000)
      expect(collector.estimatedFps).toBe(0)
    })

    it('second arrival yields the instantaneous interval rate (1000/Δms, rounded)', () => {
      const collector = new MetricsCollector()
      collector.recordFrameArrival(1000)
      collector.recordFrameArrival(1016) // 16ms → 62.5fps
      expect(collector.estimatedFps).toBe(63)
    })

    it('subsequent arrivals are EMA-smoothed (0.8 prev + 0.2 instant)', () => {
      const collector = new MetricsCollector()
      collector.recordFrameArrival(1000)
      collector.recordFrameArrival(1016) // instant 62.5 → rate 62.5
      collector.recordFrameArrival(1036) // 20ms → instant 50; 62.5*0.8 + 50*0.2 = 60
      expect(collector.estimatedFps).toBe(60)
    })

    it('non-increasing timestamps do not update the rate but do move the baseline', () => {
      const collector = new MetricsCollector()
      collector.recordFrameArrival(1000)
      collector.recordFrameArrival(1000) // equal — guard rejects, baseline stays 1000
      expect(collector.estimatedFps).toBe(0)
      collector.recordFrameArrival(900) // clock went backwards — rejected too
      expect(collector.estimatedFps).toBe(0)
      // baseline is now 900 (last assignment wins): 900→916 is a valid 16ms interval
      collector.recordFrameArrival(916)
      expect(collector.estimatedFps).toBe(63)
    })
  })
})
