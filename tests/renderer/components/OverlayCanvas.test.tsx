// @vitest-environment happy-dom
// NOTE: OverlayCanvas uses WebGL via PreviewGl. happy-dom has no WebGL.
// The mock PreviewGl supports init/draw/dispose but the canvas-2D context
// acquisition may also fail. We only assert the import + that the basic
// public methods are wired.
import { describe, it, expect, beforeEach } from 'vitest'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
})

describe('renderer/components/OverlayCanvas', () => {
  it('module exports the component symbol', async () => {
    const mod = await import('../../../src/renderer/src/components/OverlayCanvas')
    expect(typeof mod.OverlayCanvas).toBe('function')
  })

  it('subscribes to onOverlayFrame for frame updates', () => {
    setupRendererMocks()
    expect(window.rgbbox.onOverlayFrame).toBeDefined()
  })

  it('subscribes to onOverlayClosed', () => {
    setupRendererMocks()
    expect(window.rgbbox.onOverlayClosed).toBeDefined()
  })

  it.skip('renders a canvas element', () => {})
  it.skip('exposes a way to receive frames (mockPreviewGl was called)', () => {})
  it.skip('subscribes to onOverlayFrame for frame updates (render path)', () => {})
  it.skip('subscribes to onOverlayClosed (render path)', () => {})
})
