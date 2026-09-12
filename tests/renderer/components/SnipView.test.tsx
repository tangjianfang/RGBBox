// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SnipView } from '../../../src/renderer/src/components/SnipView'
import { setupRendererMocks } from '../_helpers'

// happy-dom 的 Image 不触发 onload —— 用微任务 stub 让冻结帧"解码"完成
class FakeImage {
  onload: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 300
  set src(_v: string) { queueMicrotask(() => this.onload?.()) }
}

beforeEach(() => {
  setupRendererMocks()
  cleanup()
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
})
afterEach(() => vi.unstubAllGlobals())

describe('SnipView select phase (R80.5)', () => {
  it('loads frame and enters select state (mask + hint)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(container.querySelector('.snip-hint')).toBeTruthy()
  })

  it('drag ≥8px enters annotate phase (AnnotateOverlay mounted)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
  })

  it('drag <8px stays in select state, no annotator', async () => {
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(mask, { clientX: 54, clientY: 53 })
    fireEvent.pointerUp(mask, { clientX: 54, clientY: 53 })
    await new Promise(r => setTimeout(r, 20))
    expect(container.querySelector('.video-annotate-overlay')).toBeNull()
    expect(container.querySelector('.snip-mask')).toBeTruthy()
  })

  it('ESC in select phase cancels the session', async () => {
    const mocks = setupRendererMocks()
    render(<SnipView displayId={1} />)
    await waitFor(() => expect(document.querySelector('.snip-mask')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mocks.snipCancel).toHaveBeenCalledTimes(1)
  })

  it('contextmenu (right-click) cancels the session', async () => {
    const mocks = setupRendererMocks()
    render(<SnipView displayId={1} />)
    await waitFor(() => expect(document.querySelector('.snip-mask')).toBeTruthy())
    fireEvent.contextMenu(window)
    expect(mocks.snipCancel).toHaveBeenCalledTimes(1)
  })

  async function enterAnnotate(container: HTMLElement): Promise<void> {
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
  }

  it('R80.6: × closes annotator back to select state (session alive)', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(mocks.snipCancel).not.toHaveBeenCalled()
  })

  it('R80.6: save → snipFinish(save) then snipCancel', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledTimes(1))
    expect(mocks.snipFinish.mock.calls[0][1]).toBe('save')
    await waitFor(() => expect(mocks.snipCancel).toHaveBeenCalledTimes(1))
  })

  it('R80.6: copy → snipFinish(copy)', async () => {
    const mocks = setupRendererMocks()
    const { container } = render(<SnipView displayId={1} />)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-copy')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledWith(expect.stringMatching(/^data:image\//), 'copy'))
  })
})
