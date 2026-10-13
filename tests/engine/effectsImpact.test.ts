// R291/R292 震撼门禁 — CPU 侧。
// R292 起 droplet-mirror/dual-vector-foil/trisolaran-suns 迁移 GPU 3D
// (其震撼门禁在 tests/renderer/gl/effect3dGl.test.ts 的像素回读侧);
// 本文件守 CPU 效果:three-body / gravity-wave / dark-forest-strike。
// 震撼≠帧差(R289 教训):P99 灼热核心 + 对比度 + 事件尖峰节奏。
import { describe, expect, it } from 'vitest'
import { renderEffectPixel } from '../../src/engine/effects'
import { effectPresets } from '../../src/shared/defaultProfile'
import type { EffectKind, EffectLayer, RgbFrame } from '../../src/shared/types'

const COLS = 24
const ROWS = 14

function layerOf(kind: EffectKind): EffectLayer {
  const preset = effectPresets.find((p) => p.kind === kind)
  if (!preset) throw new Error(`no preset for ${kind}`)
  return { id: `r291-${kind}`, name: kind, kind, enabled: true, opacity: 1, blendMode: 'normal', parameters: { ...preset.defaults } }
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

function meanLum(f: RgbFrame): number {
  let s = 0
  for (let i = 0; i < f.pixels.length; i += 3) s += f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2]
  return s / (COLS * ROWS * 3)
}

describe('R291 黑暗森林打击签名锁 (CPU)', () => {
  it('事件弧线:静谧(1s) ≪ 爆闪(3.45s) 且 打击后(7s) 比静谧更暗(灭世)', () => {
    const calm = meanLum(frameAt('dark-forest-strike', 1))
    const boom = meanLum(frameAt('dark-forest-strike', 3.45))
    const after = meanLum(frameAt('dark-forest-strike', 7))
    expect(boom / Math.max(1, calm)).toBeGreaterThanOrEqual(6) // 致盲爆闪
    expect(after).toBeLessThan(calm)                            // 死黑余烬
  })

  it('毁灭壳层相(ct=4.5s):亮环带存在且环内已死(<120 的格占多数)', () => {
    const f = frameAt('dark-forest-strike', 4.5)
    let bright = 0, dark = 0
    for (let i = 0; i < f.pixels.length; i += 3) {
      const l = f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2]
      if (l > 540) bright++
      if (l < 120) dark++
    }
    expect(bright).toBeGreaterThanOrEqual(2)
    expect(dark / (COLS * ROWS)).toBeGreaterThan(0.5)
  })

  it('每轮目标不同:两轮同相位帧不重合(随机死神)', () => {
    const a = frameAt('dark-forest-strike', 12.5)
    const b = frameAt('dark-forest-strike', 21.5)
    let diff = 0
    for (let i = 0; i < a.pixels.length; i += 3) {
      if (Math.abs(a.pixels[i] - b.pixels[i]) > 24) diff++
    }
    expect((diff / (COLS * ROWS)) * 100).toBeGreaterThan(3)
  })

  it('事件尖峰节奏:20s 内 ≥4 次全局亮度尖峰(ΔmeanLum>25%)', () => {
    const series: number[] = []
    for (let t = 0; t < 20; t += 0.5) series.push(meanLum(frameAt('dark-forest-strike', t)))
    let spikes = 0
    for (let i = 1; i < series.length; i++) {
      if (Math.abs(series[i] - series[i - 1]) / Math.max(1, series[i - 1]) > 0.25) spikes++
    }
    expect(spikes).toBeGreaterThanOrEqual(4)
  })
})

describe('R291 震撼指标门禁(CPU 效果)', () => {
  const KINDS: EffectKind[] = ['three-body', 'gravity-wave', 'dark-forest-strike']

  it.for(KINDS)('%s: P99≥700(灼热核心) 且 对比 P99÷P50≥4×(近黑幕+亮结构)', (kind) => {
    const lums: number[] = []
    for (let t = 0; t < 24; t += 0.2) {
      const f = frameAt(kind, t)
      for (let i = 0; i < f.pixels.length; i += 3) lums.push(f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2])
    }
    lums.sort((x, y) => x - y)
    const p50 = lums[Math.floor(lums.length * 0.5)]
    const p99 = lums[Math.floor(lums.length * 0.99)]
    expect(p99, `${kind} P99=${p99}`).toBeGreaterThanOrEqual(700)
    expect(p99 / Math.max(1, p50), `${kind} contrast`).toBeGreaterThanOrEqual(4)
  })
})
