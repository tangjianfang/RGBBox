// R304: 感觉台语义盘映射 —— 纯域单测（node 环境）
import { describe, it, expect } from 'vitest'
import { feelDialsFor, feelColorParam } from '../../../src/renderer/src/domain/feelDials'

describe('domain/feelDials (R304)', () => {
  it('全参数效果映射出 4 根盘（motion→speed / energy→intensity / density→density / palette→hueShift）', () => {
    const dials = feelDialsFor({ speed: 0.5, intensity: 1, density: 5, hueShift: 0 })
    expect(dials.map((d) => d.id)).toEqual(['motion', 'energy', 'density', 'palette'])
    expect(dials[0].param).toBe('speed')
    expect(dials[1].param).toBe('intensity')
    expect(dials[2].param).toBe('density')
    expect(dials[3].param).toBe('hueShift')
  })

  it('energy 兜底链：无 intensity 时落 baseBrightness', () => {
    const dials = feelDialsFor({ speed: 0.5, baseBrightness: 0.4 })
    const energy = dials.find((d) => d.id === 'energy')
    expect(energy?.param).toBe('baseBrightness')
  })

  it('缺参的盘自动隐藏（如 static 只有 color）', () => {
    expect(feelDialsFor({ color: '#ff0000' })).toEqual([])
    expect(feelDialsFor({})).toEqual([])
  })

  it('字符串值参数不算盘目标（防 blob/文本误入）', () => {
    expect(feelDialsFor({ speed: 'fast', animateSpeed: 0 })).toEqual([])
  })

  it('感觉色：#color 参数在位时返回 color（色相条驱动目标），无则 null', () => {
    expect(feelColorParam({ color: '#30dfb0' })).toBe('color')
    expect(feelColorParam({ color: '' })).toBeNull()
    expect(feelColorParam({ speed: 1 })).toBeNull()
  })
})
