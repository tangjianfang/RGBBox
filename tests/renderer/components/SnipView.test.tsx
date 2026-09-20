// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { SnipView } from '../../../src/renderer/src/components/SnipView'
import { setupRendererMocks } from '../_helpers'

// R130.3: 冻结帧改主进程推送 —— 用例接管 snipOnFrame 回调后按需推帧
type PushFrame = (frame: { width: number; height: number; data: Uint8Array }) => void
let pushFrame: PushFrame | null = null
// 注意：mocks 必须在 beforeEach 统一创建 —— 测试内再调 setupRendererMocks() 会
// 整个替换 window.rgbbox 对象，把这里接管好的 snipOnFrame 推送回调冲掉
let mocks: ReturnType<typeof setupRendererMocks>

beforeEach(() => {
  mocks = setupRendererMocks()
  cleanup()
  pushFrame = null
  ;(window as unknown as { rgbbox: Record<string, unknown> }).rgbbox.snipOnFrame =
    (cb: PushFrame) => { pushFrame = cb; return () => { pushFrame = null } }
})

/** 模拟主进程推送一帧全不透明 BGRA 位图。 */
function pushTestFrame(w = 400, h = 300): void {
  const data = new Uint8Array(w * h * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  act(() => { pushFrame?.({ width: w, height: h, data }) })
}

describe('SnipView select phase (R80.5 / R130.3)', () => {
  it('frame push → enters select state (mask + hint) and acks painted once', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(container.querySelector('.snip-hint')).toBeTruthy()
    expect(mocks.snipAckPainted).toHaveBeenCalledTimes(1)
  })

  it('R130.5: shutter flash mounts on first painted frame, removes on animationend', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    const flash = await waitFor(() => container.querySelector('.snip-flash') as HTMLDivElement)
    expect(flash).toBeTruthy()
    fireEvent.animationEnd(flash)
    await waitFor(() => expect(container.querySelector('.snip-flash')).toBeNull())
  })

  it('R130.5: flash does NOT replay when returning from annotator', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    const flash = await waitFor(() => container.querySelector('.snip-flash') as HTMLDivElement)
    fireEvent.animationEnd(flash)
    await waitFor(() => expect(container.querySelector('.snip-flash')).toBeNull())
    // 进标注 → × 关回拖选态 —— 白闪不再重播
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(container.querySelector('.snip-flash')).toBeNull()
  })

  it('R112.2: hint row exposes an X button that cancels the session', async () => {
    const cancelSpy = vi.fn(() => Promise.resolve())
    ;(window as unknown as { rgbbox: Record<string, () => unknown> }).rgbbox.snipCancel = cancelSpy
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const close = container.querySelector('button.snip-hint-close') as HTMLButtonElement | null
    expect(close).toBeTruthy()
    fireEvent.click(close as HTMLButtonElement)
    expect(cancelSpy).toHaveBeenCalledTimes(1)
  })

  it('drag ≥8px enters annotate phase (AnnotateOverlay mounted)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    fireEvent.pointerUp(mask, { clientX: 120, clientY: 90 })
    await waitFor(() => expect(container.querySelector('.video-annotate-overlay')).toBeTruthy())
  })

  it('R80.11: dragging carves a real hole (evenodd path), no opaque black rect; dim is light', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    const mask = container.querySelector('.snip-mask') as SVGSVGElement
    fireEvent.pointerDown(mask, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mask, { clientX: 120, clientY: 90 })
    // 选区内必须透亮：不允许任何不透明黑 rect（回归钉子：曾经用黑 rect 盖底 → 选区全黑）
    mask.querySelectorAll('rect').forEach(r => expect(r.getAttribute('fill')).not.toBe('black'))
    // 挖洞 = evenodd 路径（外框 + 选区两个子路径）
    const path = mask.querySelector('path') as SVGPathElement
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
    expect((path.getAttribute('d') ?? '').split('M').length).toBe(3)
    // 暗幕减淡（R80.11: 只需一点暗）
    expect(path.getAttribute('fill')).toBe('rgba(0,0,0,0.18)')
  })

  it('drag <8px stays in select state, no annotator', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
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
    render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(document.querySelector('.snip-mask')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mocks.snipCancel).toHaveBeenCalledTimes(1)
  })

  it('contextmenu (right-click) cancels the session', async () => {
    render(<SnipView displayId={1} />)
    pushTestFrame()
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
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-close')!)
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    expect(mocks.snipCancel).not.toHaveBeenCalled()
  })

  it('R80.6: save → snipFinish(save) then snipCancel', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-save')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledTimes(1))
    expect(mocks.snipFinish.mock.calls[0][1]).toBe('save')
    await waitFor(() => expect(mocks.snipCancel).toHaveBeenCalledTimes(1))
  })

  it('R80.6: copy → snipFinish(copy)', async () => {
    const { container } = render(<SnipView displayId={1} />)
    pushTestFrame()
    await waitFor(() => expect(container.querySelector('.snip-mask')).toBeTruthy())
    await enterAnnotate(container)
    fireEvent.click(container.querySelector('.video-annotate-copy')!)
    await waitFor(() => expect(mocks.snipFinish).toHaveBeenCalledWith(expect.stringMatching(/^data:image\//), 'copy'))
  })
})
