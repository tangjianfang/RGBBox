// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
