// R260 弹幕质变四卡 — TDD 失败测试先行,后实施 survival.ts/swarmMeta.ts。
// 驱动方式与 survival.test.ts 同构:startSurvival → spawnTimer/bossTimer 钉大
// 防 director 插队 → spawnEnemyKind 定点放敌 → 手动放弹/清 fireTimer 触发齐射。
import { describe, it, expect, vi } from 'vitest'
import {
  applyUpgrade,
  initialSurvivalState,
  spawnEnemyKind,
  startSurvival,
  tickSurvival,
} from '../../../src/renderer/src/games/survival'
import { TRANSFORM_UPGRADE_IDS, UPGRADES } from '../../../src/renderer/src/games/swarmMeta'

const { translations } = await vi.importActual<typeof import('../../../src/renderer/src/i18n')>('../../../src/renderer/src/i18n')

function readyState(): ReturnType<typeof initialSurvivalState> {
  const state = initialSurvivalState()
  startSurvival(state)
  state.spawnTimer = 999 // 不让 director 插队生成
  state.bossTimer = 999
  return state
}

describe('games/swarm 弹幕质变四卡 (R260)', () => {
  it('质变卡注册表:≥4 张、全部 max:1(一次形态改变,不可堆叠)', () => {
    expect(TRANSFORM_UPGRADE_IDS.length).toBeGreaterThanOrEqual(4)
    for (const id of TRANSFORM_UPGRADE_IDS) {
      const def = UPGRADES.find((upgrade) => upgrade.id === id)
      expect(def, `UPGRADES 缺 ${id}`).toBeDefined()
      expect(def?.max, `${id} 应为 max:1`).toBe(1)
    }
  })

  it('质变卡 i18n:zh/en 双语卡名+描述全存在(防键名原文直出)', () => {
    for (const id of TRANSFORM_UPGRADE_IDS) {
      for (const lang of ['en', 'zh'] as const) {
        const name = translations[lang][`games.up.${id}` as keyof typeof translations.zh]
        const desc = translations[lang][`games.up.${id}.desc` as keyof typeof translations.zh]
        expect(name, `${lang} 缺 games.up.${id}`).toBeTruthy()
        expect(desc, `${lang} 缺 games.up.${id}.desc`).toBeTruthy()
      }
    }
    for (const lang of ['en', 'zh'] as const) {
      expect(translations[lang]['games.up.tagTransform' as keyof typeof translations.zh]).toBeTruthy()
    }
  })

  it('eightway 八向弹幕:一次齐射 8 发(基线 multishot=1 只 1 发)', () => {
    const s = readyState()
    s.taken.eightway = 1
    spawnEnemyKind(s, 'chaser', 600, 260)
    s.player.fireTimer = 0
    tickSurvival(s, 0.016)
    expect(s.bullets.length).toBe(8)
  })

  it('laser 穿透激光:穿透 ≥4 / 弹速 ×1.6 / 寿命 2.2s', () => {
    const s = readyState()
    s.taken.laser = 1
    spawnEnemyKind(s, 'chaser', 600, 260)
    s.player.fireTimer = 0
    tickSurvival(s, 0.016)
    expect(s.bullets.length).toBeGreaterThan(0)
    const bullet = s.bullets[0]
    expect(bullet.pierce).toBeGreaterThanOrEqual(4)
    expect(bullet.life).toBeCloseTo(2.2, 1)
    expect(Math.hypot(bullet.vx, bullet.vy)).toBeGreaterThan(420 * 1.5)
  })

  it('chain 连锁闪电:子弹击杀时电弧跳邻敌(0.6×伤害,一跳不递归)', () => {
    const s = readyState()
    s.taken.chain = 1
    s.stats.damage = 10
    spawnEnemyKind(s, 'chaser', 500, 260) // A:将被子弹击杀
    spawnEnemyKind(s, 'chaser', 540, 260) // B:A 邻(40px,160px 内)
    spawnEnemyKind(s, 'chaser', 460, 260) // C:A 邻
    const a = s.enemies[0]
    a.hp = 1
    s.bullets.push({ id: 999, x: a.x, y: a.y, vx: 0, vy: 0, damage: 10, pierce: 0, crit: false, life: 1 })
    tickSurvival(s, 0.016)
    // chaser 3HP,链伤 6 → 三敌全灭(A 直击/B C 链伤)
    expect(s.enemies.length).toBe(0)
    expect(s.particles.length).toBeGreaterThan(0)
  })

  it('homing 追踪飞刃:射弹朝最近敌转向(初始直飞右侧,敌在上方 → vy 转负)', () => {
    const s = readyState()
    s.taken.homing = 1
    spawnEnemyKind(s, 'chaser', 450, 200) // 敌在弹道上上方 100px
    s.bullets.push({ id: 998, x: 450, y: 300, vx: 420, vy: 0, damage: 1, pierce: 0, crit: false, life: 1 })
    tickSurvival(s, 0.016)
    const bullet = s.bullets[0]
    expect(bullet).toBeDefined()
    expect(bullet.vy).toBeLessThan(0)
  })

  it('质变卡可被 applyUpgrade 正常选卡(进 taken,phase 回 running)', () => {
    const s = readyState()
    s.offers = ['eightway' as never]
    s.phase = 'levelup'
    applyUpgrade(s, 'eightway' as never)
    expect(s.taken.eightway).toBe(1)
    expect(s.phase).toBe('running')
  })
})
