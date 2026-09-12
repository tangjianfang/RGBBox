// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AnnotateOverlay } from '../../../src/renderer/src/components/video/AnnotateOverlay'
import { setupRendererMocks } from '../_helpers'

const png = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => { setupRendererMocks(); cleanup() })

describe('AnnotateOverlay', () => {
  it('renders toolbar with all tool buttons', () => {
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    expect(container.querySelector('.video-annotate-overlay')).toBeTruthy()
    const btns = container.querySelectorAll('.video-annotate-tool')
    expect(btns.length).toBe(7)  // select/rect/ellipse/arrow/pen/text/mosaic
    expect(container.querySelectorAll('.video-annotate-swatch').length).toBe(8)
    expect(container.querySelectorAll('.video-annotate-stroke').length).toBe(3)
  })

  it('save button exports PNG via onSave', () => {
    const onSave = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={onSave} onCopy={() => {}} />)
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
  })

  it('copy button calls onCopy with PNG', () => {
    const onCopy = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={onCopy} />)
    fireEvent.click(container.querySelector('.video-annotate-copy')!)
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onCopy.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
  })

  it('close button calls onClose; Escape key too', () => {
    const onClose = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={onClose} onSave={() => {}} onCopy={() => {}} />)
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('tool buttons switch active tool', () => {
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    const tools = container.querySelectorAll('.video-annotate-tool')
    expect(tools[0].className).toContain('active')
    fireEvent.click(tools[1])  // rect
    expect(tools[1].className).toContain('active')
    expect(tools[0].className).not.toContain('active')
  })

  it('R77.2: Escape while typing text only dismisses the input, not the overlay', () => {
    const onClose = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={onClose} onSave={() => {}} onCopy={() => {}} />)
    // 切到文字工具并点击画布 → 弹出输入框
    fireEvent.click(container.querySelectorAll('.video-annotate-tool')[5])
    fireEvent.pointerDown(container.querySelector('.video-annotate-canvas')!, { button: 0, clientX: 50, clientY: 50 })
    const ta = container.querySelector('.video-annotate-text-input') as HTMLTextAreaElement
    expect(ta).toBeTruthy()
    ta.focus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()          // 只收输入框
    expect(container.querySelector('.video-annotate-text-input')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })     // 无输入框时才关闭
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('R77.3: wheel zoom does not break save flow', () => {
    const onSave = vi.fn()
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={onSave} onCopy={() => {}} />)
    fireEvent.wheel(container.querySelector('.video-annotate-overlay')!, { deltaY: -120 })
    fireEvent.wheel(container.querySelector('.video-annotate-overlay')!, { deltaY: 120 })
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/)
  })
})
