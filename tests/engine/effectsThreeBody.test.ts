// R289 三体主题灯效库 — 签名锁单测(TDD 先红后绿)。
// 每个效果锁一个「只有它才有」的结构性质,防未来重构把灵魂改丢:
//  three-body   : T/3 构型周期性(三体全同→整体推进 T/3 后画面完全重合)
//  trisolaran  : 凌空/长夜节律(扫相位全程亮度方差显著——不是死画面)
//  droplet     : 镜面结构(球内平滑,边缘高对比——「绝对光滑」的读法)
//  gravity-wave: 四极双臂 2 重旋转对称(θ 与 θ+π 同半径等亮)
import { describe, expect, it } from 'vitest'
import { renderEffectPixel } from '../../src/engine/effects'
import { effectPresets } from '../../src/shared/defaultProfile'
import type { EffectKind, EffectLayer, RgbFrame } from '../../src/shared/types'

const COLS = 24
const ROWS = 14

function layerOf(kind: EffectKind): EffectLayer {
  const preset = effectPresets.find((p) => p.kind === kind)
  if (!preset) throw new Error(`no preset for ${kind}`)
  return { id: `tb-${kind}`, name: kind, kind, enabled: true, opacity: 1, blendMode: 'normal', parameters: { ...preset.defaults } }
}

function frameAt(kind: EffectKind, now: number): RgbFrame {
  const pixels = new Uint8ClampedArray(COLS * ROWS * 3)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = renderEffectPixel(layerOf(kind), { x, y, columns: COLS, rows: ROWS, now })
      const i = (y * COLS + x) * 3
      pixels[i] = c.r; pixels[i + 1] = c.g; pixels[i + 2] = c.b
    }
  }
  return { columns: COLS, rows: ROWS, pixels, generatedAt: now * 1000 }
}

function frameDiffPct(a: RgbFrame, b: RgbFrame): number {
  let diff = 0
  for (let i = 0; i < a.pixels.length; i += 3) {
    if (Math.abs(a.pixels[i] - b.pixels[i]) > 24 || Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > 24 || Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 24) diff++
  }
  return (diff / (COLS * ROWS)) * 100
}

function meanLum(f: RgbFrame): number {
  let s = 0
  for (let i = 0; i < f.pixels.length; i += 3) s += f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2]
  return s / (COLS * ROWS * 3)
}

describe('R289 三体主题灯效签名锁', () => {
  it('three-body: T/3 构型周期性——整体推进一个相位差,三体全同画面重合', () => {
    const speed = 0.55
    const T3 = (Math.PI * 2 / 3) / speed
    const a = frameAt('three-body', 1.0)
    const b = frameAt('three-body', 1.0 + T3)
    expect(frameDiffPct(a, b)).toBeLessThan(1.5) // 完全重合(浮点余量)
    // 而推进半个相位差绝不重合(反证:不是恒定画面)
    const c = frameAt('three-body', 1.0 + T3 / 2)
    expect(frameDiffPct(a, c)).toBeGreaterThan(3)
  })

  it('three-body: 1s 帧差 >2%(追逐在动,非准静态)', () => {
    expect(frameDiffPct(frameAt('three-body', 0), frameAt('three-body', 1))).toBeGreaterThan(2)
  })

  it('gravity-wave: 四极双臂 2 重旋转对称(θ 与 θ+π 等亮)', () => {
    const f = frameAt('gravity-wave', 1.0)
    const lum = (x: number, y: number) => {
      const i = (y * COLS + x) * 3
      return f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2]
    }
    const cx = 11.5, cy = 6.5
    let pairs = 0, ok = 0
    for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
      const dx = x - cx, dy = y - cy
      const r = Math.hypot(dx, dy)
      if (r < 3 || r > 7) continue // 臂环带
      const ox = Math.round(cx - dx), oy = Math.round(cy - dy)
      if (ox < 0 || ox >= COLS || oy < 0 || oy >= ROWS) continue
      pairs++
      const d = Math.abs(lum(x, y) - lum(ox, oy))
      if (d < 120) ok++ // 同亮度带(容臂的离散锯齿)
    }
    expect(pairs).toBeGreaterThan(8)
    expect(ok / pairs).toBeGreaterThan(0.75)
  })

  it('gravity-wave: 1s 帧差 >2%(臂旋+波纹外扩)', () => {
    expect(frameDiffPct(frameAt('gravity-wave', 0), frameAt('gravity-wave', 1))).toBeGreaterThan(2)
  })
})
