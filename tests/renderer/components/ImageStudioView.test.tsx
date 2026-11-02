// @vitest-environment happy-dom
// R333: 图片工作站 — 迁出 VideoStudioView 的取帧/截图/标注/胶片栏编排的
// 入口接线用例。crossOrigin 断言自 VideoStudioView.test.tsx 迁移（R92：只有
// media://与 blob: 源设 anonymous——没有它 canvas 导出必 SecurityError；
// 远程 http(s) 不设——强设会播不了无 CORS 的流服务器）。
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ImageStudioView } from '../../../src/renderer/src/components/ImageStudioView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
  localStorage.clear()
})

describe('renderer/components/ImageStudioView', () => {
  it('renders the studio header and mode bar', () => {
    const { container } = render(<ImageStudioView />)
    expect(container.querySelector('.images-studio')).toBeTruthy()
    expect(container.querySelectorAll('.video-mode-btn').length).toBe(3)
    expect(container.querySelector('.images-layout')).toBeTruthy()
  })

  // 取帧入口：无源时拍照/框选按钮不渲染（hasSource 门控）；源加载后出现。
  it('shows the photo / region-snip buttons only once a source is loaded', async () => {
    const { container } = render(<ImageStudioView />)
    expect(container.textContent).not.toContain('video.photo')
    const input = container.querySelector('input.video-url-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'media://local?p=x.mp4' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      const btns = Array.from(container.querySelectorAll('.video-transport button'))
        .filter((b) => b.textContent?.includes('video.photo'))
      expect(btns.length).toBe(1)
    })
    // 框选按钮同批出现，idle 态可点（仅 snipActive 时禁用）
    const snipBtn = Array.from(container.querySelectorAll('.video-transport button'))
      .find((b) => b.textContent?.includes('video.snip.button'))
    expect(snipBtn).toBeTruthy()
    expect((snipBtn as HTMLButtonElement).disabled).toBe(false)
  })

  // R92（自 VideoStudioView 迁移）：media:// 与 blob: 源必须 crossOrigin=
  // anonymous 才能导出像素；远程 http(s) 保持 No-CORS。
  it('frame-source <video> gains crossOrigin=anonymous exactly for media:// sources', async () => {
    const { container } = render(<ImageStudioView />)
    // idle: no src, no crossOrigin
    const idle = container.querySelector('video.video-preview-rect')!
    expect(idle.getAttribute('src')).toBeNull()
    expect(idle.getAttribute('crossorigin')).toBeNull()
    // remote https URL: direct bind, NO crossOrigin
    const input = container.querySelector('input.video-url-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com/stream.mp4' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(container.querySelector('video.video-preview-rect')!.getAttribute('src')).toContain('https://')
    })
    expect(container.querySelector('video.video-preview-rect')!.getAttribute('crossorigin')).toBeNull()
    // media:// source: anonymous
    fireEvent.change(input, { target: { value: 'media://local?p=x.mp4' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(container.querySelector('video.video-preview-rect')!.getAttribute('src')).toContain('media://')
    })
    expect(container.querySelector('video.video-preview-rect')!.getAttribute('crossorigin')).toBe('anonymous')
  })

  // R77.1 胶片栏接线（自 VideoStudioView 迁移）：onEdit → capturesRead →
  // AnnotateOverlay 打开。
  it('filmstrip edit opens the annotator via capturesRead', async () => {
    const mocks = setupRendererMocks()
    mocks.capturesList.mockResolvedValue([
      { id: 'c1', file: 'C:\\cap\\x.png', name: 'x.png', ts: 1, kind: 'photo' },
    ])
    const { container } = render(<ImageStudioView />)
    await waitFor(() => {
      expect(container.querySelector('.video-filmstrip-edit')).toBeTruthy()
    })
    fireEvent.click(container.querySelector('.video-filmstrip-edit')!)
    await waitFor(() => {
      expect(mocks.capturesRead).toHaveBeenCalledWith('c1')
    })
    await waitFor(() => {
      expect(container.querySelector('.video-annotate-overlay')).toBeTruthy()
    })
  })

  // R333: 全局截图按钮走新通道 rgbbox:snip:start（主进程 startSnip 与托盘/热键同源）。
  it('global snip button invokes window.rgbbox.snipStart', () => {
    const mocks = setupRendererMocks()
    const { container } = render(<ImageStudioView />)
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('images.globalSnip'))
    expect(btn).toBeTruthy()
    fireEvent.click(btn!)
    expect(mocks.snipStart).toHaveBeenCalledTimes(1)
  })

  // R290.2（自 VideoStudioView 迁移）：窗口源卡片按钮 → snipCaptureWindow 句柄直出。
  it('window source card shot button calls snipCaptureWindow', async () => {
    const mocks = setupRendererMocks()
    mocks.getCaptureSources.mockResolvedValue([
      { id: 'win1', name: 'Notepad', type: 'window', thumbnail: null },
    ])
    const { container } = render(<ImageStudioView />)
    // mode bar order: video / camera / screen
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelector('.video-source-shot')).toBeTruthy()
    })
    fireEvent.click(container.querySelector('.video-source-shot')!)
    await waitFor(() => {
      expect(mocks.snipCaptureWindow).toHaveBeenCalledWith('win1')
    })
  })
})
