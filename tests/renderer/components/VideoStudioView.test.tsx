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
})
