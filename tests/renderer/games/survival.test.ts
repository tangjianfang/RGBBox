import { describe, it, expect } from 'vitest'
import {
  applyUpgrade,
  directorSpawnInterval,
  initialSurvivalState,
  recomputeStats,
  tickSurvival,
  xpToNext,
} from '../../../src/renderer/src/games/survival'

describe('renderer/games/survival engine (R99.3/R99.4)', () => {
  it('xp curve grows with level', () => {
    expect(xpToNext(1)).toBe(8)
    expect(xpToNext(5)).toBeGreaterThan(xpToNext(2))
  })

  it('adaptive director: mercy at one hit from death, pressure when untouched', () => {
    const state = initialSurvivalState()
    const baseline = directorSpawnInterval(state)
    state.player.hp = 1
    expect(directorSpawnInterval(state)).toBeGreaterThan(baseline)
    state.player.hp = state.player.maxHp
    expect(directorSpawnInterval(state)).toBeLessThanOrEqual(baseline)
    state.time = 120
    expect(directorSpawnInterval(state)).toBeLessThan(baseline)
  })

  it('spawn pacing eases during the 12s opening grace window (R109)', () => {
    const state = initialSurvivalState('wisp')
    state.phase = 'running'
    state.time = 5
    const early = directorSpawnInterval(state)
    state.time = 15
    expect(early).toBeGreaterThan(directorSpawnInterval(state))
  })

  it('level-ups heal one HP (R109)', () => {
    const state = initialSurvivalState('wisp')
    state.phase = 'running'
    state.player.hp = 2
    state.xp = state.xpNext
    tickSurvival(state, 0.016)
    expect(state.level).toBe(2)
    expect(state.player.hp).toBe(3)
  })

  it('multishot fires one bullet per projectile and volleys damage enemies', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.taken.multishot = 2
    recomputeStats(state.stats, state.taken)
    state.enemies.push({ id: 99, x: state.player.x + 100, y: state.player.y, vx: 0, vy: 0, size: 14, hp: 50, maxHp: 50, kind: 'chaser', hitFlash: 0 })
    state.player.fireTimer = 0
    tickSurvival(state, 0.016)
    expect(state.bullets.length).toBe(3)
    for (let i = 0; i < 40; i++) tickSurvival(state, 0.016)
    expect(state.enemies[0].hp).toBeLessThan(50)
  })

  it('xp overflow freezes the run with three offers; applying one resumes', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.xp = state.xpNext
    tickSurvival(state, 0.016)
    expect(state.phase).toBe('levelup')
    expect(state.offers.length).toBe(3)
    applyUpgrade(state, state.offers[0])
    expect(state.phase).toBe('running')
    expect(state.level).toBe(2)
  })

  it('upgrade stats compound through recomputeStats', () => {
    const state = initialSurvivalState()
    state.taken.damage = 2
    state.taken.speed = 2
    recomputeStats(state.stats, state.taken)
    expect(state.stats.damage).toBe(3)
    expect(state.stats.moveSpeed).toBeGreaterThan(170)
  })

  it('boss spawns on the timer and pays out 15 orbs + heal on death (R100.1)', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.bossTimer = 0.01
    tickSurvival(state, 0.016)
    const boss = state.enemies.find((enemy) => enemy.kind === 'boss')
    expect(boss).toBeDefined()
    state.player.hp = 3
    boss.hp = 0
    const orbsBefore = state.orbs.length
    tickSurvival(state, 0.016)
    expect(state.orbs.length).toBe(orbsBefore + 15)
    expect(state.player.hp).toBe(4)
    expect(state.pendingSpins).toBe(1)
    expect(state.bossKills).toBe(1)
    expect(state.portal).toBeDefined()
    expect(state.enemies.every((enemy) => enemy.kind !== 'boss')).toBe(true)
  })

  it('entering the portal advances the island: clear field, heal, bonus, banner (R106)', () => {
    const state = initialSurvivalState('wisp')
    state.phase = 'running'
    state.island = 2
    state.portal = { x: state.player.x, y: state.player.y }
    state.player.hp = 2
    state.enemies.push({ id: 20, x: 400, y: 300, vx: 0, vy: 0, size: 14, hp: 5, maxHp: 5, kind: 'chaser', elite: false, hitFlash: 0 })
    tickSurvival(state, 0.016)
    expect(state.island).toBe(3)
    expect(state.enemies).toHaveLength(0)
    expect(state.orbs).toHaveLength(0)
    expect(state.portal).toBeNull()
    expect(state.player.hp).toBe(3)
    expect(state.comboBonus).toBe(150 * 3)
    expect(state.banner?.text).toBe('ISLAND 3')
  })

  it('enemy HP and spawn pacing scale with island depth (R106)', () => {
    const shallow = initialSurvivalState('wisp')
    const deep = initialSurvivalState('wisp')
    deep.island = 5
    expect(directorSpawnInterval(deep)).toBeLessThan(directorSpawnInterval(shallow))
    shallow.phase = 'running'
    deep.phase = 'running'
    shallow.spawnTimer = -1
    deep.spawnTimer = -1
    tickSurvival(shallow, 0.016)
    tickSurvival(deep, 0.016)
    const deepHp = deep.enemies[0]?.hp ?? 0
    const shallowHp = shallow.enemies[0]?.hp ?? 0
    expect(deepHp).toBeGreaterThan(shallowHp)
  })

  it('thorns reflect contact damage back at the attacker (R100.1)', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.taken.thorns = 2
    recomputeStats(state.stats, state.taken)
    state.enemies.push({ id: 5, x: state.player.x + 10, y: state.player.y, vx: 0, vy: 0, size: 14, hp: 10, maxHp: 10, kind: 'chaser', elite: false, hitFlash: 0 })
    const hpBefore = state.player.hp
    tickSurvival(state, 0.016)
    expect(state.player.hp).toBe(hpBefore - 1)
    expect(state.enemies[0].hp).toBeLessThanOrEqual(10 - 2)
  })

  it('regen heals one HP per interval when damaged (R100.1)', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.taken.regen = 1
    recomputeStats(state.stats, state.taken)
    expect(state.stats.regenInterval).toBe(24)
    state.player.hp = 2
    state.regenTimer = 23.99
    tickSurvival(state, 0.016)
    expect(state.player.hp).toBe(3)
  })

  it('analog axis keeps tilt magnitude and respects the deadzone (R103)', () => {
    const state = initialSurvivalState('wisp')
    state.phase = 'running'
    state.spawnTimer = 10
    const x0 = state.player.x
    state.axis = { x: 0.5, y: 0 }
    for (let i = 0; i < 10; i++) tickSurvival(state, 0.05)
    const halfTilt = state.player.x - x0
    expect(halfTilt).toBeGreaterThan(30)
    expect(halfTilt).toBeLessThan(55)
    const x1 = state.player.x
    state.axis = { x: 1, y: 0 }
    for (let i = 0; i < 10; i++) tickSurvival(state, 0.05)
    expect(state.player.x - x1).toBeGreaterThan(halfTilt * 1.5)
    const x2 = state.player.x
    state.axis = { x: 0.1, y: 0 }
    for (let i = 0; i < 10; i++) tickSurvival(state, 0.05)
    expect(state.player.x - x2).toBe(0)
  })
})
