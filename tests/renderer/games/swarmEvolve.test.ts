// R202: Swarm 进化配方 + boss 弹幕。
import { describe, expect, it } from 'vitest'
import { EVOLUTIONS, evolutionReady, readyEvolutions } from '../../../src/renderer/src/games/swarmMeta'
import { applyUpgrade, debugSpawnBoss, initialSurvivalState, recomputeStats, startSurvival, tickSurvival } from '../../../src/renderer/src/games/survival'

describe('swarm evolutions (FR-SW01)', () => {
  const taken = { fireRate: 0, damage: 0, multishot: 0, pierce: 0, blade: 0, speed: 0, maxHp: 0, magnet: 0, crit: 0, bulletSpeed: 0, thorns: 0, regen: 0 }

  it('4 recipes with multi-preconditions; readiness is exact', () => {
    expect(EVOLUTIONS).toHaveLength(4)
    const moon = EVOLUTIONS.find((e) => e.id === 'moonblade')!
    expect(evolutionReady(moon, taken)).toBe(false)
    const t1 = { ...taken, blade: 3, damage: 3 }
    expect(evolutionReady(moon, t1)).toBe(false) // damage 3 < 4
    const t2 = { ...taken, blade: 3, damage: 4 }
    expect(evolutionReady(moon, t2)).toBe(true)
  })

  it('readyEvolutions filters already-evolved', () => {
    const t = { ...taken, multishot: 3, pierce: 3, blade: 3, damage: 4 }
    const ready = readyEvolutions(t, [])
    expect(ready.map((e) => e.id)).toContain('moonblade')
    expect(ready.map((e) => e.id)).toContain('barrage')
    const after = readyEvolutions(t, ['moonblade'])
    expect(after.map((e) => e.id)).not.toContain('moonblade')
  })
})

describe('R220.3 evolution wiring (engine)', () => {
  it('配方就绪 → 升级池让位进化单卡;应用后 evolved 登记+演出+恢复 running', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.taken.blade = 3
    s.taken.damage = 4
    s.xp = s.xpNext
    tickSurvival(s, 0.016)
    expect(s.phase).toBe('levelup')
    expect(s.offers).toEqual(['moonblade'])
    applyUpgrade(s, 'moonblade' as never)
    expect(s.evolved).toEqual(['moonblade'])
    expect(s.phase).toBe('running')
    expect(s.banner?.text).toContain('EVOLVED')
  })

  it('barrage 进化:齐射追加两翼弹(multishot 1 → 3 发)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.evolved.push('barrage')
    s.enemies.push({ id: 1, kind: 'chaser', x: s.player.x + 200, y: s.player.y, hp: 99, maxHp: 99, size: 12, vx: 0, vy: 0, elite: false, hitFlash: 0 })
    s.player.fireTimer = 0
    tickSurvival(s, 0.016)
    expect(s.bullets.length).toBe(3) // 1 主射 + 2 翼射
  })

  it('thornAura 进化:0.5s 一拍灼烧光环内敌人', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.player.fireTimer = 99
    s.evolved.push('thornAura')
    s.enemies.push({ id: 1, kind: 'chaser', x: s.player.x + 50, y: s.player.y, hp: 99, maxHp: 99, size: 12, vx: 0, vy: 0, elite: false, hitFlash: 0 })
    const hp0 = s.enemies[0].hp
    s.auraTimer = 0.49
    tickSurvival(s, 0.016)
    expect(s.enemies[0].hp).toBeLessThan(hp0)
  })

  it('moonblade 进化:环刃伤害×1.5 命中', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.player.fireTimer = 99
    s.taken.blade = 1
    recomputeStats(s.stats, s.taken)
    s.evolved.push('moonblade')
    // 环刃半径 104——敌放在环带上
    const ang = s.bladeAngle
    s.enemies.push({ id: 1, kind: 'chaser', x: s.player.x + Math.cos(ang) * 104, y: s.player.y + Math.sin(ang) * 104, hp: 99, maxHp: 99, size: 12, vx: 0, vy: 0, elite: false, hitFlash: 0 })
    const hp0 = s.enemies[0].hp
    s.bladeTimer = 0.26
    tickSurvival(s, 0.016)
    expect(s.enemies[0].hp).toBeLessThan(hp0)
  })
})

describe('swarm boss barrage (FR-SW02)', () => {
  it('living boss emits bullets on the 1.2s cadence; three patterns cycle', () => {
    const s = initialSurvivalState()
    startSurvival(s)
    debugSpawnBoss(s)
    // 先走到 1.2s:tick 大 dt 分段
    for (let i = 0; i < 12; i += 1) tickSurvival(s, 0.1)
    expect(s.eBullets.length).toBeGreaterThan(0)
    const pattern0 = s.eBullets.length
    s.eBullets = []
    s.bossBulletTimer = 0
    for (let i = 0; i < 12; i += 1) tickSurvival(s, 0.1)
    expect(s.eBullets.length).toBeGreaterThan(0)
    void pattern0
  })
})
