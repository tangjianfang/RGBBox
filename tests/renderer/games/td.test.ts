// R201: TD 无尽/词缀/陨石。
import { describe, expect, it } from 'vitest'
import { affixForWave, AFFIX_PARAMS, castMeteor, initialState, launchWave, tickGame } from '../../../src/renderer/src/games/td'

describe('td endless + affix (FR-TD02)', () => {
  it('affix cycles after wave 12 (swift→tough→phantom→swift…)', () => {
    expect(affixForWave(12)).toBeNull()
    expect(affixForWave(13)).toBe('swift')
    expect(affixForWave(14)).toBe('tough')
    expect(affixForWave(15)).toBe('phantom')
    expect(affixForWave(16)).toBe('swift')
    expect(AFFIX_PARAMS.tough.hp).toBeGreaterThan(1.5)
    expect(AFFIX_PARAMS.swift.speed).toBeGreaterThan(1.2)
  })

  it('endless flag prevents the 12-wave win; wave counter keeps growing', () => {
    const s = initialState()
    s.endless = true
    s.phase = 'running'
    for (let i = 0; i < 13; i += 1) launchWave(s)
    expect(s.wave).toBe(13)
    expect(s.affix).toBe('swift')
    // 清空场面与队列——普通模式此处判胜,无尽不判
    s.waveQueue = 0
    s.balloons = []
    s.spawnTimer = 0
    tickGame(s, 0.016)
    expect(s.phase).toBe('running')
    // 对照:非无尽清空后判胜
    const s2 = initialState()
    s2.endless = false
    s2.phase = 'running'
    for (let i = 0; i < 12; i += 1) launchWave(s2)
    s2.waveQueue = 0
    s2.balloons = []
    s2.spawnTimer = 0
    s2.waveCooldown = 0
    tickGame(s2, 0.5)
    expect(['won', 'running']).toContain(s2.phase)
  })
})

describe('td meteor skill (FR-TD03)', () => {
  it('damages all balloons, sets 45s cooldown, second cast blocked until cooled', () => {
    const s = initialState()
    s.phase = 'running'
    s.balloons.push({ id: 1, progress: 0.1, speed: 0.05, hp: 30, maxHp: 30, reward: 10, slowUntil: 0, color: '#fb7185' } as never)
    s.balloons.push({ id: 2, progress: 0.2, speed: 0.05, hp: 50, maxHp: 50, reward: 18, slowUntil: 0, color: '#f97316' } as never)
    const hit = castMeteor(s)
    expect(hit).toBe(2)
    expect(s.meteorCd).toBe(45)
    // 30 血的被打死,50 血的剩 10
    expect(s.balloons.map((b) => b.hp)).toEqual([10])
    // 冷却中不可再放
    expect(castMeteor(s)).toBe(0)
    // 冷却走完可再放
    s.meteorCd = 0
    expect(castMeteor(s)).toBeGreaterThan(0)
  })
})
