// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { DashboardView, type DashboardStatus } from '../../../src/renderer/src/components/DashboardView'

beforeEach(() => cleanup())

function makeStatus(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return {
    running: true,
    onToggleEngine: vi.fn(),
    effectName: 'Rainbow',
    fps: 60,
    audioEnabled: true,
    audioDeviceId: '',
    audioDevices: [{ deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput' } as MediaDeviceInfo],
    speakerDevices: [{ deviceId: 'spk-1', label: 'Speaker 1', kind: 'audiooutput' } as MediaDeviceInfo],
    onSelectAudioDevice: vi.fn(),
    overlayCount: 2,
    version: '0.3.44',
    ...over
  }
}

function renderDash(over: { model3dEnabled?: boolean; status?: Partial<DashboardStatus>; effect?: DashboardViewTestEffect } = {}) {
  const props = {
    onOpen: vi.fn(),
    model3dEnabled: over.model3dEnabled ?? false,
    status: makeStatus(over.status ?? {}),
    effect: over.effect ?? { kind: 'rainbow' as const, parameters: { speed: 1 } }
  }
  return { props, ...render(<DashboardView {...props} />) }
}
type DashboardViewTestEffect = { kind: 'rainbow'; parameters: Record<string, number> }

describe('DashboardView (R303 舞台条布局)', () => {
  it('舞台区：状态行 + 舞台条画布 + 读数行（取代折叠组结构）', () => {
    const { container } = renderDash()
    // 折叠组已废除
    expect(container.querySelectorAll('.dash-group')).toHaveLength(0)
    const stage = container.querySelector('.dash-stage') as HTMLElement
    expect(stage).not.toBeNull()
    expect(stage.getAttribute('aria-label')).toBe('dash.stage.ariaLabel')
    // 状态行：运行点 + 状态文案 + 主开关
    expect(stage.querySelector('.dash-stage-dot.on')).not.toBeNull()
    expect(stage.querySelector('.dash-stage-state')?.textContent).toContain('engine.running')
    expect(stage.querySelector('.dash-stage-toggle')).not.toBeNull()
    // 舞台条画布在位
    expect(stage.querySelector('canvas.dash-stage-strip')).not.toBeNull()
  })

  it('读数行显示效果名/帧率/投影数与音频设备选择', () => {
    const { container } = renderDash()
    const readouts = container.querySelector('.dash-readouts') as HTMLElement
    expect(readouts).not.toBeNull()
    const text = readouts.textContent ?? ''
    expect(text).toContain('Rainbow')
    expect(text).toContain('60')
    expect(text).toContain('2')
    const select = readouts.querySelector('.audio-device-select') as HTMLSelectElement
    const options = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(options).toEqual(['', '__speaker__:spk-1', '__system_audio__', 'mic-1'])
  })

  it('引擎主开关触发 onToggleEngine（带可见文案的按钮）', () => {
    const onToggleEngine = vi.fn()
    const { container } = renderDash({ status: { onToggleEngine } })
    fireEvent.click(container.querySelector('.dash-stage-toggle') as HTMLElement)
    expect(onToggleEngine).toHaveBeenCalledOnce()
    // 暂停态显示启动文案
    const paused = renderDash({ status: { onToggleEngine, running: false } })
    expect(paused.container.querySelector('.dash-stage-toggle')?.textContent).toContain('dash.start')
  })

  it('音频关闭时读数行显示「关」而非选择器', () => {
    const { container } = renderDash({ status: { audioEnabled: false } })
    expect(container.querySelector('.audio-device-select')).toBeNull()
    expect(container.querySelector('.dash-readouts')?.textContent).toContain('audio.off')
  })

  it('首帧采样前帧率显示 —（不显示 0）', () => {
    const { container } = renderDash({ status: { fps: 0 } })
    expect(container.querySelector('.dash-readouts')?.textContent).toContain('—')
  })

  it('模块磁贴：带描述行；model3d 门控 8/9；点击触发 onOpen', () => {
    const { container, props } = renderDash()
    expect(container.querySelectorAll('.dash-tile').length).toBe(8)
    // R303: dash.desc.* 首次上屏
    const descs = container.querySelectorAll('.dash-tile-desc')
    expect(descs.length).toBe(8)
    const tile = [...container.querySelectorAll('.dash-tile')].find((el) =>
      el.textContent?.includes('nav.workspace')
    ) as HTMLElement
    expect(tile.textContent).toContain('dash.desc.workspace')
    fireEvent.click(tile)
    expect(props.onOpen).toHaveBeenCalledWith('workspace')
    const enabled = renderDash({ model3dEnabled: true })
    expect(enabled.container.querySelectorAll('.dash-tile').length).toBe(9)
  })

  it('effect=null（profile 未就绪）渲染空舞台不崩溃', () => {
    const { container } = renderDash({ effect: undefined })
    // renderDash 缺省替换 undefined → 不传 effect 的路径单独验：
    // 这里直接断言 effect 传入 null 的分支
    expect(container.querySelector('.dash-stage-idle')).toBeNull() // 缺省走了 rainbow 画布
    const props = {
      onOpen: vi.fn(),
      model3dEnabled: false,
      status: makeStatus(),
      effect: null as null
    }
    const empty = render(<DashboardView {...props} />)
    expect(empty.container.querySelector('.dash-stage-idle')).not.toBeNull()
    expect(empty.container.querySelector('canvas.dash-stage-strip')).toBeNull()
  })
})
