// @vitest-environment happy-dom
// R303: 灯效舞台条 —— DOM/生命周期冒烟（canvas 像素由真机走查承担）
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { DashStageStrip, spotlightColumnWeights } from '../../../src/renderer/src/components/DashStageStrip'

beforeEach(() => cleanup())

describe('DashStageStrip (R303)', () => {
  it('R303.6 聚光渐隐:边缘最暗(≈0.15)、中心全亮(=1)、单调递增到 25% 处', () => {
    const w = spotlightColumnWeights()
    expect(w.length).toBe(64)
    expect(w[0]).toBeCloseTo(0.15, 5)
    expect(w[w.length - 1]).toBeCloseTo(0.15, 5)
    expect(w[32]).toBe(1)
    // 距边 25%（x=16）处已达全亮，之后保持
    expect(w[16]).toBe(1)
    // 单调：边缘 → 中心不减
    for (let x = 1; x <= 32; x++) expect(w[x]).toBeGreaterThanOrEqual(w[x - 1])
  })

  it('运行中的 CPU 效果：渲染画布且不启动清理泄漏（卸载安全）', () => {
    const { container, unmount } = render(
      <DashStageStrip kind="rainbow" parameters={{ speed: 1 }} running performanceMode="balanced" />
    )
    expect(container.querySelector('canvas.dash-stage-strip')).not.toBeNull()
    expect(() => unmount()).not.toThrow()
  })

  it('暂停态：渲染画布（定格压暗路径）不崩溃', () => {
    const { container } = render(
      <DashStageStrip kind="fire" parameters={{}} running={false} />
    )
    expect(container.querySelector('canvas.dash-stage-strip')).not.toBeNull()
  })

  it('3D kind：静态暗台兜底路径不崩溃', () => {
    const { container } = render(
      <DashStageStrip kind="droplet-mirror" parameters={{}} running />
    )
    expect(container.querySelector('canvas.dash-stage-strip')).not.toBeNull()
  })
})
