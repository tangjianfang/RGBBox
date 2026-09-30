import { describe, it, expect } from 'vitest'
import {
  applyUpgrade,
  cameraZoomFor,
  centroidToOffset,
  debugSpawnBoss,
  drawSurvival,
  hitRadiusOf,
  playersCentroid,
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
  smoothOffsetTo,
  softPushForce,
  SPAWNABLE_KINDS,
  spawnEnemyKind,
  startSurvival,
  SURVIVAL_DIFFICULTY_PARAMS,
  threatOf,
  tickSurvival,
  updateCamera,
  worldToViewport,
  WORLD_W,
  WORLD_H,
  playersBBox,
  xpToNext,
} from '../../../src/renderer/src/games/survival'
import { DIFFICULTY_SCORE_MULT, GAME_DIFFICULTIES, type GameDifficulty } from '../../../src/renderer/src/games/hud'
import { WIDTH, HEIGHT } from '../../../src/renderer/src/games/td'

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
    // R219.9: P1 基线在部署后取(初始态 P1 在 vp 中心,多人部署整体迁世界中心)
    const p1x0 = state.player.x
    state.keys2.add('p2right')
    for (let i = 0; i < 30; i++) tickSurvival(state, 1 / 60)
    expect(state.player2!.x).toBeGreaterThan(x0 + 40)
    // P1 未按任何键,原地不动
    expect(state.player.x).toBe(p1x0)
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
    // R218 U11: 初始位置改世界中心(WORLD_W/2 基准)
    expect(p2.x).toBeGreaterThan(WORLD_W / 2 - 60 + 20)
    expect(p2.angle).toBeCloseTo(0, 5)
    expect(p1.x).toBe(WORLD_W / 2)
    expect(p3.x).toBe(WORLD_W / 2 + 60)
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
    const full = p2.x - (WORLD_W / 2 - 60)
    p2.x = WORLD_W / 2 - 60
    state.axes[1] = { x: 0.5, y: 0 }
    tickSurvival(state, 0.3)
    const half = p2.x - (WORLD_W / 2 - 60)
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
    // R218 U8: 伤害数字走 juice.floats(hud floatText)
    expect(s.juice.floats.some((tx) => tx.text === '-2')).toBe(true)
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
    // 母体击杀的 0.03s 顿帧(R218 U8)占 2 帧,越过冻结窗后再判
    for (let i = 0; i < 3; i++) tickSurvival(s, 0.016)
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

// ── R218 B/U6: 尺寸重校(全线缩 20-25%)+ 宽容判定(判定 ≤ 视觉 80%) ──────────
describe('R218 size recalibration + forgiving hitboxes', () => {
  it('hitRadiusOf = 视觉 size × 0.8', () => {
    expect(hitRadiusOf(14)).toBeCloseTo(11.2, 5)
    expect(hitRadiusOf(11)).toBeCloseTo(8.8, 5)
    for (const size of [6, 9, 11, 12, 15, 22, 28]) {
      expect(hitRadiusOf(size)).toBeGreaterThan(0)
      expect(hitRadiusOf(size) / size).toBeCloseTo(0.8, 5)
    }
  })

  it('尺寸表: 玩家 11/chaser 11/sprinter 9/brute 15/boss 28/tank 22/swarm 6/shooter 11/splitter+healer 12', () => {
    const s = initialSurvivalState()
    expect(s.player.size).toBe(11)
    s.phase = 'running'
    s.time = 200
    for (const kind of ['chaser', 'sprinter', 'brute', 'tank', 'swarm', 'shooter', 'splitter', 'healer'] as const) {
      spawnEnemyKind(s, kind, 100, 100)
    }
    const byKind = new Map(s.enemies.filter((e) => e.kind !== 'swarm' || true).map((e) => [e.kind, e.size]))
    expect(byKind.get('chaser')).toBe(11)
    expect(byKind.get('sprinter')).toBe(9)
    expect(byKind.get('brute')).toBe(15)
    expect(byKind.get('tank')).toBe(22)
    expect(byKind.get('swarm')).toBe(6)
    expect(byKind.get('shooter')).toBe(11)
    expect(byKind.get('splitter')).toBe(12)
    expect(byKind.get('healer')).toBe(12)
    debugSpawnBoss(s)
    expect(s.enemies.find((e) => e.kind === 'boss')!.size).toBe(28)
  })

  it('宽容判定: 视觉重叠但判定外(0.8-1.0 视觉半径和)不受击;深重叠受击', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.player.fireTimer = 99
    // 距离 22:旧口径(size 和 25)会受击;新判定和 0.8×(14+11)=20 → 不受击
    s.enemies.push({ id: 1, x: s.player.x + 22, y: s.player.y, vx: 0, vy: 0, size: 14, hp: 99, maxHp: 99, kind: 'chaser', elite: false, hitFlash: 0 })
    const hp0 = s.player.hp
    tickSurvival(s, 0.016)
    expect(s.player.hp).toBe(hp0)
    expect(22).toBeLessThan(14 + 11)
    // 深重叠(15 < 20)受击
    s.enemies[0].x = s.player.x + 15
    s.player.invuln = 0
    tickSurvival(s, 0.016)
    expect(s.player.hp).toBe(hp0 - 1)
  })

  it('磁吸/拾取半径 ×0.8: 基础磁吸 70→56;磁铁井 artifact 116', () => {
    expect(initialSurvivalState().stats.magnet).toBeCloseTo(56, 5)
    expect(initialSurvivalState('wisp', undefined, ['magnetWell']).stats.magnet).toBeCloseTo(116, 5)
  })
})

// ── R218 U10: 质心视差动态背景 ───────────────────────────────────────────────
describe('R218 U10 background offset (质心 → 归一化 → 平滑)', () => {
  it('playersCentroid: 均值质心;排除倒下玩家;全倒为 null', () => {
    const mk = (x: number, y: number, hp: number): { x: number; y: number; hp: number } => ({ x, y, hp })
    expect(playersCentroid([mk(0, 0, 1), mk(100, 50, 3)])).toEqual({ x: 50, y: 25 })
    expect(playersCentroid([mk(0, 0, 0), mk(100, 50, 3)])).toEqual({ x: 100, y: 50 })
    expect(playersCentroid([mk(0, 0, 0)])).toBeNull()
  })

  it('centroidToOffset: 区域中心→0/边缘→±1/越界钳制;null→0', () => {
    expect(centroidToOffset({ x: 450, y: 260 }, 900, 520)).toEqual({ x: 0, y: 0 })
    expect(centroidToOffset({ x: 900, y: 0 }, 900, 520)).toEqual({ x: 1, y: -1 })
    expect(centroidToOffset({ x: 5000, y: -5000 }, 900, 520)).toEqual({ x: 1, y: -1 })
    expect(centroidToOffset(null, 900, 520)).toEqual({ x: 0, y: 0 })
  })

  it('smoothOffsetTo: 单步 10% 收敛,迭代逼近目标(指数平滑)', () => {
    let cur = { x: 0, y: 0 }
    cur = smoothOffsetTo(cur, { x: 1, y: -1 })
    expect(cur.x).toBeCloseTo(0.1, 5)
    expect(cur.y).toBeCloseTo(-0.1, 5)
    for (let i = 0; i < 60; i++) cur = smoothOffsetTo(cur, { x: 1, y: -1 })
    expect(cur.x).toBeCloseTo(1, 2)
    expect(cur.y).toBeCloseTo(-1, 2)
  })

  it('tick 集成(R219.7③+R219.9): 1P 持续右移 → bgOffset 恒 0+相机钉死 vp 中心+玩家钳视口界;击杀仍产生涟漪环', () => {
    const s = initialSurvivalState()
    deployPlayers(s, 1)
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.keys.add('d')
    for (let i = 0; i < 120; i++) tickSurvival(s, 1 / 60)
    // 停用锁:DYNAMIC_BG_ENABLED=false 期间 bgOffset 不推进(移动时背景静止——
    // 用户指令「先停止动态背景」;恢复开关时本断言与 smoothOffsetTo 单测同步改回)。
    expect(s.bgOffset).toEqual({ x: 0, y: 0 })
    // R219.9: 单人固定视口——相机恒 vp 中心(画面零滚动),玩家钳在视口界内
    expect(s.camera.x).toBe(450)
    expect(s.camera.y).toBe(260)
    expect(s.camera.zoom).toBe(1)
    expect(s.player.x).toBeLessThanOrEqual(s.vp.w - 16)
    expect(s.player.x).toBeGreaterThan(0)
    s.enemies.push({ id: 9, x: s.player.x + 5, y: s.player.y, vx: 0, vy: 0, size: 11, hp: 0, maxHp: 5, kind: 'chaser', elite: false, hitFlash: 0 })
    tickSurvival(s, 1 / 60)
    expect(s.ripples.length).toBe(1)
    expect(s.ripples[0].life).toBeGreaterThan(0)
  })

  it('R219.9: 1P 出生在 vp 中心+相机即钉死;2P 保留大世界跟镜头', () => {
    const one = initialSurvivalState()
    deployPlayers(one, 1)
    expect(one.player.x).toBe(450)
    expect(one.player.y).toBe(260)
    expect(one.camera).toEqual({ x: 450, y: 260, zoom: 1 })

    const two = initialSurvivalState()
    deployPlayers(two, 2)
    two.phase = 'running'
    two.spawnTimer = 99
    two.bossTimer = 99
    // P2 大幅右移拉出包围盒 → 相机必须跟随(固定视口不得泄漏到多人局)
    two.players[1].x = two.players[0].x + 700
    for (let i = 0; i < 120; i++) tickSurvival(two, 1 / 60)
    expect(two.camera.x).toBeGreaterThan(460)
    expect(two.camera.zoom).toBeLessThanOrEqual(1)
  })
})

// ── R218 U11: 大世界(2× 视口)+ 摄像机跟随(死区/平滑/zoom-to-fit/软推回) ─────
describe('R218 U11 world + camera follow', () => {
  it('playersBBox: 存活玩家包围盒;排除倒下;全倒为 null', () => {
    const mk = (x: number, y: number, hp: number): { x: number; y: number; hp: number } => ({ x, y, hp })
    expect(playersBBox([mk(0, 0, 1), mk(100, 50, 1)])).toEqual({ x: 0, y: 0, w: 100, h: 50 })
    expect(playersBBox([mk(0, 0, 0), mk(100, 50, 1)])).toEqual({ x: 100, y: 50, w: 0, h: 0 })
    expect(playersBBox([mk(0, 0, 0)])).toBeNull()
  })

  it('zoom-to-fit: 1P/聚拢 → 1.0;凸包拉远 → zoom 下降;极远钳 0.7 下限', () => {
    expect(cameraZoomFor({ x: 0, y: 0, w: 0, h: 0 }, 900, 520)).toBe(1)
    expect(cameraZoomFor({ x: 0, y: 0, w: 200, h: 100 }, 900, 520)).toBe(1)
    const spread = cameraZoomFor({ x: 0, y: 0, w: 1000, h: 300 }, 900, 520)
    expect(spread).toBeLessThan(1)
    expect(spread).toBeGreaterThanOrEqual(0.7)
    expect(cameraZoomFor({ x: 0, y: 0, w: 4000, h: 2000 }, 900, 520)).toBe(0.7)
  })

  it('死区内静止: 目标偏移小于视口 20%(±90/±52)时摄像机不动', () => {
    const cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 }
    updateCamera(cam, { x: 950, y: 550, w: 0, h: 0 }, 900, 520, 1 / 60)
    expect(cam.x).toBe(WORLD_W / 2)
    expect(cam.y).toBe(WORLD_H / 2)
    // 出死区才追,且单步只收敛 10%
    updateCamera(cam, { x: 1000, y: 550, w: 0, h: 0 }, 900, 520, 1 / 60)
    expect(cam.x).toBeCloseTo(WORLD_W / 2 + 10, 5)
  })

  it('平滑收敛: 死区外目标经迭代逼近(0.1 指数平滑/帧,收敛进死区带即停)', () => {
    const cam = { x: 900, y: 520, zoom: 1 }
    for (let i = 0; i < 100; i++) updateCamera(cam, { x: 1200, y: 700, w: 0, h: 0 }, 900, 520, 1 / 60)
    // 死区带(±90/±52)内即为收敛终点
    expect(Math.abs(cam.x - 1200)).toBeLessThanOrEqual(95)
    expect(Math.abs(cam.y - 700)).toBeLessThanOrEqual(60)
    expect(cam.x).toBeGreaterThan(1100)
    expect(cam.y).toBeGreaterThan(640)
  })

  it('世界边界钳制: 目标在世界角落 → 摄像机钳在 [450,1350]×[260,780]', () => {
    const cam = { x: 900, y: 520, zoom: 1 }
    for (let i = 0; i < 200; i++) updateCamera(cam, { x: 0, y: 0, w: 0, h: 0 }, 900, 520, 1 / 60)
    expect(cam.x).toBe(450)
    expect(cam.y).toBe(260)
  })

  it('软推回力: 屏内玩家受力 0;出屏(超 (视口/2-40)/zoom)受向心 120px/s', () => {
    const cam = { x: 900, y: 520, zoom: 1 }
    expect(softPushForce(cam, 900, 520, { x: 1000, y: 520 })).toEqual({ x: 0, y: 0 })
    const f = softPushForce(cam, 900, 520, { x: 1500, y: 520 })
    expect(f.x).toBeCloseTo(-120, 0)
    expect(Math.abs(f.y)).toBeLessThan(1e-6)
    // 缩放越远推力方向仍指向摄像机中心
    const diag = softPushForce(cam, 900, 520, { x: 1500, y: 900 })
    expect(diag.x).toBeLessThan(0)
    expect(diag.y).toBeLessThan(0)
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(120, 0)
  })

  it('worldToViewport: 世界中心 → 视口中心;平移/缩放代数正确', () => {
    expect(worldToViewport({ x: 900, y: 520, zoom: 1 }, 900, 520, 900, 520)).toEqual({ x: 450, y: 260 })
    expect(worldToViewport({ x: 900, y: 520, zoom: 1 }, 900, 520, 1000, 620)).toEqual({ x: 550, y: 360 })
    expect(worldToViewport({ x: 900, y: 520, zoom: 0.7 }, 900, 520, 990, 590)).toEqual({ x: 450 + 90 * 0.7, y: 260 + 70 * 0.7 })
  })

  it('deployPlayers 初始位置改世界中心分侧;camera 初始对准世界中心(R219.9: 初始态=1P vp 中心)', () => {
    const s = initialSurvivalState()
    // R219.9: 初始(1P 固定视口)——玩家/相机都在 vp 中心
    expect(s.player.x).toBe(450)
    expect(s.player.y).toBe(260)
    expect(s.camera).toEqual({ x: 450, y: 260, zoom: 1 })
    deployPlayers(s, 2)
    // 多人部署:整体迁世界中心分侧,相机对准世界中心
    expect(s.player.x).toBe(WORLD_W / 2)
    expect(s.player.y).toBe(WORLD_H / 2)
    expect(s.camera).toEqual({ x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 })
    expect(s.player2!.x).toBe(WORLD_W / 2 - 60)
    expect(s.player2!.y).toBe(WORLD_H / 2 + 40)
  })

  it('spawn 在摄像机视口外环生成(世界坐标,钳 ±60)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = -1
    s.time = 30
    tickSurvival(s, 0.016)
    expect(s.enemies.length).toBeGreaterThanOrEqual(1)
    for (const e of s.enemies) {
      expect(e.x).toBeGreaterThanOrEqual(-60)
      expect(e.x).toBeLessThanOrEqual(WORLD_W + 60)
      expect(Math.hypot(e.x - s.camera.x, e.y - s.camera.y)).toBeGreaterThan(280)
    }
  })

  it('tick 集成: 两玩家拉远 → zoom-to-fit 下降并 ≥0.7;P2 倒下后 zoom 回 1', () => {
    const s = initialSurvivalState()
    deployPlayers(s, 2)
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.players[1].x = s.players[0].x + 1000
    for (let i = 0; i < 60; i++) tickSurvival(s, 1 / 60)
    expect(s.camera.zoom).toBeLessThan(0.99)
    expect(s.camera.zoom).toBeGreaterThanOrEqual(0.7)
    s.players[1].hp = 0
    for (let i = 0; i < 200; i++) tickSurvival(s, 1 / 60)
    expect(s.camera.zoom).toBeCloseTo(1, 1)
  })
})

// ── R218 U8: juice 接入(顿帧/屏震/伤害飘字,走 hud.ts 共享 helper) ───────────
describe('R218 U8 juice integration', () => {
  it('击杀大敌触发 hitStop 0.03s: 冻结期间 time 不推进,衰减后恢复', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.enemies.push({ id: 1, x: 300, y: 300, vx: 0, vy: 0, size: 22, hp: 0, maxHp: 100, kind: 'tank', elite: false, hitFlash: 0 })
    tickSurvival(s, 0.016)
    expect(s.juice.hitStop).toBeGreaterThanOrEqual(0.03)
    const timeAtFreeze = s.time
    tickSurvival(s, 0.016)
    tickSurvival(s, 0.016)
    expect(s.time).toBe(timeAtFreeze)
    // 0.03s 衰减完(2 帧 × 0.016)后恢复推进
    tickSurvival(s, 0.016)
    expect(s.time).toBeGreaterThan(timeAtFreeze)
  })

  it('splitter 母体击杀触发 hitStop;小体(gen1)击杀不触发', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.juice.hitStop = 0
    s.enemies.push({ id: 1, x: 300, y: 300, vx: 0, vy: 0, size: 12, hp: 0, maxHp: 9, kind: 'splitter', elite: false, hitFlash: 0, gen: 0 })
    tickSurvival(s, 0.016)
    expect(s.juice.hitStop).toBeGreaterThanOrEqual(0.03)
    // 冻结消退后杀小体:不再触发
    for (let i = 0; i < 4; i++) tickSurvival(s, 0.016)
    s.juice.hitStop = 0
    const children = s.enemies.filter((e) => e.kind === 'splitter')
    for (const c of children) c.hp = 0
    tickSurvival(s, 0.016)
    expect(s.juice.hitStop).toBe(0)
  })

  it('boss 死亡: juice.shake > 0(hud shake(6)),替代旧 state.shake 单一路径', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.bossTimer = 0.01
    tickSurvival(s, 0.016)
    const boss = s.enemies.find((e) => e.kind === 'boss')!
    boss.hp = 0
    s.juice.shake = 0
    tickSurvival(s, 0.016)
    expect(s.juice.shake).toBeGreaterThan(0)
    expect(s.enemies.every((e) => e.kind !== 'boss')).toBe(true)
  })

  it('玩家受击产生 juice 伤害飘字(-N 数字)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.enemies.push({ id: 1, x: s.player.x + 8, y: s.player.y, vx: 0, vy: 0, size: 14, hp: 99, maxHp: 99, kind: 'chaser', elite: false, hitFlash: 0 })
    tickSurvival(s, 0.016)
    expect(s.juice.floats.length).toBeGreaterThanOrEqual(1)
    expect(s.juice.floats.some((f) => f.text === '-1')).toBe(true)
  })
})

// ── R219.1 回归锁:绘制层归位(世界实体必须在摄像机层内)+ 机制修正 ──────────
/** 变换跟踪 ctx——只维护 CTM(translate/scale/rotate/setTransform/save/restore),
 *  记录每次 translate 的输入坐标与当时的设备空间原点;其余绘制调用 no-op。 */
function trackCtx(): { ctx: CanvasRenderingContext2D; translates: Array<{ ix: number; iy: number; dx: number; dy: number }> } {
  const translates: Array<{ ix: number; iy: number; dx: number; dy: number }> = []
  let cur = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const stack: Array<{ a: number; b: number; c: number; d: number; e: number; f: number }> = []
  const noop = (): void => undefined
  const grad = { addColorStop: noop }
  const ctx = {
    clearRect: noop, beginPath: noop, closePath: noop, fill: noop, stroke: noop,
    fillRect: noop, strokeRect: noop, arc: noop, ellipse: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fillText: noop, clip: noop, drawImage: noop, roundRect: noop,
    setLineDash: noop, measureText: () => ({ width: 0 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    save: () => { stack.push({ ...cur }) },
    restore: () => { const p = stack.pop(); if (p !== undefined) cur = p },
    translate: (x: number, y: number) => {
      cur = { ...cur, e: cur.a * x + cur.c * y + cur.e, f: cur.b * x + cur.d * y + cur.f }
      translates.push({ ix: x, iy: y, dx: cur.e, dy: cur.f })
    },
    scale: (sx: number, sy: number) => { cur = { ...cur, a: cur.a * sx, b: cur.b * sx, c: cur.c * sy, d: cur.d * sy } },
    rotate: (r: number) => {
      const cos = Math.cos(r); const sin = Math.sin(r)
      const { a, b, c, d } = cur
      cur = { ...cur, a: a * cos + c * sin, b: b * cos + d * sin, c: -a * sin + c * cos, d: -b * sin + d * cos }
    },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { cur = { a, b, c, d, e, f } },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, translates }
}

describe('renderer/games/survival R219 绘制层与机制修正', () => {
  it('R219.1: P1 飞船画在摄像机层内——世界任意位置恒映射画布中心(修复开局飞船出画布)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.scene = 'station'
    s.player.x = 420
    s.player.y = 310
    s.camera = { x: 420, y: 310, zoom: 1 } // 摄像机锁定玩家
    const rec = trackCtx()
    drawSurvival(rec.ctx, s)
    const ship = rec.translates.find((t) => t.ix === 420 && t.iy === 310)
    // 修复前:飞船在世界层 restore 之后按视口坐标直画 → 原点 (420,310) 偏离中心;
    // 修复后:经摄像机变换 → 原点 = worldToViewport = 画布中心。
    expect(ship).toBeDefined()
    expect(ship!.dx).toBeCloseTo(WIDTH / 2, 1)
    expect(ship!.dy).toBeCloseTo(HEIGHT / 2, 1)
  })

  it('R219.1: 多 P zoom<1 时飞船随镜头缩放(仍在摄像机层内)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.scene = 'station'
    s.player.x = 700
    s.player.y = 400
    s.camera = { x: 700, y: 400, zoom: 0.7 }
    const rec = trackCtx()
    drawSurvival(rec.ctx, s)
    const ship = rec.translates.find((t) => t.ix === 700 && t.iy === 400)
    expect(ship).toBeDefined()
    const vp = worldToViewport(s.camera, WIDTH, HEIGHT, 700, 400)
    expect(ship!.dx).toBeCloseTo(vp.x, 1)
    expect(ship!.dy).toBeCloseTo(vp.y, 1)
  })

  it('R219.1: boss 扇形弹幕瞄最近存活玩家(P1 倒下不打尸体)', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    deployPlayers(s, 2)
    s.player.hp = 0 // P1 倒下
    s.player2!.hp = 7
    s.player2!.x = 500
    s.player2!.y = 520
    s.enemies.push({ id: 1, x: 400, y: 520, vx: 0, vy: 0, size: 28, hp: 999, maxHp: 999, kind: 'boss', elite: false, hitFlash: 0 })
    s.bossBulletTimer = 1.3
    s.bossBulletPattern = 1 // 扇形
    tickSurvival(s, 0.016)
    expect(s.eBullets.length).toBe(5)
    // boss(400,520) → P2(500,520) 为正右方:扇心弹 vx>0、|vy| 远小于 |vx|
    const mid = s.eBullets[2]
    expect(mid.vx).toBeGreaterThan(0)
    expect(Math.abs(mid.vy)).toBeLessThan(Math.abs(mid.vx) * 0.2)
  })

  it('R219.1: director 多人因子按存活集合——P1 险血但 P2 满血=收紧,只剩 P2 满血仍收紧', () => {
    const s = initialSurvivalState()
    s.spawnTimer = 99
    s.bossTimer = 99
    deployPlayers(s, 2)
    s.player.hp = 1
    s.player2!.hp = s.player2!.maxHp
    const eased = directorSpawnInterval(s) // 任一存活险血 → 1.25 放松
    s.player.hp = 0 // P1 倒下,仅 P2 满血 → 0.85 收紧
    const tightened = directorSpawnInterval(s)
    expect(tightened).toBeLessThan(eased)
  })

  it('R219.1: juice hit-stop 冻结期间出生预警照常倒计时', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.spawnTimer = 99
    s.bossTimer = 99
    s.juice.hitStop = 0.5
    s.warnings.push({ edge: 0, t: 0.5 })
    tickSurvival(s, 0.1)
    expect(s.warnings.length).toBe(1)
    expect(s.warnings[0].t).toBeCloseTo(0.4, 5)
  })

  it('R219.7①: vp 默认 900×520;宽视口(fs 全铺满)下飞船仍绘制在 vp 中心', () => {
    const s = initialSurvivalState()
    expect(s.vp).toEqual({ w: 900, h: 520 })
    s.phase = 'running'
    s.scene = 'station'
    s.vp = { w: 1100, h: 520 } // 16:9 全铺满反推的宽视口
    s.player.x = 700
    s.player.y = 400
    s.camera = { x: 700, y: 400, zoom: 1 }
    const rec = trackCtx()
    drawSurvival(rec.ctx, s)
    const ship = rec.translates.find((t) => t.ix === 700 && t.iy === 400)
    expect(ship).toBeDefined()
    expect(ship!.dx).toBeCloseTo(550, 1) // vp.w/2,不是 900/2
    expect(ship!.dy).toBeCloseTo(260, 1)
  })
})
