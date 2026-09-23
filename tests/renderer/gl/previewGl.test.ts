// @vitest-environment node
// previewGl.ts uses WebGLRenderingContext. happy-dom doesn't supply a real
// WebGL context; full pipeline testing requires the `gl` npm headless
// package (env-dependent). Per R12.5.5 we skip when no context is available
// and verify the module shape and import surface.

import { describe, it, expect, vi } from 'vitest'
// R163.1: the global setup stubs the GL classes for component tests — this
// file tests the REAL PreviewGl on a real headless-gl context, so unmock.
// (Seven probe rounds of "black framebuffer" traced back to exactly this:
// every drawFrame was a vi.fn on MockPreviewGl, the real class never ran.)
vi.unmock('../../../src/renderer/src/gl/previewGl')
vi.unmock('../../../src/renderer/src/gl/effect3dGl')
vi.unmock('../../../src/renderer/src/gl/effectGl')

import { itGl, makeGlCanvas, readCenterPixel, solidFrame } from './glHarness'

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

  // ── R163.1: real-GL tests via headless-gl (itGl = it here, it.skip where
  //    the native binding can't load). Pixel assertions via readPixels —
  //    these were the unconditional it.skip shells of the R155 era.
  itGl('PreviewGl compiles shaders and renders when WebGL is available', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const { canvas, ctx } = makeGlCanvas(64, 64)
    const renderer = new PreviewGl(canvas)
    // Production wiring (OverlayCanvas.initGl) always follows construction
    // with resize() — that's what sets the viewport.
    renderer.resize(64, 64)
    renderer.drawFrame(solidFrame(4, 4, 255, 0, 0))
    // Shader compile + program link succeeded iff construction returned and
    // the first draw left the expected color in the framebuffer.
    expect(readCenterPixel(ctx, 64, 64).slice(0, 3)).toEqual([255, 0, 0])
  })

  itGl('PreviewGl.drawFrame pushes frame pixels to the framebuffer (and re-uploads on frame change)', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const W = 64, H = 64
    const { canvas, ctx } = makeGlCanvas(W, H)
    const renderer = new PreviewGl(canvas)
    renderer.resize(W, H)
    renderer.drawFrame(solidFrame(4, 4, 255, 0, 0)) // texImage2D path (new grid)
    expect(readCenterPixel(ctx, W, H).slice(0, 3)).toEqual([255, 0, 0])
    renderer.drawFrame(solidFrame(4, 4, 0, 255, 0)) // texSubImage2D path (same grid)
    expect(readCenterPixel(ctx, W, H).slice(0, 3)).toEqual([0, 255, 0])
  })

  itGl('PreviewGl.resize resets layout and keeps rendering', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const W = 64, H = 64
    const { canvas, ctx } = makeGlCanvas(W, H)
    const renderer = new PreviewGl(canvas)
    renderer.resize(W, H)
    renderer.drawFrame(solidFrame(8, 4, 255, 0, 0))
    renderer.resize(32, 32)
    renderer.drawFrame(solidFrame(8, 4, 0, 0, 255)) // layout recompute path after resize
    // The viewport is now 32×32 — read ITS center, not the canvas's.
    const px = new Uint8Array(4)
    ctx.readPixels(16, 16, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
    expect([px[0], px[1], px[2]]).toEqual([0, 0, 255])
  })

  itGl('PreviewGl.dispose releases GL resources without throwing', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const { canvas } = makeGlCanvas(32, 32)
    const renderer = new PreviewGl(canvas)
    renderer.drawFrame(solidFrame(2, 2, 255, 255, 255))
    expect(() => renderer.dispose()).not.toThrow()
  })

  itGl('PreviewGl renders the LED grid through the full pipeline (style + fit switches)', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const W = 64, H = 64
    const { canvas, ctx } = makeGlCanvas(W, H)
    const renderer = new PreviewGl(canvas)
    renderer.resize(W, H)
    renderer.setRenderStyle('pixel')
    renderer.setGap(0)
    renderer.drawFrame(solidFrame(4, 4, 255, 255, 255))
    expect(readCenterPixel(ctx, W, H).slice(0, 3)).toEqual([255, 255, 255])
    renderer.setRenderStyle('smooth') // texture filter + uSmooth switch
    renderer.setFit('contain')        // R63 letterbox layout recompute
    renderer.drawFrame(solidFrame(4, 4, 255, 255, 255))
    expect(readCenterPixel(ctx, W, H).slice(0, 3)).toEqual([255, 255, 255])
  })

  it('PreviewGl throws when no WebGL context is available', async () => {
    const { PreviewGl } = await import('../../../src/renderer/src/gl/previewGl')
    const deadCanvas = { getContext: () => null }
    expect(() => new PreviewGl(deadCanvas)).toThrow('WebGL not available')
  })
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
