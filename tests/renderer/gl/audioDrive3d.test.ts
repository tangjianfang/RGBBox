// R287 audioDrive3d — GPU 3D uniform 音频调制纯域单测（零 GLSL,JS 侧调制）。
import { describe, it, expect } from 'vitest'
import { createDrive3D, feedDrive3D, modulateParams3D, DRIVE3D_TAU } from '../../../src/renderer/src/gl/audioDrive3d'

describe('gl/audioDrive3D 脉冲包络 (R287)', () => {
  it('静音(beat=0)帧:pulse 从尖峰按 τ 指数衰减到 0', () => {
    const s = createDrive3D()
    feedDrive3D(s, { beat: 1, level: 0.5 }, 0) // 尖峰
    expect(s.pulse).toBeCloseTo(1, 5)
    for (let t = 16.7; t < 3000; t += 16.7) feedDrive3D(s, { beat: 0, level: 0.2 }, t)
    expect(s.pulse).toBeLessThan(0.001) // ~3s 后归零
  })

  it('τ=180ms:尖峰后 200ms 衰减到 ~0.33', () => {
    const s = createDrive3D()
    feedDrive3D(s, { beat: 1, level: 0.5 }, 0)
    feedDrive3D(s, { beat: 0, level: 0.5 }, 200)
    expect(s.pulse).toBeGreaterThan(0.25)
    expect(s.pulse).toBeLessThan(0.45)
    expect(DRIVE3D_TAU).toBe(180)
  })

  it('beat>1 钳到 1;连续尖峰保持高脉冲(不应期不存在——瞬态已由上游钩子去抖)', () => {
    const s = createDrive3D()
    feedDrive3D(s, { beat: 3, level: 0.5 }, 0)
    expect(s.pulse).toBe(1)
    feedDrive3D(s, { beat: 2, level: 0.5 }, 50)
    expect(s.pulse).toBe(1)
  })

  it('null/undefined 音频帧(未激活)视为静音', () => {
    const s = createDrive3D()
    feedDrive3D(s, { beat: 1, level: 0.5 }, 0)
    feedDrive3D(s, null, 100)
    expect(s.pulse).toBeGreaterThan(0) // 仍按包络衰减,不报错不冻结
    expect(Number.isFinite(s.pulse)).toBe(true)
  })
})

describe('gl/audioDrive3D uniform 调制 (R287)', () => {
  it('零驱动恒等:音频关/静音时参数逐位不变(零回归保证)', () => {
    const p: [number, number, number, number] = [0.75, 120, 1.0, 0.5]
    const out = modulateParams3D(p, { pulse: 0, energy: 0 })
    expect(out).toEqual(p)
  })

  it('纯拍击(pulse=1,energy=0):speed×1.9 + hueShift+18,intensity/density 不动', () => {
    const [sp, hue, it_, de] = modulateParams3D([1.0, 100, 1.0, 0.5], { pulse: 1, energy: 0 })
    expect(sp).toBeCloseTo(1.9, 5)
    expect(hue).toBeCloseTo(118, 5)
    expect(it_).toBe(1.0)
    expect(de).toBe(0.5)
  })

  it('纯响度(energy=0.8):intensity×1.4 + density×1.28,speed/hueShift 不动', () => {
    const [sp, hue, it_, de] = modulateParams3D([1.0, 100, 1.0, 0.5], { pulse: 0, energy: 0.8 })
    expect(sp).toBe(1.0)
    expect(hue).toBe(100)
    expect(it_).toBeCloseTo(1.4, 5)
    expect(de).toBeCloseTo(0.5 * 1.28, 5)
  })

  it('energy 钳 1:超响不失控(intensity 上限 ×1.5)', () => {
    const [, , it_] = modulateParams3D([1, 0, 1, 0.5], { pulse: 0, energy: 2 })
    expect(it_).toBeCloseTo(1.5, 5)
  })

  it('拍+响度叠加:两轴独立可组合', () => {
    const [sp, , it_] = modulateParams3D([1, 0, 1, 0.5], { pulse: 0.5, energy: 1 })
    expect(sp).toBeCloseTo(1.45, 5)
    expect(it_).toBeCloseTo(1.5, 5)
  })
})
