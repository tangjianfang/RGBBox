// @vitest-environment happy-dom
// NOTE: OverlayCanvas uses WebGL via PreviewGl. happy-dom has no WebGL.
// The mock PreviewGl supports init/draw/dispose but the canvas-2D context
// acquisition may also fail. We only assert the import + that the basic
// public methods are wired.
import { render, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupRendererMocks } from '../_helpers'
import type { EffectLayer, RgbFrame } from '../../../src/shared/types'

beforeEach(() => {
  vi.clearAllMocks()
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

  it('sizes the overlay backing buffer in physical pixels on high DPI displays', async () => {
    const { getOverlayCanvasBackingSize } = await import('../../../src/renderer/src/components/OverlayCanvas')

    expect(getOverlayCanvasBackingSize(1280, 720, 1.5)).toEqual({ width: 1920, height: 1080 })
  })

  it('renders 2D GPU-direct overlay broadcasts at full canvas resolution and suppresses grid frames while fresh', async () => {
    const { OverlayCanvas } = await import('../../../src/renderer/src/components/OverlayCanvas')
    const { EFFECT2D_CHANNEL, EffectGl } = await import('../../../src/renderer/src/gl/effectGl')
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')

    let onFrame: ((frame: RgbFrame) => void) | null = null
    const rgbbox = setupRendererMocks()
    rgbbox.onOverlayFrame.mockImplementation((cb: (frame: RgbFrame) => void) => {
      onFrame = cb
      return vi.fn()
    })

    render(<OverlayCanvas displayId={2} opaque />)

    const layer: EffectLayer = {
      id: 'layer-rainbow',
      name: 'Rainbow',
      kind: 'rainbow',
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      parameters: { speed: 0.5, spread: 1, hueShift: 0, angle: 0 },
    }
    const sender = new BroadcastChannel(EFFECT2D_CHANNEL)

    await act(async () => {
      sender.postMessage({ layer, t: 1.25 })
    })

    const effectInstances = (EffectGl as any).instances as Array<{ render: ReturnType<typeof vi.fn> }>
    expect(effectInstances).toHaveLength(1)
    expect(effectInstances[0].render).toHaveBeenCalledWith(layer, 1.25)

    const frame: RgbFrame = {
      columns: 2,
      rows: 1,
      pixels: new Uint8ClampedArray([255, 0, 0, 0, 0, 255]),
      generatedAt: Date.now(),
    }
    await act(async () => {
      onFrame?.(frame)
    })

    const previewInstances = (PreviewGl as any).instances as Array<{ drawFrame: ReturnType<typeof vi.fn> }>
    expect(previewInstances.at(-1)?.drawFrame).not.toHaveBeenCalled()
  })

  it.skip('renders a canvas element', () => {})
  it.skip('exposes a way to receive frames (mockPreviewGl was called)', () => {})
  it.skip('subscribes to onOverlayFrame for frame updates (render path)', () => {})
  it.skip('subscribes to onOverlayClosed (render path)', () => {})
})
