// 「光刃斩击」(R142-E4 / R141-C) — the gesture-native game. Design follows
// the Beat Saber / Fruit Ninja evidence: BIG targets, low precision demands,
// direction-marked, rhythm-tolerant — the input IS the game. It reuses the
// EXISTING vision primitives with zero new gesture code: a decisive directional
// sweep already fires Arrow* events (8-way ring), pinch already fires Space.
// Keyboard arrows/space work identically (parity for tests & no-camera play).
//
// Momentum (R142-L5): every slash spawns an inertial streak — velocity-carrying
// particles that coast and decay, the physical feel missing from binary input.

import {
  applyShake,
  drawAlertVignette,
  drawFloats,
  drawHealthBar,
  emptyJuice,
  floatText,
  hitStop as juiceHitStop,
  type GameDifficulty,
  type JuiceState,
  shake as juiceShake,
  tickJuice,
} from './hud'

export const WIDTH = 900
export const HEIGHT = 520
export const RUN_SECONDS = 60

/**
 * R218(B1): 心 → 血条。hp 为权威字段(标准 100),hearts 保留兼容读
 * (hearts = ceil(hp / 25));旧 view/旧存档直接写 hearts 时由
 * syncHeartsCompat 镜像回 hp,行为不回退。
 */
export const SLASH_BASE_HP = 100
export const HEART_HP = 25

/** R218(B3): 难度四档——敌速 × 受伤系数(spec §三 Slash)。 */
export const SLASH_DIFFICULTY_PARAMS: Record<GameDifficulty, {
  enemySpeedMult: number
  dmgMult: number
}> = {
  casual: { enemySpeedMult: 0.85, dmgMult: 0.7 },
  standard: { enemySpeedMult: 1, dmgMult: 1 },
  hard: { enemySpeedMult: 1.15, dmgMult: 1.2 },
  insane: { enemySpeedMult: 1.25, dmgMult: 1.4 },
}

/** R218(B2): 敌型(行为正交);knife = thrower 投出的飞刀实体。 */
export type BlockKind = 'normal' | 'feint' | 'guard' | 'dasher' | 'thrower' | 'knife'

/** R218(B1): 各敌型漏防/命中伤害(×难度 dmgMult 后取整,至少 1)。 */
export const BLOCK_DAMAGE: Record<BlockKind, number> = {
  normal: 25,
  feint: 30,
  guard: 30,
  dasher: 35,
  thrower: 35,
  knife: 35,
}

/** dasher 三段:接近 → 蓄力(0.5s 定住) → 冲刺(3.2×速) → 撞墙硬直(0.8s) → done(判漏)。 */
export const DASHER_CHARGE_T = 0.5
export const DASH_CHARGE_SECONDS = 0.5
export const DASH_SPEED_MULT = 3.2
export const DASH_WALL_T = 1.3
export const DASH_STAGGER_SECONDS = 0.8
/** thrower:停在判定圈外(t=0.28)投 2 刀(间隔 2s,首刀 1.2s)后逼近身。 */
export const THROWER_STOP_T = 0.28
export const THROWER_MAX_KNIVES = 2
export const THROW_INTERVAL = 2
export const THROW_FIRST_DELAY = 1.2
export const KNIFE_SPEED = 0.9
/** 飞刀抵达核心的判伤门槛(普通块仍 1.12)。 */
export const KNIFE_HIT_T = 1.02

/** 8 directions in ring order (matches gesture SECTORS: 0=right, CCW to 7=down-right) */
export const DIRS: Array<{ x: number; y: number; glyph: string }> = [
  { x: 1, y: 0, glyph: '→' }, { x: 0.71, y: -0.71, glyph: '↗' }, { x: 0, y: -1, glyph: '↑' },
  { x: -0.71, y: -0.71, glyph: '↖' }, { x: -1, y: 0, glyph: '←' }, { x: -0.71, y: 0.71, glyph: '↙' },
  { x: 0, y: 1, glyph: '↓' }, { x: 0.71, y: 0.71, glyph: '↘' },
]

export type SlashPhase = 'ready' | 'running' | 'lost'

export interface Block {
  /** R203/M3(FR-SL04): 假动作块——临近判定圈时方向标记翻转一次,诱导提前出刀。 */
  feint?: boolean
  id: number
  dir: number
  /** 0 = spawn edge, 1 = the strike ring */
  t: number
  speed: number
  hue: number
  bonus: boolean
  /** R218(B2): 敌型(normal 默认;feint 兼容旧布尔字段)。 */
  kind?: BlockKind
  /** guard:1 = 盾完好(正面格挡一次斩击,需绕后或先破防)。 */
  shield?: number
  /** dasher 行为状态机。 */
  dashState?: 'approach' | 'charge' | 'dash' | 'stagger' | 'done'
  dashTimer?: number
  /** thrower:已投刀数 / 投刀倒计时。 */
  throws?: number
  throwTimer?: number
}

export interface Streak {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hue: number
}

import { HIT_STOP, hitStopTick, TrailPoint, tickTrail, TRAIL_LIFE } from './juice'

export interface SlashState {
  phase: SlashPhase
  score: number
  combo: number
  bestCombo: number
  timeLeft: number
  /** FR-G08 burst short-run: time ceiling of the current run, written by
   *  startSlash (RUN_SECONDS default). The difficulty curve normalizes
   *  against this instead of the module constant. */
  runSeconds?: number
  blocks: Block[]
  streaks: Streak[]
  spawnTimer: number
  nextId: number
  bombCd: number
  flash: number
  shake: number
  /** R200(FR-G06): hit-stop 与刀光轨迹。 */
  hitStop: number
  trail: TrailPoint[]
  /** R203(FR-SL01): 三心制(兼容读;R218 B1 起为 hp 的派生 = ceil(hp/25))。 */
  hearts: number
  maxHearts: number
  /** R203(FR-SL02): 连锁块(击中后触发相邻同向块连爆)。 */
  chainEnabled: boolean
  /** R218(B1): 血条制——hp 权威字段(标准 100;受击按敌型 25/30/35 ×难度)。 */
  hp: number
  maxHp: number
  /** R218(B3): 难度四档(默认 standard)。 */
  difficulty: GameDifficulty
  /** R218(B3): U8 juice——完美斩 hitStop 0.03/屏震/连击飘字。 */
  juice: JuiceState
  /** R218(B3): 击杀涟漪(道场背景反馈)。 */
  ripples: { x: number; y: number; life: number }[]
}

export function initialSlashState(): SlashState {
  return {
    hitStop: 0,
    trail: [],
    hearts: Math.ceil(SLASH_BASE_HP / HEART_HP),
    maxHearts: Math.ceil(SLASH_BASE_HP / HEART_HP),
    chainEnabled: true,
    phase: 'ready', score: 0, combo: 0, bestCombo: 0, timeLeft: RUN_SECONDS,
    blocks: [], streaks: [], spawnTimer: 0.4, nextId: 1, bombCd: 0, flash: 0, shake: 0,
    hp: SLASH_BASE_HP,
    maxHp: SLASH_BASE_HP,
    difficulty: 'standard',
    juice: emptyJuice(),
    ripples: [],
  }
}

/** FR-G08: startSlash takes an optional run length (burst short-run uses 30s);
 *  the countdown and difficulty curve scale to whatever ceiling is passed.
 *  R218(B3): 第三参 difficulty(默认 standard)——旧二参调用行为不变。 */
export function startSlash(s: SlashState, seconds: number = RUN_SECONDS, difficulty: GameDifficulty = 'standard'): void {
  const fresh = initialSlashState()
  Object.assign(s, fresh)
  s.runSeconds = seconds
  s.timeLeft = seconds
  s.difficulty = difficulty
  s.phase = 'running'
}

/** 方块的敌型归一(kind 缺省时看旧 feint 布尔)。 */
export function blockKindOf(b: Block): BlockKind {
  if (b.kind !== undefined) return b.kind
  return b.feint === true ? 'feint' : 'normal'
}

/**
 * R218(B1): 旧 hearts 写入兼容——hearts 与派生值不一致视为外部直写
 * (旧 view 的休闲 5 心/旧存档),镜像进权威 hp/maxHp;hp 变化处同步 hearts。
 */
export function syncHeartsCompat(s: SlashState): void {
  if (typeof s.hp !== 'number' || typeof s.maxHp !== 'number') {
    s.hp = Math.max(0, s.hearts) * HEART_HP
    s.maxHp = Math.max(1, s.maxHearts) * HEART_HP
    return
  }
  const derived = Math.max(0, Math.ceil(s.hp / HEART_HP))
  if (s.hearts !== derived) {
    s.hp = Math.max(0, s.hearts) * HEART_HP
    s.maxHp = Math.max(1, s.maxHearts) * HEART_HP
  }
}

/** R218(B1): 受击结算——敌型伤害 ×难度 dmgMult(至少 1),同步 hearts,飘字;归零判负。 */
export function damageSlash(s: SlashState, amount: number): number {
  const dmg = Math.max(1, Math.round(amount * SLASH_DIFFICULTY_PARAMS[s.difficulty ?? 'standard'].dmgMult))
  s.hp = Math.max(0, s.hp - dmg)
  s.hearts = Math.max(0, Math.ceil(s.hp / HEART_HP))
  s.flash = 0.2
  s.shake = Math.min(8, s.shake + 4)
  if (s.juice) floatText(s.juice, WIDTH / 2, HEIGHT / 2 - 64, `-${dmg}`, '#f87171')
  if (s.hp <= 0) s.phase = 'lost'
  return dmg
}

/** Spawn a block flying inward from a random edge, marked with a direction. */
function spawnBlock(s: SlashState): void {
  // easier early, denser later — the difficulty curve (scaled to this run's ceiling)
  const run = s.runSeconds ?? RUN_SECONDS
  const hard = Math.min(1, (run - s.timeLeft) / run)
  const dir = Math.floor(Math.random() * 8)
  // R218(B2): 新敌型按波次/进度渐进混入(假动作 15s 后;guard 25% / dasher 35% / thrower 45%)
  const r = Math.random()
  let kind: BlockKind | undefined
  if (s.timeLeft < RUN_SECONDS - 15 && r < 0.1) kind = 'feint'
  else if (hard >= 0.45 && r < 0.27) kind = r < 0.16 ? 'guard' : r < 0.22 ? 'dasher' : 'thrower'
  else if (hard >= 0.35 && r < 0.22) kind = r < 0.16 ? 'guard' : 'dasher'
  else if (hard >= 0.25 && r < 0.16) kind = 'guard'
  const block: Block = {
    id: s.nextId++,
    dir,
    t: 0,
    speed: 0.14 + hard * 0.16 + Math.random() * 0.05,
    hue: (dir * 45 + 180) % 360,
    bonus: Math.random() < 0.08,
  }
  if (kind === 'feint') block.feint = true
  else if (kind !== undefined) block.kind = kind
  if (kind === 'guard') block.shield = 1
  if (kind === 'dasher') block.dashState = 'approach'
  if (kind === 'thrower') {
    block.throws = 0
    block.throwTimer = THROW_FIRST_DELAY
  }
  s.blocks.push(block)
}

/** R218(B2): thrower 的飞刀——从停点沿同方向飞向核心,可被斩落(t 窗口同判定圈)。 */
function spawnKnife(s: SlashState, thrower: Block): void {
  s.blocks.push({
    id: s.nextId++,
    dir: thrower.dir,
    t: THROWER_STOP_T,
    speed: KNIFE_SPEED,
    hue: 0,
    bonus: false,
    kind: 'knife',
  })
}

function burst(s: SlashState, x: number, y: number, hue: number, count: number, power: number): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = (0.4 + Math.random() * 0.6) * power
    s.streaks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, maxLife: 0.8, hue })
  }
}

const cx = () => WIDTH / 2
const cy = () => HEIGHT / 2

/** block position at parameter t (edge → strike ring) */
export function blockPos(b: Block): { x: number; y: number } {
  const R = Math.min(WIDTH, HEIGHT) * 0.46
  const d = DIRS[b.dir]
  // approach along the OPPOSITE of its marked direction (arrow = how to cut)
  const ex = cx() - d.x * R
  const ey = cy() - d.y * R
  return { x: ex + (cx() - ex) * b.t, y: ey + (cy() - ey) * b.t }
}

/** R218(B2): 判定圈内的可斩块——普通窗口 t∈[0.72,1.08];硬直中的 dasher 全程可斩。 */
function strikeable(b: Block): boolean {
  if (b.kind === 'dasher' && b.dashState === 'stagger') return true
  return b.t >= 0.72 && b.t <= 1.08
}

/**
 * A slash in direction `dir` (0..7). Kills blocks whose marker matches AND
 * that reached the strike zone; a wrong-direction slash in the zone breaks
 * the combo (accuracy pressure without punishing speed).
 * R218(B2): guard 持盾时正面(dir 同向)格挡一次返 'blocked'(盾碎,不断连击),
 * 背面(反向 dir+4)直接击杀;其余方向仍算 'wrong'。
 */
export function slash(s: SlashState, dir: number): 'hit' | 'wrong' | 'miss' | 'blocked' {
  if (s.phase !== 'running' || dir < 0 || dir > 7) return 'miss'
  let hit: Block | null = null
  for (const b of s.blocks) {
    if (strikeable(b)) { hit = b; break }
  }
  // momentum streak: the blade trail itself carries inertia (R142-L5)
  const d = DIRS[dir]
  burst(s, cx() - d.x * 60, cy() - d.y * 60, (dir * 45 + 180) % 360, 10, 220)
  if (!hit) return 'miss'
  if (hit.kind === 'guard' && (hit.shield ?? 0) > 0) {
    if (dir === hit.dir) {
      // 正面格挡一次:盾碎(先破防),连击保留
      hit.shield = 0
      s.flash = 0.12
      if (s.juice) juiceShake(s.juice, 2)
      return 'blocked'
    }
    if (dir !== (hit.dir + 4) % 8) {
      s.combo = 0
      s.flash = 0.15
      return 'wrong'
    }
    // 背面斩 → 正常击杀(绕后)
  } else if (hit.dir !== dir) {
    s.combo = 0
    s.flash = 0.15
    return 'wrong'
  }
  const p = blockPos(hit)
  s.blocks = s.blocks.filter((b) => b.id !== hit!.id)
  s.combo++
  s.bestCombo = Math.max(s.bestCombo, s.combo)
  const mult = 1 + Math.floor(s.combo / 5) * 0.5
  // R200: 金块/每 10 连击 → 顿帧(轻重两档)
  if (hit.bonus || s.combo % 10 === 0) s.hitStop = hit.bonus ? HIT_STOP.medium : HIT_STOP.light
  // R218(B3): 完美斩(金块)juice——hitStop 0.03 + 屏震;每 5 连击飘字;击杀涟漪
  if (hit.bonus && s.juice) {
    juiceHitStop(s.juice, 0.03)
    juiceShake(s.juice)
  }
  if (s.combo >= 5 && s.combo % 5 === 0 && s.juice) {
    floatText(s.juice, p.x, p.y - 30, `COMBO ×${s.combo}`, '#67e8f9')
  }
  if (s.ripples) {
    s.ripples.push({ x: p.x, y: p.y, life: 0.5 })
    if (s.ripples.length > 12) s.ripples.shift()
  }
  s.score += Math.round((hit.bonus ? 50 : 10) * mult)
  burst(s, p.x, p.y, hit.hue, hit.bonus ? 26 : 14, hit.bonus ? 320 : 200)
  // R203(FR-SL02): 连锁块——同向且接近判定圈的块被连带引爆(+5/块,不计连击)
  if (s.chainEnabled) {
    const chained = s.blocks.filter((b) => b.dir === dir && Math.abs(b.t - hit!.t) < 0.18 && b.kind !== 'knife' && !(b.kind === 'guard' && (b.shield ?? 0) > 0))
    for (const b of chained) {
      const cp = blockPos(b)
      burst(s, cp.x, cp.y, b.hue, 10, 220)
      s.score += 5
    }
    if (chained.length > 0) s.blocks = s.blocks.filter((b) => !chained.includes(b))
  }
  // R200: 刀光轨迹锚点(渐隐光带由绘制层连接)
  s.trail.push({ x: p.x, y: p.y, life: TRAIL_LIFE })
  if (s.trail.length > 8) s.trail.shift()
  s.shake = Math.min(8, s.shake + 3)
  return 'hit'
}

/** Pinch: shockwave bomb — clears every in-flight block at reduced value. */
export function bomb(s: SlashState): boolean {
  if (s.phase !== 'running' || s.bombCd > 0 || s.blocks.length === 0) return false
  s.bombCd = 6
  s.score += s.blocks.length * 5
  for (const b of s.blocks) {
    const p = blockPos(b)
    burst(s, p.x, p.y, b.hue, 10, 260)
  }
  s.blocks = []
  s.shake = 10
  return true
}

/** R218(B2): 按敌型推进方块(dasher/thrower 状态机;其余走通用路径)。 */
function advanceBlock(s: SlashState, b: Block, dt: number): void {
  const speedMult = SLASH_DIFFICULTY_PARAMS[s.difficulty ?? 'standard'].enemySpeedMult
  if (b.kind === 'dasher') {
    if (b.dashState === undefined) b.dashState = 'approach'
    if (b.dashState === 'approach') {
      b.t += b.speed * speedMult * dt
      if (b.t >= DASHER_CHARGE_T) {
        b.t = DASHER_CHARGE_T
        b.dashState = 'charge'
        b.dashTimer = DASH_CHARGE_SECONDS
      }
    } else if (b.dashState === 'charge') {
      b.dashTimer = (b.dashTimer ?? 0) - dt
      if (b.dashTimer <= 0) b.dashState = 'dash'
    } else if (b.dashState === 'dash') {
      b.t += b.speed * DASH_SPEED_MULT * speedMult * dt
      if (b.t >= DASH_WALL_T) {
        b.t = DASH_WALL_T
        b.dashState = 'stagger'
        b.dashTimer = DASH_STAGGER_SECONDS
      }
    } else if (b.dashState === 'stagger') {
      b.dashTimer = (b.dashTimer ?? 0) - dt
      if (b.dashTimer <= 0) {
        // 硬直结束仍未被斩 → 交由越圈过滤器判漏
        b.dashState = 'done'
        b.t = DASH_WALL_T + 0.01
      }
    }
    return
  }
  if (b.kind === 'thrower') {
    if (b.throws === undefined) b.throws = 0
    if (b.throwTimer === undefined) b.throwTimer = THROW_FIRST_DELAY
    if (b.t < THROWER_STOP_T) {
      b.t = Math.min(THROWER_STOP_T, b.t + b.speed * speedMult * dt)
    } else if ((b.throws ?? 0) < THROWER_MAX_KNIVES) {
      b.throwTimer -= dt
      if (b.throwTimer <= 0) {
        b.throws = (b.throws ?? 0) + 1
        b.throwTimer = THROW_INTERVAL
        spawnKnife(s, b)
      }
    } else {
      // 两刀投尽 → 逼近身(进入判定圈,可斩)
      b.t += b.speed * speedMult * dt
    }
    return
  }
  b.t += b.speed * speedMult * dt
  // FR-SL04: 假动作块在 t≈0.85 翻转一次方向标记(绘制层读取 dir 绘箭头)
  if ((b.feint === true || b.kind === 'feint') && b.t >= 0.85 && (b as Block & { flipped?: boolean }).flipped !== true) {
    (b as Block & { flipped?: boolean }).flipped = true
    b.dir = (b.dir + 4) % 8
  }
}

export function tickSlash(s: SlashState, dt: number): void {
  // R218: 旧状态对象缺新字段时补默认
  if (!s.juice) s.juice = emptyJuice()
  if (!s.ripples) s.ripples = []
  if (!s.difficulty) s.difficulty = 'standard'
  // R218(B1): 旧 hearts 直写镜像进 hp
  syncHeartsCompat(s)
  // R200: hit-stop(CHAIN/金块)冻结游戏计时;R218(B3): juice.hitStop 并入同一冻结
  if (s.hitStop > 0 || s.juice.hitStop > 0) {
    const [remain] = hitStopTick(s.hitStop, dt)
    const [juiceRemain] = hitStopTick(s.juice.hitStop, dt)
    s.hitStop = remain
    s.juice.hitStop = juiceRemain
    s.trail = tickTrail(s.trail, dt)
    return
  }
  s.trail = tickTrail(s.trail, dt)
  tickJuice(s.juice, dt)
  for (let i = s.ripples.length - 1; i >= 0; i--) {
    s.ripples[i].life -= dt
    if (s.ripples[i].life <= 0) s.ripples.splice(i, 1)
  }
  s.flash = Math.max(0, s.flash - dt)
  s.shake = Math.max(0, s.shake - dt * 24)
  s.bombCd = Math.max(0, s.bombCd - dt)
  // momentum: streaks coast with exponential decay
  for (const p of s.streaks) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vx *= 1 - 2.2 * dt
    p.vy *= 1 - 2.2 * dt
    p.life -= dt
  }
  s.streaks = s.streaks.filter((p) => p.life > 0)
  if (s.phase !== 'running') return
  s.timeLeft -= dt
  if (s.timeLeft <= 0) {
    s.timeLeft = 0
    s.phase = 'lost'
    return
  }
  // blocks that cross the ring un-cut: combo break (they "hit" the player core)
  // (按快照长度推进——本帧新投出的飞刀下一帧才开始飞)
  const blockCount = s.blocks.length
  for (let i = 0; i < blockCount; i++) advanceBlock(s, s.blocks[i], dt)
  // R218(B1/B2): 越圈按敌型各自结算伤害(25/30/35 ×难度);dasher 仅在硬直
  // 结束(done)判漏;飞刀门槛 1.02(抵达核心)。
  const crossed = s.blocks.filter((b) => {
    if (b.kind === 'dasher') return b.dashState === 'done'
    return b.t > (b.kind === 'knife' ? KNIFE_HIT_T : 1.12)
  })
  if (crossed.length > 0) {
    s.combo = 0
    for (const b of crossed) damageSlash(s, BLOCK_DAMAGE[blockKindOf(b)])
    s.blocks = s.blocks.filter((b) => !crossed.includes(b))
    if (s.hp <= 0) return // damageSlash 已把 phase 置 lost
  }
  s.spawnTimer -= dt
  if (s.spawnTimer <= 0) {
    spawnBlock(s)
    const run = s.runSeconds ?? RUN_SECONDS
    const hard = Math.min(1, (run - s.timeLeft) / run)
    s.spawnTimer = 0.9 - hard * 0.45 + Math.random() * 0.35
  }
}

export function drawSlash(ctx: CanvasRenderingContext2D, s: SlashState, time: number): void {
  drawSlashBody(ctx, s, time)
  // R200(FR-G06.3): 刀光轨迹——最近 6–8 帧命中点连成渐隐光带
  if (s.trail.length > 1) {
    ctx.save()
    ctx.lineCap = 'round'
    for (let i = 1; i < s.trail.length; i += 1) {
      const a = s.trail[i - 1]
      const b = s.trail[i]
      ctx.globalAlpha = Math.max(0, b.life / 0.18) * 0.5
      ctx.strokeStyle = '#e2f8ff'
      ctx.lineWidth = 2 + 4 * (i / s.trail.length)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
    ctx.restore()
  }
  // R200(取证 F5): 炸弹充能环——右上角,bombCd 从 6 递减,环随充能闭合
  if (s.phase === 'running') {
    const cx = WIDTH - 36
    const cy = 36
    const r = 14
    const frac = 1 - Math.min(1, s.bombCd / 6)
    ctx.save()
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.35)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    if (frac > 0) {
      ctx.strokeStyle = s.bombCd <= 0 ? '#4ade80' : '#fb7185'
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
      ctx.stroke()
    }
    ctx.fillStyle = '#9fb7c1'
    ctx.font = '700 9px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('B', cx, cy)
    ctx.restore()
  }
}

/**
 * R218(B3): 道场背景——渐变 + 2 层轻视差(纯绘制于 slash.ts 内,不动 scene.ts)。
 * 玩家固定于核心 → 视差为时间慢漂移(远层 0.05 系数斜纹 / 近层 0.10 光尘),
 * 击杀涟漪与低血 vignette 提供事件响应。
 */
function drawDojoBackdrop(ctx: CanvasRenderingContext2D, time: number): void {
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  g.addColorStop(0, '#0c1620')
  g.addColorStop(0.55, '#101b22')
  g.addColorStop(1, '#0a1116')
  ctx.fillStyle = g
  ctx.fillRect(-12, -12, WIDTH + 24, HEIGHT + 24)
  // 远层(0.05):斜向格栅缓慢漂移
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.strokeStyle = '#67e8f9'
  ctx.lineWidth = 10
  const off1 = (time * 0.006) % 96
  for (let x = -192 + off1; x < WIDTH + 96; x += 96) {
    ctx.beginPath()
    ctx.moveTo(x, -12)
    ctx.lineTo(x + 160, HEIGHT + 12)
    ctx.stroke()
  }
  ctx.restore()
  // 近层(0.10):光尘反向漂移
  ctx.save()
  ctx.fillStyle = '#9fd6e8'
  for (let i = 0; i < 14; i++) {
    const seed = i * 137.5
    const x = WIDTH - (((seed * 7 + time * 0.012) % (WIDTH + 80)) - 40)
    const y = ((seed * 3.3) % (HEIGHT + 40)) - 20
    ctx.globalAlpha = 0.05 + 0.04 * Math.sin(time / 900 + i)
    ctx.beginPath()
    ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSlashBody(ctx: CanvasRenderingContext2D, s: SlashState, time: number): void {
  // R218(B1): 心形 HUD → U5 连续血条(左上,稳定层不随屏震)
  if (s.phase === 'running' || s.phase === 'lost') {
    const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 1
    drawHealthBar(ctx, 14, 12, 180, 14, ratio, time / 1000)
    ctx.fillStyle = 'rgba(226, 248, 255, 0.92)'
    ctx.font = '700 10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.max(0, Math.ceil(s.hp))}/${s.maxHp}`, 104, 19.5)
  }
  ctx.save()
  if (s.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake)
  }
  // R218(B3): U8 juice 屏震
  if (s.juice) applyShake(ctx, s.juice)
  // backdrop
  drawDojoBackdrop(ctx, time)

  // strike ring
  ctx.strokeStyle = 'rgba(103,232,249,0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.arc(cx(), cy(), Math.min(WIDTH, HEIGHT) * 0.33, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // R218(B3): 击杀涟漪
  if (s.ripples) {
    for (const r of s.ripples) {
      const k = 1 - Math.max(0, r.life) / 0.5
      ctx.globalAlpha = Math.max(0, r.life / 0.5) * 0.6
      ctx.strokeStyle = '#67e8f9'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(r.x, r.y, 8 + k * 36, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // blocks with direction glyphs
  for (const b of s.blocks) {
    const p = blockPos(b)
    const kind = blockKindOf(b)
    const size = kind === 'knife' ? 9 : 18 + b.t * 14
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(Math.atan2(DIRS[b.dir].y, DIRS[b.dir].x))
    if (kind === 'knife') {
      // R218(B2): 飞刀——细长三角朝核心
      ctx.fillStyle = '#fca5a5'
      ctx.beginPath()
      ctx.moveTo(size + 7, 0)
      ctx.lineTo(-size, -5)
      ctx.lineTo(-size + 4, 0)
      ctx.lineTo(-size, 5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      continue
    }
    if (kind === 'guard') {
      ctx.strokeStyle = `hsl(210 30% ${b.shield ? 66 : 48}%)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect?.(-size, -size, size * 2, size * 2, 8)
      if (!ctx.roundRect) ctx.rect(-size, -size, size * 2, size * 2)
      ctx.stroke()
      if ((b.shield ?? 0) > 0) {
        // 面向核心的盾(+x = 行进方向)
        ctx.fillStyle = 'rgba(203, 213, 225, 0.9)'
        ctx.fillRect(size - 5, -size + 4, 6, size * 2 - 8)
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.9)'
        ctx.lineWidth = 2
        ctx.strokeRect(size - 5, -size + 4, 6, size * 2 - 8)
      } else {
        // 破防裂纹
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(size - 8, -size + 6)
        ctx.lineTo(size - 2, -size + 14)
        ctx.lineTo(size - 9, -size + 20)
        ctx.stroke()
      }
    } else if (kind === 'dasher') {
      ctx.strokeStyle = `hsl(${b.hue} 92% 64%)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(size, 0)
      ctx.lineTo(0, -size)
      ctx.lineTo(-size, 0)
      ctx.lineTo(0, size)
      ctx.closePath()
      ctx.stroke()
      if (b.dashState === 'dash') {
        // 冲刺拖影
        ctx.globalAlpha = 0.35
        ctx.strokeStyle = `hsl(${b.hue} 92% 70%)`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-size - 26, 0)
        ctx.lineTo(-size - 6, 0)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    } else if (kind === 'thrower') {
      ctx.strokeStyle = `hsl(350 70% 62%)`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-4, -6); ctx.lineTo(4, 6)
      ctx.moveTo(4, -6); ctx.lineTo(-4, 6)
      ctx.stroke()
    } else {
      ctx.strokeStyle = `hsl(${b.hue} 85% 62%)`
      ctx.lineWidth = 3
      if (kind === 'feint') ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.roundRect?.(-size, -size, size * 2, size * 2, 8)
      if (!ctx.roundRect) ctx.rect(-size, -size, size * 2, size * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (b.bonus) {
      ctx.fillStyle = `hsl(${b.hue} 85% 62%)`
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    // 非旋转层:dasher 蓄力预警 / 硬直眩晕
    if (kind === 'dasher' && b.dashState === 'charge') {
      const k = 1 - Math.max(0, b.dashTimer ?? 0) / DASH_CHARGE_SECONDS
      ctx.strokeStyle = `rgba(251, 191, 36, ${0.35 + 0.45 * k})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, size + 10 - 8 * k, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (kind === 'dasher' && b.dashState === 'stagger') {
      ctx.strokeStyle = 'rgba(159, 183, 193, 0.8)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y - size - 8, 5, 0, Math.PI * 2)
      ctx.stroke()
    }
    // 方向箭头(飞刀已在上面 continue,不绘箭头)
    ctx.fillStyle = `hsl(${b.hue} 90% 72%)`
    ctx.font = '600 22px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(DIRS[b.dir].glyph, p.x, p.y)
  }

  // momentum streaks
  for (const p of s.streaks) {
    ctx.fillStyle = `hsla(${p.hue}, 90%, 70%, ${Math.max(0, p.life / p.maxLife)})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // core
  ctx.strokeStyle = `rgba(103,232,249,${0.7 + 0.3 * Math.sin(time / 200)})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx(), cy(), 16, 0, Math.PI * 2)
  ctx.stroke()

  if (s.flash > 0) {
    ctx.fillStyle = `rgba(248,113,113,${s.flash})`
    ctx.fillRect(-12, -12, WIDTH + 24, HEIGHT + 24)
  }
  ctx.restore()
  // R218(B1/B3): 低血 vignette(≤25%)+ U8 飘字(稳定层)
  if (s.phase === 'running' && s.maxHp > 0) {
    const ratio = Math.max(0, Math.min(1, s.hp / s.maxHp))
    if (ratio <= 0.25) drawAlertVignette(ctx, WIDTH, HEIGHT, 0.3 + 0.5 * (1 - ratio), time / 1000)
  }
  if (s.juice) drawFloats(ctx, s.juice)
}

// ── FR-G01(R198): 策略教练 —— 纯函数,key 制文案 ──
import type { CoachHint } from './coach'

export function slashHints(state: SlashState): CoachHint[] {
  const hints: CoachHint[] = []
  if (state.phase !== 'running') return hints
  if (state.timeLeft <= 10) hints.push({ key: 'sl.timeLow', tone: 'warn', priority: 80 })
  if (state.bombCd <= 0) hints.push({ key: 'sl.bombReady', tone: 'tip', priority: 60 })
  if (state.combo >= 10) hints.push({ key: 'sl.comboPraise', tone: 'praise', priority: 55 })
  if (state.flash > 0) hints.push({ key: 'sl.wrongCut', tone: 'warn', priority: 45 })
  if (state.bestCombo < 3 && state.combo < 2) hints.push({ key: 'sl.aim', tone: 'tip', priority: 30 })
  return hints
}

// ── R208 (FR-MP03): 轮换对决——纯函数判定,view 层编排回合 ──

export type DuelVerdict = 'p1' | 'p2' | 'tie'

/** 双方两回合比分判定（未完成回合按 null 视作未定,返回 null）。 */
export function judgeDuel(scores: [number | null, number | null]): DuelVerdict | null {
  const [a, b] = scores
  if (a === null || b === null) return null
  if (a > b) return 'p1'
  if (b > a) return 'p2'
  return 'tie'
}
