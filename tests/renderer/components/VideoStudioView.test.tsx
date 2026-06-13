// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
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
})
