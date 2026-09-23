// @vitest-environment node
// effect3dGl.ts uses WebGLRenderingContext. Per R12.5.5, the test gracefully
// skips if no WebGL context is available in the current Node environment.
//
// R163.1: the shader/draw shells below were unconditional it.skip — they now
// run for real through the headless-gl harness (itGl), with pixel-readback
// assertions per Effect3DGl kind. The global setup's Effect3DGl stub never
// applies here (unmock below — same lesson as previewGl.test.ts).

import { describe, it, expect, vi } from 'vitest'
vi.unmock('../../../src/renderer/src/gl/effect3dGl')
vi.unmock('../../../src/renderer/src/gl/previewGl')
vi.unmock('../../../src/renderer/src/gl/effectGl')

import { itGl, makeGlCanvas, readCenterPixel } from './glHarness'

const KINDS = ['sphere-pulse', 'warp-portal', 'neon-galaxy', 'lava-sphere', 'laser-show', 'hologram'] as const

describe('renderer/gl/effect3dGl', () => {
  it('module exports Effect3DGl class', async () => {
    const mod = await import('../../../src/renderer/src/gl/effect3dGl')
    expect(typeof mod.Effect3DGl).toBe('function')
  })

  it('Effect3DGl has the expected public methods', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    expect(typeof Effect3DGl).toBe('function')
    const proto: any = Effect3DGl.prototype
    expect(Object.getOwnPropertyNames(proto).length).toBeGreaterThan(0)
  })

  // One real compile+draw+readback per kind — the raymarchers differ enough
  // (uniforms, detail/extra channels) that each deserves its own proof.
  for (const kind of KINDS) {
    itGl(`Effect3DGl compiles shaders and renders for ${kind}`, async () => {
      const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
      const W = 64, H = 64
      const { canvas, ctx } = makeGlCanvas(W, H)
      const renderer = new Effect3DGl(canvas, kind)
      renderer.draw(1.25, [0.5, 0.5, 0, 0])
      const [r, g, b] = readCenterPixel(ctx, W, H)
      // Non-black output at the frame center — the kind's raymarch actually
      // lit a fragment (every kind's default framing centers on content).
      expect(r + g + b).toBeGreaterThan(0)
    })
  }

  itGl('Effect3DGl.draw advances frames without GL errors', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    const W = 64, H = 64
    const { canvas, ctx } = makeGlCanvas(W, H)
    const renderer = new Effect3DGl(canvas, 'sphere-pulse')
    for (let frame = 0; frame < 4; frame++) {
      renderer.draw(frame * (1 / 30), [0.5, 0.5, 0, 0])
    }
    expect(ctx.getError()).toBe(0)
    const [r, g, b] = readCenterPixel(ctx, W, H)
    expect(r + g + b).toBeGreaterThan(0)
  })

  itGl('Effect3DGl.dispose releases all GL resources without throwing', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    const { canvas } = makeGlCanvas(32, 32)
    const renderer = new Effect3DGl(canvas, 'warp-portal')
    renderer.draw(0, [0.5, 0.5, 0, 0])
    expect(() => renderer.dispose()).not.toThrow()
  })

  it('Effect3DGl throws when no WebGL context is available', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    const deadCanvas = { getContext: () => null }
    expect(() => new Effect3DGl(deadCanvas, 'sphere-pulse')).toThrow('WebGL not available')
  })
})
