import { describe, it, expect } from 'vitest'
import { LOW_HP_RATIO, autoPick } from '../../../src/renderer/src/games/swarmAutoPick'
import { UPGRADES, type UpgradeId } from '../../../src/renderer/src/games/swarmMeta'

function zeroTaken(over: Partial<Record<UpgradeId, number>> = {}): Record<UpgradeId, number> {
  return Object.assign(Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])), over) as Record<UpgradeId, number>
}

describe('renderer/games/swarmAutoPick (R213)', () => {
  it('off 模式恒为 null(手动)', () => {
    expect(autoPick(['fireRate', 'damage'], ['damage'], 'off', zeroTaken(), 10, 10)).toBeNull()
  })

  it('list 模式按 prefs 优先级命中最靠前项(而非 offers 顺序)', () => {
    expect(autoPick(['fireRate', 'multishot'], ['multishot', 'fireRate'], 'list', zeroTaken(), 10, 10)).toBe('multishot')
    expect(autoPick(['damage', 'fireRate'], ['blade', 'damage'], 'list', zeroTaken(), 10, 10)).toBe('damage')
  })

  it('list 模式全不命中 / 空清单 / 空 offers → null', () => {
    expect(autoPick(['fireRate', 'damage'], ['blade', 'pierce'], 'list', zeroTaken(), 10, 10)).toBeNull()
    expect(autoPick(['fireRate'], [], 'list', zeroTaken(), 10, 10)).toBeNull()
    expect(autoPick([], ['fireRate'], 'list', zeroTaken(), 10, 10)).toBeNull()
  })

  it('best 模式低血救急:优先 offers 中的生存类(maxHp/regen)', () => {
    // hp 2/10 = 0.2 < 0.4
    expect(autoPick(['fireRate', 'regen', 'damage'], [], 'best', zeroTaken({ fireRate: 0 }), 2, 10)).toBe('regen')
    expect(autoPick(['maxHp', 'damage'], [], 'best', zeroTaken({ damage: 5 }), 3, 10)).toBe('maxHp')
    // 两类都在:取 offers 数组序靠前的
    expect(autoPick(['regen', 'maxHp'], [], 'best', zeroTaken(), 1, 10)).toBe('regen')
  })

  it('best 模式血线边界:0.4 不算低血,走常规分支', () => {
    expect(LOW_HP_RATIO).toBe(0.4)
    // 4/10 = 0.4 恰好不低:全员 taken=0 并列 → offers 数组序
    expect(autoPick(['fireRate', 'maxHp'], [], 'best', zeroTaken(), 4, 10)).toBe('fireRate')
  })

  it('best 模式低血但无生存类 offers → 回落常规(最少 taken)', () => {
    expect(autoPick(['fireRate', 'damage'], [], 'best', zeroTaken({ fireRate: 3 }), 2, 10)).toBe('damage')
  })

  it('best 模式常规:取 taken 计数最少者,并列取 offers 数组序', () => {
    expect(autoPick(['damage', 'fireRate'], [], 'best', zeroTaken({ damage: 2, fireRate: 0 }), 10, 10)).toBe('fireRate')
    expect(autoPick(['pierce', 'blade'], [], 'best', zeroTaken(), 10, 10)).toBe('pierce')
    // taken 缺项按 0 计
    expect(autoPick(['crit', 'magnet'], [], 'best', {} as Record<UpgradeId, number>, 10, 10)).toBe('crit')
  })

  it('best 模式空 offers → null;maxHp=0 不崩溃走常规', () => {
    expect(autoPick([], [], 'best', zeroTaken(), 10, 10)).toBeNull()
    expect(autoPick(['damage'], [], 'best', zeroTaken(), 0, 0)).toBe('damage')
  })
})
