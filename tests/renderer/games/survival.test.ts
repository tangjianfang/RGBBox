import { describe, it, expect } from 'vitest'
import {
  applyUpgrade,
  debugSpawnBoss,
  deployPlayer2,
  deployPlayers,
  directorSpawnInterval,
  enemyContactDamage,
  enemySpeedFor,
  ENEMY_SPAWN_WEIGHTS,
  ENEMY_UNLOCK_SECONDS,
  initialSurvivalState,
  pickSpawnKindFrom,
  recomputeStats,
  setSurvivalDifficulty,
  SPAWNABLE_KINDS,
  spawnEnemyKind,
  startSurvival,
  SURVIVAL_DIFFICULTY_PARAMS,
  threatOf,
  tickSurvival,
  xpToNext,
} from '../../../src/renderer/src/games/survival'
import { DIFFICULTY_SCORE_MULT, GAME_DIFFICULTIES, type GameDifficulty } from '../../../src/renderer/src/games/hud'
import { WIDTH } from '../../../src/renderer/src/games/td'

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

describe('renderer/games/survival FR-G08 short-run matrix (sprint)', () => {
  it('a sprint run settles as lost ("time up") once time passes sprintSeconds, score kept', () => {
    const state = initialSurvivalState()
    state.sprintSeconds = 90
    state.phase = 'running'
    state.kills = 5
    state.comboBonus = 100
    state.time = 90 - 0.05
    tickSurvival(state, 0.05)
    expect(state.time).toBeGreaterThanOrEqual(90)
    expect(state.phase).toBe('lost')
    expect(state.player.hp).toBe(state.player.maxHp) // time-up, not death
    expect(state.score).toBeGreaterThan(0)
  })

  it('an endless run (sprintSeconds undefined) never times out', () => {
    const state = initialSurvivalState()
    state.phase = 'running'
    state.spawnTimer = 10
    state.time = 90
    tickSurvival(state, 0.016)
    expect(state.phase).toBe('running')
  })
})

// ── R213: 4P 引擎数组化——players/inputs 名册 + deployPlayers + 别名兼容 ──
describe('R213 4P engine roster', () => {
  it('别名不变量: player===players[0] / keys===inputs[0];deploy 后 player2/keys2 同引用', () => {
    const state = initialSurvivalState()
    expect(state.players).toHaveLength(1)
    expect(state.player).toBe(state.players[0])
    expect(state.keys).toBe(state.inputs[0])
    expect(state.revivesUsedN).toEqual([0, 0, 0, 0])
    deployPlayers(state, 2)
    expect(state.player2).toBe(state.players[1])
    expect(state.keys2).toBe(state.inputs[1])
    deployPlayers(state, 4)
    expect(state.players).toHaveLength(4)
    expect(state.inputs).toHaveLength(4)
    // 扩名册不破坏别名(P1 恒为同一对象)
    expect(state.player).toBe(state.players[0])
    expect(state.player2).toBe(state.players[1])
    expect(state.keys).toBe(state.inputs[0])
    expect(state.keys2).toBe(state.inputs[1])
  })

  it('deployPlayers(4): 四实体就位/位置互距>30/HP 继承 maxHp 且出生无敌', () => {
    const state = initialSurvivalState()
    state.player.maxHp = 9
    state.player.hp = 9
    deployPlayers(state, 4)
    expect(state.players).toHaveLength(4)
    for (let i = 0; i < 4; i++) {
      const pl = state.players[i]
      expect(pl.hp).toBe(9)
      expect(pl.maxHp).toBe(9)
      if (i > 0) expect(pl.invuln).toBeGreaterThan(0)
      for (let j = i + 1; j < 4; j++) {
        expect(Math.hypot(pl.x - state.players[j].x, pl.y - state.players[j].y)).toBeGreaterThan(30)
      }
    }
  })

  it('P3 键池 inputs[2] 独立移动(p3right),其余玩家零串键', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 4)
    state.phase = 'running'
    for (const pl of state.players) {
      pl.invuln = 0
      pl.fireTimer = 99
    }
    const xs = state.players.map((pl) => pl.x)
    state.inputs[2].add('p3right')
    for (let i = 0; i < 30; i++) tickSurvival(state, 1 / 60)
    expect(state.players[2].x).toBeGreaterThan(xs[2] + 40)
    expect(state.players[0].x).toBe(xs[0])
    expect(state.players[1].x).toBe(xs[1])
    expect(state.players[3].x).toBe(xs[3])
  })

  it('四人局:三人倒下仍 running,全员倒下才 lost(弹幕结算路径)', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 4)
    state.phase = 'running'
    state.stats.magnet = 10
    for (const pl of state.players) {
      pl.invuln = 0
      pl.hp = 1
      pl.fireTimer = 99
    }
    const hit = (i: number): void => {
      state.eBullets.push({ x: state.players[i].x, y: state.players[i].y, vx: 0, vy: 0, size: 20, life: 1 })
    }
    hit(1)
    hit(2)
    hit(3)
    tickSurvival(state, 1 / 60)
    expect(state.phase).toBe('running')
    expect(state.players.filter((pl) => pl.hp <= 0)).toHaveLength(3)
    expect(state.reviveOrbs.map((orb) => orb.target).sort()).toEqual([2, 3, 4])
    // 最后一人倒下 → lost
    hit(0)
    tickSurvival(state, 1 / 60)
    expect(state.phase).toBe('lost')
  })

  it('复活珠 target 3:队友拾取复活 P3,revivesUsedN 计数且不误写 legacy {p1,p2}', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 4)
    state.phase = 'running'
    state.stats.magnet = 10
    state.players[2].hp = 0
    state.reviveOrbs.push({ id: 7001, x: state.player.x + 10, y: state.player.y, target: 3 })
    tickSurvival(state, 1 / 60)
    expect(state.reviveOrbs).toHaveLength(0)
    expect(state.players[2].hp).toBeGreaterThanOrEqual(1)
    expect(state.players[2].invuln).toBeGreaterThan(1.5)
    expect(state.revivesUsedN[2]).toBe(1)
    expect(state.revivesUsed).toEqual({ p1: 0, p2: 0 })
  })

  it('legacy 兼容:视图直置 player2=null(合作开关关)后名册截断,P2 不再被处理', () => {
    const state = initialSurvivalState()
    deployPlayer2(state)
    state.phase = 'running'
    state.player2!.invuln = 0
    state.player2!.fireTimer = 99
    state.player2 = null
    state.keys2.add('p2right') // keys2 仍是有效 Set(视图释放路径会写)
    tickSurvival(state, 1 / 60)
    expect(state.players).toHaveLength(1)
    expect(state.inputs).toHaveLength(1)
    expect(state.phase).toBe('running')
  })
})

describe('R213 二期 P2-P4 手柄摇杆轴控', () => {
  it('axes 槽随 deployPlayers 人数伸缩(1→4→1),初始为 1 槽', () => {
    const state = initialSurvivalState()
    expect(state.axes).toHaveLength(1)
    deployPlayers(state, 4)
    expect(state.axes).toHaveLength(4)
    deployPlayers(state, 1)
    expect(state.axes).toHaveLength(1)
    // 视图直置 player2=null(截断名册)后 tick 入口 syncRoster 同步收 axes
    deployPlayers(state, 3)
    state.player2 = null
    tickSurvival(state, 1 / 60)
    expect(state.axes).toHaveLength(1)
  })

  it('axes[1].x>0.5 → P2 右移,P1/P3 零串轴(无键池输入)', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 3)
    state.phase = 'running'
    const [p1, p2, p3] = state.players
    state.axes[1] = { x: 0.9, y: 0 }
    tickSurvival(state, 0.5)
    expect(p2.x).toBeGreaterThan(WIDTH / 2 - 60 + 20)
    expect(p2.angle).toBeCloseTo(0, 5)
    expect(p1.x).toBe(WIDTH / 2)
    expect(p3.x).toBe(WIDTH / 2 + 60)
  })

  it('axes[2].y<-0.5 → P3 上移(y 减小);死区内(<0.18)不动', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 3)
    state.phase = 'running'
    const p3 = state.players[2]
    const y0 = p3.y
    state.axes[2] = { x: 0, y: -0.8 }
    tickSurvival(state, 0.5)
    expect(p3.y).toBeLessThan(y0 - 20)
    const p2 = state.players[1]
    const y2 = p2.y
    state.axes[1] = { x: 0.1, y: 0 } // 死区内:不产生移动
    tickSurvival(state, 0.5)
    expect(p2.y).toBe(y2)
  })

  it('轴幅度缩放移速(与 P1 axis 同语义):半倾位移约为满倾一半', () => {
    const state = initialSurvivalState()
    deployPlayers(state, 2)
    state.phase = 'running'
    const p2 = state.players[1]
    state.axes[1] = { x: 1, y: 0 }
    tickSurvival(state, 0.3)
    const full = p2.x - (WIDTH / 2 - 60)
    p2.x = WIDTH / 2 - 60
    state.axes[1] = { x: 0.5, y: 0 }
    tickSurvival(state, 0.3)
    const half = p2.x - (WIDTH / 2 - 60)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeCloseTo(full / 2, 5)
  })
})

// ── R218 E: 难度四档 eHP(休闲 10×0.65 / 标准 7×1.0 / 困难 5×1.35 / 炼狱 3×1.6) ──
describe('R218 survival difficulty tiers (eHP + 血条化)', () => {
  it('四档 maxHp 计算矩阵: 难度基数 + 角色 hpMod + 永久成长叠加;玻璃=1', () => {
    expect(initialSurvivalState('wisp', undefined, [], 'casual').player.maxHp).toBe(10)
    expect(initialSurvivalState('wisp', undefined, [], 'standard').player.maxHp).toBe(7)
    expect(initialSurvivalState('wisp', undefined, [], 'hard').player.maxHp).toBe(5)
    expect(initialSurvivalState('wisp', undefined, [], 'insane').player.maxHp).toBe(3)
    // bulwark hpMod+3 / volt hpMod-1 / 永久成长 maxHp+2 仍按原式叠加
    expect(initialSurvivalState('bulwark', undefined, [], 'standard').player.maxHp).toBe(10)
    expect(initialSurvivalState('volt', undefined, [], 'hard').player.maxHp).toBe(4)
    expect(initialSurvivalState('wisp', { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 2, xpGain: 0, luck: 0 }, [], 'hard').player.maxHp).toBe(7)
    expect(initialSurvivalState('wisp', undefined, ['glass'], 'casual').player.maxHp).toBe(1)
    // 缺省档为 standard(旧调用点零改动)
    expect(initialSurvivalState().player.maxHp).toBe(7)
    expect(initialSurvivalState().difficulty).toBe('standard')
  })

  it('敌伤乘难度系数后取整 ≥1: 休闲/标准/困难=1,炼狱=2', () => {
    const expected: Record<GameDifficulty, number> = { casual: 1, standard: 1, hard: 1, insane: 2 }
    for (const d of GAME_DIFFICULTIES) {
      expect(enemyContactDamage(initialSurvivalState('wisp', undefined, [], d))).toBe(expected[d])
    }
  })

  it('容错次数反推(受击 1.2 次/min × 10min ≈ 12 次口径): 单调递减 10>7>5>2', () => {
    const tolerance = (d: GameDifficulty): number =>
      Math.ceil(SURVIVAL_DIFFICULTY_PARAMS[d].hp / Math.max(1, Math.round(SURVIVAL_DIFFICULTY_PARAMS[d].enemyDmgMult)))
    expect(tolerance('casual')).toBe(10)
    expect(tolerance('standard')).toBe(7)
    expect(tolerance('hard')).toBe(5)
    expect(tolerance('insane')).toBe(2)
    // 休闲档裸容错 ≥ 平均局(12 次受击)的八成——升级/换岛/boss 击杀的 +1HP
    // 治疗流补足余量;炼狱档显著低于平均(硬核定位)
    expect(tolerance('casual')).toBeGreaterThanOrEqual(Math.ceil(12 * 0.8))
    expect(tolerance('insane')).toBeLessThan(12)
    expect(tolerance('casual')).toBeGreaterThan(tolerance('standard'))
    expect(tolerance('standard')).toBeGreaterThan(tolerance('hard'))
    expect(tolerance('hard')).toBeGreaterThan(tolerance('insane'))
  })

  it('scoreMult 与共享 hud.DIFFICULTY_SCORE_MULT 同表;分数按难度倍率放大', () => {
    for (const d of GAME_DIFFICULTIES) {
      expect(SURVIVAL_DIFFICULTY_PARAMS[d].scoreMult).toBe(DIFFICULTY_SCORE_MULT[d])
    }
    const casual = initialSurvivalState('wisp', undefined, [], 'casual')
    const insane = initialSurvivalState('wisp', undefined, [], 'insane')
    for (const s of [casual, insane]) {
      s.phase = 'running'
      s.spawnTimer = 99
      s.bossTimer = 99
      s.kills = 100
      s.time = 60
      s.comboBonus = 0
      tickSurvival(s, 0.016)
    }
    expect(insane.score).toBeGreaterThan(casual.score * 2)
  })

  it('受击走难度伤害: 炼狱档接触伤害 2,飘出 -2 数字并触发闪白', () => {
    const s = initialSurvivalState('wisp', undefined, [], 'insane')
    s.phase = 'running'
    s.spawnTimer = 99
    s.enemies.push({ id: 1, x: s.player.x + 5, y: s.player.y, vx: 0, vy: 0, size: 14, hp: 99, maxHp: 99, kind: 'chaser', elite: false, hitFlash: 0 })
    const hp0 = s.player.hp
    tickSurvival(s, 0.016)
    expect(s.player.hp).toBe(hp0 - 2)
    expect(s.player.hitFlash).toBeGreaterThan(0)
    expect(s.texts.some((tx) => tx.text === '-2')).toBe(true)
  })

  it('敌速乘难度系数: hard 档 chaser 位移 ≈ 标准 ×1.08', () => {
    const std = initialSurvivalState('wisp', undefined, [], 'standard')
    const hard = initialSurvivalState('wisp', undefined, [], 'hard')
    for (const s of [std, hard]) {
      s.phase = 'running'
      s.spawnTimer = 99
      s.bossTimer = 99
      s.enemies.push({ id: 1, x: s.player.x, y: s.player.y - 300, vx: 0, vy: 0, size: 14, hp: 999, maxHp: 999, kind: 'chaser', elite: false, hitFlash: 0 })
    }
    tickSurvival(std, 1)
    tickSurvival(hard, 1)
    const movedStd = Math.abs(std.enemies[0].y - (std.player.y - 300))
    const movedHard = Math.abs(hard.enemies[0].y - (hard.player.y - 300))
    expect(movedHard).toBeGreaterThan(movedStd)
    expect(movedHard / movedStd).toBeCloseTo(1.08, 1)
  })

  it('setSurvivalDifficulty: ready 态改档全员 maxHp/hp 随基数差平移;玻璃局跳过', () => {
    const s = initialSurvivalState('wisp', undefined, [], 'standard')
    deployPlayers(s, 2)
    setSurvivalDifficulty(s, 'casual')
    for (const pl of s.players) {
      expect(pl.maxHp).toBe(10)
      expect(pl.hp).toBe(10)
    }
    setSurvivalDifficulty(s, 'insane')
    for (const pl of s.players) {
      expect(pl.maxHp).toBe(3)
      expect(pl.hp).toBe(3)
    }
    const glass = initialSurvivalState('wisp', undefined, ['glass'], 'standard')
    setSurvivalDifficulty(glass, 'casual')
    expect(glass.player.maxHp).toBe(1)
  })
})

// ── R218 D: 敌人 8 种行为正交矩阵 + 威胁值加权投放 ──────────────────────────
describe('R218 enemy matrix (8 行为正交 + 威胁值加权投放)', () => {
  it('威胁值全为正;投放权重全为正、和为 1,且高威胁种类更稀有', () => {
    let sum = 0
    for (const kind of SPAWNABLE_KINDS) {
      expect(threatOf(kind)).toBeGreaterThan(0)
      expect(ENEMY_SPAWN_WEIGHTS[kind]).toBeGreaterThan(0)
      expect(ENEMY_SPAWN_WEIGHTS[kind]).toBeLessThan(1)
      sum += ENEMY_SPAWN_WEIGHTS[kind]
    }
    expect(sum).toBeCloseTo(1, 9)
    expect(ENEMY_SPAWN_WEIGHTS.tank).toBeLessThan(ENEMY_SPAWN_WEIGHTS.chaser)
    expect(ENEMY_SPAWN_WEIGHTS.tank).toBeLessThan(ENEMY_SPAWN_WEIGHTS.swarm)
  })

  it('波次解锁单调: swarm<tank<shooter<splitter<healer(映射 45/60/75/90/105s)', () => {
    expect(ENEMY_UNLOCK_SECONDS.swarm).toBeLessThan(ENEMY_UNLOCK_SECONDS.tank)
    expect(ENEMY_UNLOCK_SECONDS.tank).toBeLessThan(ENEMY_UNLOCK_SECONDS.shooter)
    expect(ENEMY_UNLOCK_SECONDS.shooter).toBeLessThan(ENEMY_UNLOCK_SECONDS.splitter)
    expect(ENEMY_UNLOCK_SECONDS.splitter).toBeLessThan(ENEMY_UNLOCK_SECONDS.healer)
    for (const kind of SPAWNABLE_KINDS) expect(ENEMY_UNLOCK_SECONDS[kind]).toBeGreaterThanOrEqual(0)
  })

  it('pickSpawnKindFrom: 未解锁期恒 chaser;满解锁期 roll 全扫描覆盖全部 8 种', () => {
    for (let i = 0; i < 200; i++) expect(pickSpawnKindFrom(30, i / 200)).toBe('chaser')
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) seen.add(pickSpawnKindFrom(1000, i / 2000))
    expect(seen.size).toBe(8)
  })

  it('swarm 虫群: 一次 spawn 8-12 个 size 6 小体,hp≥1,速度散布 0.75-1.25', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    spawnEnemyKind(s, 'swarm', 400, 300)
    const pack = s.enemies.filter((e) => e.kind === 'swarm')
    expect(pack.length).toBeGreaterThanOrEqual(8)
    expect(pack.length).toBeLessThanOrEqual(12)
    for (const e of pack) {
      expect(e.size).toBe(6)
      expect(e.hp).toBeGreaterThanOrEqual(1)
      expect(e.jitter ?? 1).toBeGreaterThanOrEqual(0.75)
      expect(e.jitter ?? 1).toBeLessThanOrEqual(1.25)
    }
  })

  it('tank 堡垒: 移速下界 22 且显著慢于 brute(40);hp 公式 ×6 于 brute 基线', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.time = 60
    const tank = { id: 1, x: 450, y: 100, vx: 0, vy: 0, size: 22, hp: 100, maxHp: 100, kind: 'tank', elite: false, hitFlash: 0 }
    const brute = { id: 2, x: 450, y: 100, vx: 0, vy: 0, size: 20, hp: 100, maxHp: 100, kind: 'brute', elite: false, hitFlash: 0 }
    expect(enemySpeedFor(s, tank)).toBe(22)
    expect(enemySpeedFor(s, tank)).toBeLessThan(enemySpeedFor(s, brute))
    spawnEnemyKind(s, 'tank', 100, 100)
    spawnEnemyKind(s, 'brute', 100, 100)
    const spawnedTank = s.enemies.find((e) => e.kind === 'tank')
    const spawnedBrute = s.enemies.find((e) => e.kind === 'brute')
    expect(spawnedTank!.hp).toBe(spawnedBrute!.hp * 6)
    expect(spawnedTank!.size).toBe(22)
  })

  it('shooter 炮手: 距离保持带死区(远于 300 接近/带内径向不动/近于 220 后撤)+ 2.2s 瞄准弹', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    const mk = (dx: number): void => {
      s.enemies.length = 0
      s.enemies.push({ id: 1, x: s.player.x + dx, y: s.player.y, vx: 0, vy: 0, size: 11, hp: 50, maxHp: 50, kind: 'shooter', elite: false, hitFlash: 0, fireTimer: 99, strafeDir: 1 })
    }
    mk(500)
    tickSurvival(s, 0.5)
    expect(Math.abs(s.enemies[0].x - s.player.x)).toBeLessThan(500)
    mk(260)
    const radialBefore = Math.hypot(s.enemies[0].x - s.player.x, s.enemies[0].y - s.player.y)
    tickSurvival(s, 0.2)
    const radialAfter = Math.hypot(s.enemies[0].x - s.player.x, s.enemies[0].y - s.player.y)
    expect(Math.abs(radialAfter - radialBefore)).toBeLessThan(1)
    expect(radialAfter).toBeGreaterThanOrEqual(220)
    expect(radialAfter).toBeLessThanOrEqual(300)
    mk(150)
    tickSurvival(s, 0.5)
    expect(Math.abs(s.enemies[0].x - s.player.x)).toBeGreaterThan(150)
    mk(280)
    s.enemies[0].fireTimer = 0.01
    s.eBullets.length = 0
    tickSurvival(s, 0.1)
    expect(s.eBullets.length).toBe(1)
    // elite 提速:1.5s 一发
    s.enemies[0].elite = true
    s.enemies[0].fireTimer = 0.01
    s.eBullets.length = 0
    tickSurvival(s, 0.1)
    expect(s.enemies[0].fireTimer).toBeCloseTo(1.5, 5)
  })

  it('healer 医疗者: 6s 脉冲治疗半径 90 内友军 +30% maxHp(有上限),远处友军不回', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    const healer = { id: 1, x: s.player.x + 300, y: s.player.y, vx: 0, vy: 0, size: 12, hp: 20, maxHp: 20, kind: 'healer', elite: false, hitFlash: 0, healTimer: 0 }
    const near = { id: 2, x: healer.x + 50, y: healer.y, vx: 0, vy: 0, size: 14, hp: 2, maxHp: 10, kind: 'chaser', elite: false, hitFlash: 0 }
    const capped = { id: 3, x: healer.x - 60, y: healer.y, vx: 0, vy: 0, size: 14, hp: 9, maxHp: 10, kind: 'chaser', elite: false, hitFlash: 0 }
    const far = { id: 4, x: healer.x + 300, y: healer.y, vx: 0, vy: 0, size: 14, hp: 2, maxHp: 10, kind: 'chaser', elite: false, hitFlash: 0 }
    s.enemies.push(healer, near, capped, far)
    tickSurvival(s, 0.02)
    expect(near.hp).toBe(5) // 2 + round(10*0.3)=3
    expect(capped.hp).toBe(10) // 9+3 → 钳到 maxHp
    expect(far.hp).toBe(2)
    expect(healer.healPulse ?? 0).toBeGreaterThan(0)
    // 脉冲后计时回满档(elite 4s / 普通 6s)
    expect(healer.healTimer).toBe(6)
  })

  it('splitter 分裂体: 母体死亡裂变 2 个 size 7 小体(gen1),小体死亡不再裂变', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.enemies.push({ id: 1, x: 300, y: 300, vx: 0, vy: 0, size: 12, hp: 0, maxHp: 9, kind: 'splitter', elite: false, hitFlash: 0, gen: 0 })
    tickSurvival(s, 0.016)
    const children = s.enemies.filter((e) => e.kind === 'splitter')
    expect(children).toHaveLength(2)
    for (const c of children) {
      expect(c.size).toBe(7)
      expect(c.gen).toBe(1)
      expect(c.hp).toBe(2)
    }
    for (const c of children) c.hp = 0
    tickSurvival(s, 0.016)
    expect(s.enemies.filter((e) => e.kind === 'splitter')).toHaveLength(0)
  })

  it('boss 弹幕四型显式轮转: bossBulletPattern 逐齐射 +1 并 mod 4', () => {
    const s = initialSurvivalState()
    startSurvival(s)
    debugSpawnBoss(s)
    const boss = s.enemies.find((e) => e.kind === 'boss')!
    for (let volley = 1; volley <= 5; volley++) {
      s.bossBulletTimer = 1.19
      boss.x = 450
      boss.y = 260
      const before = s.eBullets.length
      tickSurvival(s, 0.02)
      expect(s.bossBulletPattern).toBe(volley % 4)
      expect(s.eBullets.length).toBeGreaterThan(before)
    }
  })
})
