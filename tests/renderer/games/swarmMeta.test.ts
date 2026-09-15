import { describe, it, expect } from 'vitest'
import {
  DISSOLVE_XP,
  EMPTY_PERM,
  PERM_MAX,
  PERM_UPGRADES,
  RARITY_LEVELS,
  UPGRADES,
  buyPerm,
  permCost,
  pickOffers,
  rollRarity,
  rollRouletteItem,
  rollRouletteStat,
  runCoins,
  type UpgradeId,
} from '../../../src/renderer/src/games/swarmMeta'
import { initialSurvivalState, tickSurvival } from '../../../src/renderer/src/games/survival'

function zeroTaken(): Record<UpgradeId, number> {
  return Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])) as Record<UpgradeId, number>
}

function maxedTaken(): Record<UpgradeId, number> {
  return Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, upgrade.max])) as Record<UpgradeId, number>
}

describe('renderer/games/swarmMeta (R101)', () => {
  it('characters inject passives into initial stats', () => {
    const bulwark = initialSurvivalState('bulwark')
    expect(bulwark.player.maxHp).toBe(8)
    expect(bulwark.stats.thorns).toBe(1)
    const volt = initialSurvivalState('volt')
    expect(volt.stats.blade).toBe(1)
    expect(volt.stats.fireRate).toBeGreaterThan(2)
    expect(volt.player.maxHp).toBe(4)
    expect(initialSurvivalState('wisp').xpMult).toBeGreaterThan(1.1)
  })

  it('permanent upgrades compound stats and max HP at run start', () => {
    const state = initialSurvivalState('wisp', { ...EMPTY_PERM, damage: 3, maxHp: 2, fireRate: 2 })
    expect(state.player.maxHp).toBe(7)
    expect(state.stats.damage).toBeCloseTo(1.3, 5)
    expect(state.stats.fireRate).toBeGreaterThan(2)
  })

  it('luck shifts rarity mass toward rare tiers', () => {
    let rarePlain = 0
    let rareLucky = 0
    for (let i = 0; i < 800; i++) {
      if (rollRarity(0) >= 2) rarePlain += 1
      if (rollRarity(3) >= 2) rareLucky += 1
    }
    expect(rareLucky).toBeGreaterThan(rarePlain)
  })

  it('pickOffers skips maxed upgrades and returns distinct picks', () => {
    const taken = maxedTaken()
    taken.bulletSpeed = 0
    taken.thorns = 0
    const offers = pickOffers(taken, 3, 0)
    expect(offers).toHaveLength(2)
    expect(new Set(offers).size).toBe(2)
  })

  it('item roulette respects rarity level caps and maps dissolve XP', () => {
    const taken = zeroTaken()
    for (let i = 0; i < 60; i++) {
      const result = rollRouletteItem(taken, 0)
      expect(result.kind).toBe('item')
      if (result.kind === 'item') {
        expect(result.levels).toBeLessThanOrEqual(RARITY_LEVELS[result.rarity])
        expect(result.levels).toBeGreaterThanOrEqual(1)
        expect(result.xpValue).toBe(DISSOLVE_XP[result.rarity])
      }
    }
  })

  it('stat roulette rolls 10–30% on a known stat', () => {
    for (let i = 0; i < 40; i++) {
      const result = rollRouletteStat(0)
      expect(result.kind).toBe('stat')
      if (result.kind === 'stat') {
        expect(result.pct).toBeGreaterThanOrEqual(10)
        expect(result.pct).toBeLessThanOrEqual(30)
        expect(result.xpValue).toBe(DISSOLVE_XP[result.rarity])
      }
    }
  })

  it('perm shop: escalating costs, buy flow, poverty and max guards', () => {
    const damageDef = PERM_UPGRADES.find((upgrade) => upgrade.key === 'damage')
    if (!damageDef) throw new Error('damage perm missing')
    expect(permCost(damageDef, 0)).toBe(60)
    expect(permCost(damageDef, 2)).toBe(180)
    let meta = { coins: 100, perm: { ...EMPTY_PERM } }
    const bought = buyPerm(meta, 'damage')
    expect(bought?.coins).toBe(40)
    expect(bought?.perm.damage).toBe(1)
    meta = bought ?? meta
    expect(buyPerm({ ...meta, coins: 0 }, 'damage')).toBeNull()
    expect(buyPerm({ coins: 9999, perm: { ...EMPTY_PERM, damage: PERM_MAX } }, 'damage')).toBeNull()
  })

  it('run coins are score / 20', () => {
    expect(runCoins(0)).toBe(0)
    expect(runCoins(419)).toBe(20)
    expect(runCoins(1000)).toBe(50)
  })

  it('combo chains raise per-kill score in the engine', () => {
    const state = initialSurvivalState('wisp')
    state.phase = 'running'
    for (let i = 0; i < 3; i++) {
      state.enemies.push({ id: 10 + i, x: state.player.x + 200, y: state.player.y, vx: 0, vy: 0, size: 12, hp: 0, maxHp: 1, kind: 'chaser', elite: false, hitFlash: 0 })
      tickSurvival(state, 0.016)
    }
    expect(state.kills).toBe(3)
    expect(state.comboBest).toBe(3)
    expect(state.comboBonus).toBe(1 + 2 + 3)
    tickSurvival(state, 0.016)
    expect(state.score).toBeGreaterThanOrEqual(30 + 6)
  })
})
