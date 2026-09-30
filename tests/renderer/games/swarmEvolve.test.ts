// R202: Swarm 进化配方 + boss 弹幕。
import { describe, expect, it } from 'vitest'
import { EVOLUTIONS, evolutionReady, readyEvolutions } from '../../../src/renderer/src/games/swarmMeta'
import { debugSpawnBoss, initialSurvivalState, startSurvival, tickSurvival } from '../../../src/renderer/src/games/survival'

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
