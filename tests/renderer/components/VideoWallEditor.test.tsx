// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { VideoWallEditor } from '../../../src/renderer/src/components/VideoWallEditor'
import { setupRendererMocks } from '../_helpers'
import type { DisplayInfo, DisplayTopology, VideoWallLayout } from '../../../src/shared/types'
import { buildMatrixLayout, getWallAspect } from '../../../src/engine/videoWall'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

function makeDisplay(id: number, label: string): DisplayInfo {
  return {
    id,
    label,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    rotation: 0,
    primary: id === 1
  }
}

function makeTopology(displays: DisplayInfo[]): DisplayTopology {
  return {
    displays,
    virtualBounds: { x: 0, y: 0, width: 1920, height: 1080 }
  }
}

const topology = makeTopology([makeDisplay(1, 'Primary'), makeDisplay(2, 'Secondary')])

describe('renderer/components/VideoWallEditor', () => {
  it('renders the disabled state with an enable button when no layout', () => {
    const onChange = vi.fn()
    const { container } = render(<VideoWallEditor topology={topology} onChange={onChange} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('emits a 2x2 layout mapped to displays when enabled', () => {
    const onChange = vi.fn()
    const { container } = render(<VideoWallEditor topology={topology} onChange={onChange} />)
    fireEvent.click(container.querySelector('button')!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const layout = onChange.mock.calls[0][0] as VideoWallLayout
    expect(layout.rows).toBe(2)
    expect(layout.cols).toBe(2)
    expect(layout.panels).toHaveLength(4)
    expect(layout.panels[0].displayId).toBe(1)
    expect(layout.panels[1].displayId).toBe(2)
  })

  it('emits undefined to disable wall mode', () => {
    const onChange = vi.fn()
    const layout = buildMatrixLayout(2, 2)
    const { container } = render(
      <VideoWallEditor layout={layout} topology={topology} onChange={onChange} />
    )
    // The first button in the head toggles wall mode off.
    fireEvent.click(container.querySelector('.videowall-head button')!)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('resizes panels while preserving rotation/displayId of surviving cells', () => {
    const onChange = vi.fn()
    const base = buildMatrixLayout(2, 2, { displayIds: [1, 2] })
    base.panels[0].rotation = 90
    const { container } = render(
      <VideoWallEditor layout={base} topology={topology} onChange={onChange} />
    )
    const rowsInput = container.querySelector('.videowall-dims input')!
    fireEvent.change(rowsInput, { target: { value: '3' } })
    const next = onChange.mock.calls[0][0] as VideoWallLayout
    expect(next.rows).toBe(3)
    expect(next.panels).toHaveLength(6)
    expect(next.panels.find((p) => p.row === 0 && p.col === 0)?.rotation).toBe(90)
  })

  it('clamps rows/cols to the 1..8 range', () => {
    const onChange = vi.fn()
    const base = buildMatrixLayout(2, 2)
    const { container } = render(
      <VideoWallEditor layout={base} topology={topology} onChange={onChange} />
    )
    const colsInput = container.querySelectorAll('.videowall-dims input')[1]
    fireEvent.change(colsInput, { target: { value: '99' } })
    const next = onChange.mock.calls[0][0] as VideoWallLayout
    expect(next.cols).toBe(8)
  })

  it('updates bezel and fit', () => {
    const onChange = vi.fn()
    const base = buildMatrixLayout(2, 2)
    const { container } = render(
      <VideoWallEditor layout={base} topology={topology} onChange={onChange} />
    )
    fireEvent.change(container.querySelector('input[type="range"]')!, { target: { value: '0.2' } })
    expect((onChange.mock.calls[0][0] as VideoWallLayout).bezel).toBeCloseTo(0.2)

    onChange.mockClear()
    const fitButtons = container.querySelectorAll('.videowall-fit-buttons button')
    fireEvent.click(fitButtons[1]) // contain
    expect((onChange.mock.calls[0][0] as VideoWallLayout).fit).toBe('contain')
  })

  it('toggles bezel compensation', () => {
    const onChange = vi.fn()
    const base = buildMatrixLayout(2, 2, { bezelCompensation: true })
    const { container } = render(
      <VideoWallEditor layout={base} topology={topology} onChange={onChange} />
    )
    fireEvent.click(container.querySelector('.videowall-check input')!)
    expect((onChange.mock.calls[0][0] as VideoWallLayout).bezelCompensation).toBe(false)
  })

  it('edits a panel rotation and display mapping after selecting it', () => {
    const onChange = vi.fn()
    const base = buildMatrixLayout(2, 2, { displayIds: [1, 2] })
    const { container } = render(
      <VideoWallEditor layout={base} topology={topology} onChange={onChange} />
    )
    fireEvent.click(container.querySelector('.videowall-cell')!)
    // Panel edit section now visible.
    const rotButtons = container.querySelectorAll('.videowall-rotation-buttons button')
    expect(rotButtons.length).toBe(4)
    fireEvent.click(rotButtons[2]) // 180°
    const next = onChange.mock.calls[0][0] as VideoWallLayout
    expect(next.panels[0].rotation).toBe(180)

    onChange.mockClear()
    fireEvent.change(container.querySelector('.videowall-panel-edit select')!, { target: { value: '2' } })
    expect((onChange.mock.calls[0][0] as VideoWallLayout).panels[0].displayId).toBe(2)
  })

  it('renders without topology (empty display list) without crashing', () => {
    const onChange = vi.fn()
    const { container } = render(
      <VideoWallEditor layout={buildMatrixLayout(1, 1)} onChange={onChange} />
    )
    expect(container.querySelectorAll('.videowall-cell')).toHaveLength(1)
  })
})


// ── R280: 单屏逃生 + 动态 aspect ─────────────────────────────────────────
describe('VideoWallEditor R280 单屏逃生/墙比例保真', () => {
  it('单屏 + 墙模式生效 → 逃生条渲染,点击关闭调用 onChange(undefined)', async () => {
    const onChange = vi.fn()
    const single = { displays: [makeDisplay(1, 'Solo')], virtualBounds: { x: 0, y: 0, width: 1920, height: 1080 } } as never
    const layout = buildMatrixLayout(2, 2, { displayIds: [1] })
    const { container } = render(
      <VideoWallEditor layout={layout} topology={single} onChange={onChange} />
    )
    const bar = container.querySelector('[data-field="wall-single-escape"]')
    expect(bar).toBeTruthy()
    fireEvent.click(bar!.querySelector('button')!)
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('多屏 → 无逃生条', () => {
    const two = { displays: [makeDisplay(1, 'A'), makeDisplay(2, 'B')], virtualBounds: { x: 0, y: 0, width: 3840, height: 1080 } } as never
    const { container } = render(
      <VideoWallEditor layout={buildMatrixLayout(2, 1, { displayIds: [1, 2] })} topology={two} onChange={() => {}} />
    )
    expect(container.querySelector('[data-field="wall-single-escape"]')).toBeNull()
  })

  it('W6: 8×1 墙容器 aspectRatio = getWallAspect(≈8/1×面板比) 而非硬编码 16/9', () => {
    const two = { displays: [makeDisplay(1, 'A'), makeDisplay(2, 'B')], virtualBounds: { x: 0, y: 0, width: 3840, height: 1080 } } as never
    const layout = buildMatrixLayout(8, 1, { displayIds: [1, 2] })
    const { container } = render(
      <VideoWallEditor layout={layout} topology={two} onChange={() => {}} />
    )
    const grid = container.querySelector('.videowall-grid') as HTMLElement
    // happy-dom 将 aspectRatio 规范为 "n / 1" 形式——按数值比较
    const got = Number(grid.style.aspectRatio.split('/')[0].trim())
    expect(got).toBeCloseTo(getWallAspect(layout, 1920 / 1080), 5)
    expect(got).not.toBeCloseTo(16 / 9, 1)
  })
})
