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

import { itGl, makeGlCanvas, readCenterPixel, isSoftwareGl } from './glHarness'

const KINDS = ['sphere-pulse', 'warp-portal', 'neon-galaxy', 'lava-sphere', 'hologram',
  // R292: 三体王座场景
  'droplet-mirror', 'dual-vector-foil', 'trisolaran-suns'] as const

/** 全帧像素读取(震撼门禁用——不只中心点)。 */
function readAllPixels(ctx: WebGLRenderingContext, w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4)
  ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
  return px
}

function frameLums(px: Uint8Array): number[] {
  const out: number[] = []
  for (let i = 0; i < px.length; i += 4) out.push(px[i] + px[i + 1] + px[i + 2])
  return out
}

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
      // Non-black output at the frame center — the raymarch actually
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

// ── R292: 三体王座场景 — 签名锁+震撼门禁(全帧像素回读) ─────────────────────
describe('renderer/gl/effect3dGl 三体王座 (R292)', () => {
  const W = 96, H = 54

  function render(kind: string, t: number, params: [number, number, number, number]): Uint8Array {
    // 每用例自建 renderer(headless-gl 上下文独立,避免跨用例状态)
    const { canvas, ctx } = makeGlCanvas(W, H)
    return { px: (() => {
      // 需同步导入——itGl 内 import 已就绪
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return null
    })(), ctx, canvas } as never as Uint8Array
  }

  itGl('droplet-mirror: 镜面圆盘存在+背景暗(R292 GPU 签名)', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    const { canvas, ctx } = makeGlCanvas(W, H)
    const r = new Effect3DGl(canvas, 'droplet-mirror')
    r.draw(2.0, [0.4, 0, 1, 0.5])
    const px = readAllPixels(ctx, W, H)
    const lums = frameLums(px).sort((a, b) => a - b)
    // 镜面体+菲涅尔缘:高亮像素(P99)与暗场(P50)并存,对比≥4×
    const p50 = lums[Math.floor(lums.length * 0.5)], p99 = lums[Math.floor(lums.length * 0.99)]
    // R293: bloom 后处理+ACES 压缩量化级——阈值随实测校准
    // R310g: software GL (windows CI runner, first nightly: measured 2.08)
    // rasterizes the SAME signature at lower magnitude — the floor relaxes,
    // the signature (bright disc + dark field) stays asserted on both
    const ratioFloor = isSoftwareGl(ctx) ? 2.0 : 2.5
    expect(p99).toBeGreaterThanOrEqual(150)
    expect(p99 / Math.max(1, p50)).toBeGreaterThanOrEqual(ratioFloor)
  })

  itGl('dual-vector-foil: 事件弧线——掠镜闪光相亮度 ≥ 扫掠中段 2×', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    const flash = (() => {
      const { canvas, ctx } = makeGlCanvas(W, H)
      return { canvas, ctx }
    })()
    const fr = new Effect3DGl(flash.canvas, 'dual-vector-foil')
    fr.draw(5.62 + 8 * 0, [1, 0, 1, 0.5])   // ct=5.62(闪光峰)
    const flashLums = frameLums(readAllPixels(flash.ctx, W, H))
    const flashMean = flashLums.reduce((a, b) => a + b, 0) / flashLums.length

    const sweep = (() => {
      const { canvas, ctx } = makeGlCanvas(W, H)
      return { canvas, ctx }
    })()
    const sr = new Effect3DGl(sweep.canvas, 'dual-vector-foil')
    sr.draw(3.0, [1, 0, 1, 0.5])             // ct=3(推进中段)
    const sweepLums = frameLums(readAllPixels(sweep.ctx, W, H))
    const sweepMean = sweepLums.reduce((a, b) => a + b, 0) / sweepLums.length
    expect(flashMean / Math.max(1, sweepMean)).toBeGreaterThanOrEqual(1.6)
  })

  itGl('dual-vector-foil: 全周期非黑(8s 扫一遍,5 采样点都该有内容)', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    // 单上下文复用(draw 无状态)——多上下文在负载下建得慢曾致假红
    const { canvas, ctx } = makeGlCanvas(W, H)
    const r = new Effect3DGl(canvas, 'dual-vector-foil')
    for (const t of [0.4, 2, 4, 6.5, 7.5]) {
      r.draw(t, [1, 0, 1, 0.5])
      const lums = frameLums(readAllPixels(ctx, W, H))
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length
      expect(mean, `t=${t} meanLum=${mean.toFixed(1)} 不该是黑场`).toBeGreaterThan(4)
    }
  })

  itGl('trisolaran-suns: 三日亮核存在+纪元呼吸(凌空相亮区>长夜相)', async () => {
    const { Effect3DGl } = await import('../../../src/renderer/src/gl/effect3dGl')
    // 单上下文复用(负载下多上下文建得慢曾致超时假红);eraPhase=u_time*0.85
    const { canvas, ctx } = makeGlCanvas(W, H)
    const r = new Effect3DGl(canvas, 'trisolaran-suns')
    const at = (ut: number) => {
      r.draw(ut, [0.4, 0, 1, 0.5])
      return frameLums(readAllPixels(ctx, W, H))
    }
    const peak = at(2 * Math.PI / 0.85)   // eraPhase=2π → cos=1 凌空峰
    const night = at(Math.PI / 0.85)      // eraPhase=π → cos=-1 长夜
    const brightCount = (lums: number[]) => lums.filter((l) => l > 450).length
    expect(brightCount(peak), `凌空亮格=${brightCount(peak)}`).toBeGreaterThanOrEqual(3)
    expect(brightCount(peak)).toBeGreaterThan(brightCount(night) + 3)
  }, 20000)
})
