// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { RegionSnipOverlay } from '../../../src/renderer/src/components/video/RegionSnipOverlay'

beforeEach(() => cleanup())

// 恒等视图（absScale=1、无偏移）+ 容器 800x600 + contain rect 与原生同尺寸 800x450@(0,75)
const props = {
  view: { center: { x: 400, y: 300 }, offset: { x: 0, y: 0 }, absScale: 1 },
  contentRect: { x: 0, y: 75, w: 800, h: 450 },
  nativeSize: { w: 800, h: 450 },
  wrapSize: { w: 800, h: 600 },
}

describe('RegionSnipOverlay', () => {
  it('renders svg mask without selection initially', () => {
    const { container } = render(<RegionSnipOverlay {...props} onConfirm={() => {}} onCancel={() => {}} />)
    expect(container.querySelector('.video-snip-svg')).toBeTruthy()
    expect(container.querySelectorAll('rect').length).toBe(0)
  })

  it('drag creates a selection and Enter confirms native rect', () => {
    const onConfirm = vi.fn()
    const { container } = render(<RegionSnipOverlay {...props} onConfirm={onConfirm} onCancel={() => {}} />)
    const svg = container.querySelector('.video-snip-svg')!
    // drag: 屏幕坐标 (100,200) → (300,350)；恒等视图下内容坐标相同
    fireEvent.pointerDown(svg, { button: 0, clientX: 100, clientY: 200 })
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 350 })
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 350 })
    // 选框 + 8 手柄 = 9 个 rect
    expect(container.querySelectorAll('rect').length).toBe(9)
    expect(container.querySelector('.video-snip-label')?.textContent).toBe('200×150')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith({ x: 100, y: 125, w: 200, h: 150 })
  })

  it('Escape cancels', () => {
    const onCancel = vi.fn()
    render(<RegionSnipOverlay {...props} onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Enter without selection does not confirm', () => {
    const onConfirm = vi.fn()
    render(<RegionSnipOverlay {...props} onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
