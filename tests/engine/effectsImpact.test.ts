// R291 震撼批 — 两名场面签名锁 + 全六效果震撼指标门禁。
// 震撼≠帧差(R289 教训:1s 帧差 85-99% 仍被用户评「很一般」)。震撼的
// 可测代理:P99 峰值亮度(灼热核心) + 对比度 P99÷P50(近黑幕+亮结构)
// + 事件性(全局亮度尖峰节奏)。门禁值来自 R289 首批实测(P99 532-676
// /对比 1.9-3.5× = 不震撼)与 R291 调优后实测(720-765/4.2-734×)。
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

describe('R291 二向箔降维签名锁', () => {
  it('12s 周期循环:两轮同相位帧重合(降维是循环叙事)', () => {
    const a = frameAt('dual-vector-foil', 15.3)
    const b = frameAt('dual-vector-foil', 27.3)
    let diff = 0
    for (let i = 0; i < a.pixels.length; i += 3) {
      if (Math.abs(a.pixels[i] - b.pixels[i]) > 24 || Math.abs(a.pixels[i + 1] - b.pixels[i + 1]) > 24 || Math.abs(a.pixels[i + 2] - b.pixels[i + 2]) > 24) diff++
    }
    // 星场 hash 含 floor(now*0.3) 项——两轮相位差 12s 会挪动星栅,容 20% 内
    expect((diff / (COLS * ROWS)) * 100).toBeLessThan(20)
  })

  it('锋面扫掠相(ct=4s):炽白锋面线存在(P99≥700)+后方已平+前方有星', () => {
    const f = frameAt('dual-vector-foil', 4)
    const lums: number[] = []
    for (let i = 0; i < f.pixels.length; i += 3) lums.push(f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2])
    lums.sort((x, y) => x - y)
    expect(lums[Math.floor(lums.length * 0.99)]).toBeGreaterThanOrEqual(700) // 炽白锋面
    expect(lums[Math.floor(lums.length * 0.5)]).toBeLessThanOrEqual(200)     // 大片死寂/暗场
  })

  it('事件性:完成闪光时刻(ct≈8.7s)全幕亮度 ≥ 扫掠中段 2×', () => {
    const flash = meanLum(frameAt('dual-vector-foil', 8.75))
    const sweep = meanLum(frameAt('dual-vector-foil', 4.5))
    expect(flash / Math.max(1, sweep)).toBeGreaterThanOrEqual(2)
  })
})

describe('R291 黑暗森林打击签名锁', () => {
  it('事件弧线:静谧(1s) ≪ 爆闪(3.45s) 且 打击后(7s) 比静谧更暗(灭世)', () => {
    const calm = meanLum(frameAt('dark-forest-strike', 1))
    const boom = meanLum(frameAt('dark-forest-strike', 3.45))
    const after = meanLum(frameAt('dark-forest-strike', 7))
    expect(boom / Math.max(1, calm)).toBeGreaterThanOrEqual(6) // 致盲爆闪
    expect(after).toBeLessThan(calm)                            // 死黑余烬
  })

  it('毁灭壳层相(ct=4.5s):亮环带存在(有格>540)且环内已死(<120 的格占多数)', () => {
    const f = frameAt('dark-forest-strike', 4.5)
    let bright = 0, dark = 0
    for (let i = 0; i < f.pixels.length; i += 3) {
      const l = f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2]
      if (l > 540) bright++
      if (l < 120) dark++
    }
    expect(bright).toBeGreaterThanOrEqual(2)        // 亮环带
    expect(dark / (COLS * ROWS)).toBeGreaterThan(0.5) // 环内星已死
  })

  it('每轮目标不同:两轮同相位(爆闪后)帧不重合(随机死神)', () => {
    const a = frameAt('dark-forest-strike', 12.5)
    const b = frameAt('dark-forest-strike', 21.5)
    let diff = 0
    for (let i = 0; i < a.pixels.length; i += 3) {
      if (Math.abs(a.pixels[i] - b.pixels[i]) > 24) diff++
    }
    expect((diff / (COLS * ROWS)) * 100).toBeGreaterThan(3)
  })
})

describe('R291 震撼指标门禁(全六效果)', () => {
  const KINDS: EffectKind[] = ['three-body', 'trisolaran-suns', 'droplet-mirror', 'gravity-wave', 'dual-vector-foil', 'dark-forest-strike']

  it.for(KINDS)('%s: P99≥700(灼热核心) 且 对比 P99÷P50≥4×(近黑幕+亮结构)', (kind) => {
    // 0.2s 密采样跨 2 个周期——事件效果的 0.1s 级尖峰不能被错过
    const lums: number[] = []
    for (let t = 0; t < 24; t += 0.2) {
      const f = frameAt(kind, t)
      for (let i = 0; i < f.pixels.length; i += 3) lums.push(f.pixels[i] + f.pixels[i + 1] + f.pixels[i + 2])
    }
    lums.sort((x, y) => x - y)
    const p50 = lums[Math.floor(lums.length * 0.5)]
    const p99 = lums[Math.floor(lums.length * 0.99)]
    expect(p99, `${kind} P99=${p99}`).toBeGreaterThanOrEqual(700)
    expect(p99 / Math.max(1, p50), `${kind} contrast=${(p99 / Math.max(1, p50)).toFixed(1)}`).toBeGreaterThanOrEqual(4)
  })

  it('事件尖峰节奏:两名场面每 10s ≥2 次全局亮度尖峰(ΔmeanLum>25%)', () => {
    for (const kind of ['dual-vector-foil', 'dark-forest-strike'] as EffectKind[]) {
      const series: number[] = []
      for (let t = 0; t < 20; t += 0.5) series.push(meanLum(frameAt(kind, t)))
      let spikes = 0
      for (let i = 1; i < series.length; i++) {
        if (Math.abs(series[i] - series[i - 1]) / Math.max(1, series[i - 1]) > 0.25) spikes++
      }
      expect(spikes, `${kind} spikes=${spikes}`).toBeGreaterThanOrEqual(4) // 20s 窗口 ≥4 次
    }
  })
})
