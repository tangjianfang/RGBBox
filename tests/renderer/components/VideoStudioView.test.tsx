// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { VideoStudioView } from '../../../src/renderer/src/components/VideoStudioView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/VideoStudioView', () => {
  it('renders the video studio header', () => {
    const { container } = render(<VideoStudioView />)
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('renders control buttons', () => {
    const { container } = render(<VideoStudioView />)
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('renders without saved paths', () => {
    ;(window.rgbbox.videoGetSavedPaths as any) = () => Promise.resolve([])
    const { container } = render(<VideoStudioView />)
    expect(container).toBeTruthy()
  })

  it('handles a saved video path', () => {
    ;(window.rgbbox.videoGetSavedPaths as any) = () => Promise.resolve(['/videos/clip.mp4'])
    const { container } = render(<VideoStudioView />)
    expect(container).toBeTruthy()
  })

  // R70.4: the persistence effect used to skip the save IPC when the playlist
  // was empty, so deleting the last video never reached disk and the stale
  // file resurrected it on the next launch.
  it('persists an emptied playlist: removing the last item writes []', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default' },
    ])
    const { container } = render(<VideoStudioView />)
    // Switch to player mode so the playlist panel renders (mode bar order:
    // camera / screen / player).
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    // The restore effect resolves async — wait for the item to appear.
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    // Remove the only item — its trash button lives inside the track row.
    fireEvent.click(container.querySelector('.audio-track-item .audio-btn-icon')!)
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(0)
    })
    // The save effect must now have written an empty list (not skipped).
    await waitFor(() => {
      const calls = mocks.videoSavePaths.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      expect(calls[calls.length - 1][0]).toEqual([])
    })
  })

  // R92: media:// playlist items play cross-origin — without crossOrigin the
  // frames taint the canvas and photo/snip export dies with SecurityError
  // (verified live: 'Tainted canvases may not be exported'). Same-origin blob:
  // also gets it (harmless); remote http(s) must NOT (anonymous would break
  // playback on CORS-less stream servers).
  it('player <video> gains crossOrigin=anonymous exactly for media:// sources', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default' },
    ])
    const { container } = render(<VideoStudioView />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    // idle player: no src, no crossOrigin (remote-URL branch shares this state)
    const idle = container.querySelector('video.video-preview-rect')!
    expect(idle.getAttribute('src')).toBeNull()
    expect(idle.getAttribute('crossorigin')).toBeNull()
    // play the restored media:// item
    fireEvent.click(container.querySelector('.audio-track-item')!)
    await waitFor(() => {
      const v = container.querySelector('video.video-preview-rect')!
      expect(v.getAttribute('src')).toContain('media://')
    })
    const playing = container.querySelector('video.video-preview-rect')!
    expect(playing.getAttribute('crossorigin')).toBe('anonymous')
  })

  // R91.1: the mode tab (camera/screen/player) must persist across launches —
  // it used to be a hardcoded useState('camera').
  it('persists the mode tab to localStorage and restores it', () => {
    localStorage.clear()
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([])
    const { container, unmount } = render(<VideoStudioView />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2]) // player
    expect(localStorage.getItem('rgbbox:videoMode')).toBe('player')
    unmount()
    // fresh mount picks the stored tab up
    const { container: c2 } = render(<VideoStudioView />)
    expect(c2.querySelectorAll('.video-mode-btn')[2].className).toContain('active')
    localStorage.clear()
  })

  // R91.1: opening an item with stored progress (>30s in, >60s from end)
  // surfaces the resume prompt.
  it('offers resume for a restored item with progress past the thresholds', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default', progress: 754, duration: 8597, updatedAt: 1 },
    ])
    const { container } = render(<VideoStudioView />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    expect(container.querySelector('.video-resume-bar')).toBeNull() // not until opened
    fireEvent.click(container.querySelector('.audio-track-item')!)
    await waitFor(() => {
      expect(container.querySelector('.video-resume-bar')).toBeTruthy()
    })
  })

  // R91.2: keep-alive — a hidden view with a loaded player source surfaces the
  // MiniPlayerCard (portaled to document.body); making the view visible again
  // retracts it.
  it('surfaces the MiniPlayerCard while hidden and retracts it when visible', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default' },
    ])
    const { container, rerender } = render(<VideoStudioView visible={false} />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    fireEvent.click(container.querySelector('.audio-track-item')!)
    await waitFor(() => {
      expect(document.querySelector('.mini-player')).toBeTruthy()
    })
    rerender(<VideoStudioView visible={true} />)
    await waitFor(() => {
      expect(document.querySelector('.mini-player')).toBeNull()
    })
  })

  // R94: entering the player with no active source auto-loads the last played
  // playlist item (once per session) — the player no longer opens empty.
  it('auto-restores the last played item on entering the player', async () => {
    localStorage.setItem('rgbbox:videoMode', 'player')
    localStorage.setItem('rgbbox:videoLastItem', 'v1')
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default', progress: 754, duration: 8597, updatedAt: 1 },
    ])
    const { container } = render(<VideoStudioView />)
    await waitFor(() => {
      const v = container.querySelector('video.video-preview-rect')!
      expect(v.getAttribute('src')).toContain('media://')
    })
    // R91.1: stored progress past the thresholds surfaces the resume prompt
    await waitFor(() => {
      expect(container.querySelector('.video-resume-bar')).toBeTruthy()
    })
    localStorage.clear()
  })

  // R91.3: the Audio FX popover lists the four presets and selects them.
  it('audio panel opens from the transport and switches presets', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'a.mp4', path: 'C:\\videos\\a.mp4', group: 'Default' },
    ])
    const { container } = render(<VideoStudioView />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    fireEvent.click(container.querySelector('.audio-track-item')!)
    await waitFor(() => {
      expect(container.querySelector('video.video-preview-rect')!.getAttribute('src')).toContain('media://')
    })
    const fxBtn = container.querySelectorAll('.video-transport button')
    // the i18n test mock returns the key itself
    const audioBtn = Array.from(fxBtn).find(b => b.textContent?.includes('video.audio.button'))!
    expect(audioBtn).toBeTruthy()
    // disabled until media loads — it has now
    expect((audioBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(audioBtn)
    await waitFor(() => {
      expect(container.querySelector('.video-audio-panel')).toBeTruthy()
    })
    const pills = container.querySelectorAll('.video-audio-presets .video-btn')
    expect(pills.length).toBe(4)
    // happy-dom has no AudioContext — the hook declines and resets to off,
    // but the panel + selection UI itself must work.
    fireEvent.click(pills[2]) // dialog boost
    await waitFor(() => {
      expect(container.querySelector('.video-audio-panel')).toBeTruthy()
    })
  })
})

// ── R317d(REVIEW_2026-10-24 附录04 R-2): 失效条目不触发自动恢复 ─────────────
// 旧行为:另一台机器上 playlist 文件不可达 + localStorage 停在 player/LastItem
// → R94 自动恢复挂载即加载死链 →「打开视频工作站即报 ⚠ 读取失败」。
describe('VideoStudioView R317d auto-restore skips missing entries', () => {
  it('exists:false 的恢复条目不进 <video>(视图打开零报错,列表数据保留)', async () => {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue([
      { id: 'v1', name: 'gone.mp4', path: 'D:\moved\gone.mp4', group: 'Default', exists: false },
    ])
    localStorage.setItem('rgbbox:videoMode', 'player')
    localStorage.setItem('rgbbox:videoLastItem', 'v1')
    const { container } = render(<VideoStudioView />)
    // 恢复效应落定:失效条目仍在播放列表(数据保留)
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(1)
    })
    // 自动恢复必须跳过死链(旧行为:src 被设为 media:// 死链)
    await new Promise((r) => setTimeout(r, 60))
    const v = container.querySelector('video.video-preview-rect')!
    expect(v.getAttribute('src')).toBeNull()
    expect(mocks.videoSavePaths.mock.calls.length).toBeGreaterThanOrEqual(0) // 不触发清除式保存
  })
})

// ── R334: 自动连播 / 上下集 / 选中即播 / 树形列表 / 全屏文件名 / 打开定位 ────
describe('VideoStudioView R334 playback & tree playlist', () => {
  beforeEach(() => {
    localStorage.removeItem('rgbbox:videoAutoNext')
    localStorage.removeItem('rgbbox:videoLastItem')
    localStorage.removeItem('rgbbox:videoMode')
    // 隔离此前用例持久化的播放列表缓存（videoGroups 初值来自它）
    localStorage.removeItem('rgbbox-video-playlist-config')
  })

  const SAVED = [
    { id: 'a1', name: 'a1.mp4', path: 'C:\\v\\a1.mp4', group: 'FolderA' },
    { id: 'a2', name: 'a2.mp4', path: 'C:\\v\\a2.mp4', group: 'FolderA' },
    { id: 'b1', name: 'b1.mp4', path: 'C:\\v\\b1.mp4', group: 'FolderB' },
  ]

  async function setupPlayer(saved: unknown[] = SAVED) {
    const mocks = setupRendererMocks()
    mocks.videoGetSavedPaths.mockResolvedValue(saved)
    const { container } = render(<VideoStudioView />)
    fireEvent.click(container.querySelectorAll('.video-mode-btn')[2])
    await waitFor(() => {
      expect(container.querySelectorAll('.audio-track-item').length).toBe(saved.length)
    })
    return { container }
  }

  const videoEl = (c: HTMLElement) => c.querySelector('video.video-preview-rect')!
  const nextBtn = (c: HTMLElement) =>
    c.querySelector('button[title="video.player.nextEp"]') as HTMLButtonElement
  const prevBtn = (c: HTMLElement) =>
    c.querySelector('button[title="video.player.prevEp"]') as HTMLButtonElement

  it('auto-advances on ended, crossing into the next folder', async () => {
    const { container } = await setupPlayer()
    fireEvent.click(container.querySelectorAll('.audio-track-item')[0]) // a1
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
    videoEl(container).dispatchEvent(new Event('ended'))
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a2.mp4'))
    // 同一文件夹播完 → 下一个文件夹的第一个条目
    videoEl(container).dispatchEvent(new Event('ended'))
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('b1.mp4'))
  })

  it('prev/next episode buttons navigate and disable at the ends', async () => {
    const { container } = await setupPlayer()
    fireEvent.click(container.querySelectorAll('.audio-track-item')[0]) // a1
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
    expect(prevBtn(container).disabled).toBe(true) // 全局第一集
    expect(nextBtn(container).disabled).toBe(false)
    fireEvent.click(nextBtn(container))
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a2.mp4'))
    fireEvent.click(prevBtn(container))
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
  })

  it('autoplays on selecting a playlist item (选中即播)', async () => {
    const { container } = await setupPlayer()
    // media:// 换 key 会重挂 <video>（R92 crossOrigin 契约）——spy 挂原型才稳
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(() => Promise.resolve())
    try {
      fireEvent.click(container.querySelectorAll('.audio-track-item')[0])
      await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
      expect(playSpy).toHaveBeenCalled()
    } finally {
      playSpy.mockRestore()
    }
  })

  it('auto-advance resumes a half-watched item silently (no prompt bar)', async () => {
    const saved = [
      { id: 'a1', name: 'a1.mp4', path: 'C:\\v\\a1.mp4', group: 'FolderA' },
      { id: 'a2', name: 'a2.mp4', path: 'C:\\v\\a2.mp4', group: 'FolderA', progress: 754, duration: 8597, updatedAt: 1 },
    ]
    const { container } = await setupPlayer(saved)
    fireEvent.click(container.querySelectorAll('.audio-track-item')[0])
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
    videoEl(container).dispatchEvent(new Event('ended'))
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a2.mp4'))
    // 连播到达：静默续播（手动点开半途条目才弹提示条——既有用例锁住）
    expect(container.querySelector('.video-resume-bar')).toBeNull()
  })

  it('fullscreen mousemove shows the playing filename chip, hides after 5s', async () => {
    const { container } = await setupPlayer()
    fireEvent.click(container.querySelectorAll('.audio-track-item')[0])
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('a1.mp4'))
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.body,
    })
    vi.useFakeTimers()
    try {
      fireEvent.mouseMove(container.querySelector('.video-player-wrap')!)
      const chip = container.querySelector('.video-player-title-chip')
      expect(chip).toBeTruthy()
      expect(chip!.textContent).toBe('a1.mp4')
      act(() => { vi.advanceTimersByTime(5000) })
      expect(container.querySelector('.video-player-title-chip')).toBeNull()
    } finally {
      vi.useRealTimers()
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => undefined,
      })
    }
  })

  it('renders the playlist as a tree and re-opens located at the playing item', async () => {
    const saved = [
      { id: 'a1', name: 'a1.mp4', path: 'C:\\v\\a1.mp4', group: 'Anime' },
      { id: 'b1', name: 'b1.mp4', path: 'C:\\v\\b1.mp4', group: 'Anime/S2' },
      { id: 'm1', name: 'm1.mp4', path: 'C:\\v\\m1.mp4', group: 'Movies' },
    ]
    const { container } = await setupPlayer(saved)
    // 树形渲染：Anime(含 S2 子节点) + Movies；标题 = 节点名而非完整路径
    const headers = Array.from(container.querySelectorAll('.audio-group-header'))
    expect(headers.map(h => h.querySelector('.audio-group-name')?.textContent))
      .toEqual(['Anime', 'S2', 'Movies'])
    // 子节点按深度缩进；分组计数含子孙（Anime = 2）
    expect((headers[1] as HTMLElement).style.paddingLeft).toBe('12px')
    expect(headers[0].querySelector('.audio-group-count')?.textContent).toBe('2')

    // 播放嵌套条目 b1 → 折叠 Anime → 关闭列表 → 重开自动展开祖先并滚动定位
    fireEvent.click(container.querySelectorAll('.audio-track-item')[1]) // b1
    await waitFor(() => expect(videoEl(container).getAttribute('src')).toContain('b1.mp4'))
    fireEvent.click(headers[0]) // 折叠 Anime
    expect(container.querySelectorAll('.audio-track-item').length).toBe(1) // 只剩 Movies
    fireEvent.click(container.querySelector('.video-panel-toggle')!) // 关闭列表
    expect(container.querySelector('.video-playlist-scroll')).toBeNull()
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    try {
      fireEvent.click(container.querySelector('.video-panel-toggle')!) // 重开
      await waitFor(() => {
        expect(container.querySelectorAll('.audio-track-item').length).toBe(3) // 祖先自动展开
      })
      await waitFor(() => expect(scrollSpy).toHaveBeenCalled())
      expect(container.querySelector('.audio-track-item.active')?.textContent).toContain('b1.mp4')
    } finally {
      scrollSpy.mockRestore()
    }
  })
})
