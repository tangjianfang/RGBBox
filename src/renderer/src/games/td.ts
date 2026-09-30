// R99.6: Balloon TD Arena engine — extracted from MiniGamesView (R97/R98
// mechanics unchanged) with synthesized sound effects hooked in.
import { playSfx } from './sfx'
// R218: 共享 HUD/juice 工具(U1 胶囊 / U5 血条 / U1 vignette+toast / U8 juice)
import {
  applyShake,
  DIFFICULTY_SCORE_MULT,
  drawAlertVignette,
  drawFloats,
  drawHealthBar,
  drawHudCapsule,
  drawToasts,
  emptyJuice,
  floatText,
  hitStop as juiceHitStop,
  type GameDifficulty,
  type HudToast,
  type JuiceState,
  pushToast,
  shake as juiceShake,
  tickJuice,
  tickToasts,
} from './hud'

export type GamePhase = 'ready' | 'running' | 'won' | 'lost'
export type TowerKind = 'dart' | 'frost' | 'storm' | 'rail' | 'mint'

export interface Point {
  x: number
  y: number
}

export interface Balloon {
  id: number
  progress: number
  speed: number
  hp: number
  maxHp: number
  reward: number
  slowUntil: number
  color: string
  /** R218(A2): 再生词缀——距下次回血的倒计时(秒);仅 regen 波推进。 */
  regenTimer?: number
}

export interface Tower extends Point {
  id: number
  kind: TowerKind
  level: number
  spent: number
  angle: number
  range: number
  cooldown: number
  fireRate: number
  damage: number
}

interface Projectile extends Point {
  id: number
  targetId: number
  speed: number
  damage: number
  color: string
  slow: boolean
  splash: boolean
  lx: number
  ly: number
}

interface FloatingText extends Point {
  id: number
  text: string
  life: number
  color: string
}

interface Particle extends Point {
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface Banner {
  text: string
  life: number
}

export interface GameState {
  phase: GamePhase
  wave: number
  lives: number
  coins: number
  score: number
  clock: number
  shake: number
  nextId: number
  waveQueue: number
  spawnTimer: number
  waveCooldown: number
  balloons: Balloon[]
  towers: Tower[]
  projectiles: Projectile[]
  texts: FloatingText[]
  particles: Particle[]
  banner: Banner | null
  /** R200(FR-G06): 整波清空顿帧。 */
  hitStop: number
  /** R201(FR-TD02)+R218(A2): 当前词缀波(>12 波后循环;null=普通波)。 */
  affix: Affix | null
  /** R201(FR-TD03): 陨石技能(冷却剩余秒;Q 触发)。 */
  meteorCd: number
  /** R201(FR-TD02): 无尽模式(>12 波不判胜,词缀循环)。 */
  endless: boolean
  /** FR-G08 blitz short-run: 6-wave race. View writes it before start
   *  (same pattern as other mode flags); the engine only reads it. */
  blitz?: boolean
  /** R218(A1): 难度四档(默认 standard;驱动 TD_DIFFICULTY_PARAMS)。 */
  difficulty: GameDifficulty
  /** R218(A3): 基地生命条分母(=开局 lives;U5 比例用)。 */
  maxLives: number
  /** R218(A3): U8 juice——漏球 hitStop 0.02 / 屏震 / 飘字。 */
  juice: JuiceState
  /** R218(A3): U1 toast 队列(boss 波开场提示)。 */
  toasts: HudToast[]
}

export interface TowerDefinition {
  kind: TowerKind
  label: string
  cost: number
  range: number
  fireRate: number
  damage: number
  color: string
  description: string
}

export const WIDTH = 900
export const HEIGHT = 520
export const MAX_WAVE = 12
/** FR-G08: wave ceiling of a blitz short-run. */
export const BLITZ_WAVES = 6
export const AUTO_WAVE_SECONDS = 8
export const TOWER_MAX_LEVEL = 3
export const SELL_REFUND = 0.7
/** R218(A1): 标准档起始金(TD_DIFFICULTY_PARAMS.startGoldDelta 的基准)。 */
export const TD_BASE_COINS = 220

/**
 * R218(A1): TD 难度四档参数(spec §三 TD)——lives × 敌 HP 系数 × 起始金增减。
 * 旧 R204 二档语义映射:casual=lives 30(旧 30 命)+起始金 +60;standard=20/0
 * (与旧标准档 20 命/220 金完全一致,零参数调用 initialState() 行为不变)。
 * 分数结算统一 ×DIFFICULTY_SCORE_MULT(见 tickGame;街机档案侧由 shell 挂)。
 */
export const TD_DIFFICULTY_PARAMS: Record<GameDifficulty, {
  lives: number
  enemyHpMult: number
  startGoldDelta: number
}> = {
  casual: { lives: 30, enemyHpMult: 0.8, startGoldDelta: 60 },
  standard: { lives: 20, enemyHpMult: 1.0, startGoldDelta: 0 },
  hard: { lives: 14, enemyHpMult: 1.25, startGoldDelta: -40 },
  insane: { lives: 10, enemyHpMult: 1.5, startGoldDelta: -80 },
}

const PATH: Point[] = [
  { x: -40, y: 284 },
  { x: 128, y: 284 },
  { x: 128, y: 118 },
  { x: 344, y: 118 },
  { x: 344, y: 404 },
  { x: 594, y: 404 },
  { x: 594, y: 198 },
  { x: 784, y: 198 },
  { x: 940, y: 328 },
]

export const TOWER_DEFINITIONS: TowerDefinition[] = [
  { kind: 'dart', label: 'Pulse Dart', cost: 70, range: 126, fireRate: 0.62, damage: 1, color: '#67e8f9', description: 'Fast single-target shots.' },
  { kind: 'frost', label: 'Frost Prism', cost: 105, range: 112, fireRate: 1.05, damage: 1, color: '#93c5fd', description: 'Slows dense balloon packs.' },
  { kind: 'storm', label: 'Storm Coil', cost: 145, range: 146, fireRate: 1.32, damage: 2, color: '#f0abfc', description: 'High damage with splash arcs.' },
  { kind: 'rail', label: 'Rail Cannon', cost: 190, range: 210, fireRate: 2.2, damage: 4, color: '#fca5a5', description: 'Snipes the toughest balloon first.' },
  { kind: 'mint', label: 'Mint Spire', cost: 120, range: 0, fireRate: 4, damage: 0, color: '#fde047', description: 'Mints +6 coins every 4 seconds.' },
]

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pathLength(): number {
  let total = 0
  for (let i = 0; i < PATH.length - 1; i++) total += distance(PATH[i], PATH[i + 1])
  return total
}

const TOTAL_PATH_LENGTH = pathLength()

function pointAtProgress(progress: number): Point {
  let remaining = progress * TOTAL_PATH_LENGTH
  for (let i = 0; i < PATH.length - 1; i++) {
    const start = PATH[i]
    const end = PATH[i + 1]
    const segment = distance(start, end)
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
    }
    remaining -= segment
  }
  return PATH[PATH.length - 1]
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return distance(point, a)
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1)
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t })
}

export function distanceToPath(point: Point): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < PATH.length - 1; i++) min = Math.min(min, distanceToSegment(point, PATH[i], PATH[i + 1]))
  return min
}

/** FR-G08: wave ceiling of the current run — 6 in a blitz race, MAX_WAVE
 *  otherwise. All wave-gating logic (launch guard / win / auto next wave)
 *  reads through this so the two modes share one code path. */
export function targetWaves(state: GameState): number {
  return state.blitz ? BLITZ_WAVES : MAX_WAVE
}

export function initialState(difficulty: GameDifficulty = 'standard'): GameState {
  const params = TD_DIFFICULTY_PARAMS[difficulty]
  return {
    phase: 'ready',
    wave: 0,
    lives: params.lives,
    maxLives: params.lives,
    coins: TD_BASE_COINS + params.startGoldDelta,
    score: 0,
    clock: 0,
    shake: 0,
    nextId: 1,
    waveQueue: 0,
    spawnTimer: 0,
    waveCooldown: AUTO_WAVE_SECONDS,
    balloons: [],
    towers: [],
    projectiles: [],
    texts: [],
    particles: [],
    banner: null,
    hitStop: 0,
    affix: null,
    meteorCd: 0,
    endless: false,
    blitz: false,
    difficulty,
    juice: emptyJuice(),
    toasts: [],
  }
}

export function addText(state: GameState, x: number, y: number, text: string, color: string): void {
  state.texts.push({ id: state.nextId++, x, y, text, color, life: 0.9 })
}

export function spawnBurst(state: GameState, x: number, y: number, color: string, count = 10, power = 130): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.35 + Math.random() * 0.65)
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.35,
      maxLife: 0.85,
      size: 2 + Math.random() * 3,
      color,
    })
  }
}

function spawnBalloon(state: GameState): void {
  const wavePower = Math.max(1, state.wave)
  const elite = wavePower > 4 && state.waveQueue % 5 === 0
  // R201(FR-TD02): 词缀波——坚韧倍血;R218(A1): 难度敌 HP 系数
  const affixHp = state.affix !== null ? AFFIX_PARAMS[state.affix].hp : 1
  const hp = Math.round((elite ? 3 + Math.floor(wavePower / 2) : 1 + Math.floor(wavePower / 3)) * affixHp * TD_DIFFICULTY_PARAMS[state.difficulty].enemyHpMult)
  state.balloons.push({
    id: state.nextId++,
    progress: 0,
    speed: (elite ? 0.035 : 0.046) + wavePower * 0.002,
    hp,
    maxHp: hp,
    reward: elite ? 18 : 10,
    slowUntil: 0,
    color: elite ? '#f97316' : ['#fb7185', '#38bdf8', '#facc15', '#a78bfa'][wavePower % 4],
    // R218(A2): regen 波出场的气球带 3s 回血计时
    regenTimer: state.affix === 'regen' ? REGEN_INTERVAL : undefined,
  })
}

export const AFFIXES = ['swift', 'tough', 'phantom', 'regen', 'armored'] as const
export type Affix = (typeof AFFIXES)[number]

export interface AffixParams {
  speed: number
  hp: number
  phase: boolean
  label: string
  /** R218(A2): regen——每 REGEN_INTERVAL 秒回 maxHp 的该比例(绿色脉冲环)。 */
  regenPct?: number
  /** R218(A2): armored——单次受击伤害低于该值被格挡(灰甲描边)。 */
  armorMin?: number
}

/** R201(FR-TD02)+R218(A2): 词缀波参数——迅捷/坚韧/幻影/再生/重甲。 */
export const AFFIX_PARAMS: Record<Affix, AffixParams> = {
  swift: { speed: 1.45, hp: 1, phase: false, label: '迅捷' },
  tough: { speed: 1, hp: 2.2, phase: false, label: '坚韧' },
  phantom: { speed: 1.15, hp: 1, phase: true, label: '幻影' },
  regen: { speed: 1, hp: 1, phase: false, label: '再生', regenPct: 0.08 },
  armored: { speed: 1, hp: 1, phase: false, label: '重甲', armorMin: 2 },
}

/** R218(A2): regen 回血周期(秒)。 */
export const REGEN_INTERVAL = 3

/**
 * R218(A2): 结算单次对气球伤害——armored 词缀下低于 armorMin 的伤害被格挡
 * (返回 0,不扣血);≥armorMin 的伤害全额生效。meteor/弹丸共用本入口。
 */
export function applyBalloonDamage(balloon: Balloon, damage: number, affix: Affix | null): number {
  if (affix === 'armored' && damage < (AFFIX_PARAMS.armored.armorMin ?? 2)) return 0
  balloon.hp -= damage
  return damage
}

/** 波 13–24(无尽前两圈):沿旧三词缀循环,行为与 R201 完全一致。 */
const CLASSIC_AFFIX_CYCLE: readonly Affix[] = ['swift', 'tough', 'phantom']
/**
 * R218(A2): 无尽高波次(≥25)加权词缀池——新词缀 regen/armored 各占 3/10,
 * 旧三词缀合计 4/10(「高波次词缀池加权出新种」,确定性序列保证 LAN 双端一致)。
 */
const DEEP_AFFIX_POOL: readonly Affix[] = [
  'regen', 'swift', 'armored', 'regen', 'tough',
  'armored', 'phantom', 'swift', 'regen', 'armored',
]
/** R218(A2): 加权池起始波(13–24 保持旧循环)。 */
export const DEEP_AFFIX_START_WAVE = MAX_WAVE + 13

export function affixForWave(wave: number): Affix | null {
  if (wave <= MAX_WAVE) return null
  const n = wave - MAX_WAVE - 1
  if (wave < DEEP_AFFIX_START_WAVE) return CLASSIC_AFFIX_CYCLE[n % CLASSIC_AFFIX_CYCLE.length]
  return DEEP_AFFIX_POOL[(n - (DEEP_AFFIX_START_WAVE - MAX_WAVE - 1)) % DEEP_AFFIX_POOL.length]
}

export function launchWave(state: GameState): void {
  // R201(FR-TD02): 无尽模式——12 波后不封顶,词缀循环
  // (FR-G08: 常规/闪电赛上限统一走 targetWaves)
  if (!state.endless && state.wave >= targetWaves(state)) return
  state.wave += 1
  state.waveQueue = 12 + state.wave * 3
  state.spawnTimer = 0.2
  state.waveCooldown = AUTO_WAVE_SECONDS
  state.phase = 'running'
  state.affix = affixForWave(state.wave)
  state.banner = { text: state.affix !== null ? `WAVE ${state.wave} · ${AFFIX_PARAMS[state.affix].label}` : `WAVE ${state.wave}`, life: 1.7 }
  // R218(A3): boss 波(重精英波 = 5 的倍数波)开场 toast 提示
  if (state.wave >= 5 && state.wave % 5 === 0) {
    if (!state.toasts) state.toasts = []
    pushToast(state.toasts, `BOSS WAVE ${state.wave} — elites inbound`, 3, '#fca5a5')
  }
  playSfx('wave')
}

function nearestTarget(tower: Tower, balloons: Balloon[]): Balloon | undefined {
  let target: Balloon | undefined
  let bestProgress = -1
  let bestHp = -1
  const prioritizeToughest = tower.kind === 'rail'
  for (const balloon of balloons) {
    const pos = pointAtProgress(balloon.progress)
    if (distance(tower, pos) > tower.range) continue
    if (prioritizeToughest) {
      if (balloon.maxHp > bestHp || (balloon.maxHp === bestHp && balloon.progress > bestProgress)) {
        target = balloon
        bestHp = balloon.maxHp
        bestProgress = balloon.progress
      }
    } else if (balloon.progress > bestProgress) {
      target = balloon
      bestProgress = balloon.progress
    }
  }
  return target
}

/** R201(FR-TD03): 陨石——全屏伤害 40,冷却 45s;返回命中数(0=未就绪)。 */
export function castMeteor(state: GameState): number {
  if (state.phase !== 'running' || state.meteorCd > 0) return 0
  const hit = state.balloons.length
  for (const balloon of state.balloons) {
    // R218(A2): 统一走 applyBalloonDamage(40 ≥ armorMin,重甲不格挡)
    applyBalloonDamage(balloon, 40, state.affix)
    const pos = pointAtProgress(balloon.progress)
    spawnBurst(state, pos.x, pos.y, '#fbbf24', 6, 200)
  }
  state.meteorCd = 45
  state.shake = 8
  state.balloons = state.balloons.filter((b) => b.hp > 0)
  return hit
}

export function towerUpgradeCost(tower: Tower): number {
  const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
  return Math.round(def.cost * (tower.level === 1 ? 0.85 : 1.35))
}

export function upgradeTower(state: GameState, tower: Tower): boolean {
  if (tower.level >= TOWER_MAX_LEVEL) return false
  const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
  const cost = towerUpgradeCost(tower)
  if (state.coins < cost) return false
  state.coins -= cost
  tower.spent += cost
  tower.level += 1
  tower.damage = Math.max(1, Math.round(def.damage * (1 + 0.6 * (tower.level - 1))))
  tower.range = Math.round(def.range * (1 + 0.16 * (tower.level - 1)))
  tower.fireRate = def.fireRate / (1 + 0.22 * (tower.level - 1))
  playSfx('build')
  return true
}

export function sellTower(state: GameState, tower: Tower): void {
  const refund = Math.round(tower.spent * SELL_REFUND)
  state.coins += refund
  state.towers = state.towers.filter((item) => item.id !== tower.id)
  spawnBurst(state, tower.x, tower.y, '#9fb7c1', 12, 100)
  addText(state, tower.x, tower.y - 20, `+${refund}`, '#86efac')
  playSfx('coin')
}

function makeProjectile(state: GameState, tower: Tower, target: Balloon, def: TowerDefinition): void {
  state.projectiles.push({ id: state.nextId++, x: tower.x, y: tower.y, targetId: target.id, speed: tower.kind === 'storm' ? 420 : tower.kind === 'rail' ? 640 : 520, damage: tower.damage, color: def.color, slow: tower.kind === 'frost', splash: tower.kind === 'storm', lx: tower.x, ly: tower.y })
}

export function tickGame(state: GameState, dt: number): void {
  // R218: 旧快照(LAN/持久化)缺新字段时补默认,避免 undefined 崩 tick
  if (!state.juice) state.juice = emptyJuice()
  if (!state.toasts) state.toasts = []
  if (!state.difficulty) state.difficulty = 'standard'
  // R200: 整波清空 → 轻顿帧;R218(A3): juice.hitStop 并入同一冻结;冻结期间不推进
  if (state.hitStop > 0 || state.juice.hitStop > 0) {
    const [remain] = hitStopTick(state.hitStop, dt)
    const [juiceRemain] = hitStopTick(state.juice.hitStop, dt)
    state.hitStop = remain
    state.juice.hitStop = juiceRemain
    return
  }
  if (state.meteorCd > 0) state.meteorCd = Math.max(0, state.meteorCd - dt)
  const waveJustCleared = state.wave >= 1 && state.waveQueue === 0 && state.balloons.length === 0 && state.spawnTimer === 0 && state.phase === 'running'
  if (waveJustCleared && state.waveCooldown > 7.9) state.hitStop = HIT_STOP.light
  state.clock += dt
  // R218(A3): U1 toast / U8 juice 步进(所有阶段都衰减)
  tickToasts(state.toasts, dt)
  tickJuice(state.juice, dt)
  state.shake = Math.max(0, state.shake - dt * 14)
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 260 * dt
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
  if (state.banner) {
    state.banner.life -= dt
    if (state.banner.life <= 0) state.banner = null
  }
  if (state.phase !== 'running') return
  if (state.waveQueue > 0) {
    state.spawnTimer -= dt
    if (state.spawnTimer <= 0) {
      spawnBalloon(state)
      state.waveQueue -= 1
      state.spawnTimer = Math.max(0.28, 0.72 - state.wave * 0.025)
    }
  }
  for (const balloon of state.balloons) {
    const slowFactor = balloon.slowUntil > 0 ? 0.56 : 1
    balloon.progress += balloon.speed * slowFactor * dt * (state.affix !== null ? AFFIX_PARAMS[state.affix].speed : 1)
    balloon.slowUntil = Math.max(0, balloon.slowUntil - dt)
    // R218(A2): 再生词缀——每 3s 回 8% maxHp(至少 1,不超上限)
    if (state.affix === 'regen') {
      if (balloon.regenTimer === undefined) balloon.regenTimer = REGEN_INTERVAL
      balloon.regenTimer -= dt
      if (balloon.regenTimer <= 0) {
        balloon.regenTimer += REGEN_INTERVAL
        if (balloon.hp < balloon.maxHp) {
          const heal = Math.max(1, Math.round(balloon.maxHp * (AFFIX_PARAMS.regen.regenPct ?? 0.08)))
          balloon.hp = Math.min(balloon.maxHp, balloon.hp + heal)
        }
      }
    }
  }
  const escaped = state.balloons.filter((balloon) => balloon.progress >= 1)
  if (escaped.length > 0) {
    state.lives -= escaped.length
    state.balloons = state.balloons.filter((balloon) => balloon.progress < 1)
    spawnBurst(state, 880, 328, '#f87171', 10, 150)
    state.shake = Math.min(7, 2.5 + escaped.length)
    // R218(A3): 漏球 juice——hitStop 0.02 + 屏震 3 + 飘字(-n)
    juiceHitStop(state.juice, 0.02)
    juiceShake(state.juice, 3)
    floatText(state.juice, 862, 296, `-${escaped.length}`, '#f87171')
    playSfx('hurt')
  }
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt)
    if (tower.kind === 'mint') {
      if (tower.cooldown <= 0) {
        state.coins += 6
        addText(state, tower.x, tower.y - 26, '+6', '#fde047')
        spawnBurst(state, tower.x, tower.y, '#fde047', 5, 70)
        tower.cooldown = tower.fireRate
      }
      continue
    }
    const target = nearestTarget(tower, state.balloons)
    if (!target) continue
    const pos = pointAtProgress(target.progress)
    const desired = Math.atan2(pos.y - tower.y, pos.x - tower.x)
    let diff = desired - tower.angle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    tower.angle += diff * Math.min(1, dt * 12)
    if (tower.cooldown > 0) continue
    const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
    makeProjectile(state, tower, target, def)
    tower.cooldown = tower.fireRate
    playSfx('shoot')
  }
  const remainingProjectiles: Projectile[] = []
  for (const projectile of state.projectiles) {
    const target = state.balloons.find((balloon) => balloon.id === projectile.targetId)
    if (!target) continue
    const targetPos = pointAtProgress(target.progress)
    const dx = targetPos.x - projectile.x
    const dy = targetPos.y - projectile.y
    const step = projectile.speed * dt
    const dist = Math.hypot(dx, dy)
    if (dist <= step || dist <= 1) {
      const hitBalloons = projectile.splash ? state.balloons.filter((balloon) => distance(pointAtProgress(balloon.progress), targetPos) <= 44) : [target]
      let blockedAny = false
      for (const balloon of hitBalloons) {
        // R218(A2): armored 词缀——伤害 <2 被格挡(返回 0)
        if (applyBalloonDamage(balloon, projectile.damage, state.affix) === 0) blockedAny = true
        if (projectile.slow) balloon.slowUntil = 1.5
      }
      spawnBurst(state, targetPos.x, targetPos.y, projectile.color, 6, 90)
      if (blockedAny) {
        addText(state, targetPos.x, targetPos.y - 26, 'BLOCK', '#94a3b8')
      } else {
        addText(state, targetPos.x, targetPos.y - 12, projectile.splash ? 'ARC' : `-${projectile.damage}`, projectile.color)
      }
    } else {
      projectile.lx = projectile.x
      projectile.ly = projectile.y
      projectile.x += (dx / dist) * step
      projectile.y += (dy / dist) * step
      remainingProjectiles.push(projectile)
    }
  }
  state.projectiles = remainingProjectiles
  const popped = state.balloons.filter((balloon) => balloon.hp <= 0)
  if (popped.length > 0) {
    // R218(A1): 分数结算 ×难度倍率(1/1.5/2/3;街机档案侧由 shell 读 state.difficulty)
    const scoreMult = DIFFICULTY_SCORE_MULT[state.difficulty]
    for (const balloon of popped) {
      const pos = pointAtProgress(balloon.progress)
      state.coins += balloon.reward
      state.score += Math.round(balloon.reward * 5 * scoreMult)
      spawnBurst(state, pos.x, pos.y, balloon.color, 10, 140)
      addText(state, pos.x, pos.y, `+${balloon.reward}`, '#86efac')
    }
    state.balloons = state.balloons.filter((balloon) => balloon.hp > 0)
    playSfx('pop')
  }
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'lost'
    spawnBurst(state, WIDTH / 2, HEIGHT / 2, '#f87171', 26, 220)
    playSfx('gameover')
    return
  }
  if (!state.endless && state.wave >= targetWaves(state) && state.waveQueue === 0 && state.balloons.length === 0) {
    state.phase = 'won'
    spawnBurst(state, WIDTH / 2, HEIGHT / 2 - 40, '#67e8f9', 22, 200)
    spawnBurst(state, WIDTH / 2 - 120, HEIGHT / 2 + 40, '#86efac', 16, 160)
    spawnBurst(state, WIDTH / 2 + 120, HEIGHT / 2 + 40, '#fde68a', 16, 160)
    playSfx('levelup')
    return
  }
  if (state.waveQueue === 0 && state.balloons.length === 0 && state.wave < targetWaves(state)) {
    state.waveCooldown -= dt
    if (state.waveCooldown <= 0) launchWave(state)
  }
}

function drawPanelBackground(ctx: CanvasRenderingContext2D, from: string, to: string): void {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
}

function drawTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]): void {
  for (const text of texts) {
    ctx.globalAlpha = clamp(text.life, 0, 1)
    ctx.fillStyle = text.color
    ctx.font = '800 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, subtitle: string, footer = ''): void {
  ctx.fillStyle = 'rgba(5, 10, 14, 0.68)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#e2f8ff'
  ctx.font = '800 34px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 30)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '500 15px Inter, sans-serif'
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 14)
  if (footer) {
    ctx.fillStyle = '#c9ecff'
    ctx.font = '600 13px Inter, sans-serif'
    ctx.fillText(footer, WIDTH / 2, HEIGHT / 2 + 56)
  }
}

export interface TdLabels {
  readyTitle: string
  readySubtitle: string
  wonTitle: string
  lostTitle: string
  waveLabel: (wave: number) => string
  nextWaveHint: (seconds: number, bonus: number) => string
  replaySuffix: string
}

const TD_LABELS: TdLabels = {
  readyTitle: 'Balloon TD Arena',
  readySubtitle: 'Place RGB towers, pop waves, protect the desktop core.',
  wonTitle: 'Defense Perfect',
  lostTitle: 'Core Breached',
  waveLabel: (wave) => `Wave ${wave}/${MAX_WAVE}`,
  nextWaveHint: (seconds, bonus) => `Next wave in ${seconds}s  ·  early start +${bonus}`,
  replaySuffix: '— Press Start to play again',
}

export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, selectedTowerId: number | null, best: number, labels: TdLabels = TD_LABELS): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
  // R218(A3): U8 juice 屏震(与 legacy state.shake 并存,二者都已衰减驱动)
  if (state.juice) applyShake(ctx, state.juice)
  drawPanelBackground(ctx, '#071118', '#141025')
  ctx.strokeStyle = 'rgba(72, 187, 255, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x < WIDTH; x += 36) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke()
  }
  for (let y = 0; y < HEIGHT; y += 36) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke()
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  PATH.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y))
  ctx.strokeStyle = '#263746'; ctx.lineWidth = 54; ctx.stroke()
  ctx.strokeStyle = '#4b6576'; ctx.lineWidth = 38; ctx.stroke()
  ctx.setLineDash([16, 18])
  ctx.lineDashOffset = -state.clock * 30
  ctx.strokeStyle = 'rgba(148, 221, 255, 0.3)'; ctx.lineWidth = 2; ctx.stroke()
  ctx.setLineDash([])
  ctx.lineDashOffset = 0

  const pulse = 1 + Math.sin(state.clock * 4) * 0.14
  ctx.beginPath(); ctx.arc(880, 328, 20 * pulse, 0, Math.PI * 2); ctx.fillStyle = 'rgba(103, 232, 249, 0.1)'; ctx.fill(); ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.stroke()
  ctx.beginPath(); ctx.arc(880, 328, 6, 0, Math.PI * 2); ctx.fillStyle = '#67e8f9'; ctx.fill()

  for (const tower of state.towers) {
    const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
    if (tower.id === selectedTowerId && tower.range > 0) {
      ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2); ctx.fillStyle = `${def.color}0d`; ctx.fill(); ctx.strokeStyle = `${def.color}99`; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.setLineDash([])
    }
    if (tower.kind !== 'mint') {
      ctx.save()
      ctx.translate(tower.x, tower.y)
      ctx.rotate(tower.angle)
      ctx.fillStyle = '#1c2b36'
      ctx.fillRect(2, -5, tower.kind === 'rail' ? 40 : 30, 10)
      ctx.fillStyle = def.color
      ctx.fillRect(tower.kind === 'rail' ? 34 : 24, -4, 8, 8)
      ctx.restore()
    }
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 17, 0, Math.PI * 2); ctx.fillStyle = '#0f1720'; ctx.fill(); ctx.strokeStyle = '#31485a'; ctx.lineWidth = 5; ctx.stroke()
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 12, 0, Math.PI * 2); ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.stroke()
    if (tower.kind === 'mint') {
      const pulse = 1 + Math.sin(state.clock * 5) * 0.18
      ctx.beginPath(); ctx.arc(tower.x, tower.y, 7 * pulse, 0, Math.PI * 2); ctx.fillStyle = def.color; ctx.fill()
      ctx.fillStyle = '#0f1720'
      ctx.font = '700 10px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('◎', tower.x, tower.y + 0.5)
    } else {
      ctx.beginPath(); ctx.arc(tower.x, tower.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = def.color; ctx.fill()
    }
    for (let i = 0; i < tower.level; i++) {
      ctx.fillStyle = def.color
      ctx.fillRect(tower.x - 10 + i * 8, tower.y + 22, 5, 5)
    }
  }

  for (const projectile of state.projectiles) {
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = projectile.color
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(projectile.lx, projectile.ly); ctx.lineTo(projectile.x, projectile.y); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.splash ? 5 : 4, 0, Math.PI * 2); ctx.fillStyle = projectile.color; ctx.shadowColor = projectile.color; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0
  }

  for (const balloon of state.balloons) {
    const base = pointAtProgress(balloon.progress)
    const bob = Math.sin(state.clock * 3 + balloon.id) * 1.6
    const pos = { x: base.x, y: base.y + bob }
    const radius = 13 + Math.min(8, balloon.maxHp * 1.2)
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y, radius * 0.82, radius, 0, 0, Math.PI * 2); ctx.fillStyle = balloon.slowUntil > 0 ? '#bfdbfe' : balloon.color; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y + radius); ctx.lineTo(pos.x - 5, pos.y + radius + 9); ctx.lineTo(pos.x + 5, pos.y + radius + 9); ctx.closePath(); ctx.fillStyle = balloon.slowUntil > 0 ? '#93c5fd' : balloon.color; ctx.fill()
    if (balloon.hp < balloon.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'; ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32, 4)
      ctx.fillStyle = '#86efac'; ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32 * (balloon.hp / balloon.maxHp), 4)
    }
    // R218(A2): 词缀视觉——regen 绿色脉冲环 / armored 灰甲描边
    if (state.affix === 'regen') {
      const pr = radius + 5 + Math.sin(state.clock * 4 + balloon.id) * 2
      ctx.beginPath(); ctx.arc(pos.x, pos.y, pr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)'; ctx.lineWidth = 2; ctx.stroke()
    }
    if (state.affix === 'armored') {
      ctx.beginPath(); ctx.ellipse(pos.x, pos.y, radius * 0.82 + 4, radius + 4, 0, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.85)'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.stroke()
      ctx.setLineDash([])
    }
  }

  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  drawTexts(ctx, state.texts)
  if (state.banner) {
    ctx.globalAlpha = clamp(state.banner.life / 0.5, 0, 1)
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '800 44px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(state.banner.text, WIDTH / 2, 116)
    ctx.globalAlpha = 1
  }
  if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0 && state.wave < targetWaves(state)) {
    const bonus = Math.max(0, Math.round(state.waveCooldown * 4))
    ctx.fillStyle = '#9fb7c1'
    ctx.font = '600 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels.nextWaveHint(Math.ceil(Math.max(0, state.waveCooldown)), bonus), WIDTH / 2, 58)
  }
  ctx.restore()
  // ── R218(A3): U1/U5 HUD——半透明胶囊顶栏 + 基地生命条(顶部居中 260)──
  // 贴画布边缘、不随屏震抖动;旧 DOM 顶栏由 shell 分支(U9)收敛后以此为准。
  {
    const toasts = state.toasts ?? []
    const juice = state.juice ?? emptyJuice()
    const maxLives = state.maxLives || TD_DIFFICULTY_PARAMS[state.difficulty ?? 'standard'].lives
    const hpRatio = clamp(state.lives / maxLives, 0, 1)
    // 金币(左上)
    drawHudCapsule(ctx, 12, 8, 150, 22)
    ctx.fillStyle = '#fde047'
    ctx.font = '700 12px Inter, sans-serif'
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillText(`◎ ${state.coins}`, 26, 20)
    // 波次(右上;无尽显示 ∞)
    drawHudCapsule(ctx, WIDTH - 162, 8, 150, 22)
    ctx.fillStyle = '#c9ecff'
    ctx.textAlign = 'right'
    ctx.fillText(state.endless ? `WAVE ${state.wave} · ∞` : `WAVE ${state.wave}/${targetWaves(state)}`, WIDTH - 26, 20)
    // 基地生命条(顶部居中,宽 260;U5 连续条替代数字)
    drawHealthBar(ctx, WIDTH / 2 - 130, 8, 260, 14, hpRatio, state.clock)
    ctx.fillStyle = 'rgba(226, 248, 255, 0.92)'
    ctx.font = '700 10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`❤ ${Math.max(0, state.lives)}/${maxLives}`, WIDTH / 2, 16)
    // 低生命(≤25%)警示 vignette(U1)
    if (state.phase === 'running' && hpRatio <= 0.25) {
      drawAlertVignette(ctx, WIDTH, HEIGHT, 0.3 + 0.5 * (1 - hpRatio), state.clock)
    }
    drawToasts(ctx, WIDTH, HEIGHT, toasts)
    drawFloats(ctx, juice)
  }
  if (state.phase !== 'running') {
    const title = state.phase === 'won' ? labels.wonTitle : state.phase === 'lost' ? labels.lostTitle : labels.readyTitle
    const subtitle = state.phase === 'ready' ? labels.readySubtitle : labels.waveLabel(state.wave)
    const footer = state.phase === 'ready' ? (best > 0 ? `Best ★${best}` : '') : `Score ★${state.score} · Best ★${best} ${labels.replaySuffix}`
    drawOverlay(ctx, title, subtitle, footer)
  }
}

// ── FR-G01(R198): 策略教练 —— 纯函数,key 制文案(渲染层 t('games.coach.<key>'))──
import type { CoachHint } from './coach'
import { HIT_STOP, hitStopTick } from './juice'

export function tdHints(state: GameState): CoachHint[] {
  const hints: CoachHint[] = []
  if (state.phase !== 'running') return hints
  if (state.towers.length === 0) hints.push({ key: 'td.noTower', tone: 'warn', priority: 90 })
  if (state.lives <= 8) hints.push({ key: 'td.livesLow', tone: 'warn', priority: 80 })
  if (state.coins >= 220 && state.towers.length < 6) hints.push({ key: 'td.coinsIdle', tone: 'tip', priority: 50 })
  if (state.balloons.length === 0 && state.waveCooldown > 3) hints.push({ key: 'td.earlyStart', tone: 'tip', priority: 40 })
  if (state.wave >= MAX_WAVE - 2) hints.push({ key: 'td.finalWaves', tone: 'warn', priority: 60 })
  if (state.towers.some((t) => t.level < TOWER_MAX_LEVEL && state.coins >= towerUpgradeCost(t))) {
    hints.push({ key: 'td.upgradeReady', tone: 'tip', priority: 55 })
  }
  return hints
}

// ── R209 三期(FR-LN05 前置): 客端插值渲染 —— 气球 progress 线性外推 ──
// 纯函数:LAN guest 收 15Hz 快照后,绘制帧按 now-snapAt 对 balloons 的
// progress 做恒速外推(TD 气球恒速天然可外推;塔/弹等复杂实体不做)。
// 不改输入(快照副本供逐帧重算,避免外推量叠加);progress 钳在 1 之下
// (是否逃逸/扣命由房主权威快照裁决,客端不制造越界事件)。
/**
 * Extrapolate balloon positions for the guest renderer.
 * @param state snapshot source — only balloons/affix are read, never mutated
 * @param dt seconds since the snapshot arrived (caller clamps to ~0.3s)
 * @returns a fresh balloons array with advanced progress (input untouched)
 */
export function extrapolateBalloons(state: Pick<GameState, 'balloons' | 'affix'>, dt: number): Balloon[] {
  if (dt <= 0) return state.balloons.map((balloon) => ({ ...balloon }))
  const affixSpeed = state.affix !== null ? AFFIX_PARAMS[state.affix].speed : 1
  return state.balloons.map((balloon) => ({
    ...balloon,
    progress: Math.min(0.9999, balloon.progress + balloon.speed * (balloon.slowUntil > 0 ? 0.56 : 1) * dt * affixSpeed),
    slowUntil: Math.max(0, balloon.slowUntil - dt),
  }))
}
