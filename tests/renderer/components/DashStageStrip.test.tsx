// @vitest-environment happy-dom
// R303: 灯效舞台条 —— DOM/生命周期冒烟（canvas 像素由真机走查承担）
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { DashStageStrip } from '../../../src/renderer/src/components/DashStageStrip'

beforeEach(() => cleanup())

describe('DashStageStrip (R303)', () => {
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
