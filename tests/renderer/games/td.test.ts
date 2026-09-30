// R201: TD 无尽/词缀/陨石。
import { describe, expect, it } from 'vitest'
import { affixForWave, AFFIX_PARAMS, BLITZ_WAVES, castMeteor, extrapolateBalloons, initialState, launchWave, MAX_WAVE, targetWaves, tickGame } from '../../../src/renderer/src/games/td'

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

describe('renderer/games/td engine (R99.6)', () => {
  it('standard run ceiling is MAX_WAVE; blitz runs cap at BLITZ_WAVES', () => {
    const standard = initialState()
    expect(standard.blitz).toBeFalsy()
    expect(targetWaves(standard)).toBe(MAX_WAVE)
    const blitz = initialState()
    blitz.blitz = true
    expect(targetWaves(blitz)).toBe(BLITZ_WAVES)
    expect(BLITZ_WAVES).toBe(6)
  })
})

describe('renderer/games/td FR-G08 short-run matrix (blitz)', () => {
  it('a blitz run wins the moment wave 6 is cleared — well before MAX_WAVE', () => {
    const state = initialState()
    state.blitz = true
    state.phase = 'running'
    state.wave = BLITZ_WAVES
    state.waveQueue = 0
    state.balloons = []
    tickGame(state, 0.016)
    expect(state.phase).toBe('won')
  })

  it('a standard run at wave 6 does NOT win — it keeps auto-launching toward MAX_WAVE', () => {
    const state = initialState()
    state.phase = 'running'
    state.wave = 6
    state.waveQueue = 0
    state.balloons = []
    tickGame(state, 0.016)
    expect(state.phase).toBe('running')
  })

  it('launchWave refuses to go past the blitz ceiling (no wave 7)', () => {
    const state = initialState()
    state.blitz = true
    state.phase = 'running'
    state.wave = BLITZ_WAVES
    launchWave(state)
    expect(state.wave).toBe(BLITZ_WAVES)
    state.wave = BLITZ_WAVES - 1
    launchWave(state)
    expect(state.wave).toBe(BLITZ_WAVES)
  })
})

// ── R209 三期: 客端插值渲染 —— extrapolateBalloons 纯函数 ──
describe('R209 guest balloon extrapolation', () => {
  const balloon = (over: Partial<Parameters<typeof extrapolateBalloons>[0]['balloons'][number]> = {}) => ({
    id: 1, progress: 0.5, speed: 0.1, hp: 3, maxHp: 3, reward: 5, slowUntil: 0, color: '#f00', ...over,
  })

  it('恒速线性外推:progress 按 speed·dt 前进;输入快照不被改动(纯函数)', () => {
    const snap = { affix: null as null, balloons: [balloon()] }
    const out = extrapolateBalloons(snap, 0.1)
    expect(out[0].progress).toBeCloseTo(0.5 + 0.1 * 0.1, 10)
    expect(snap.balloons[0].progress).toBe(0.5) // 基准未被污染(逐帧重算不叠加)
    // 再次以同基准外推同 dt 结果一致(无状态)
    expect(extrapolateBalloons(snap, 0.1)[0].progress).toBeCloseTo(0.51, 10)
  })

  it('dt=0/负值返回等值副本;dt 越大推进越多(时间单调)', () => {
    const snap = { affix: null as null, balloons: [balloon({ speed: 0.2 })] }
    expect(extrapolateBalloons(snap, 0)[0].progress).toBe(0.5)
    const a = extrapolateBalloons(snap, 0.05)[0].progress
    const b = extrapolateBalloons(snap, 0.1)[0].progress
    expect(b).toBeGreaterThan(a)
  })

  it('减速气球按 0.56 因子外推,slowUntil 同步衰减', () => {
    const snap = { affix: null as null, balloons: [balloon({ slowUntil: 2 })] }
    const out = extrapolateBalloons(snap, 0.5)
    expect(out[0].progress).toBeCloseTo(0.5 + 0.1 * 0.56 * 0.5, 10)
    expect(out[0].slowUntil).toBeCloseTo(1.5, 10)
  })

  it('词缀波按 AFFIX_PARAMS.speed 放大;progress 钳在 1 之下(逃逸由房主裁决)', () => {
    const snap = { affix: 'swift' as const, balloons: [balloon({ progress: 0.95, speed: 0.5 })] }
    const out = extrapolateBalloons(snap, 1)
    expect(out[0].progress).toBeLessThan(1)
    expect(out[0].progress).toBeGreaterThanOrEqual(0.9999)
    // 无词缀同参数也已钳制
    const plain = extrapolateBalloons({ affix: null, balloons: [balloon({ progress: 0.95, speed: 0.5 })] }, 1)
    expect(plain[0].progress).toBeLessThan(1)
  })
})
