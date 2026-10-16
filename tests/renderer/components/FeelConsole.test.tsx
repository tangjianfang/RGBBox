// @vitest-environment happy-dom
// R304: 感觉台——两标签/语义盘写参/专家页长尾/paint 提示
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FeelConsole } from '../../../src/renderer/src/components/FeelConsole'
import type { EffectLayer } from '../../../src/shared/types'

beforeEach(() => cleanup())

function makeLayer(parameters: Record<string, unknown>, kind: EffectLayer['kind'] = 'aurora'): EffectLayer {
  return { id: 'l1', name: 'L', kind, enabled: true, opacity: 1, blendMode: 'normal', parameters }
}

const baseProps = {
  setLayerParameter: vi.fn(),
  updateSelectedLayer: vi.fn(),
  randomizerMode: 'subtle' as const,
  setRandomizerMode: vi.fn(),
  randomizerLockedParams: [] as string[],
  toggleRandomizerParamLock: vi.fn(),
  randomizeSelectedLayer: vi.fn()
}

describe('FeelConsole (R304)', () => {
  it('默认「调感觉」页：全参效果渲染 4 根语义盘 + 色相条（有 color 参数）', () => {
    const { container } = render(
      <FeelConsole {...baseProps} layer={makeLayer({ speed: 0.5, intensity: 1, density: 5, hueShift: 30, color: '#ff8800' })} />
    )
    const tabs = container.querySelectorAll('.feel-tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0].className).toContain('active')
    const rows = container.querySelectorAll('.feel-body .feel-row')
    expect(rows.length).toBe(5) // 4 dials + 1 hue strip
    expect(container.querySelector('input.hue-strip')).not.toBeNull()
    expect(container.textContent).toContain('feel.motion')
    expect(container.textContent).toContain('feel.palette')
  })

  it('拖动感盘写底层参数（语义标签 → 真实 param 名）', () => {
    const setLayerParameter = vi.fn()
    const { container } = render(
      <FeelConsole {...baseProps} setLayerParameter={setLayerParameter} layer={makeLayer({ speed: 0.5 })} />
    )
    const slider = container.querySelector('.feel-row input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.8' } })
    expect(setLayerParameter).toHaveBeenCalledWith('speed', 0.8)
  })

  it('「专家参数」页：长尾滑杆在位 + 重置默认 + 随机器；计数含非 _ 参数', () => {
    const { container } = render(
      <FeelConsole {...baseProps} layer={makeLayer({ speed: 0.5, colorSpread: 0.3, _maskZone: 'top' })} />
    )
    const tabs = container.querySelectorAll('.feel-tab')
    expect(tabs[1].textContent).toContain('(2)') // _ 前缀不入计数
    fireEvent.click(tabs[1])
    const expert = container.querySelector('.feel-expert') as HTMLElement
    expect(expert).not.toBeNull()
    expect(expert.querySelectorAll('.feel-row').length).toBe(2)
    expect(expert.querySelector('.fx-reset-defaults')).not.toBeNull()
    expect(expert.querySelector('.randomizer-select')).not.toBeNull()
  })

  it('paint 类：感觉页与专家页都显示舞台画板提示（参数区零幽灵控制）', () => {
    const { container } = render(
      <FeelConsole {...baseProps} layer={makeLayer({ pixelData: '' }, 'custom-paint')} />
    )
    expect(container.querySelector('.feel-body')?.textContent).toContain('feel.paintHint')
    fireEvent.click(container.querySelectorAll('.feel-tab')[1])
    expect(container.querySelector('.feel-expert')?.textContent).toContain('feel.paintHint')
    expect(container.querySelector('.feel-expert')?.querySelectorAll('.feel-row').length).toBe(0)
  })

  it('无盘无色效果显示 noDials 空态', () => {
    const { container } = render(<FeelConsole {...baseProps} layer={makeLayer({}, 'static')} />)
    expect(container.querySelector('.feel-body')?.textContent).toContain('feel.noDials')
  })
})
