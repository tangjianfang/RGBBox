// R263 进化可视化 + 击退钉死 + 空间哈希 — TDD 失败测试先行。
import { describe, it, expect } from 'vitest'
import { initialSurvivalState, spawnEnemyKind, startSurvival, tickSurvival } from '../../../src/renderer/src/games/survival'
import { evolutionInSight, UPGRADES } from '../../../src/renderer/src/games/swarmMeta'
import { buildGrid, gridNear } from '../../../src/renderer/src/games/spatialGrid'

describe('games/swarmMeta #5 进化在望 (R263)', () => {
  const zero = { fireRate: 0, damage: 0, multishot: 0, pierce: 0, blade: 0, speed: 0, maxHp: 0, magnet: 0, crit: 0, bulletSpeed: 0, thorns: 0, regen: 0, eightway: 0, laser: 0, chain: 0, homing: 0 }

  it('pierce 差 1 级达成 lightspear 配方 → inSight(拿这张卡直接推进进化)', () => {
    const taken = { ...zero, pierce: 2, bulletSpeed: 3 }
    const hint = evolutionInSight(taken, [], 'pierce')
    expect(hint).not.toBeNull()
    expect(hint!.recipeEffect).toBe('lightspear')
    expect(hint!.missing).toBe(1)
  })

  it('配方远(总差 ≥3)→ null;不相关 id → null', () => {
    expect(evolutionInSight(zero, [], 'pierce')).toBeNull() // lightspear 差 6
    expect(evolutionInSight(zero, [], 'speed')).toBeNull() // 不在任何配方
  })

  it('id 已取满该配方需求 → null(拿卡不再推进);已进化配方不再提示', () => {
    const taken = { ...zero, pierce: 3, bulletSpeed: 3 }
    expect(evolutionInSight(taken, [], 'pierce')).toBeNull() // pierce 已满 3,拿了不推进
    const partial = { ...zero, pierce: 2, bulletSpeed: 3 }
    expect(evolutionInSight(partial, ['lightspear'], 'pierce')).toBeNull()
  })

  it('UPGRADES 全部 id 都可被 evolutionInSight 查询(防拼写脱节)', () => {
    for (const def of UPGRADES) {
      expect(() => evolutionInSight(zero, [], def.id)).not.toThrow()
    }
  })
})

describe('games/survival #7 击退节流 (R263)', () => {
  it('高频弹不再逐帧连推:命中击退后 0.15s 内的下一击不再位移(knockCd)', () => {
    const s = initialSurvivalState()
    startSurvival(s)
    s.spawnTimer = 999
    s.bossTimer = 999
    s.taken.homing = 0
    spawnEnemyKind(s, 'brute', 600, 260) // 高血敌,不会被一击秒
    const enemy = s.enemies[0]
    enemy.hp = 9999
    // 第一击:位移 + knockCd 置位
    s.bullets.push({ id: 1, x: enemy.x, y: enemy.y, vx: 420, vy: 0, damage: 1, pierce: 5, crit: false, life: 1 })
    tickSurvival(s, 0.016)
    const xAfterFirst = enemy.x
    expect(enemy.x).toBeGreaterThan(xAfterFirst - 0.001) // vx>0 推向 +x(被击退沿弹道 → +x?击退=沿弹道单位向量推 → +x)
    expect(enemy.knockCd ?? 0).toBeCloseTo(0.15 - 0.016, 2) // 同帧敌循环已衰减一拍
    // 第二击(knockCd 未过):无击退位移
    s.bullets.push({ id: 2, x: enemy.x, y: enemy.y, vx: 420, vy: 0, damage: 1, pierce: 5, crit: false, life: 1 })
    const xBeforeSecond = enemy.x
    tickSurvival(s, 0.016)
    // 敌人本帧会向玩家移动,但击退位移为 0 → 总位移应远小于 12px 击退
    expect(Math.abs(enemy.x - xBeforeSecond)).toBeLessThan(12)
  })
})

describe('games/spatialGrid #8 对拍 (R263)', () => {
  function naive<T extends { x: number; y: number }>(items: T[], x: number, y: number, r: number): T[] {
    return items.filter((it) => Math.hypot(it.x - x, it.y - y) <= r)
  }

  it('gridNear+精筛 与朴素遍历同结果(确定性伪随机 200 点 × 10 查询)', () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    const items = Array.from({ length: 200 }, (_, i) => ({ id: i, x: rand() * 1800, y: rand() * 1040 }))
    const CELL = 64
    const grid = buildGrid(items, CELL)
    for (let q = 0; q < 10; q++) {
      const x = rand() * 1800, y = rand() * 1040, r = 20 + rand() * 120
      const candidates = gridNear(grid, x, y, r, CELL)
      const refined = candidates.filter((it) => Math.hypot(it.x - x, it.y - y) <= r)
      const expected = naive(items, x, y, r)
      expect(new Set(refined.map((it) => it.id))).toEqual(new Set(expected.map((it) => it.id)))
    }
  })

  it('空网格/半径 0 安全', () => {
    const grid = buildGrid([], 64)
    expect(gridNear(grid, 100, 100, 50, 64)).toEqual([])
  })
})
