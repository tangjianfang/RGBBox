import { describe, expect, it } from 'vitest'
import {
  BLOCK_DAMAGE, HEART_HP, initialSlashState, judgeDuel, RUN_SECONDS, SLASH_BASE_HP,
  SLASH_DIFFICULTY_PARAMS, slash as slashCut, startSlash, tickSlash, bomb, blockPos,
} from  '../../../src/renderer/src/games/slash'

function runToZone(state: { blocks: Array<{ t: number; speed: number }>; timeLeft: number }): void {
  // advance until the first block is inside the strike window
  for (let i = 0; i < 600; i++) {
    tickSlash(state, 1 / 60)
    if (state.blocks[0]?.t >= 0.75) return
  }
}

describe('games/slash (R142-E4)', () => {
  it('starts a fresh run and counts down to a loss at time zero', () => {
    const s = initialSlashState()
    startSlash(s)
    expect(s.phase).toBe('running')
    expect(s.score).toBe(0)
    tickSlash(s, RUN_SECONDS + 0.1)
    expect(s.phase).toBe('lost')
    expect(s.timeLeft).toBe(0)
  })

  it('spawns blocks over time and they approach the strike ring', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60) // 4s
    expect(s.blocks.length).toBeGreaterThan(0)
    expect(s.blocks[0].t).toBeGreaterThan(0)
    const p = blockPos(s.blocks[0])
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(900)
  })

  it('a matching slash kills the block, scores, builds combo and momentum streaks', () => {
    const s = initialSlashState()
    startSlash(s)
    runToZone(s)
    const block = s.blocks[0]
    const before = s.streaks.length
    expect(slashCut(s, block.dir)).toBe('hit')
    expect(s.blocks.some((b) => b.id === block.id)).toBe(false)
    expect(s.score).toBeGreaterThan(0)
    expect(s.combo).toBe(1)
    expect(s.streaks.length).toBeGreaterThan(before) // blade trail carries inertia
  })

  it('a wrong-direction slash in the zone breaks the combo but kills nothing', () => {
    const s = initialSlashState()
    startSlash(s)
    runToZone(s)
    const block = s.blocks[0]
    s.combo = 4
    const wrongDir = (block.dir + 1) % 8
    expect(slashCut(s, wrongDir)).toBe('wrong')
    expect(s.combo).toBe(0)
    expect(s.blocks.some((b) => b.id === block.id)).toBe(true)
  })

  it('a slash with nothing in the zone is a harmless miss', () => {
    const s = initialSlashState()
    startSlash(s)
    expect(s.blocks.length).toBe(0)
    expect(slashCut(s, 0)).toBe('miss')
  })

  it('an un-cut block crossing the ring breaks the combo and clears it', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60)
    expect(s.blocks.length).toBeGreaterThan(0)
    s.combo = 3
    for (let i = 0; i < 600 && s.combo !== 0; i++) tickSlash(s, 1 / 60)
    expect(s.combo).toBe(0)
  })

  it('pinch bomb clears all in-flight blocks once per cooldown', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60)
    expect(s.blocks.length).toBeGreaterThan(0)
    expect(bomb(s)).toBe(true)
    expect(s.blocks.length).toBe(0)
    for (let i = 0; i < 120; i++) tickSlash(s, 1 / 60) // refill a little
    expect(bomb(s)).toBe(false) // cooldown active
  })
})

// R203: 三心制 + 连锁块。(R218 B1 起心制为 hp 100 的派生显示,断言等价改写)

describe('slash hearts (FR-SL01 → R218 B1 hp 等价改写)', () => {
  it('missed block costs a quarter (25HP); four misses end the run; legacy 5-heart writes mirror to 125HP', () => {
    const s = initialSlashState()
    s.phase = 'running'
    expect(s.hearts).toBe(4) // ceil(100/25) 派生
    expect(s.hp).toBe(SLASH_BASE_HP)
    expect(s.maxHp).toBe(SLASH_BASE_HP)
    for (let round = 0; round < 4; round += 1) {
      s.blocks.push({ id: s.nextId++, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false }) // 已越圈
      tickSlash(s, 0.016)
    }
    expect(s.hearts).toBe(0)
    expect(s.hp).toBe(0)
    expect(s.phase).toBe('lost')
    // 旧休闲 5 心路径:hearts 直写 → hp 镜像 125,漏一块 → 100/4 心
    const casual = initialSlashState()
    casual.hearts = 5
    casual.maxHearts = 5
    casual.phase = 'running'
    casual.blocks.push({ id: casual.nextId++, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false })
    tickSlash(casual, 0.016)
    expect(casual.hearts).toBe(4)
    expect(casual.hp).toBe(100)
    expect(casual.phase).toBe('running')
  })
})

describe('slash chain blocks (FR-SL02)', () => {
  it('hitting a block detonates same-dir neighbors near the ring for +5 each', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 200, bonus: false })
    s.blocks.push({ id: 2, dir: 2, t: 0.8, speed: 1, hue: 210, bonus: false }) // 同向近圈 → 连锁
    s.blocks.push({ id: 3, dir: 4, t: 0.85, speed: 1, hue: 120, bonus: false }) // 异向 → 保留
    const before = s.score
    const out = slashCut(s, 2)
    expect(out).toBe('hit')
    expect(s.score).toBeGreaterThan(before)
    expect(s.blocks.some((b) => b.id === 3)).toBe(true)
    expect(s.blocks.some((b) => b.id === 2)).toBe(false)
  })
})

// M3(FR-SL04): 假动作块。
describe('slash feint blocks (FR-SL04)', () => {
  it('a feint block flips its direction once at t≈0.85', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.timeLeft = 30 // >15s 进度 → 允许 feint
    s.blocks.push({ id: 1, dir: 0, t: 0.7, speed: 1, hue: 200, bonus: false, feint: true })
    tickSlash(s, 0.16) // t ≈ 0.86 ≥ 0.85 → flip
    expect(s.blocks[0].dir).toBe(4) // 0 → 4(翻转)
    const flippedDir = s.blocks[0].dir
    tickSlash(s, 0.1)
    expect(s.blocks[0].dir).toBe(flippedDir) // 只翻一次
  })
})

// ── R208 (FR-MP03): 轮换对决判定 ──
describe('FR-MP03 judgeDuel', () => {
  it('未完成回合返回 null', () => {
    expect(judgeDuel([null, null])).toBeNull()
    expect(judgeDuel([120, null])).toBeNull()
    expect(judgeDuel([null, 80])).toBeNull()
  })
  it('双方完赛按比分判定 p1/p2/tie', () => {
    expect(judgeDuel([120, 80])).toBe('p1')
    expect(judgeDuel([80, 120])).toBe('p2')
    expect(judgeDuel([0, 0])).toBe('tie')
  })
})

describe('games/slash FR-G08 short-run matrix (30s burst)', () => {
  it('startSlash(s, 30) arms a 30s run that settles lost when the clock hits zero', () => {
    const s = initialSlashState()
    startSlash(s, 30)
    expect(s.runSeconds).toBe(30)
    expect(s.timeLeft).toBe(30)
    tickSlash(s, 30 + 0.1)
    expect(s.phase).toBe('lost')
    expect(s.timeLeft).toBe(0)
  })

  it('default startSlash keeps the standard 60s ceiling', () => {
    const s = initialSlashState()
    startSlash(s)
    expect(s.runSeconds).toBe(RUN_SECONDS)
    expect(s.timeLeft).toBe(RUN_SECONDS)
    tickSlash(s, 29)
    expect(s.phase).toBe('running') // a 30s burst would already be over
  })
})

// ── R218(B1): 心 → 血条 100HP ─────────────────────────────────────────────
describe('R218(B1) hearts → hp 100', () => {
  it('hp 初始化 100/100;一次漏块 -25 → 75(hearts 派生 3)', () => {
    const s = initialSlashState()
    startSlash(s)
    s.spawnTimer = 999
    s.blocks.push({ id: s.nextId++, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false })
    tickSlash(s, 0.016)
    expect(s.hp).toBe(75)
    expect(s.hearts).toBe(Math.ceil(75 / HEART_HP))
    expect(s.phase).toBe('running')
  })

  it('敌型伤害映射:normal 25 / feint 30 / dasher 35;难度 dmgMult 缩放(炼狱 normal 35 / 休闲 normal 18)', () => {
    const dmgFor = (kind: 'normal' | 'feint' | 'dasher', diff: 'casual' | 'standard' | 'insane' = 'standard'): number => {
      const s = initialSlashState()
      startSlash(s, RUN_SECONDS, diff)
      s.spawnTimer = 999
      s.blocks.push({ id: 1, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false, kind, dashState: kind === 'dasher' ? 'done' : undefined })
      tickSlash(s, 0.016)
      return 100 - s.hp
    }
    expect(BLOCK_DAMAGE.normal).toBe(25)
    expect(BLOCK_DAMAGE.feint).toBe(30)
    expect(BLOCK_DAMAGE.dasher).toBe(35)
    expect(dmgFor('normal')).toBe(25)
    expect(dmgFor('feint')).toBe(30)
    expect(dmgFor('dasher')).toBe(35)
    expect(dmgFor('normal', 'insane')).toBe(35) // 25×1.4
    expect(dmgFor('normal', 'casual')).toBe(18) // 25×0.7 → round 17.5 = 18
  })
})

// ── R218(B2): 敌型扩展(guard / dasher / thrower)─────────────────────────
describe('R218(B2) guard 格挡型', () => {
  it('持盾时正面斩被格挡一次(盾碎/连击保留),再正面斩可杀;背面斩直接击杀', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 210, bonus: false, kind: 'guard', shield: 1 })
    s.combo = 3
    expect(slashCut(s, 2)).toBe('blocked')
    expect(s.blocks.some((b) => b.id === 1)).toBe(true)
    expect(s.blocks[0].shield).toBe(0)
    expect(s.combo).toBe(3) // 格挡不断连击
    expect(slashCut(s, 2)).toBe('hit') // 破防后正面可杀
    expect(s.blocks).toHaveLength(0)
    // 背面(反向 dir+4)绕后直接击杀
    const s2 = initialSlashState()
    s2.phase = 'running'
    s2.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 210, bonus: false, kind: 'guard', shield: 1 })
    expect(slashCut(s2, (2 + 4) % 8)).toBe('hit')
    expect(s2.blocks).toHaveLength(0)
  })

  it('持盾 guard 斩其它方向仍算 wrong(断连击)', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 210, bonus: false, kind: 'guard', shield: 1 })
    s.combo = 4
    expect(slashCut(s, (2 + 1) % 8)).toBe('wrong')
    expect(s.combo).toBe(0)
    expect(s.blocks.some((b) => b.id === 1)).toBe(true)
  })
})

describe('R218(B2) dasher 冲刺型(蓄力-冲-硬直三段)', () => {
  it('t=0.5 定住蓄力 0.5s → 3.2×速冲刺 → 撞墙(t=1.3)硬直 0.8s 可斩;全程不判漏', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.spawnTimer = 999
    s.blocks.push({ id: 1, dir: 0, t: 0.44, speed: 0.5, hue: 200, bonus: false, kind: 'dasher', dashState: 'approach' })
    tickSlash(s, 0.2) // t → 0.54 ≥ 0.5 → 进蓄力并钳在 0.5
    expect(s.blocks[0].dashState).toBe('charge')
    expect(s.blocks[0].t).toBeCloseTo(0.5, 5)
    tickSlash(s, 0.3) // 蓄力 0.5s 内定住
    expect(s.blocks[0].dashState).toBe('charge')
    expect(s.blocks[0].t).toBeCloseTo(0.5, 5)
    tickSlash(s, 0.25) // 蓄力结束 → 冲刺
    expect(s.blocks[0].dashState).toBe('dash')
    tickSlash(s, 0.1) // 0.5×3.2×0.1 = 0.16
    expect(s.blocks[0].t).toBeCloseTo(0.66, 5)
    for (let i = 0; i < 10; i += 1) tickSlash(s, 0.1) // 冲到墙 → 硬直
    expect(s.blocks[0].dashState).toBe('stagger')
    expect(s.blocks[0].t).toBeCloseTo(1.3, 5)
    expect(s.hp).toBe(100) // 冲刺/硬直期间不判漏
    expect(slashCut(s, 0)).toBe('hit') // 硬直中按方向可斩
    expect(s.blocks).toHaveLength(0)
  })

  it('硬直 0.8s 结束仍未斩 → 判漏 -35 并移除', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.spawnTimer = 999
    s.blocks.push({ id: 1, dir: 0, t: 1.3, speed: 0.5, hue: 200, bonus: false, kind: 'dasher', dashState: 'stagger', dashTimer: 0.05 })
    tickSlash(s, 0.1)
    expect(s.blocks).toHaveLength(0)
    expect(s.hp).toBe(65)
  })
})

describe('R218(B2) thrower 投掷型', () => {
  it('停在判定圈外(t=0.28)按计时投飞刀;投满 2 刀后逼近身', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.spawnTimer = 999
    s.blocks.push({ id: 1, dir: 0, t: 0.1, speed: 1, hue: 200, bonus: false, kind: 'thrower', throws: 0, throwTimer: 0.1 })
    tickSlash(s, 0.2) // 推进到停点(计时不动)
    expect(s.blocks).toHaveLength(1)
    expect(s.blocks[0].t).toBeCloseTo(0.28, 5)
    tickSlash(s, 0.15) // 停点倒计时归零 → 第一刀
    const knife = s.blocks.find((b) => b.kind === 'knife')
    expect(knife).toBeDefined()
    expect(knife!.dir).toBe(0)
    expect(knife!.t).toBeCloseTo(0.28, 5)
    // 飞刀以 KNIFE_SPEED 飞向核心
    tickSlash(s, 0.1)
    expect(s.blocks.find((b) => b.kind === 'knife')!.t).toBeCloseTo(0.28 + 0.9 * 0.1, 5)
    // 第二刀 + 间隔后:thrower 逼近(t 增长越过停点;2.5s 内尚未越圈)
    for (let i = 0; i < 25; i += 1) tickSlash(s, 0.1)
    const thrower = s.blocks.find((b) => b.kind === 'thrower')
    expect(thrower).toBeDefined()
    expect(thrower!.throws).toBe(2)
    expect(thrower!.t).toBeGreaterThan(0.28)
    expect(thrower!.t).toBeLessThan(1.12)
  })

  it('飞刀抵达核心 -35;窗口内按方向斩落则免伤', () => {
    const hurt = initialSlashState()
    hurt.phase = 'running'
    hurt.spawnTimer = 999
    hurt.blocks.push({ id: 1, dir: 3, t: 0.95, speed: 0.9, hue: 0, bonus: false, kind: 'knife' })
    tickSlash(hurt, 0.1) // t = 1.04 > 1.02 → 命中核心
    expect(hurt.hp).toBe(65)
    expect(hurt.blocks).toHaveLength(0)
    const cut = initialSlashState()
    cut.phase = 'running'
    cut.spawnTimer = 999
    cut.blocks.push({ id: 1, dir: 3, t: 0.9, speed: 0.9, hue: 0, bonus: false, kind: 'knife' })
    expect(slashCut(cut, 3)).toBe('hit')
    expect(cut.hp).toBe(100)
  })
})

// ── R218(B3): 难度四档 + juice ────────────────────────────────────────────
describe('R218(B3) SLASH_DIFFICULTY_PARAMS + juice', () => {
  it('难度矩阵 0.85/1/1.15/1.25 × 0.7/1/1.2/1.4;startSlash 第三参接线;敌速系数生效', () => {
    expect(SLASH_DIFFICULTY_PARAMS).toEqual({
      casual: { enemySpeedMult: 0.85, dmgMult: 0.7 },
      standard: { enemySpeedMult: 1, dmgMult: 1 },
      hard: { enemySpeedMult: 1.15, dmgMult: 1.2 },
      insane: { enemySpeedMult: 1.25, dmgMult: 1.4 },
    })
    const s = initialSlashState()
    startSlash(s, RUN_SECONDS, 'hard')
    expect(s.difficulty).toBe('hard')
    // 敌速:同 speed 方块 casual 比 standard 慢
    const std = initialSlashState()
    startSlash(std)
    const cas = initialSlashState()
    startSlash(cas, RUN_SECONDS, 'casual')
    for (const st of [std, cas]) {
      st.spawnTimer = 999
      st.blocks.push({ id: 1, dir: 0, t: 0, speed: 0.5, hue: 200, bonus: false })
    }
    tickSlash(std, 0.5)
    tickSlash(cas, 0.5)
    expect(std.blocks[0].t).toBeCloseTo(0.25, 5)
    expect(cas.blocks[0].t).toBeCloseTo(0.25 * 0.85, 5)
  })

  it('完美斩(金块)juice:hitStop 0.03 + 屏震 + 击杀涟漪;每 5 连击飘字', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.spawnTimer = 999
    s.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 200, bonus: true })
    expect(slashCut(s, 2)).toBe('hit')
    expect(s.juice.hitStop).toBeCloseTo(0.03, 5)
    expect(s.juice.shake).toBeGreaterThan(0)
    expect(s.ripples).toHaveLength(1)
    for (let i = 0; i < 4; i += 1) {
      s.blocks.push({ id: s.nextId++, dir: 1, t: 0.9, speed: 1, hue: 200, bonus: false })
      expect(slashCut(s, 1)).toBe('hit')
    }
    expect(s.combo).toBe(5)
    expect(s.juice.floats.some((f) => f.text.includes('COMBO'))).toBe(true)
  })

  it('漏块飘字 -25 入 juice.floats;随 tick 衰减退场', () => {
    const s = initialSlashState()
    startSlash(s)
    s.spawnTimer = 999
    s.blocks.push({ id: 1, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false })
    tickSlash(s, 0.016)
    expect(s.juice.floats.some((f) => f.text === '-25')).toBe(true)
    for (let i = 0; i < 60; i += 1) tickSlash(s, 0.016)
    expect(s.juice.floats).toHaveLength(0)
  })
})
