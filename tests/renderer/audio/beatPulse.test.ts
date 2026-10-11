// R286 beatPulse — 节拍引擎与频谱动力学纯域单测。
import { describe, it, expect } from 'vitest'
import {
  createBeatPulse, feedBeatPulse, createSpectrumDynamics, stepSpectrumBar,
  stepDisplayGain, shapeDisplayValue, DISPLAY_GAIN_FLOOR,
} from '../../../src/renderer/src/audio/beatPulse'

function freq(low: number, len = 64): Uint8Array {
  const a = new Uint8Array(len)
  for (let i = 0; i < 8; i++) a[i] = Math.round(low * 255)
  return a
}

describe('audio/beatPulse 节拍检测 (R286)', () => {
  it('恒定低音不触发(短/长窗比≈1)', () => {
    const s = createBeatPulse()
    for (let t = 0; t < 2000; t += 33) feedBeatPulse(s, freq(0.5), t)
    expect(s.pulse).toBeLessThan(0.1)
  })

  it('静音后低音突增 → 触发 pulse=1', () => {
    const s = createBeatPulse()
    for (let t = 0; t < 1500; t += 33) feedBeatPulse(s, freq(0.05), t) // 安静基线
    const p = feedBeatPulse(s, freq(0.9), 1533) // 重拍
    expect(p).toBe(1)
  })

  it('触发后指数衰减:300ms 后 <0.3,600ms 后 <0.1(按 60fps 持续喂帧)', () => {
    const s = createBeatPulse()
    for (let t = 0; t < 1500; t += 33) feedBeatPulse(s, freq(0.05), t)
    feedBeatPulse(s, freq(0.9), 1533)
    // 衰减段持续按帧率喂(稀疏喂帧会让 EMA 一步跨 300ms 失真)
    for (let t = 1566; t <= 1833; t += 33) feedBeatPulse(s, freq(0.05), t)
    expect(s.pulse).toBeLessThan(0.3)
    for (let t = 1866; t <= 2133; t += 33) feedBeatPulse(s, freq(0.05), t)
    expect(s.pulse).toBeLessThan(0.1)
  })

  it('不应期:连续重拍 100ms 间隔只触发一次(防抖)', () => {
    const s = createBeatPulse()
    for (let t = 0; t < 1500; t += 33) feedBeatPulse(s, freq(0.05), t)
    feedBeatPulse(s, freq(0.9), 1533)
    // 100ms 后又一记重拍——处于不应期,pulse 只按衰减走(<1)
    expect(feedBeatPulse(s, freq(0.9), 1633)).toBeLessThan(1)
  })
})

describe('audio/beatPulse 频谱动力学 (R286)', () => {
  it('attack 快于 release:上升 1 帧到位 >60%,下落 1 帧丢失 <40%', () => {
    const d = createSpectrumDynamics(1)
    d.lastAt = 0
    const up = stepSpectrumBar(d, 0, 1.0, 16.7) // 60fps
    expect(up.level).toBeGreaterThan(0.65)
    // 目标归零,一帧后仍 >60%(慢落=跳动感的下半拍)
    const down = stepSpectrumBar(d, 0, 0, 33.4)
    expect(down.level).toBeGreaterThan(0.55) // attack 0.7 vs release 0.18——一帧后丢 <20% 即慢落
  })

  it('峰值帽吸附后重力下落,且慢于条体', () => {
    const d = createSpectrumDynamics(1)
    d.lastAt = 0
    stepSpectrumBar(d, 0, 1.0, 16.7)
    const { level, peak } = stepSpectrumBar(d, 0, 0.1, 500) // 0.5s 后
    expect(peak).toBeGreaterThan(level) // 帽在条体上方
    expect(peak).toBeLessThan(1.0)      // 已下落
  })

  it('同帧多条共享 dt:第 63 条与第 1 条同帧起跳(冻结 bug 回归锁)', () => {
    const d = createSpectrumDynamics(64)
    d.lastAt = 0
    // 同一帧步进两条(同一 nowMs)——逐条覆盖 lastAt 的实现会让第二条 dt=0
    const first = stepSpectrumBar(d, 0, 1.0, 16.7)
    const last = stepSpectrumBar(d, 63, 1.0, 16.7)
    expect(first.level).toBeGreaterThan(0.65)
    expect(last.level).toBeGreaterThan(0.65) // 修前恒 0——真机频谱冻结的根因
  })
})

describe('audio/beatPulse 显示域自适应增益 (R286b)', () => {
  it('增益即时跟随响段帧峰值', () => {
    const d = createSpectrumDynamics(64)
    stepDisplayGain(d, 0.9, 100)
    expect(d.gain).toBeCloseTo(0.9, 5)
  })

  it('弱奏段按 τ 指数衰减,且永不低于下限', () => {
    const d = createSpectrumDynamics(64)
    stepDisplayGain(d, 0.9, 0) // 响段建立
    const at500 = (() => { let t = 0; for (; t < 500; t += 16.7) stepDisplayGain(d, 0.1, t); return d.gain })()
    expect(at500).toBeGreaterThan(0.6) // τ=1.6s:0.5s 只衰 ~27%
    for (let t = 500; t < 8000; t += 16.7) stepDisplayGain(d, 0.1, t) // 弱奏(0.1 < floor 0.22)
    expect(d.gain).toBeCloseTo(DISPLAY_GAIN_FLOOR, 5) // 贴下限稳定——观感仍被抬到 0.1/0.22
    for (let t = 8000; t < 12000; t += 16.7) stepDisplayGain(d, 0, t) // 静音
    expect(d.gain).toBeCloseTo(DISPLAY_GAIN_FLOOR, 5) // 不再下探
  })

  it('独立时钟:只调 stepDisplayGain(无声谱条循环)也按真实 dt 衰减', () => {
    const d = createSpectrumDynamics(1) // 声谱图场景:条循环从不跑
    stepDisplayGain(d, 0.8, 0)
    stepDisplayGain(d, 0, 16.7) // 一帧 16.7ms
    expect(d.gain).toBeCloseTo(0.8 * Math.exp(-0.0167 / 1.6), 4) // τ=1.6s,非 100ms 钳制
  })

  it('shapeDisplayValue:静音门(0.05 以下)恒 0——静音不被抬亮', () => {
    expect(shapeDisplayValue(0, 0.22)).toBe(0)
    expect(shapeDisplayValue(0.03, 0.22)).toBe(0)
    expect(shapeDisplayValue(0.049, 0.22)).toBe(0)
  })

  it('shapeDisplayValue:响段真实还原(v=gain → 1.0),弱奏抬升过半', () => {
    expect(shapeDisplayValue(0.8, 0.8)).toBeCloseTo(1.0, 6)
    // 钢琴衰减尾段实测 level≈0.12,增益衰到下限 0.22 → 条高 ~0.65(观感活)
    expect(shapeDisplayValue(0.12, DISPLAY_GAIN_FLOOR)).toBeGreaterThan(0.5)
  })
})
