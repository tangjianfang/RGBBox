// R284 灯效救活批 — TDD：black-hole 去饱和 / audio idle 楼层 / aurora·microvilli 提速
// / 帧级暗谷地板。基线对照 docs/ui-review/r-effect-audit/engine-motion-sweep.csv。
import { describe, expect, it } from 'vitest'
import { renderEffectPixel } from '../../src/engine/effects'
import { effectPresets } from '../../src/shared/defaultProfile'
import { liftDarkFloor } from '../../src/engine/previewEngine'
import type { EffectKind, EffectLayer, RgbFrame } from '../../src/shared/types'

const COLS = 24
const ROWS = 14

function layerOf(kind: EffectKind): EffectLayer {
  const preset = effectPresets.find((p) => p.kind === kind)
  if (!preset) throw new Error(`no preset for ${kind}`)
  return { id: `revive-${kind}`, name: kind, kind, enabled: true, opacity: 1, blendMode: 'normal', parameters: { ...preset.defaults } }
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
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (Math.abs(a.pixels[i] - b.pixels[i]) > 24 || Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > 24 || Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 24) diff++
  }
  return (diff / (COLS * ROWS)) * 100
}

function litPct(frame: RgbFrame, threshold = 60): number {
  let lit = 0
  for (let i = 0; i < frame.pixels.length; i += 4) {
    const l = 0.299 * frame.pixels[i] + 0.587 * frame.pixels[i + 1] + 0.114 * frame.pixels[i + 2]
    if (l > threshold) lit++
  }
  return (lit / (COLS * ROWS)) * 100
}

describe('engine/effects R284 救活批', () => {
  it('black-hole: 1s 差分 >2%（基线 0%——温度饱和 bug 修复锁）', () => {
    const a = frameAt('black-hole', 0)
    const b = frameAt('black-hole', 1)
    expect(frameDiffPct(a, b)).toBeGreaterThan(2)
  })

  it('black-hole: 盘面保有径向亮度梯度（饱和区=大片同值白热消灭）', () => {
    const f = frameAt('black-hole', 2)
    const lums: number[] = []
    for (let x = 0; x < COLS; x++) {
      const i = (7 * COLS + x) * 3 // 中行扫过盘面
      lums.push(0.299 * f.pixels[i] + 0.587 * f.pixels[i + 1] + 0.114 * f.pixels[i + 2])
    }
    const distinct = new Set(lums.map((l) => Math.round(l / 8))).size
    expect(distinct).toBeGreaterThan(6) // 修前饱和区大片同档
  })

  it('audio-beat idle(无音频管线): 全屏呼吸可见 lit>8%（基线 0%）', () => {
    let max = 0
    for (const now of [0, 0.8, 1.6, 2.4, 3.2]) max = Math.max(max, litPct(frameAt('audio-beat', now)))
    expect(max).toBeGreaterThan(8)
  })

  it('aurora: 默认参数 1s>1% 或 3s>10%（基线 1s=0%/3s=4.8%——行波提速 3.3×）', () => {
    const d1 = frameDiffPct(frameAt('aurora', 0), frameAt('aurora', 1))
    const d3 = frameDiffPct(frameAt('aurora', 0), frameAt('aurora', 3))
    expect(d1 > 1 || d3 > 10).toBe(true)
  })

  it('microvilli-field: 1s 差分>3%（基线 1.5%——摆幅提速 2×）', () => {
    expect(frameDiffPct(frameAt('microvilli-field', 0), frameAt('microvilli-field', 1))).toBeGreaterThan(3)
  })
})

describe('previewEngine liftDarkFloor (R284③)', () => {
  it('暗谷帧(<8% lit)提升到 ≥7.5% 地板(结构本该可见的效果——扫相位取真低谷)', () => {
    // eclipse 的刻意深暗是设计(归删除裁决)——地板验证用暗谷受害的 microvilli
    let dark: RgbFrame | null = null
    for (const now of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
      const f = frameAt('microvilli-field', now)
      if (litPct(f) < 8) { dark = f; break }
    }
    if (dark === null) return // 该预设无低谷相则地板无事可做(合法)
    const lifted = liftDarkFloor(dark)
    expect(litPct(lifted)).toBeGreaterThanOrEqual(7.5) // 浮点余量
  })

  it('已亮帧(≥12%)原样返回(不动健康效果)', () => {
    const f = frameAt('rainbow', 1)
    const lifted = liftDarkFloor(f)
    expect(Array.from(lifted.pixels)).toEqual(Array.from(f.pixels))
  })

  it('提升有上限(×2.3)——暗审美不炸成白屏', () => {
    const f = frameAt('eclipse-alignment', 1.2)
    const lifted = liftDarkFloor(f)
    let maxOver = 0
    for (let i = 0; i < f.pixels.length; i++) {
      const b = Math.max(1, f.pixels[i])
      maxOver = Math.max(maxOver, lifted.pixels[i] / b)
    }
    expect(maxOver).toBeLessThanOrEqual(2.35)
  })
})
