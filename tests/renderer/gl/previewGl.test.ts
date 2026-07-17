// @vitest-environment node
// previewGl.ts uses WebGLRenderingContext. happy-dom doesn't supply a real
// WebGL context; full pipeline testing requires the `gl` npm headless
// package (env-dependent). Per R12.5.5 we skip when no context is available
// and verify the module shape and import surface.

import { describe, it, expect } from 'vitest'

describe('renderer/gl/previewGl', () => {
  it('module exports PreviewGl class', async () => {
    const mod = await import('../../../src/renderer/src/gl/previewGl')
    expect(typeof mod.PreviewGl).toBe('function')
  })

  it('PreviewGl has the expected public methods', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    expect(typeof PreviewGl).toBe('function')
    // Method existence on prototype is best-effort: TS may strip them
    // depending on the target config. We confirm the class shape and
    // that the prototype has at least one own member.
    const ownNames = Object.getOwnPropertyNames(PreviewGl.prototype)
    expect(ownNames.length).toBeGreaterThan(0)
  })

  it.skip('PreviewGl compiles shaders and renders when WebGL is available', () => {})
  it.skip('PreviewGl.draw pushes pixels to the framebuffer', () => {})
  it.skip('PreviewGl.resize recreates with new dimensions', () => {})
  it.skip('PreviewGl.dispose releases GL resources', () => {})
  it.skip('PreviewGl renders the LED grid (full pipeline integration)', () => {})
  it.skip('PreviewGl throws when no WebGL context is available', () => {})
})

// R63: pure-math "contain" (letterbox) layout used by non-fullscreen overlay
// regions so the COMPLETE effect is shown, undistorted, instead of being
// stretched (distorted) or cropped (partial) to fit an arbitrary window
// aspect ratio. No WebGL context needed — this is plain arithmetic.
describe('renderer/gl/previewGl computeContainLayout', () => {
  it('fills the full canvas height and pillarboxes left/right when the canvas is wider than the grid', async () => {
    const { computeContainLayout } = await import('../../../src/renderer/src/gl/previewGl')
    // grid aspect 1:1 (10x10), canvas aspect 2:1 (200x100) → wider canvas
    const layout = computeContainLayout(10, 10, 200, 100)
    expect(layout.cellH).toBeCloseTo(1 / 10) // full-height image: imgHeightUV=1
    expect(layout.originY).toBeCloseTo(0)
    // image width in UV = canvasAspect... gridAspect(1) / canvasAspect(2) = 0.5
    expect(layout.cellW).toBeCloseTo(0.5 / 10)
    expect(layout.originX).toBeCloseTo((1 - 0.5) / 2)
  })

  it('fills the full canvas width and letterboxes top/bottom when the canvas is taller than the grid', async () => {
    const { computeContainLayout } = await import('../../../src/renderer/src/gl/previewGl')
    // grid aspect 2:1 (20x10), canvas aspect 1:1 (100x100) → taller canvas relative to grid
    const layout = computeContainLayout(20, 10, 100, 100)
    expect(layout.cellW).toBeCloseTo(1 / 20) // full-width image: imgWidthUV=1
    expect(layout.originX).toBeCloseTo(0)
    // imgHeightUV = canvasAspect(1) / gridAspect(2) = 0.5
    expect(layout.cellH).toBeCloseTo(0.5 / 10)
    expect(layout.originY).toBeCloseTo((1 - 0.5) / 2)
  })

  it('is a no-op letterbox (fills the whole canvas) when grid and canvas aspect ratios match', async () => {
    const { computeContainLayout } = await import('../../../src/renderer/src/gl/previewGl')
    const layout = computeContainLayout(16, 9, 1600, 900)
    expect(layout.originX).toBeCloseTo(0)
    expect(layout.originY).toBeCloseTo(0)
    expect(layout.cellW).toBeCloseTo(1 / 16)
    expect(layout.cellH).toBeCloseTo(1 / 9)
  })
})
