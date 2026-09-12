// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AnnotateOverlay, shouldCommitText } from '../../../src/renderer/src/components/video/AnnotateOverlay'
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
    // canvas 源：base/natural 同步就绪（严格守卫下文字放置需要底图已解码）
    const cv = document.createElement('canvas')
    cv.width = 400; cv.height = 300
    const { container } = render(<AnnotateOverlay source={cv} onClose={onClose} onSave={() => {}} onCopy={() => {}} />)
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

  it('R78.1: shouldCommitText respects IME composition', () => {
    expect(shouldCommitText({ key: 'Enter' })).toBe(true)
    expect(shouldCommitText({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(shouldCommitText({ key: 'Enter', isComposing: true })).toBe(false)   // 输入法确认候选词
    expect(shouldCommitText({ key: ' ' })).toBe(false)
  })

  it('R78.3/R79.2: OCR panel result editable, copy-all writes clipboard text', async () => {
    const mocks = setupRendererMocks()
    mocks.ocrRecognize.mockResolvedValue({ ok: true, text: '识别结果 line1\nline2', hint: undefined })
    const { container, findByTestId } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    // R79.2 后 OCR 按钮先进框选模式 → 拖一个区域触发识别
    fireEvent.click(container.querySelector('.video-annotate-ocr')!)
    const canvas = container.querySelector('.video-annotate-canvas')!
    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 120 })
    fireEvent.pointerUp(canvas, { clientX: 200, clientY: 120 })
    const panel = await findByTestId('ocr-panel')
    const ta = panel.querySelector('.video-annotate-ocr-text') as HTMLTextAreaElement
    expect(ta.value).toContain('识别结果')
    fireEvent.change(ta, { target: { value: '编辑后' } })
    fireEvent.click(panel.querySelector('.video-annotate-ocr-copyall')!)
    await vi.waitFor(() => {
      expect(mocks.clipboardWriteText).toHaveBeenCalledWith('编辑后')
    })
  })

  it('R78.1: layer buttons are disabled without a selection', () => {
    const { container } = render(<AnnotateOverlay source={png} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    const layerBtns = container.querySelectorAll('.video-annotate-layer')
    expect(layerBtns.length).toBe(4)
    layerBtns.forEach(b => expect((b as HTMLButtonElement).disabled).toBe(true))
  })

  it('R79.2: OCR button enters region mode; drag+release recognizes the region', async () => {
    const mocks = setupRendererMocks()
    mocks.ocrRecognize.mockResolvedValue({ ok: true, text: '区域结果', hint: undefined })
    const cv = document.createElement('canvas')
    cv.width = 400; cv.height = 300
    const { container, findByTestId } = render(<AnnotateOverlay source={cv} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    // 点击 OCR 按钮 → 框选模式（遮罩出现）
    fireEvent.click(container.querySelector('.video-annotate-ocr')!)
    expect(container.querySelector('.video-ocr-region-mask')).toBeTruthy()
    // 拖选 (40,40) → (240,160)，松手即识别
    const canvas = container.querySelector('.video-annotate-canvas')!
    fireEvent.pointerDown(canvas, { button: 0, clientX: 40, clientY: 40 })
    fireEvent.pointerMove(canvas, { clientX: 240, clientY: 160 })
    fireEvent.pointerUp(canvas, { clientX: 240, clientY: 160 })
    await findByTestId('ocr-panel')
    expect(mocks.ocrRecognize).toHaveBeenCalledTimes(1)
    expect(String(mocks.ocrRecognize.mock.calls[0][0])).toMatch(/^data:image\//)
    // 面板「整图」按钮 → 再识别一次
    fireEvent.click(container.querySelector('.video-annotate-ocr-full')!)
    await vi.waitFor(() => expect(mocks.ocrRecognize).toHaveBeenCalledTimes(2))
  })

  it('R79.2: Esc exits region mode without recognizing', () => {
    const mocks = setupRendererMocks()
    const cv = document.createElement('canvas')
    cv.width = 400; cv.height = 300
    const { container } = render(<AnnotateOverlay source={cv} onClose={() => {}} onSave={() => {}} onCopy={() => {}} />)
    fireEvent.click(container.querySelector('.video-annotate-ocr')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.video-ocr-region-mask')).toBeNull()
    expect(mocks.ocrRecognize).not.toHaveBeenCalled()
  })
})
