import { describe, it, expect } from 'vitest'
import {
  applyUpgrade,
  deployPlayer2,
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

// ── R208 (FR-MP01): 本地合作——第二实体/独立输入/复活珠/双倒判负 ──
describe('FR-MP01 swarm local co-op', () => {
  it('deployPlayer2: 独立实体,位置分侧,继承 maxHp,出生带 2s 无敌', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    expect(state.player2).not.toBeNull()
    expect(state.player2!.hp).toBe(state.player.maxHp)
    expect(state.player2!.invuln).toBeGreaterThan(0)
    expect(Math.abs(state.player2!.x - state.player.x)).toBeGreaterThan(30)
  })

  it('P2 独立键位移动(keys2 分池,不与 P1 keys 串键)', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    state.phase = 'running'
    state.player2!.invuln = 0
    state.player2!.fireTimer = 99
    const x0 = state.player2!.x
    state.keys2.add('p2right')
    for (let i = 0; i < 30; i++) tickSurvival(state, 1 / 60)
    expect(state.player2!.x).toBeGreaterThan(x0 + 40)
    // P1 未按任何键,原地不动
    expect(state.player.x).toBe(initialSurvivalState().player.x)
  })

  it('P2 自动索敌开火(共享弹池)', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    state.phase = 'running'
    state.player2!.invuln = 0
    state.enemies.push({ id: 9001, kind: 'chaser', x: state.player2!.x + 120, y: state.player2!.y, hp: 5, maxHp: 5, size: 10, vx: 0, vy: 0, elite: false, hitFlash: 0 })
    const bullets = state.bullets.length
    state.player.fireTimer = 99
    tickSurvival(state, 1 / 60)
    expect(state.bullets.length).toBeGreaterThan(bullets)
  })

  it('单玩家倒下不判负,掉复活珠;全员倒下才 lost', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    state.phase = 'running'
    state.player2!.invuln = 0
    state.player2!.hp = 1
    state.player.invuln = 0
    state.enemies.push({ id: 9002, kind: 'brute', x: state.player2!.x, y: state.player2!.y, hp: 99, maxHp: 99, size: 12, vx: 0, vy: 0, elite: false, hitFlash: 0 })
    for (let i = 0; i < 240 && state.phase === 'running'; i++) tickSurvival(state, 1 / 60)
    expect(state.phase).toBe('running')
    expect(state.player2!.hp).toBeLessThanOrEqual(0)
    expect(state.reviveOrbs.length).toBe(1)
    expect(state.reviveOrbs[0].target).toBe(2)
  })

  it('队友拾取复活珠救回倒下玩家(半血+2s 无敌,每局各 1 次)', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    state.phase = 'running'
    state.player2!.hp = 0
    state.reviveOrbs.push({ id: 8001, x: state.player.x + 12, y: state.player.y, target: 2 })
    state.player2!.fireTimer = 99
    const before = state.revivesUsed.p2
    tickSurvival(state, 1 / 60)
    expect(state.reviveOrbs.length).toBe(0)
    expect(state.player2!.hp).toBeGreaterThanOrEqual(1)
    expect(state.player2!.invuln).toBeGreaterThan(1.5)
    expect(state.revivesUsed.p2).toBe(before + 1)
  })
})
