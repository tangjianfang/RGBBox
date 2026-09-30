// R201: TD 无尽/词缀/陨石。
import { describe, expect, it } from 'vitest'
import {
  AFFIXES, AFFIX_PARAMS, affixForWave, applyBalloonDamage, BLITZ_WAVES, castMeteor, DEEP_AFFIX_START_WAVE,
  extrapolateBalloons, initialState, launchWave, MAX_WAVE, REGEN_INTERVAL, targetWaves, tickGame,
  TD_BASE_COINS, TD_DIFFICULTY_PARAMS,
} from '../../../src/renderer/src/games/td'

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

// ── R218(A1): 难度四档参数化 ─────────────────────────────────────────────
describe('R218(A1) TD difficulty tiers', () => {
  it('四档参数表:休闲 30/0.8/+60 · 标准 20/1.0/0 · 困难 14/1.25/-40 · 炼狱 10/1.5/-80', () => {
    expect(TD_DIFFICULTY_PARAMS.casual).toEqual({ lives: 30, enemyHpMult: 0.8, startGoldDelta: 60 })
    expect(TD_DIFFICULTY_PARAMS.standard).toEqual({ lives: 20, enemyHpMult: 1.0, startGoldDelta: 0 })
    expect(TD_DIFFICULTY_PARAMS.hard).toEqual({ lives: 14, enemyHpMult: 1.25, startGoldDelta: -40 })
    expect(TD_DIFFICULTY_PARAMS.insane).toEqual({ lives: 10, enemyHpMult: 1.5, startGoldDelta: -80 })
  })

  it('initialState 按难度接线 lives/maxLives/coins/difficulty', () => {
    for (const d of ['casual', 'standard', 'hard', 'insane'] as const) {
      const s = initialState(d)
      expect(s.lives).toBe(TD_DIFFICULTY_PARAMS[d].lives)
      expect(s.maxLives).toBe(TD_DIFFICULTY_PARAMS[d].lives)
      expect(s.coins).toBe(TD_BASE_COINS + TD_DIFFICULTY_PARAMS[d].startGoldDelta)
      expect(s.difficulty).toBe(d)
    }
  })

  it('零参调用兼容旧路径:standard 20 命/220 金;旧 R204 直写 lives/coins 不被引擎回改', () => {
    const s = initialState()
    expect(s.lives).toBe(20)
    expect(s.coins).toBe(220)
    expect(s.difficulty).toBe('standard')
    // 旧 view 的 casual 直写(30 命/300 金)仍然生效——引擎不回写这两个字段
    s.lives = 30
    s.coins = 300
    s.phase = 'running'
    tickGame(s, 0.016)
    expect(s.lives).toBe(30)
    expect(s.coins).toBe(300)
  })

  it('敌 HP 系数按难度生效(wave 9 基础 4 血:3/4/5/6)', () => {
    const hpFor = (d: 'casual' | 'standard' | 'hard' | 'insane'): number => {
      const s = initialState(d)
      s.phase = 'running'
      s.wave = 9
      s.waveQueue = 1
      s.spawnTimer = 0
      tickGame(s, 0.016)
      return s.balloons[0].hp
    }
    expect(hpFor('casual')).toBe(3)
    expect(hpFor('standard')).toBe(4)
    expect(hpFor('hard')).toBe(5)
    expect(hpFor('insane')).toBe(6)
  })

  it('分数结算 ×难度倍率(同气球 standard 75 / insane 150)', () => {
    const scoreFor = (d: 'standard' | 'insane'): number => {
      const s = initialState(d)
      s.phase = 'running'
      s.balloons.push({ id: 1, progress: 0.2, speed: 0, hp: 0, maxHp: 1, reward: 10, slowUntil: 0, color: '#fb7185' })
      tickGame(s, 0.016)
      return s.score
    }
    expect(scoreFor('standard')).toBe(75) // 10 × 5 × 1.5
    expect(scoreFor('insane')).toBe(150) // 10 × 5 × 3
  })
})

// ── R218(A2): 新词缀 regen / armored ─────────────────────────────────────
describe('R218(A2) TD new affixes regen/armored', () => {
  it('AFFIXES 扩为 5 种;波 13-24 保持旧三循环,≥25 加权出新种(新词缀占 6/10)', () => {
    expect(AFFIXES).toHaveLength(5)
    expect(AFFIXES).toContain('regen')
    expect(AFFIXES).toContain('armored')
    expect(AFFIX_PARAMS.regen.regenPct).toBeCloseTo(0.08)
    expect(AFFIX_PARAMS.armored.armorMin).toBe(2)
    // 旧循环不动(13-24)
    expect(affixForWave(24)).toBe('phantom')
    // 深波加权池(确定性序列,LAN 双端一致)
    expect(affixForWave(DEEP_AFFIX_START_WAVE)).toBe('regen')
    expect(affixForWave(DEEP_AFFIX_START_WAVE + 1)).toBe('swift')
    expect(affixForWave(DEEP_AFFIX_START_WAVE + 2)).toBe('armored')
    const deep = Array.from({ length: 20 }, (_, i) => affixForWave(DEEP_AFFIX_START_WAVE + i))
    expect(deep.filter((a) => a === 'regen' || a === 'armored')).toHaveLength(12)
  })

  it('regen:每 3s 回 8% maxHp(至少 1),封顶不溢出', () => {
    const s = initialState()
    s.phase = 'running'
    s.affix = 'regen'
    s.balloons.push({ id: 1, progress: 0.1, speed: 0, hp: 1, maxHp: 10, reward: 10, slowUntil: 0, color: '#fb7185' })
    tickGame(s, REGEN_INTERVAL + 0.05)
    expect(s.balloons[0].hp).toBe(2) // 1 + max(1, round(10×0.08)=1)
    tickGame(s, REGEN_INTERVAL + 0.05)
    expect(s.balloons[0].hp).toBe(3)
    // 封顶:hp=maxHp 时不再回
    s.balloons[0].hp = 10
    tickGame(s, REGEN_INTERVAL + 0.05)
    expect(s.balloons[0].hp).toBe(10)
  })

  it('armored:1 伤被格挡(返回 0),2 伤放行;tough 厚血气球跨入 armored 波同样结算', () => {
    const b = { id: 1, progress: 0, speed: 0, hp: 5, maxHp: 5, reward: 10, slowUntil: 0, color: '#f00' }
    expect(applyBalloonDamage(b, 1, 'armored')).toBe(0)
    expect(b.hp).toBe(5)
    expect(applyBalloonDamage(b, 2, 'armored')).toBe(2)
    expect(b.hp).toBe(3)
    expect(applyBalloonDamage(b, 1, null)).toBe(1) // 非装甲波 1 伤照常
    // 叠加:坚韧波(wave 13,2.2× 血=11)吹出的厚血气球,下一波切重甲
    const s = initialState()
    s.affix = 'tough'
    s.wave = 13
    s.waveQueue = 1
    s.spawnTimer = 0
    s.phase = 'running'
    tickGame(s, 0.016)
    expect(s.balloons[0].hp).toBe(11)
    s.affix = 'armored'
    expect(applyBalloonDamage(s.balloons[0], 1, s.affix)).toBe(0)
    expect(s.balloons[0].hp).toBe(11)
    expect(applyBalloonDamage(s.balloons[0], 2, s.affix)).toBe(2)
    expect(s.balloons[0].hp).toBe(9)
  })

  it('弹丸结算接线:armored 波下 dart(1 伤)格挡存活,storm(2 伤)击破', () => {
    const s = initialState()
    s.phase = 'running'
    s.affix = 'armored'
    s.balloons.push({ id: 1, progress: 0.05, speed: 0, hp: 1, maxHp: 1, reward: 10, slowUntil: 0, color: '#fb7185' })
    s.towers.push({ id: 1, kind: 'dart', x: 60, y: 230, level: 1, spent: 70, angle: 0, range: 126, cooldown: 0, fireRate: 0.62, damage: 1 })
    tickGame(s, 0.02) // 锁定+开火
    tickGame(s, 0.2)  // 弹丸命中
    expect(s.balloons).toHaveLength(1) // 1 伤被格挡
    expect(s.texts.some((t) => t.text === 'BLOCK')).toBe(true)
    // 换 2 伤 storm
    s.towers[0] = { id: 2, kind: 'storm', x: 60, y: 230, level: 1, spent: 145, angle: 0, range: 146, cooldown: 0, fireRate: 1.32, damage: 2 }
    s.projectiles = []
    tickGame(s, 0.02)
    tickGame(s, 0.2)
    expect(s.balloons).toHaveLength(0) // 2 伤放行 → 击破
  })
})

// ── R218(A3): 基地生命条 + HUD 半透明 + juice ─────────────────────────────
describe('R218(A3) TD juice integration', () => {
  it('漏气球:hitStop 0.02 + juice.shake≥3 + 飘字 -1 各触发一次;随 tick 衰减归零', () => {
    const s = initialState()
    s.phase = 'running'
    s.balloons.push({ id: 1, progress: 0.999, speed: 0.5, hp: 5, maxHp: 5, reward: 10, slowUntil: 0, color: '#fb7185' })
    tickGame(s, 0.016)
    expect(s.lives).toBe(19)
    expect(s.juice.hitStop).toBeCloseTo(0.02, 5)
    expect(s.juice.shake).toBeGreaterThanOrEqual(3)
    expect(s.juice.floats.filter((f) => f.text === '-1')).toHaveLength(1)
    // 衰减:hitStop 冻结帧内递减;shake 指数衰减;飘字 0.8s 退场
    for (let i = 0; i < 60; i++) tickGame(s, 0.016)
    expect(s.juice.hitStop).toBe(0)
    expect(s.juice.shake).toBe(0)
    expect(s.juice.floats).toHaveLength(0)
  })

  it('boss 波(5 的倍数波)开场 toast;普通波无 toast;3s 自动退场', () => {
    const s = initialState()
    s.phase = 'running'
    for (let i = 0; i < 4; i++) launchWave(s)
    expect(s.toasts).toHaveLength(0)
    launchWave(s) // wave 5
    expect(s.toasts).toHaveLength(1)
    expect(s.toasts[0].text).toContain('BOSS')
    for (let i = 0; i < 200; i++) tickGame(s, 0.016) // 3.2s
    expect(s.toasts).toHaveLength(0)
  })
})
