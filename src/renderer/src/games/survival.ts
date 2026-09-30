// R99.3: "Nova Swarm" — Goobies-style survival arena. Player auto-fires at the
// nearest enemy, kills drop XP orbs, level-ups freeze the run for a pick-one-of-
// three upgrade card, and an adaptive director tightens or eases the spawn pace
// based on how well the run is going.
import { playSfx } from './sfx'
import { WIDTH, HEIGHT } from './td'
import { SCENE_IDS, drawScene, type SceneId } from './scene'
import {
  DIFFICULTY_SCORE_MULT,
  drawAlertVignette,
  drawHealthBar,
  drawHudCapsule,
  emptyJuice,
  floatText,
  applyShake,
  drawFloats,
  tickJuice,
  hitStop as queueHitStop,
  shake as queueShake,
  type GameDifficulty,
  type JuiceState,
} from './hud'
import {
  UPGRADES,
  characterById,
  pickOffers as pickWeightedOffers,
  scoreMultiplier,
  type ArtifactId,
  type CharacterId,
  type PermMap,
  type RouletteResult,
  type RouletteStat,
  type UpgradeDef,
  type UpgradeId,
} from './swarmMeta'

export { UPGRADES }
export type { UpgradeDef, UpgradeId }

export type SurvivalPhase = 'ready' | 'running' | 'levelup' | 'roulette' | 'lost'

export const BOSS_INTERVAL = 90

/** R219.7③: 动态背景总开关——用户指令「先停止动态背景的功能」(移动时卡顿观感)。
 *  false = 视差 offset 不传(parallaxShift 恒 0)、场景时间 t 冻结为按岛定值
 *  (星空漂移/闪烁/舱段全静止)、legacy 星空同冻结、bgOffset 平滑停走。
 *  恢复路径:翻回 true 并同步改「bgOffset 恒 0」测试锁。 */
export const DYNAMIC_BG_ENABLED = false

/** R219.7①: 视口逻辑尺寸(可变纵横比)。默认 900×520;fs/focus 全铺满时由
 *  view 层按「高度基准 uniform scale」反推——vp.h 恒 ≈520,vp.w 随屏幕比例
 *  拉宽(如 16:9 ≈ 924)。引擎内一切「视口尺寸」语义(摄像机/生成环/预警
 *  箭点/HUD 锚点/暗罩/vignette)一律读 state.vp,不再读 WIDTH/HEIGHT 常量。 */
export interface ViewportSize {
  w: number
  h: number
}

// ── R218 U4/E: 难度四档 eHP 参数(spec §二 Survival) ──────────────────────────
// 休闲 10HP×0.65 / 标准 7×1.0 / 困难 5×1.35 / 炼狱 3×1.6(敌伤系数);
// 敌速沿用既有 enemySpeedMult 体系乘法微调 1/1/1.08/1.15;
// scoreMult 与共享 hud.DIFFICULTY_SCORE_MULT 同表(挂街机档案)。
export interface SurvivalDifficultyParams {
  /** 该档玩家 maxHp 基数(角色 hpMod/永久成长仍叠加)。 */
  hp: number
  /** 敌方单次接触/弹幕伤害系数(乘 1 后取整 ≥1)。 */
  enemyDmgMult: number
  /** 敌移速乘法系数(叠加 artifact swift 的 enemySpeedMult)。 */
  enemySpeedMult: number
  /** 分数倍率(= DIFFICULTY_SCORE_MULT)。 */
  scoreMult: number
}

export const SURVIVAL_DIFFICULTY_PARAMS: Record<GameDifficulty, SurvivalDifficultyParams> = {
  casual: { hp: 10, enemyDmgMult: 0.65, enemySpeedMult: 1, scoreMult: DIFFICULTY_SCORE_MULT.casual },
  standard: { hp: 7, enemyDmgMult: 1, enemySpeedMult: 1, scoreMult: DIFFICULTY_SCORE_MULT.standard },
  hard: { hp: 5, enemyDmgMult: 1.35, enemySpeedMult: 1.08, scoreMult: DIFFICULTY_SCORE_MULT.hard },
  insane: { hp: 3, enemyDmgMult: 1.6, enemySpeedMult: 1.15, scoreMult: DIFFICULTY_SCORE_MULT.insane },
}

/** 读当前难度参数(旧状态缺 difficulty 字段时退 standard)。 */
export function survivalDifficultyParams(state: SurvivalState): SurvivalDifficultyParams {
  return SURVIVAL_DIFFICULTY_PARAMS[state.difficulty ?? 'standard']
}

/** 敌方单次伤害(接触/弹幕同口径):×难度系数取整且 ≥1(休闲/标准/困难=1,炼狱=2)。 */
export function enemyContactDamage(state: SurvivalState): number {
  return Math.max(1, Math.round(survivalDifficultyParams(state).enemyDmgMult))
}

/** ready 态改档:按两档基数差重算全员 maxHp(玻璃 artifact maxHp=1 时跳过),
 *  hp 随正向差值补满、负向钳到上限。运行中调用只影响后续伤害系数。 */
export function setSurvivalDifficulty(state: SurvivalState, difficulty: GameDifficulty): void {
  if (state.difficulty === difficulty) return
  const delta = SURVIVAL_DIFFICULTY_PARAMS[difficulty].hp - SURVIVAL_DIFFICULTY_PARAMS[state.difficulty ?? 'standard'].hp
  state.difficulty = difficulty
  for (const pl of state.players) {
    if (pl.maxHp <= 1) continue // 玻璃局:恒 1 HP
    pl.maxHp = Math.max(1, pl.maxHp + delta)
    pl.hp = clamp(pl.hp + Math.max(0, delta), 0, pl.maxHp)
  }
}

// ── R218 D: 敌人 8 种行为正交矩阵(spec §二 Survival;VS 设计法) ──────────────
// 每种一个「迫使决策」行为:
//   chaser  = 贴身压迫(基线)     sprinter = 走位考验(快而脆)
//   brute   = 火力考验(厚)       tank    = 堡垒(极慢极厚,高击退抗,逼绕行)
//   swarm   = 虫群(一次 8-12 小体,逼范围清场)
//   shooter = 炮手(220-300 风筝带,2.2s 敌弹,逼追击/掩体决策)
//   splitter= 分裂体(死亡裂变 2 小体,逼集火顺序)
//   healer  = 医疗者(6s 脉冲群疗半径 90,逼优先击杀)
// boss 保留(四型弹幕循环)。
export type SpawnableKind = Exclude<Enemy['kind'], 'boss'>
export const SPAWNABLE_KINDS: readonly SpawnableKind[] = ['chaser', 'sprinter', 'swarm', 'brute', 'tank', 'shooter', 'splitter', 'healer']

/** 解锁波次(spec 表 tank4/swarm3/shooter5/splitter6/healer7;基准 15s/波,
 *  chaser 0/sprinter 40/brute 90 沿用既有节奏)。 */
export const ENEMY_UNLOCK_SECONDS: Record<SpawnableKind, number> = {
  chaser: 0,
  sprinter: 40,
  swarm: 45,
  tank: 60,
  shooter: 75,
  splitter: 90,
  brute: 90,
  healer: 105,
}

/** 威胁值标称统计(标准档/中期;dps 为等效接触输出,healer 计入群疗支援价值)。 */
export interface EnemyNominalStats {
  hp: number
  dps: number
  speed: number
}

export const ENEMY_NOMINAL_STATS: Record<SpawnableKind, EnemyNominalStats> = {
  chaser: { hp: 8, dps: 1.1, speed: 80 },
  sprinter: { hp: 4, dps: 1.6, speed: 132 },
  brute: { hp: 14, dps: 1.8, speed: 40 },
  tank: { hp: 48, dps: 2.2, speed: 22 },
  swarm: { hp: 1, dps: 0.8, speed: 95 },
  shooter: { hp: 6, dps: 1.5, speed: 70 },
  splitter: { hp: 10, dps: 1.2, speed: 60 },
  healer: { hp: 8, dps: 2.5, speed: 55 },
}

/** 威胁值 = hp × dps / speed(归一化基准;越大越危险)。 */
export function threatOf(kind: SpawnableKind): number {
  const s = ENEMY_NOMINAL_STATS[kind]
  return (s.hp * s.dps) / s.speed
}

export const SWARM_PACK_MIN = 8
export const SWARM_PACK_MAX = 12

/** R218 U6/B: 宽容判定——命中/受击判定半径 = 视觉 size × 0.8(判定 ≤ 视觉 80%,
 *  商业宽容判定惯例;视觉绘制尺寸不变,只收窄碰撞)。 */
export function hitRadiusOf(size: number): number {
  return size * 0.8
}
/** 权重计算用的标称虫群规模(一次 spawn 事件的总威胁 = 个体 × 规模)。 */
const SWARM_PACK_NOMINAL = (SWARM_PACK_MIN + SWARM_PACK_MAX) / 2

/** 事件威胁(shake 一词不妥——是「一次 spawn 事件的总威胁」):swarm 按整包计。 */
function eventThreat(kind: SpawnableKind): number {
  return threatOf(kind) * (kind === 'swarm' ? SWARM_PACK_NOMINAL : 1)
}

/** 投放权重 = 归一化逆威胁(高威胁种类更稀有;威胁预算守恒的等价形式)。 */
export const ENEMY_SPAWN_WEIGHTS: Record<SpawnableKind, number> = (() => {
  const inv = {} as Record<SpawnableKind, number>
  let sum = 0
  for (const kind of SPAWNABLE_KINDS) {
    inv[kind] = 1 / eventThreat(kind)
    sum += inv[kind]
  }
  const weights = {} as Record<SpawnableKind, number>
  for (const kind of SPAWNABLE_KINDS) weights[kind] = inv[kind] / sum
  return weights
})()

/** 纯函数:按解锁池+权重从 roll ∈ [0,1) 选种(测试可注入确定性 roll)。 */
export function pickSpawnKindFrom(time: number, roll: number): SpawnableKind {
  const unlocked = SPAWNABLE_KINDS.filter((kind) => time >= ENEMY_UNLOCK_SECONDS[kind])
  const pool = unlocked.length > 0 ? unlocked : (['chaser'] as SpawnableKind[])
  const total = pool.reduce((sum, kind) => sum + ENEMY_SPAWN_WEIGHTS[kind], 0)
  let r = clamp(roll, 0, 0.999999) * total
  for (const kind of pool) {
    r -= ENEMY_SPAWN_WEIGHTS[kind]
    if (r < 0) return kind
  }
  return pool[pool.length - 1]
}

/** shooter/healer 风筝带 [近界, 远界](px,对最近存活玩家)。 */
export const SHOOTER_BAND: readonly [number, number] = [220, 300]
export const HEALER_BAND: readonly [number, number] = [140, 220]

// ── R218 U10: 质心 → 归一化视差偏移(纯函数链) ────────────────────────────────
export interface BgOffset {
  x: number
  y: number
}

/** 存活玩家质心(全倒下 → null)。
 *  R219 注:U11 大世界后引擎内偏移改由摄像机位置派生,本函数及 centroidToOffset
 *  保留导出仅供单测/外部工具复核质心语义,引擎不再调用。 */
export function playersCentroid(players: Array<{ x: number; y: number; hp: number }>): { x: number; y: number } | null {
  let sx = 0
  let sy = 0
  let n = 0
  for (const pl of players) {
    if (pl.hp <= 0) continue
    sx += pl.x
    sy += pl.y
    n += 1
  }
  if (n === 0) return null
  return { x: sx / n, y: sy / n }
}

/** 质心 → 归一化视差偏移(以区域半宽/半高归一,钳制 ±1;null → 0)。 */
export function centroidToOffset(centroid: { x: number; y: number } | null, w: number, h: number): BgOffset {
  if (centroid === null) return { x: 0, y: 0 }
  return {
    x: clamp((centroid.x - w / 2) / (w / 2), -1, 1),
    y: clamp((centroid.y - h / 2) / (h / 2), -1, 1),
  }
}

/** 指数平滑(默认 alpha=0.1;每帧向目标收敛 10%)。 */
export function smoothOffsetTo(cur: BgOffset, target: BgOffset, alpha = 0.1): BgOffset {
  return { x: cur.x + (target.x - cur.x) * alpha, y: cur.y + (target.y - cur.y) * alpha }
}

// ── R218 U11: 大世界 + 摄像机跟随(纯函数;世界 2× 视口) ──────────────────────
export const WORLD_W = 1800
export const WORLD_H = 1040
/** zoom-to-fit 的凸包边距(单侧 80px,双侧 160)。 */
export const CAMERA_MARGIN = 80
export const CAMERA_ZOOM_MIN = 0.7
export const CAMERA_ZOOM_MAX = 1.0
/** 死区:视口短边的 20%(质心在死区内摄像机不动)。 */
export const CAMERA_DEADZONE = 0.2
/** 位置/缩放的指数平滑系数(0.08-0.12 取 0.1,按 60fps 归一)。 */
export const CAMERA_SMOOTHING = 0.1

export interface CameraState {
  /** 视口中心的世界坐标。 */
  x: number
  y: number
  /** 缩放(1P=1;2-4P zoom-to-fit,钳 0.7-1.0)。 */
  zoom: number
}

/** 存活玩家轴对齐包围盒(凸包的外接盒;无人存活 → null)。 */
export interface PlayerBox {
  x: number
  y: number
  w: number
  h: number
}

export function playersBBox(players: Array<{ x: number; y: number; hp: number }>): PlayerBox | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const pl of players) {
    if (pl.hp <= 0) continue
    minX = Math.min(minX, pl.x)
    minY = Math.min(minY, pl.y)
    maxX = Math.max(maxX, pl.x)
    maxY = Math.max(maxY, pl.y)
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** zoom-to-fit:zoom = clamp(min(vw/(w+边距×2), vh/(h+边距×2)), 0.7, 1.0);
 *  单人 bbox 为点 → 被 1.0 上限钳住(1P 恒 1)。 */
export function cameraZoomFor(bbox: PlayerBox | null, vw: number, vh: number): number {
  if (bbox === null) return 1
  const zx = vw / (bbox.w + CAMERA_MARGIN * 2)
  const zy = vh / (bbox.h + CAMERA_MARGIN * 2)
  return clamp(Math.min(zx, zy), CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX)
}

/** 摄像机步进:目标=存活玩家凸包(包围盒)中心;死区内不动;0.1 指数平滑
 *  (dt 按 60fps 归一);最后钳制到世界边界(视口不出世界)。 */
export function updateCamera(cam: CameraState, bbox: PlayerBox | null, vw: number, vh: number, dt: number): void {
  if (bbox === null) return
  const alpha = Math.min(1, CAMERA_SMOOTHING * Math.max(1, dt * 60))
  const targetZoom = cameraZoomFor(bbox, vw, vh)
  cam.zoom += (targetZoom - cam.zoom) * alpha
  const deadX = (vw / cam.zoom) * CAMERA_DEADZONE * 0.5
  const deadY = (vh / cam.zoom) * CAMERA_DEADZONE * 0.5
  const dx = bbox.x + bbox.w / 2 - cam.x
  const dy = bbox.y + bbox.h / 2 - cam.y
  if (Math.abs(dx) > deadX) cam.x += dx * alpha
  if (Math.abs(dy) > deadY) cam.y += dy * alpha
  // 世界边界钳制(视口半宽/半高按 zoom 折算;世界小于视口时退到世界中心)
  const halfW = vw / 2 / cam.zoom
  const halfH = vh / 2 / cam.zoom
  cam.x = clamp(cam.x, Math.min(halfW, WORLD_W / 2), Math.max(WORLD_W - halfW, WORLD_W / 2))
  cam.y = clamp(cam.y, Math.min(halfH, WORLD_H / 2), Math.max(WORLD_H - halfH, WORLD_H / 2))
}

/** 世界坐标 → 视口坐标(摄像机变换的代数形式;HUD/外部叠加层绘制用)。 */
export function worldToViewport(cam: CameraState, vw: number, vh: number, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.x) * cam.zoom + vw / 2, y: (y - cam.y) * cam.zoom + vh / 2 }
}

/** 玩家出屏软约束:距摄像机中心超 (视口半宽-40)/zoom 时向心推力(120px/s)。 */
export function softPushForce(cam: CameraState, vw: number, vh: number, pl: { x: number; y: number }): { x: number; y: number } {
  const limitX = (vw / 2 - 40) / cam.zoom
  const limitY = (vh / 2 - 40) / cam.zoom
  const dx = cam.x - pl.x
  const dy = cam.y - pl.y
  const overX = Math.abs(dx) > limitX ? Math.abs(dx) - limitX : 0
  const overY = Math.abs(dy) > limitY ? Math.abs(dy) - limitY : 0
  if (overX === 0 && overY === 0) return { x: 0, y: 0 }
  const len = Math.max(1e-6, Math.hypot(dx, dy))
  return { x: (dx / len) * 120, y: (dy / len) * 120 }
}

/** 各敌种基础移速(不含难度/artifact 乘法)——tank 下界即 22。 */
export function enemyBaseSpeed(enemy: Enemy): number {
  switch (enemy.kind) {
    case 'sprinter': return 132
    case 'brute': return 40
    case 'boss': return 34
    case 'tank': return 22
    case 'swarm': return 95 * (enemy.jitter ?? 1)
    case 'splitter': return (enemy.gen ?? 0) > 0 ? 90 : 60
    case 'shooter': return 70
    case 'healer': return 55
    default: return 0 // chaser:随时间爬升,见 enemySpeedFor
  }
}

/** 敌移速 = 基速 ×(artifact swift × 难度敌速);chaser 随时间 64→112 爬升。 */
export function enemySpeedFor(state: SurvivalState, enemy: Enemy): number {
  const mult = state.enemySpeedMult * survivalDifficultyParams(state).enemySpeedMult
  if (enemy.kind === 'chaser') return Math.min(112, 64 + state.time * 0.12) * mult
  return enemyBaseSpeed(enemy) * mult
}

interface Point {
  x: number
  y: number
}

interface Enemy extends Point {
  id: number
  vx: number
  vy: number
  size: number
  hp: number
  maxHp: number
  kind: 'chaser' | 'sprinter' | 'brute' | 'boss' | 'tank' | 'swarm' | 'shooter' | 'splitter' | 'healer'
  elite: boolean
  hitFlash: number
  /** R218 D: splitter 世代(0=可裂变母体;1=裂变小体,不再分裂)。 */
  gen?: number
  /** R218 D: shooter 开火计时(2.2s 一发;elite 1.5s)。 */
  fireTimer?: number
  /** R218 D: shooter 切向游走方向(±1)。 */
  strafeDir?: number
  /** R218 D: healer 脉冲治疗计时(6s;elite 4s)。 */
  healTimer?: number
  /** R218 D: healer 治疗脉冲视觉剩余秒数(扩散光环环)。 */
  healPulse?: number
  /** R218 D: swarm 个体速度散布系数(0.75-1.25)。 */
  jitter?: number
}

interface Bullet extends Point {
  id: number
  vx: number
  vy: number
  damage: number
  pierce: number
  crit: boolean
  life: number
}

/** R202(FR-SW02): boss 弹幕子弹(敌向)。 */
interface EnemyBullet extends Point {
  vx: number
  vy: number
  size: number
  life: number
}

interface Orb extends Point {
  id: number
  value: number
}

interface Particle extends Point {
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface FloatText extends Point {
  id: number
  text: string
  life: number
  color: string
}

interface Banner {
  text: string
  life: number
}

/** R218 U10: 击杀涟漪轻量环(击杀点扩散圆环,particles 之外的克制一层)。 */
interface Ripple {
  x: number
  y: number
  life: number
  maxLife: number
}

export interface PlayerState {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hp: number
  maxHp: number
  invuln: number
  fireTimer: number
  angle: number
  /** R218 U5: 受击闪白剩余秒数(>0 时船体画纯白)。 */
  hitFlash: number
}

export interface PlayerStats {
  fireRate: number
  damage: number
  multishot: number
  pierce: number
  blade: number
  moveSpeed: number
  magnet: number
  crit: number
  bulletSpeed: number
  thorns: number
  regenInterval: number
}

export interface SurvivalState {
  phase: SurvivalPhase
  clock: number
  time: number
  /** FR-G08 sprint short-run: time cap in seconds (undefined = endless).
   *  View writes it before start; the engine only reads it. */
  sprintSeconds?: number
  score: number
  kills: number
  level: number
  xp: number
  xpNext: number
  xpMult: number
  nextId: number
  player: PlayerState
  stats: PlayerStats
  taken: Record<UpgradeId, number>
  bonuses: Partial<Record<RouletteStat, number>>
  character: CharacterId
  /** R218 U4/E: 难度四档(view 在 start 前写入;默认 standard)。
   *  挂 SURVIVAL_DIFFICULTY_PARAMS:maxHp 基数/敌伤/敌速/分数倍率。 */
  difficulty: GameDifficulty
  perm: PermMap
  offers: UpgradeId[]
  pendingSpins: number
  combo: number
  comboTimer: number
  comboBest: number
  comboBonus: number
  enemies: Enemy[]
  bullets: Bullet[]
  /** R202(FR-SW02): boss 弹幕池。 */
  eBullets: EnemyBullet[]
  orbs: Orb[]
  particles: Particle[]
  texts: FloatText[]
  /** R218 U10: 击杀涟漪环池。 */
  ripples: Ripple[]
  /** R218 U10: 背景视差偏移(平滑后的归一化 ±1;R218 U11 起由摄像机位置派生)。 */
  bgOffset: BgOffset
  /** R218 U11: 摄像机(视口中心世界坐标 + 缩放;凸包质心跟随 + zoom-to-fit)。 */
  camera: CameraState
  /** R218 U8: juice(hud.ts 共享四件套:hit-stop/屏震衰减/伤害飘字)。 */
  juice: JuiceState
  banner: Banner | null
  island: number
  portal: Point | null
  keys: Set<string>
  axis: { x: number; y: number }
  /** R219.7①: 当前视口逻辑尺寸(view 层每帧按 canvas/scale 反推写入)。 */
  vp: ViewportSize
  /** R213 二期: 每玩家手柄摇杆轴(长度随 deployPlayers 人数,对齐 players)。
   *  axes[pi] 与 P1 legacy axis 同语义:>0.18 死区时模拟向量覆盖键池向量,
   *  幅度缩放移速;axes[0] 不驱动 P1(P1 移动仍读 axis,vision 叠加路径不变)。 */
  axes: Array<{ x: number; y: number }>
  scoreMult: number
  coinMult: number
  timeScale: number
  spawnMult: number
  enemySpeedMult: number
  invulnWindow: number
  magnetBonus: number
  bossKills: number
  spawnTimer: number
  bossTimer: number
  regenTimer: number
  bladeAngle: number
  bladeTimer: number
  lastMinute: number
  /** R200(FR-G06): 进化/boss 顿帧与出生预警。 */
  hitStop: number
  warnings: SpawnWarning[]
  /** R202(FR-SW01): 已触发的进化。 */
  evolved: string[]
  /** R202(FR-SW02): boss 弹幕计时(驱动三型循环)。 */
  bossBulletTimer: number
  /** R218 D: boss 弹幕型序号(0-3 显式轮转,放射/扇形/环形/双螺旋)。 */
  bossBulletPattern: number
  /** R208(FR-MP01): 二号位玩家(本地合作;null=单人局)。hp≤0 为倒下态。
   *  R213: players[1] 的别名引用(同一对象);视图仍直接读写该字段
   *  (合作开关关闭时直接置 null),tick/draw 入口 syncRoster 负责回写名册。 */
  player2: PlayerState | null
  /** P2 独立输入源(IJKL→p2up/p2down/p2left/p2right,防与 P1 keys 串键)。
   *  R213: inputs[1] 的别名引用(同一 Set 对象)。 */
  keys2: Set<string>
  /** 倒下玩家掉落的复活珠(target=被救者);由存活队友拾取触发复活。
   *  R213: target 扩为 1-4(玩家 1-based 序号,1|2 保持字面量联合更严)。 */
  reviveOrbs: Array<{ id: number; x: number; y: number; target: 1 | 2 | 3 | 4 }>
  /** 各玩家被复活次数(各限 1 次/局,宽恕设计)。legacy {p1,p2} 形状保留,
   *  由 spendRevive 与 revivesUsedN 双写维持一致。 */
  revivesUsed: { p1: number; p2: number }
  /** R213: 玩家名册(长度 1-4,players[0] 即 P1,与 player 字段同对象引用)。
   *  引擎内权威数组:移动/开火/索敌/判负遍历它;legacy 字段(player/keys/
   *  player2/keys2)是它的别名视图,现有单人/双人路径零改动。 */
  players: PlayerState[]
  /** R213: 每玩家独立键池(inputs[0] 即 keys 同引用;P2+ 键名规范
   *  pNup/pNdown/pNleft/pNright,与现有 p2* 一致风格)。 */
  inputs: Array<Set<string>>
  /** R213: 复活计数(按玩家 0-based 索引,长度 4)。新逻辑读本数组,
   *  缺失时视为全 0(旧状态形状兼容)。 */
  revivesUsedN: number[]
  /** R213-⑤: 场景背景(view 层写入;undefined=原岛屿主题星空)。 */
  scene?: SceneId
}

// ── R213: P2..P4 皮肤(琥珀/粉/青;P1 沿用青白 #e2f8ff/#67e8f9 不变) ──
const ROSTER_ACCENT = ['#fbbf24', '#f472b6', '#4ade80']
const ROSTER_HULL = ['#fff7e2', '#ffe4f1', '#e4ffee']

export function xpToNext(level: number): number {
  return 5 + level * 3
}

function baseStats(): PlayerStats {
  return {
    fireRate: 2,
    damage: 1,
    multishot: 1,
    pierce: 0,
    blade: 0,
    moveSpeed: 170,
    magnet: 56,
    crit: 0,
    bulletSpeed: 420,
    thorns: 0,
    regenInterval: 0,
  }
}

export function recomputeStats(
  stats: PlayerStats,
  taken: Record<UpgradeId, number>,
  ctx?: { character?: CharacterId; perm?: PermMap; bonuses?: Partial<Record<RouletteStat, number>>; magnetBonus?: number },
): void {
  const character = characterById(ctx?.character ?? 'wisp')
  const perm = ctx?.perm
  const bonuses = ctx?.bonuses
  stats.fireRate = 2 * (1 + 0.22 * taken.fireRate) * (1 + 0.15 * (perm?.fireRate ?? 0)) * (1 + (bonuses?.fireRate ?? 0)) * character.fireRateMod
  stats.damage = (1 + taken.damage) * (1 + 0.1 * (perm?.damage ?? 0)) * (1 + (bonuses?.damage ?? 0))
  stats.multishot = 1 + taken.multishot
  stats.pierce = taken.pierce
  stats.blade = taken.blade + character.innateBlade
  stats.moveSpeed = 170 * (1 + 0.12 * taken.speed) * (1 + 0.1 * (perm?.moveSpeed ?? 0)) * (1 + (bonuses?.moveSpeed ?? 0)) * character.speedMod
  stats.magnet = (56 + 45 * taken.magnet + (ctx?.magnetBonus ?? 0)) * (1 + (bonuses?.magnet ?? 0))
  stats.crit = 0.1 * taken.crit + (bonuses?.crit ?? 0)
  stats.bulletSpeed = 420 * (1 + 0.3 * taken.bulletSpeed)
  stats.thorns = taken.thorns + character.innateThorns
  stats.regenInterval = taken.regen === 0 ? 0 : taken.regen === 1 ? 24 : 12
}

export function initialSurvivalState(
  character: CharacterId = 'wisp',
  perm: PermMap = { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 },
  artifacts: ArtifactId[] = [],
  difficulty: GameDifficulty = 'standard',
): SurvivalState {
  const def = characterById(character)
  const has = (id: ArtifactId) => artifacts.includes(id)
  // R218 E: maxHp 基数走难度表(休闲 10/标准 7/困难 5/炼狱 3);
  // 角色 hpMod 与永久成长 maxHp 仍按原式叠加。
  let maxHp = Math.max(1, SURVIVAL_DIFFICULTY_PARAMS[difficulty].hp + def.hpMod + perm.maxHp)
  if (has('glass')) maxHp = 1
  // R213: 先构造 player/keys 再装配 state——players[0]/inputs[0] 与
  // player/keys 字段从出生起就是同一对象引用(别名不变量由构造保证)。
  const player: PlayerState = { x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0, size: 11, hp: maxHp, maxHp, invuln: 0, fireTimer: 0, angle: -Math.PI / 2, hitFlash: 0 }
  const keys = new Set<string>()
  const state: SurvivalState = {
    phase: 'ready',
    clock: 0,
    time: 0,
    score: 0,
    kills: 0,
    level: 1,
    xp: 0,
    xpNext: xpToNext(1),
    xpMult: def.xpMod * (1 + 0.1 * perm.xpGain) * (has('famine') ? 0.75 : 1),
    nextId: 1,
    player,
    stats: baseStats(),
    taken: { fireRate: 0, damage: 0, multishot: 0, pierce: 0, blade: 0, speed: 0, maxHp: 0, magnet: 0, crit: 0, bulletSpeed: 0, thorns: 0, regen: 0 },
    bonuses: {},
    character,
    difficulty,
    perm: { ...perm },
    offers: [],
    pendingSpins: 0,
    combo: 0,
    comboTimer: 0,
    comboBest: 0,
    comboBonus: 0,
    enemies: [],
    bullets: [],
    orbs: [],
    particles: [],
    texts: [],
    ripples: [],
    bgOffset: { x: 0, y: 0 },
    camera: { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 },
    juice: emptyJuice(),
    banner: null,
    island: 1,
    portal: null,
    keys,
    players: [player],
    inputs: [keys],
    axis: { x: 0, y: 0 },
    vp: { w: WIDTH, h: HEIGHT },
    axes: [{ x: 0, y: 0 }],
    scoreMult: 1 + scoreMultiplier(artifacts),
    coinMult: has('bounty') ? 2 : 1,
    timeScale: has('chrono') ? 1.25 : 1,
    spawnMult: has('mutantis') ? 1.6 : 1,
    enemySpeedMult: has('swift') ? 1.35 : 1,
    invulnWindow: has('pain') ? 0.5 : 0.9,
    magnetBonus: has('magnetWell') ? 60 : 0,
    bossKills: 0,
    spawnTimer: 1,
    bossTimer: BOSS_INTERVAL,
    regenTimer: 0,
    bladeAngle: 0,
    bladeTimer: 0,
    lastMinute: 0,
    hitStop: 0,
    warnings: [],
    evolved: [],
    bossBulletTimer: 0,
    bossBulletPattern: 0,
    eBullets: [],
    player2: null,
    keys2: new Set<string>(),
    reviveOrbs: [],
    revivesUsed: { p1: 0, p2: 0 },
    revivesUsedN: [0, 0, 0, 0],
  }
  recomputeStats(state.stats, state.taken, { character: state.character, perm: state.perm, bonuses: state.bonuses, magnetBonus: state.magnetBonus })
  return state
}

/** R213: 多人位部署偏移(围绕中心分侧;P1 居中、P2 左下、P3 右下、P4 上方)。
 *  P2 偏移与 R208 deployPlayer2 逐字节一致(位置/hp 继承/2s 无敌)。 */
const DEPLOY_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },
  { dx: -60, dy: 40 },
  { dx: 60, dy: 40 },
  { dx: 0, dy: -70 },
]

/** R213: 名册同步——players/inputs 是引擎权威名册,但 legacy 字段
 *  (player2/keys2)仍被视图直接读写(合作开关关闭时直接置 player2 = null)。
 *  每次 tick/draw 入口调用:把 legacy 字段的突变镜像回数组,维持
 *  player===players[0] / player2===players[1] / keys2===inputs[1] 的别名
 *  不变量;player2 被置 null 视为退回单人局(名册截断到 1)。
 *  R213 二期: axes 长度一并对齐 players(手柄轴槽随人数伸缩)。 */
function syncRoster(state: SurvivalState): void {
  if (state.player2 === null) {
    if (state.players.length > 1) state.players.length = 1
    if (state.inputs.length > 1) state.inputs.length = 1
  } else {
    if (state.players[1] !== state.player2) state.players.splice(1, state.players.length - 1, state.player2)
    if (state.inputs[1] !== state.keys2) state.inputs.splice(1, state.inputs.length - 1, state.keys2)
  }
  if (state.axes.length > state.players.length) state.axes.length = state.players.length
  while (state.axes.length < state.players.length) state.axes.push({ x: 0, y: 0 })
}

/** R213: 部署 1-4 人位。count≥2 时 players[1] 即现 player2 逻辑位置
 *  (legacy player2/keys2 字段同步指向同一对象);count≥3/4 追加 P3/P4,
 *  键池用 inputs[2]/inputs[3](键名 p3up/p4up... 与 p2* 一致风格)。
 *  已在位的实体保留(重复调用幂等,仅补齐缺失位);count=1 退回单人。
 *  共享 build(升级/轮盘对全员同时生效),仅实体与输入独立。 */
export function deployPlayers(state: SurvivalState, count: 1 | 2 | 3 | 4): void {
  syncRoster(state)
  for (let i = state.players.length; i < count; i++) {
    const off = DEPLOY_OFFSETS[i]
    state.players.push({
      x: WORLD_W / 2 + off.dx, y: WORLD_H / 2 + off.dy, vx: 0, vy: 0, size: 11,
      hp: state.player.maxHp, maxHp: state.player.maxHp, invuln: 2,
      fireTimer: 0, angle: -Math.PI / 2, hitFlash: 0,
    })
    state.inputs.push(new Set<string>())
  }
  if (state.players.length > count) state.players.length = count
  if (state.inputs.length > count) state.inputs.length = count
  if (state.axes.length > count) state.axes.length = count
  while (state.axes.length < count) state.axes.push({ x: 0, y: 0 })
  if (count < 2) state.player2 = null
  else {
    state.player2 = state.players[1]
    state.keys2 = state.inputs[1]
  }
  syncRoster(state)
}

/** R208(FR-MP01): 部署二号位——R213 起为 deployPlayers(state, 2) 的别名
 *  (独立 HP/无敌帧/开火计时,位置与 P1 分侧),兼容既有调用点。 */
export function deployPlayer2(state: SurvivalState): void {
  deployPlayers(state, 2)
}

function key(state: SurvivalState, value: string): boolean {
  return state.keys.has(value)
}

// ── R208(FR-MP01)→R213: 存活玩家集合/最近存活者(敌人索敌与磁吸以存活者为准) ──
function alivePlayers(state: SurvivalState): PlayerState[] {
  return state.players.filter((pl) => pl.hp > 0)
}

function nearestAlive(state: SurvivalState, p: { x: number; y: number }): PlayerState | null {
  let best: PlayerState | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const pl of alivePlayers(state)) {
    const dist = distance(pl, p)
    if (dist < bestDist) {
      best = pl
      bestDist = dist
    }
  }
  return best
}

/** R213: 玩家在名册中的 1-based 序号(P1=1..P4=4);不在名册时退化为 P1。 */
function playerIndexOf(state: SurvivalState, pl: PlayerState): 1 | 2 | 3 | 4 {
  const idx = state.players.indexOf(pl)
  const oneBased = (idx === -1 ? 0 : idx) + 1
  return oneBased === 1 || oneBased === 2 || oneBased === 3 ? oneBased : 4
}

/** R213: 复活剩余额度(读 revivesUsedN,缺失视为全 0——旧状态形状兼容)。 */
function reviveQuotaLeft(state: SurvivalState, idx: number): boolean {
  return (state.revivesUsedN?.[idx] ?? 0) < 1
}

/** R213: 消耗复活次数——revivesUsedN 按玩家索引计数,legacy {p1,p2} 双写
 *  (仅 P1/P2 有对应键,P3/P4 只记数组)。 */
function spendRevive(state: SurvivalState, idx: number): void {
  state.revivesUsedN[idx] = (state.revivesUsedN?.[idx] ?? 0) + 1
  if (idx === 0) state.revivesUsed.p1 += 1
  else if (idx === 1) state.revivesUsed.p2 += 1
}

/** 玩家倒下:爆散+掉复活珠(该玩家本局未被复活过时);全员倒下由调用方判负。 */
function playerDown(state: SurvivalState, which: 1 | 2 | 3 | 4): void {
  const p = state.players[which - 1]
  if (p === undefined || p.hp > 0) return
  spawnBurst(state, p.x, p.y, '#f87171', 22, 210)
  addText(state, p.x, p.y - 30, `P${which} DOWN`, '#f87171')
  if (reviveQuotaLeft(state, which - 1)) {
    state.reviveOrbs.push({ id: state.nextId++, x: clamp(p.x, 30, WORLD_W - 30), y: clamp(p.y, 30, WORLD_H - 30), target: which })
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function addText(state: SurvivalState, x: number, y: number, text: string, color: string): void {
  state.texts.push({ id: state.nextId++, x, y, text, color, life: 0.9 })
}

function spawnBurst(state: SurvivalState, x: number, y: number, color: string, count = 10, power = 130): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.35 + Math.random() * 0.65)
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 30, life: 0.5 + Math.random() * 0.35, maxLife: 0.85, size: 2 + Math.random() * 3, color })
  }
}

export function startSurvival(state: SurvivalState): void {
  if (state.phase !== 'ready') return
  state.phase = 'running'
  state.banner = { text: 'SURVIVE', life: 1.5 }
  playSfx('wave')
}

export function restartSurvival(): SurvivalState {
  return initialSurvivalState()
}

/** Adaptive director: spawn interval tightens over time and with player level;
 * eases off when the player is one hit from death, tightens when untouched. */
export function directorSpawnInterval(state: SurvivalState): number {
  const minutes = state.time / 60
  const base = clamp(1.5 - minutes * 0.28 - state.level * 0.05, 0.32, 1.5)
  // R219.1: 低血/满血因子按存活玩家集合判定(单人局与旧语义逐值一致;
  // 多人局不再只看 P1——P1 倒下但队友满血时应收紧而非放松)。
  const alive = alivePlayers(state)
  const factor = alive.length === 0
    ? 1
    : alive.some((pl) => pl.hp <= 1) ? 1.25 : alive.every((pl) => pl.hp >= pl.maxHp) ? 0.85 : 1
  const grace = state.time < 15 ? 2 : 1
  return (base * factor * grace) / (state.spawnMult * (1 + 0.15 * (state.island - 1)))
}

export function advanceIsland(state: SurvivalState): void {
  if (!state.portal) return
  for (const enemy of state.enemies) {
    spawnBurst(state, enemy.x, enemy.y, '#9fb7c1', 6, 110)
  }
  state.enemies = []
  state.bullets = []
  state.orbs = []
  state.island += 1
  state.portal = null
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1)
  state.comboBonus += 150 * state.island
  state.banner = { text: `ISLAND ${state.island}`, life: 1.8 }
  queueShake(state.juice, 5)
  spawnBurst(state, state.player.x, state.player.y, '#67e8f9', 24, 190)
  playSfx('wave')
}

function pickOffers(state: SurvivalState): UpgradeId[] {
  return pickWeightedOffers(state.taken, 3, 0.12 * state.perm.luck)
}

export function applyUpgrade(state: SurvivalState, id: UpgradeId): void {
  const def = UPGRADES.find((upgrade) => upgrade.id === id)
  if (!def || state.taken[id] >= def.max) return
  state.taken[id] += 1
  if (id === 'maxHp') {
    state.player.maxHp += 1
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2)
  }
  recomputeStats(state.stats, state.taken, { character: state.character, perm: state.perm, bonuses: state.bonuses, magnetBonus: state.magnetBonus })
  state.offers = []
  state.phase = 'running'
  spawnBurst(state, state.player.x, state.player.y, def.accent, 18, 150)
  addText(state, state.player.x, state.player.y - 30, `+${id}`, def.accent)
}

export function openRoulette(state: SurvivalState): void {
  if (state.phase !== 'running' || state.pendingSpins <= 0) return
  state.phase = 'roulette'
}

export function applyRouletteResult(state: SurvivalState, result: RouletteResult): void {
  if (state.phase !== 'roulette') return
  state.pendingSpins = Math.max(0, state.pendingSpins - 1)
  if (result.kind === 'item') {
    const def = UPGRADES.find((upgrade) => upgrade.id === result.upgradeId)
    const before = state.taken[result.upgradeId]
    state.taken[result.upgradeId] = Math.min(def?.max ?? 1, before + result.levels)
    if (result.upgradeId === 'maxHp') {
      const gained = state.taken[result.upgradeId] - before
      state.player.maxHp += gained
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + gained * 2)
    }
    spawnBurst(state, state.player.x, state.player.y, def?.accent ?? '#fde68a', 22, 180)
    addText(state, state.player.x, state.player.y - 34, `+${result.upgradeId} x${result.levels}`, def?.accent ?? '#fde68a')
  } else {
    state.bonuses[result.stat] = (state.bonuses[result.stat] ?? 0) + result.pct / 100
    spawnBurst(state, state.player.x, state.player.y, '#fde68a', 22, 180)
    addText(state, state.player.x, state.player.y - 34, `${result.stat} +${result.pct}%`, '#fde68a')
  }
  recomputeStats(state.stats, state.taken, { character: state.character, perm: state.perm, bonuses: state.bonuses, magnetBonus: state.magnetBonus })
  playSfx('levelup')
  state.phase = 'running'
}

export function dissolveRoulette(state: SurvivalState, result: RouletteResult): void {
  if (state.phase !== 'roulette') return
  state.pendingSpins = Math.max(0, state.pendingSpins - 1)
  state.xp += result.xpValue
  spawnBurst(state, state.player.x, state.player.y, '#4ade80', 16, 140)
  addText(state, state.player.x, state.player.y - 34, `+${result.xpValue} XP`, '#4ade80')
  playSfx('xp')
  state.phase = 'running'
}

/** R218 U11: 摄像机视口外环生成点(世界坐标;再钳回世界 ±60 边界)。
 *  R219.7①: 视口尺寸读 state.vp(可变纵横比)。 */
function spawnRingPoint(state: SurvivalState, ring: number): { x: number; y: number; side: number } {
  const vw = state.vp.w / state.camera.zoom
  const vh = state.vp.h / state.camera.zoom
  const side = Math.floor(Math.random() * 4)
  let x: number
  let y: number
  if (side === 0) {
    x = state.camera.x + (Math.random() - 0.5) * vw
    y = state.camera.y - vh / 2 - ring
  } else if (side === 1) {
    x = state.camera.x + vw / 2 + ring
    y = state.camera.y + (Math.random() - 0.5) * vh
  } else if (side === 2) {
    x = state.camera.x + (Math.random() - 0.5) * vw
    y = state.camera.y + vh / 2 + ring
  } else {
    x = state.camera.x - vw / 2 - ring
    y = state.camera.y + (Math.random() - 0.5) * vh
  }
  return { x: clamp(x, -60, WORLD_W + 60), y: clamp(y, -60, WORLD_H + 60), side }
}

function spawnEnemy(state: SurvivalState): void {
  // R218 U11: 大世界——敌人在摄像机视口外环生成(warning 边沿即相对视口方位);
  // R200: 出生预警——下一次入场的敌人先在对应边缘亮 0.5s 红箭头(登记在生成前)。
  const spot = spawnRingPoint(state, 30 + Math.random() * 50)
  state.warnings.push({ edge: spot.side as 0 | 1 | 2 | 3, t: SPAWN_WARN_SECONDS })
  const elite = state.time > 60 && Math.random() < 0.08
  // R218 D: 种类按「威胁值加权」投放(已解锁池内归一化逆威胁权重)
  spawnEnemyKind(state, pickSpawnKindFrom(state.time, Math.random()), spot.x, spot.y, elite)
}

/** R218 D: 按种类生成敌人(可导出供测试/脚本直接投放)。swarm 一次生成整包。 */
export function spawnEnemyKind(state: SurvivalState, kind: SpawnableKind, x: number, y: number, elite = false): void {
  const islandMult = 1 + 0.25 * (state.island - 1)
  const scale = (elite ? 2.5 : 1) * islandMult
  if (kind === 'swarm') {
    const pack = SWARM_PACK_MIN + Math.floor(Math.random() * (SWARM_PACK_MAX - SWARM_PACK_MIN + 1))
    const hp = Math.max(1, Math.round(1 * scale))
    for (let i = 0; i < pack; i++) {
      state.enemies.push({
        id: state.nextId++, x: x + (Math.random() - 0.5) * 48, y: y + (Math.random() - 0.5) * 48, vx: 0, vy: 0,
        size: 6, hp, maxHp: hp, kind: 'swarm', elite, hitFlash: 0,
        jitter: 0.75 + Math.random() * 0.5,
      })
    }
    return
  }
  const hpFor = (): number => {
    if (kind === 'tank') return Math.round((10 + Math.floor(state.time / 15)) * 6 * scale)
    if (kind === 'brute') return Math.round((10 + Math.floor(state.time / 15)) * scale)
    if (kind === 'sprinter') return Math.round(2 * scale)
    if (kind === 'shooter') return Math.round(6 * scale)
    if (kind === 'splitter') return Math.round(9 * scale)
    if (kind === 'healer') return Math.round(8 * scale)
    return Math.round((3 + Math.floor(state.time / 25)) * scale)
  }
  const sizeFor = (): number => {
    // R218 B: 尺寸重校(玩家/敌全线缩 20-25%;实体直径 ≤ 画布短边 4%)
    if (kind === 'tank') return 22
    if (kind === 'brute') return 15
    if (kind === 'splitter' || kind === 'healer') return 12
    if (kind === 'sprinter') return 9
    if (kind === 'shooter') return 11
    if (kind === 'chaser') return 11
    return 6
  }
  const hp = hpFor()
  const enemy: Enemy = { id: state.nextId++, x, y, vx: 0, vy: 0, size: sizeFor(), hp, maxHp: hp, kind, elite, hitFlash: 0 }
  if (kind === 'shooter') {
    enemy.fireTimer = 1.5
    enemy.strafeDir = Math.random() < 0.5 ? -1 : 1
  }
  if (kind === 'healer') enemy.healTimer = 3
  if (kind === 'splitter') enemy.gen = 0
  state.enemies.push(enemy)
}

/** R218 D: 风筝带移动——远于上界接近/近于下界后撤/带内切向游走(死区)。 */
function kiteMove(state: SurvivalState, enemy: Enemy, target: Point, dt: number, band: readonly [number, number]): void {
  const dx = target.x - enemy.x
  const dy = target.y - enemy.y
  const dist = Math.max(1, Math.hypot(dx, dy))
  const nx = dx / dist
  const ny = dy / dist
  const speed = enemySpeedFor(state, enemy)
  if (dist > band[1]) {
    enemy.x += nx * speed * dt
    enemy.y += ny * speed * dt
  } else if (dist < band[0]) {
    enemy.x -= nx * speed * dt
    enemy.y -= ny * speed * dt
  } else {
    const dir = enemy.strafeDir ?? 1
    enemy.x += -ny * dir * speed * 0.6 * dt
    enemy.y += nx * dir * speed * 0.6 * dt
  }
}

/** R218 D: shooter 开火——2.2s 一发瞄准弹(elite 1.5s,乘法提速)。 */
function shooterFire(state: SurvivalState, enemy: Enemy, target: Point, dt: number): void {
  enemy.fireTimer = (enemy.fireTimer ?? 1.5) - dt
  if (enemy.fireTimer > 0) return
  enemy.fireTimer = enemy.elite ? 1.5 : 2.2
  const a = Math.atan2(target.y - enemy.y, target.x - enemy.x)
  state.eBullets.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, size: 5, life: 4 })
}

/** R218 D: healer 脉冲——6s 一拍,半径 90 内友军 +30% maxHp(elite 4s)。 */
function healerPulse(state: SurvivalState, enemy: Enemy, dt: number): void {
  enemy.healTimer = (enemy.healTimer ?? 3) - dt
  if (enemy.healTimer > 0) return
  enemy.healTimer = enemy.elite ? 4 : 6
  enemy.healPulse = 0.6
  let healed = 0
  for (const ally of state.enemies) {
    if (ally === enemy || ally.hp <= 0 || ally.hp >= ally.maxHp) continue
    if (distance(ally, enemy) <= 90) {
      ally.hp = Math.min(ally.maxHp, ally.hp + Math.max(1, Math.round(ally.maxHp * 0.3)))
      healed += 1
    }
  }
  if (healed > 0) spawnBurst(state, enemy.x, enemy.y, '#4ade80', 6, 70)
}

/** R202(FR-SW02)+R218 D: boss 弹幕——放射(12 向)/瞄准扇形(5 发)/环形(16 发)/
 *  双螺旋(两臂旋进,新形态)四型循环(bossBulletPattern 显式计数轮转)。 */
function bossBarrage(state: SurvivalState, boss: Enemy): void {
  const pattern = state.bossBulletPattern % 4
  if (pattern === 0) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, size: 5, life: 4 })
    }
  } else if (pattern === 1) {
    // R219.1: 扇形瞄准最近存活玩家(原恒瞄 P1——多人局 P1 倒下后弹幕仍打向尸体)
    const tgt = nearestAlive(state, boss) ?? state.player
    const base = Math.atan2(tgt.y - boss.y, tgt.x - boss.x)
    for (let i = -2; i <= 2; i += 1) {
      const a = base + i * 0.18
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, size: 6, life: 4 })
    }
  } else if (pattern === 2) {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 + 0.2
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, size: 4, life: 5 })
    }
  } else {
    // R218 D: 双螺旋——两臂相位差 π,基角随 clock 旋进(跨齐射旋转)
    const base = state.clock * 2.6
    for (let arm = 0; arm < 2; arm += 1) {
      for (let i = 0; i < 6; i += 1) {
        const a = base + arm * Math.PI + (i / 6) * Math.PI
        state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, size: 4, life: 5 })
      }
    }
  }
}

function spawnBoss(state: SurvivalState): void {
  const hp = 60 + Math.floor(state.time / 10) * 6
  // R218 U11: boss 同样在摄像机视口外环登场(50-100px)
  const spot = spawnRingPoint(state, 50 + Math.random() * 50)
  const x = spot.x
  const y = spot.y
  state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 28, hp, maxHp: hp, kind: 'boss', elite: false, hitFlash: 0 })
  state.banner = { text: 'BOSS INBOUND', life: 1.6 }
  playSfx('wave')
}

/** E2E seam (R109): lets the verification script place a boss on demand so the
 *  roulette/portal chain can be driven live without a 90s survival run. */
export function debugSpawnBoss(state: SurvivalState): void {
  if (state.phase !== 'running') return
  spawnBoss(state)
}

function killEnemy(state: SurvivalState, enemy: Enemy): void {
  state.kills += 1
  // R218 U10: 击杀涟漪(大敌环更大更久)
  const rippleLife = enemy.kind === 'boss' || enemy.kind === 'tank' ? 0.6 : 0.4
  state.ripples.push({ x: enemy.x, y: enemy.y, life: rippleLife, maxLife: rippleLife })
  // R218 U8: 击杀大敌顿帧——tank/splitter 母体 0.03s(boss 沿用 R200 重档 0.06)
  if (enemy.kind === 'tank' || (enemy.kind === 'splitter' && (enemy.gen ?? 0) === 0)) {
    queueHitStop(state.juice, 0.03)
  }
  state.combo = state.comboTimer > 0 ? state.combo + 1 : 1
  state.comboTimer = 2.5
  state.comboBest = Math.max(state.comboBest, state.combo)
  state.comboBonus += Math.min(state.combo, 25)
  if (enemy.kind === 'boss') {
    spawnBurst(state, enemy.x, enemy.y, '#f472b6', 34, 260)
    spawnBurst(state, enemy.x, enemy.y, '#fde68a', 20, 180)
    for (let i = 0; i < 15; i++) {
      state.orbs.push({ id: state.nextId++, x: enemy.x + (Math.random() - 0.5) * 110, y: enemy.y + (Math.random() - 0.5) * 110, value: 1 })
    }
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1)
    state.pendingSpins += 1
    state.hitStop = HIT_STOP.heavy
    state.bossKills += 1
    state.portal = { x: clamp(enemy.x, 60, WORLD_W - 60), y: clamp(enemy.y, 60, WORLD_H - 60) }
    state.banner = { text: 'BOSS DOWN — ROULETTE +1', life: 1.8 }
    queueShake(state.juice, 6)
    playSfx('levelup')
    return
  }
  const color = enemy.kind === 'brute' ? '#f472b6' : enemy.kind === 'sprinter' ? '#fbbf24' : '#fb7185'
  // R218 D: splitter 裂变——母体死亡裂出 2 个 size 7 小体(gen 1,不再分裂)
  if (enemy.kind === 'splitter' && (enemy.gen ?? 0) === 0) {
    for (let i = 0; i < 2; i++) {
      const childHp = Math.max(1, Math.round(enemy.maxHp * 0.25))
      state.enemies.push({
        id: state.nextId++, x: enemy.x + (i === 0 ? -9 : 9), y: enemy.y + (i === 0 ? -6 : 6), vx: 0, vy: 0,
        size: 7, hp: childHp, maxHp: childHp, kind: 'splitter', elite: false, hitFlash: 0, gen: 1,
      })
    }
    spawnBurst(state, enemy.x, enemy.y, '#fb923c', 8, 120)
  }
  spawnBurst(state, enemy.x, enemy.y, color, enemy.kind === 'brute' ? 18 : 9, 140)
  const drops = enemy.elite || enemy.kind === 'brute' ? 3 : 1
  for (let i = 0; i < drops; i++) {
    state.orbs.push({ id: state.nextId++, x: enemy.x + (Math.random() - 0.5) * 18, y: enemy.y + (Math.random() - 0.5) * 18, value: 1 })
  }
}

export function tickSurvival(state: SurvivalState, dt: number): void {
  // R213: 名册同步(legacy player2/keys2 字段可能被视图直改,先镜像回 players/inputs)
  syncRoster(state)
  // R218 U8: juice 顿帧——hitStop>0 时本帧 dt=0(计时/敌人/掉落全静止,渲染继续);
  // juice 自身(shake 衰减/飘字)按真实 dt 步进。
  // R200: hit-stop(进化/boss 击杀);预警条目独立于冻结推进
  // (R219.1: 移到 juice 冻结 early-return 之前——冻结期间预警照常倒计时)
  state.warnings = tickWarnings(state.warnings, dt)
  const juiceFrozen = state.juice.hitStop > 0
  tickJuice(state.juice, dt)
  if (juiceFrozen) return
  // R202(FR-SW02): boss 弹幕三型循环(放射/瞄准扇形/环形,每 1.2s)
  state.bossBulletTimer += dt
  for (const enemy of state.enemies) {
    if (enemy.kind === 'boss' && state.bossBulletTimer >= 1.2) {
      bossBarrage(state, enemy)
      state.bossBulletPattern = (state.bossBulletPattern + 1) % 4
    }
  }
  if (state.bossBulletTimer >= 1.2) state.bossBulletTimer = 0
  // 弹幕运动/寿命/命中
  for (const eb of state.eBullets) {
    eb.x += eb.vx * dt
    eb.y += eb.vy * dt
    eb.life -= dt
  }
  state.eBullets = state.eBullets.filter((eb) => eb.life > 0 && eb.x > -40 && eb.x < WORLD_W + 40 && eb.y > -40 && eb.y < WORLD_H + 40)
  for (const eb of state.eBullets) {
    // R208: 弹幕对任一存活玩家结算(独立无敌帧)
    for (const pl of alivePlayers(state)) {
      if (pl.invuln <= 0 && Math.hypot(eb.x - pl.x, eb.y - pl.y) < hitRadiusOf(pl.size) + eb.size) {
        const dmg = enemyContactDamage(state)
        pl.hp -= dmg
        pl.invuln = state.invulnWindow
        pl.hitFlash = 0.15
        queueShake(state.juice, 4)
        floatText(state.juice, pl.x, pl.y - 26, `-${dmg}`, '#f87171')
        eb.life = 0
        playSfx('hurt')
        if (pl.hp <= 0) {
          playerDown(state, playerIndexOf(state, pl))
          if (alivePlayers(state).length === 0) {
            state.phase = 'lost'
            playSfx('gameover')
            return
          }
        }
        break
      }
    }
  }
  state.eBullets = state.eBullets.filter((eb) => eb.life > 0)
  if (state.hitStop > 0) {
    const [remain, thaw] = hitStopTick(state.hitStop, dt)
    state.hitStop = remain
    if (thaw === 0) return
    dt = thaw
  }
  dt *= state.timeScale
  state.clock += dt
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
  // R218 U10: 涟漪寿命衰减
  for (const rp of state.ripples) rp.life -= dt
  state.ripples = state.ripples.filter((rp) => rp.life > 0)
  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 200 * dt
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
  if (state.banner) {
    state.banner.life -= dt
    if (state.banner.life <= 0) state.banner = null
  }
  if (state.phase !== 'running') return

  state.time += dt
  state.comboTimer = Math.max(0, state.comboTimer - dt)
  if (state.comboTimer === 0 && state.combo > 0) state.combo = 0
  state.score = Math.floor((state.kills * 10 + state.comboBonus + Math.floor(state.time)) * state.scoreMult * survivalDifficultyParams(state).scoreMult)
  // FR-G08 sprint: a time-capped run settles through the existing end path —
  // 'lost' reads as "time up", and the score earned so far stays on the board.
  if (state.sprintSeconds !== undefined && state.time >= state.sprintSeconds) {
    state.phase = 'lost'
    return
  }
  const player = state.player
  const stats = state.stats
  player.invuln = Math.max(0, player.invuln - dt)
  player.hitFlash = Math.max(0, player.hitFlash - dt)

  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  let moveX = dx
  let moveY = dy
  const axisLen = Math.hypot(state.axis.x, state.axis.y)
  if (axisLen > 0.18) {
    moveX = state.axis.x
    moveY = state.axis.y
  }
  const moveLen = Math.hypot(moveX, moveY)
  const moveScale = Math.min(1, moveLen)
  if (moveLen > 0.0001) {
    player.x = clamp(player.x + (moveX / moveLen) * moveScale * stats.moveSpeed * dt, 16, WORLD_W - 16)
    player.y = clamp(player.y + (moveY / moveLen) * moveScale * stats.moveSpeed * dt, 16, WORLD_H - 16)
    player.angle = Math.atan2(moveY, moveX)
    if (Math.random() < dt * 40) state.particles.push({ x: player.x - Math.cos(player.angle) * 14, y: player.y - Math.sin(player.angle) * 14, vx: -Math.cos(player.angle) * 60, vy: -Math.sin(player.angle) * 60, life: 0.3, maxLife: 0.3, size: 2.5, color: '#67e8f9' })
  }

  state.spawnTimer -= dt
  if (state.spawnTimer <= 0) {
    spawnEnemy(state)
    if (state.time > 60 && Math.random() < 0.35) spawnEnemy(state)
    state.spawnTimer = directorSpawnInterval(state)
  }
  // R208: 传送门任一存活玩家踩中即换岛
  if (state.portal && alivePlayers(state).some((pl) => distance(pl, state.portal as { x: number; y: number }) < 30)) advanceIsland(state)
  state.bossTimer -= dt
  if (state.bossTimer <= 0) {
    spawnBoss(state)
    state.bossTimer = BOSS_INTERVAL
  }
  if (stats.regenInterval > 0 && player.hp < player.maxHp) {
    state.regenTimer += dt
    if (state.regenTimer >= stats.regenInterval) {
      state.regenTimer = 0
      player.hp += 1
      addText(state, player.x, player.y - 34, '+HP', '#34d399')
      spawnBurst(state, player.x, player.y, '#34d399', 8, 90)
    }
  }

  player.fireTimer -= dt
  if (player.fireTimer <= 0 && state.enemies.length > 0) {
    let nearest: Enemy | undefined
    let bestDist = Number.POSITIVE_INFINITY
    for (const enemy of state.enemies) {
      const dist = distance(player, enemy)
      if (dist < bestDist) {
        nearest = enemy
        bestDist = dist
      }
    }
    if (nearest) {
      const baseAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x)
      const shots = stats.multishot
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * (Math.PI / 14)
        const angle = baseAngle + spread
        const crit = Math.random() < stats.crit
        state.bullets.push({ id: state.nextId++, x: player.x, y: player.y, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, damage: crit ? stats.damage * 2 : stats.damage, pierce: stats.pierce, crit, life: 1.2 })
      }
      playSfx('shoot')
    }
    player.fireTimer = 1 / stats.fireRate
  }

  // ── R208(FR-MP01)→R213: 玩家 2..n——独立键池(pNup/pNdown/pNleft/pNright)
  // 移动/无敌帧/自动索敌开火。共享弹池与 stats(build 对全员同时生效);
  // P2+ 开火不叠 sfx(音频预算);P2 键池即 legacy keys2(syncRoster 保证同引用)。
  for (let pi = 1; pi < state.players.length; pi++) {
    const pl = state.players[pi]
    if (pl.hp <= 0) continue
    pl.invuln = Math.max(0, pl.invuln - dt)
    pl.hitFlash = Math.max(0, pl.hitFlash - dt)
    const pool = state.inputs[pi]
    if (pool === undefined) continue
    const dpx = (pool.has(`p${pi + 1}right`) ? 1 : 0) - (pool.has(`p${pi + 1}left`) ? 1 : 0)
    const dpy = (pool.has(`p${pi + 1}down`) ? 1 : 0) - (pool.has(`p${pi + 1}up`) ? 1 : 0)
    let movePx = dpx
    let movePy = dpy
    // R213 二期: 手柄摇杆轴——与 P1 axis 同语义(死区 0.18,过阈值时模拟
    // 向量覆盖键池向量,幅度缩放移速)。
    const axP = state.axes[pi]
    if (axP !== undefined) {
      const axLen = Math.hypot(axP.x, axP.y)
      if (axLen > 0.18) {
        movePx = axP.x
        movePy = axP.y
      }
    }
    const lenP = Math.hypot(movePx, movePy)
    const scaleP = Math.min(1, lenP)
    if (lenP > 0.0001) {
      pl.x = clamp(pl.x + (movePx / lenP) * scaleP * stats.moveSpeed * dt, 16, WORLD_W - 16)
      pl.y = clamp(pl.y + (movePy / lenP) * scaleP * stats.moveSpeed * dt, 16, WORLD_H - 16)
      pl.angle = Math.atan2(movePy, movePx)
      if (Math.random() < dt * 40) state.particles.push({ x: pl.x - Math.cos(pl.angle) * 14, y: pl.y - Math.sin(pl.angle) * 14, vx: -Math.cos(pl.angle) * 60, vy: -Math.sin(pl.angle) * 60, life: 0.3, maxLife: 0.3, size: 2.5, color: ROSTER_ACCENT[pi - 1] })
    }
    pl.fireTimer -= dt
    if (pl.fireTimer <= 0 && state.enemies.length > 0) {
      let nearestP: Enemy | undefined
      let bestDistP = Number.POSITIVE_INFINITY
      for (const enemy of state.enemies) {
        const dist = distance(pl, enemy)
        if (dist < bestDistP) {
          nearestP = enemy
          bestDistP = dist
        }
      }
      if (nearestP) {
        const baseAngle = Math.atan2(nearestP.y - pl.y, nearestP.x - pl.x)
        const shots = stats.multishot
        for (let i = 0; i < shots; i++) {
          const spread = (i - (shots - 1) / 2) * (Math.PI / 14)
          const angle = baseAngle + spread
          const crit = Math.random() < stats.crit
          state.bullets.push({ id: state.nextId++, x: pl.x, y: pl.y, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, damage: crit ? stats.damage * 2 : stats.damage, pierce: stats.pierce, crit, life: 1.2 })
        }
      }
      pl.fireTimer = 1 / stats.fireRate
    }
  }

  // R218 U11: 摄像机——存活玩家凸包(包围盒)跟随(死区+平滑+世界钳制),
  // zoom-to-fit 2-4P;玩家出屏软约束(向心 120px/s);背景 offset 由摄像机派生
  // (与 U10 质心视差合一:摄像机即平滑后的质心)。
  // R219.7①: 视口读 vp;③ 动态背景停用时 bgOffset 不再随摄像机漂移(恒 0)。
  updateCamera(state.camera, playersBBox(state.players), state.vp.w, state.vp.h, dt)
  for (const pl of alivePlayers(state)) {
    const push = softPushForce(state.camera, state.vp.w, state.vp.h, pl)
    pl.x += push.x * dt
    pl.y += push.y * dt
  }
  if (DYNAMIC_BG_ENABLED) {
    state.bgOffset = smoothOffsetTo(state.bgOffset, {
      x: clamp((state.camera.x - WORLD_W / 2) / (WORLD_W / 2), -1, 1),
      y: clamp((state.camera.y - WORLD_H / 2) / (WORLD_H / 2), -1, 1),
    })
  }

  state.bladeAngle += dt * 2.8
  state.bladeTimer += dt
  if (stats.blade > 0 && state.bladeTimer >= 0.25) {
    state.bladeTimer = 0
    for (let i = 0; i < stats.blade; i++) {
      const angle = state.bladeAngle + (i * Math.PI * 2) / stats.blade
      const bx = player.x + Math.cos(angle) * 78
      const by = player.y + Math.sin(angle) * 78
      for (const enemy of state.enemies) {
        if (distance({ x: bx, y: by }, enemy) < 13 + hitRadiusOf(enemy.size)) {
          enemy.hp -= stats.damage
          enemy.hitFlash = 0.1
        }
      }
    }
  }

  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt
    bullet.y += bullet.vy * dt
    bullet.life -= dt
    for (const enemy of state.enemies) {
      if (bullet.pierce < 0 || bullet.life <= 0) break
      if (distance(bullet, enemy) < 4 + hitRadiusOf(enemy.size)) {
        enemy.hp -= bullet.damage
        enemy.hitFlash = 0.1
        // R218 D: tank 堡垒体——子弹击退系数 0.08(其余 0.5),阻挡感
        const knock = enemy.kind === 'tank' ? 0.08 : 0.5
        enemy.x += bullet.vx * dt * knock
        enemy.y += bullet.vy * dt * knock
        bullet.pierce -= 1
        spawnBurst(state, bullet.x, bullet.y, bullet.crit ? '#fbbf24' : '#67e8f9', 3, 60)
        playSfx('hit')
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && bullet.pierce >= 0 && bullet.x > -20 && bullet.x < WORLD_W + 20 && bullet.y > -20 && bullet.y < WORLD_H + 20)

  for (const enemy of state.enemies) {
    // R208(FR-MP01): 敌人追最近存活玩家(单人局退化原行为);
    // R218 D: shooter/healer 走风筝带移动(220-300/140-220,带内切向游走),
    // 其余直追。shooter 兼施放瞄准弹,healer 兼脉冲群疗。
    const target = nearestAlive(state, enemy) ?? player
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
    if ((enemy.healPulse ?? 0) > 0) enemy.healPulse = Math.max(0, (enemy.healPulse ?? 0) - dt)
    if (enemy.kind === 'shooter' || enemy.kind === 'healer') {
      kiteMove(state, enemy, target, dt, enemy.kind === 'shooter' ? SHOOTER_BAND : HEALER_BAND)
      if (enemy.kind === 'shooter') shooterFire(state, enemy, target, dt)
      else healerPulse(state, enemy, dt)
    } else {
      const dist = Math.max(1, distance(enemy, target))
      const speed = enemySpeedFor(state, enemy)
      enemy.x += ((target.x - enemy.x) / dist) * speed * dt
      enemy.y += ((target.y - enemy.y) / dist) * speed * dt
    }
    const dist = Math.max(1, distance(enemy, target))
    if (target.invuln <= 0 && distance(enemy, target) < hitRadiusOf(enemy.size) + hitRadiusOf(target.size)) {
      const dmg = enemyContactDamage(state)
      target.hp -= dmg
      target.invuln = state.invulnWindow
      target.hitFlash = 0.15
      queueShake(state.juice, enemy.kind === 'boss' ? 9 : 6)
      playSfx('hurt')
      floatText(state.juice, target.x, target.y - 26, `-${dmg}`, '#f87171')
      spawnBurst(state, target.x, target.y, '#f87171', 12, 150)
      // R218 D: tank 高击退抗——接触后撤仅 8px(其余 46px)
      const recoil = enemy.kind === 'tank' ? 8 : 46
      enemy.x -= ((target.x - enemy.x) / dist) * recoil
      enemy.y -= ((target.y - enemy.y) / dist) * recoil
      if (stats.thorns > 0) {
        enemy.hp -= stats.thorns
        enemy.hitFlash = 0.1
      }
      if (target.hp <= 0) {
        playerDown(state, playerIndexOf(state, target))
        if (alivePlayers(state).length === 0) {
          state.phase = 'lost'
          spawnBurst(state, target.x, target.y, '#f87171', 30, 230)
          playSfx('gameover')
          return
        }
      }
    }
  }
  for (let i = 0; i < state.enemies.length; i++) {
    for (let j = i + 1; j < state.enemies.length; j++) {
      const a = state.enemies[i]
      const b = state.enemies[j]
      const dist = distance(a, b)
      const min = a.size + b.size
      if (dist < min && dist > 0.01) {
        const push = ((min - dist) / 2) * 0.35
        const nx = (b.x - a.x) / dist
        const ny = (b.y - a.y) / dist
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) killEnemy(state, enemy)
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0)

  state.orbs = state.orbs.filter((orb) => {
    // R208: XP 珠被最近存活玩家磁吸/拾取(共享 XP 池)
    const holder = nearestAlive(state, orb) ?? player
    const dist = distance(orb, holder)
    if (dist < stats.magnet) {
      const speed = 260
      orb.x += ((holder.x - orb.x) / dist) * speed * dt
      orb.y += ((holder.y - orb.y) / dist) * speed * dt
    }
    if (dist < holder.size + 6) {
      state.xp += orb.value * state.xpMult
      playSfx('xp')
      return false
    }
    return true
  })

  // ── R208(FR-MP01)→R213: 复活珠——最近存活队友靠近磁吸,拾取复活倒下方
  // (各 1 次/局;target=玩家 1-based 序号,2P 退化原双人逻辑) ──
  state.reviveOrbs = state.reviveOrbs.filter((orb) => {
    const target = state.players[orb.target - 1]
    let rescuer: PlayerState | null = null
    let rescuerDist = Number.POSITIVE_INFINITY
    for (const pl of state.players) {
      if (pl === target || pl.hp <= 0) continue
      const d = distance(orb, pl)
      if (d < rescuerDist) {
        rescuer = pl
        rescuerDist = d
      }
    }
    if (target === undefined || rescuer === null) return true
    if (rescuerDist < stats.magnet) {
      const speed = 240
      orb.x += ((rescuer.x - orb.x) / rescuerDist) * speed * dt
      orb.y += ((rescuer.y - orb.y) / rescuerDist) * speed * dt
    }
    if (rescuerDist < rescuer.size + 8) {
      target.hp = Math.max(1, Math.ceil(target.maxHp / 2))
      target.invuln = 2
      target.x = clamp(rescuer.x + (Math.random() - 0.5) * 64, 16, WORLD_W - 16)
      target.y = clamp(rescuer.y + (Math.random() - 0.5) * 64, 16, WORLD_H - 16)
      spendRevive(state, orb.target - 1)
      addText(state, rescuer.x, rescuer.y - 34, `P${orb.target} REVIVED`, '#4ade80')
      spawnBurst(state, rescuer.x, rescuer.y, '#4ade80', 18, 160)
      playSfx('levelup')
      return false
    }
    return true
  })

  if (state.xp >= state.xpNext) {
    state.xp -= state.xpNext
    state.level += 1
    state.xpNext = xpToNext(state.level)
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1)
    addText(state, state.player.x, state.player.y - 44, '+HP', '#86efac')
    state.offers = pickOffers(state)
    if (state.offers.length > 0) {
      state.phase = 'levelup'
      state.banner = { text: `LEVEL ${state.level}`, life: 1.4 }
      playSfx('levelup')
    }
  }

  const minute = Math.floor(state.time / 60)
  if (minute > state.lastMinute) {
    state.lastMinute = minute
    state.banner = { text: `${minute} MIN SURVIVED`, life: 1.6 }
    playSfx('wave')
  }
}

// R219.7①: 星位存 0..1 分数——按 vp 尺寸解析(可变纵横比下不再只覆盖左 900px)
const STARS = Array.from({ length: 42 }, (_, i) => ({
  fx: Math.sin(i * 127.3) * 0.5 + 0.5,
  fy: Math.sin(i * 311.7) * 0.5 + 0.5,
  size: (Math.sin(i * 73.1) * 0.5 + 0.5) * 1.6 + 0.6,
  phase: (Math.sin(i * 45.7) * 0.5 + 0.5) * Math.PI * 2,
}))

// R106.3: five rotating island themes (background + star tint)
const ISLAND_THEMES = [
  { bg: '#050a12', star: '#9fb7c1' },
  { bg: '#0a0512', star: '#c7b7d1' },
  { bg: '#05120c', star: '#b7d1c3' },
  { bg: '#120a05', star: '#d1c3b7' },
  { bg: '#050f12', star: '#b7cdd1' },
]

function dimScene(ctx: CanvasRenderingContext2D, phase: SurvivalPhase, vw: number, vh: number): void {
  if (phase === 'ready' || phase === 'lost') {
    // R219.3: ready 态菜单已移出画布(下方独立面板),压暗只为场景预览分层,
    // 幅度 0.68→0.35;lost 结算覆盖层仍在画布中央,维持压暗。
    ctx.fillStyle = phase === 'ready' ? 'rgba(5, 10, 14, 0.35)' : 'rgba(5, 10, 14, 0.68)'
    ctx.fillRect(0, 0, vw, vh)
  } else if (phase === 'roulette') {
    ctx.fillStyle = 'rgba(5, 10, 14, 0.55)'
    ctx.fillRect(0, 0, vw, vh)
  }
}

/** R219.4(S3): 船体多层绘制——尾焰(动画抖动)/描边船身/翼刃高光/座舱双层。
 *  轮廓与旧 3 笔船完全一致(15/-10/-5 锚点),只叠层次不改判定尺寸。 */
function drawShipBody(
  ctx: CanvasRenderingContext2D,
  pl: { x: number; y: number; angle: number; invuln: number },
  hull: string,
  accent: string,
  clock: number,
  hitFlash: number,
): void {
  ctx.save()
  ctx.translate(pl.x, pl.y)
  ctx.rotate(pl.angle)
  // 尾焰:长度随 clock 高频抖动;无敌帧期间更亮(受击反馈)
  const flick = 0.7 + 0.3 * Math.sin(clock * 26)
  const flameLen = 12 + 7 * flick
  const flameAlpha = pl.invuln > 0 ? 0.7 : 0.45
  const flame = ctx.createLinearGradient(-8, 0, -8 - flameLen, 0)
  if (flame) {
    flame.addColorStop(0, `rgba(103, 232, 249, ${flameAlpha})`)
    flame.addColorStop(1, 'rgba(103, 232, 249, 0)')
    ctx.fillStyle = flame
  } else {
    ctx.fillStyle = `rgba(103, 232, 249, ${flameAlpha * 0.5})`
  }
  ctx.beginPath()
  ctx.moveTo(-8, -3.5)
  ctx.lineTo(-8 - flameLen, 0)
  ctx.lineTo(-8, 3.5)
  ctx.closePath()
  ctx.fill()
  // 船身:浅色 hull + accent 描边(受击闪白整体覆盖)
  ctx.fillStyle = hitFlash > 0 ? '#ffffff' : hull
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(15, 0)
  ctx.lineTo(-10, -10)
  ctx.lineTo(-5, 0)
  ctx.lineTo(-10, 10)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // 翼刃高光(上半翼细线,廉价立体感)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(12, -1)
  ctx.lineTo(-7, -8)
  ctx.stroke()
  // 座舱:accent 圆 + 内白高光点
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath(); ctx.arc(3, -1, 1.4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

export function drawSurvival(ctx: CanvasRenderingContext2D, state: SurvivalState): void {
  // R213: 名册同步(与 tickSurvival 同口径,视图直改 player2 后立即生效)
  syncRoster(state)
  drawSurvivalBody(ctx, state)
  // R200(FR-G06.2): 出生预警——边缘红色箭头(0.5s);R219.7①: 锚点读 vp
  for (const w of state.warnings) {
    const alpha = Math.min(1, w.t / 0.5)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#fb7185'
    ctx.font = '800 26px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = w.edge === 1 ? state.vp.w - 46 : w.edge === 3 ? 46 : state.vp.w / 2
    const cy = w.edge === 0 ? 46 : w.edge === 2 ? state.vp.h - 46 : state.vp.h / 2
    const glyph = w.edge === 0 ? '▲' : w.edge === 1 ? '▶' : w.edge === 2 ? '▼' : '◀'
    ctx.fillText(glyph, cx, cy)
    ctx.restore()
  }
}

function drawSurvivalBody(ctx: CanvasRenderingContext2D, state: SurvivalState): void {
  const player = state.player
  // R219.7①: 视口尺寸统一入口——引擎不再直读 900×520 常量。
  const vp = state.vp
  // R219.7③: 动态背景停用——场景时间冻结为按岛定值(星空/漂移/闪烁全静止),
  // 视差与玩家位移动输入恒定;恢复开关见 DYNAMIC_BG_ENABLED。
  const sceneT = DYNAMIC_BG_ENABLED ? state.clock : (state.island - 1) * 97.3
  const bgPx = DYNAMIC_BG_ENABLED ? player.x : vp.w / 2
  const bgPy = DYNAMIC_BG_ENABLED ? player.y : vp.h / 2
  ctx.clearRect(0, 0, vp.w, vp.h)
  ctx.save()
  // R219.1: 震屏单一路径——legacy state.shake 平移已删,统一走 juice.shake
  // (applyShake;受击/换岛/boss 击杀全部经 queueShake 入队)。
  applyShake(ctx, state.juice)
  // R213: 场景背景系统——state.scene 指定程序化场景(fusion=按岛屿轮换);
  // 未设置时保留原岛屿主题星空(单机默认走 view 层写入,引擎侧不预设)。
  // R218 U10: 传视差 offset(质心平滑派生)与 darken(boss 在场压暗)。
  if (state.scene !== undefined) {
    const id = state.scene === 'fusion' ? SCENE_IDS[(state.island - 1) % (SCENE_IDS.length - 1)] : state.scene
    drawScene(id, {
      ctx, w: vp.w, h: vp.h, t: sceneT, px: bgPx, py: bgPy,
      offset: DYNAMIC_BG_ENABLED ? state.bgOffset : undefined,
      darken: state.enemies.some((enemy) => enemy.kind === 'boss') ? 0.32 : 0,
    })
  } else {
  const theme = ISLAND_THEMES[(state.island - 1) % ISLAND_THEMES.length]
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, vp.w, vp.h)
  for (const star of STARS) {
    ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(sceneT * 2 + star.phase))
    ctx.fillStyle = theme.star
    ctx.fillRect(star.fx * vp.w - bgPx * 0.02, star.fy * vp.h - bgPy * 0.02, star.size, star.size)
  }
  }
  ctx.globalAlpha = 1

  // ── R218 U11: 世界层——摄像机变换(视口中心 → zoom → 负摄像机平移);
  //    世界实体(弹幕/门/珠/刀光/子弹/敌/粒子/涟漪/玩家/飘字)在此层绘制,
  //    restore 后再画 HUD(恒在视口坐标,不随摄像机动)。 ──
  ctx.save()
  ctx.translate(vp.w / 2, vp.h / 2)
  ctx.scale(state.camera.zoom, state.camera.zoom)
  ctx.translate(-state.camera.x, -state.camera.y)

  // R202: boss/shooter 弹幕绘制(世界坐标)
  for (const eb of state.eBullets) {
    ctx.save()
    ctx.fillStyle = '#fb7185'
    ctx.shadowColor = '#fb7185'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(eb.x, eb.y, eb.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (state.portal) {
    const p = state.portal
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(state.clock * 2.4)
    ctx.strokeStyle = '#67e8f9'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 1.2); ctx.stroke()
    ctx.rotate(Math.PI)
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 1.2); ctx.stroke()
    ctx.restore()
    const glow = 0.5 + 0.5 * Math.sin(state.clock * 5)
    ctx.fillStyle = `rgba(103, 232, 249, ${0.25 + glow * 0.35})`
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill()
  }

  for (const orb of state.orbs) {
    ctx.save()
    ctx.translate(orb.x, orb.y)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'
    ctx.shadowBlur = 8
    ctx.fillRect(-4, -4, 8, 8)
    ctx.restore()
    ctx.shadowBlur = 0
  }

  // R208(FR-MP01): 复活珠——脉动绿光十字,提示「拾取可救回队友」
  for (const orb of state.reviveOrbs) {
    const glow = 0.5 + 0.5 * Math.sin(state.clock * 4)
    ctx.save()
    ctx.translate(orb.x, orb.y)
    ctx.rotate(state.clock * 1.6)
    ctx.strokeStyle = `rgba(74, 222, 128, ${0.5 + glow * 0.4})`
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(0, 0, 9 + glow * 3, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'
    ctx.shadowBlur = 12
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.shadowBlur = 0
  }

  if (state.stats.blade > 0) {
    for (let i = 0; i < state.stats.blade; i++) {
      const angle = state.bladeAngle + (i * Math.PI * 2) / state.stats.blade
      const bx = player.x + Math.cos(angle) * 78
      const by = player.y + Math.sin(angle) * 78
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(player.x + Math.cos(angle - 0.5) * 78, player.y + Math.sin(angle - 0.5) * 78)
      ctx.lineTo(bx, by)
      ctx.stroke()
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fill()
    }
  }

  for (const bullet of state.bullets) {
    ctx.strokeStyle = bullet.crit ? 'rgba(251, 191, 36, 0.6)' : 'rgba(103, 232, 249, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(bullet.x - bullet.vx * 0.02, bullet.y - bullet.vy * 0.02)
    ctx.lineTo(bullet.x, bullet.y)
    ctx.stroke()
    ctx.fillStyle = bullet.crit ? '#fbbf24' : '#67e8f9'
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.crit ? 4 : 3, 0, Math.PI * 2); ctx.fill()
  }

  for (const enemy of state.enemies) {
    if (enemy.elite) {
      ctx.shadowColor = '#fde68a'
      ctx.shadowBlur = 14
    }
    const kindColor =
      enemy.kind === 'brute' ? '#f472b6'
        : enemy.kind === 'sprinter' ? '#fbbf24'
          : enemy.kind === 'tank' ? '#7c8da4'
            : enemy.kind === 'swarm' ? '#a3e635'
              : enemy.kind === 'shooter' ? '#c084fc'
                : enemy.kind === 'splitter' ? '#fb923c'
                  : enemy.kind === 'healer' ? '#34d399'
                    : '#fb7185'
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : kindColor
    if (enemy.kind === 'boss') {
      ctx.save()
      ctx.translate(enemy.x, enemy.y)
      ctx.rotate(state.clock * 0.8)
      ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#db2777'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        const px = Math.cos(angle) * enemy.size
        const py = Math.sin(angle) * enemy.size
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#f9a8d4'
      ctx.lineWidth = 3
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * enemy.size, Math.sin(angle) * enemy.size)
        ctx.lineTo(Math.cos(angle) * (enemy.size + 12), Math.sin(angle) * (enemy.size + 12))
        ctx.stroke()
      }
      ctx.restore()
    } else if (enemy.kind === 'sprinter') {
      // R208: 朝向最近存活玩家(与索敌目标一致)
      const heading = nearestAlive(state, enemy) ?? state.player
      const angle = Math.atan2(heading.y - enemy.y, heading.x - enemy.x)
      ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(angle)
      ctx.beginPath(); ctx.moveTo(enemy.size + 3, 0); ctx.lineTo(-enemy.size * 0.8, -enemy.size * 0.9); ctx.lineTo(-enemy.size * 0.8, enemy.size * 0.9); ctx.closePath(); ctx.fill()
      ctx.restore()
    } else if (enemy.kind === 'brute') {
      ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size, enemy.size * 2, enemy.size * 2)
      // R219.4(S3): 方块系(brute)同批加描边+高光角
      ctx.strokeStyle = 'rgba(8, 12, 20, 0.45)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(enemy.x - enemy.size, enemy.y - enemy.size, enemy.size * 2, enemy.size * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fillRect(enemy.x - enemy.size + 3, enemy.y - enemy.size + 3, enemy.size * 0.9, 3)
    } else if (enemy.kind === 'tank') {
      // R218 D: 堡垒——厚甲方块+描边+暗核(阻挡感)
      ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size, enemy.size * 2, enemy.size * 2)
      ctx.strokeStyle = 'rgba(226,232,240,0.4)'
      ctx.lineWidth = 2
      ctx.strokeRect(enemy.x - enemy.size + 2, enemy.y - enemy.size + 2, enemy.size * 2 - 4, enemy.size * 2 - 4)
      ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#334155'
      ctx.fillRect(enemy.x - enemy.size * 0.45, enemy.y - enemy.size * 0.45, enemy.size * 0.9, enemy.size * 0.9)
    } else if (enemy.kind === 'shooter') {
      // R218 D: 炮手——朝向玩家的箭镞(带尾凹)
      const heading = nearestAlive(state, enemy) ?? state.player
      const angle = Math.atan2(heading.y - enemy.y, heading.x - enemy.x)
      ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(enemy.size + 4, 0)
      ctx.lineTo(-enemy.size * 0.7, -enemy.size * 0.8)
      ctx.lineTo(-enemy.size * 0.3, 0)
      ctx.lineTo(-enemy.size * 0.7, enemy.size * 0.8)
      ctx.closePath(); ctx.fill()
      ctx.restore()
    } else if (enemy.kind === 'splitter') {
      // R218 D: 分裂体——双球叶+中缝(预示裂变)
      const r = enemy.size * 0.62
      ctx.beginPath()
      ctx.arc(enemy.x - enemy.size * 0.34, enemy.y, r, 0, Math.PI * 2)
      ctx.arc(enemy.x + enemy.size * 0.34, enemy.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(5,10,18,0.55)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y - r); ctx.lineTo(enemy.x, enemy.y + r); ctx.stroke()
    } else if (enemy.kind === 'healer') {
      // R218 D: 医疗者——绿球+白十字;常显 90px 治疗半径提示环,脉冲时扩散环
      ctx.strokeStyle = 'rgba(52,211,153,0.1)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 90, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#052012'
      ctx.fillRect(enemy.x - 1.5, enemy.y - enemy.size * 0.55, 3, enemy.size * 1.1)
      ctx.fillRect(enemy.x - enemy.size * 0.55, enemy.y - 1.5, enemy.size * 1.1, 3)
      const pulse = enemy.healPulse ?? 0
      if (pulse > 0) {
        ctx.strokeStyle = `rgba(74,222,128,${(pulse / 0.6) * 0.5})`
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 90 * (1 - pulse / 0.6) + 10, 0, Math.PI * 2); ctx.stroke()
      }
    } else {
      // R219.4(S3): 圆系敌人(chaser/swarm 等)加暗描边+左上高光点(低成本立体感)
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(8, 12, 20, 0.45)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.beginPath(); ctx.arc(enemy.x - enemy.size * 0.32, enemy.y - enemy.size * 0.32, Math.max(1.2, enemy.size * 0.18), 0, Math.PI * 2); ctx.fill()
    }
    ctx.shadowBlur = 0
    if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28, 3)
      ctx.fillStyle = '#86efac'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28 * (enemy.hp / enemy.maxHp), 3)
    }
  }

  // ── R219.1: 世界实体补齐——粒子/涟漪/玩家/飘字同为世界坐标,必须在摄像机
  //    层内绘制(R218 合并回归:曾被画在 restore 之后,导致玩家出生点 (900,520)
  //    按视口坐标落在 900×520 画布右下角外——开局飞船不可见、移动全错位)。──
  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  // R218 U10: 击杀涟漪——克制的一层扩散圆环
  for (const rp of state.ripples) {
    const p = 1 - rp.life / rp.maxLife
    ctx.strokeStyle = `rgba(103, 232, 249, ${(1 - p) * 0.35})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(rp.x, rp.y, 6 + p * 34, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (!(player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0)) {
    drawShipBody(ctx, player, '#e2f8ff', '#67e8f9', state.clock, player.hitFlash)
  }

  // R208(FR-MP01)→R213: 玩家 2..n 实体(P2 琥珀/P3 粉/P4 青,区别 P1 青白)
  // + 头顶 HP 条;无敌帧闪烁与 P1 同口径。
  for (let pi = 1; pi < state.players.length; pi++) {
    const pl = state.players[pi]
    if (pl.hp <= 0 || (pl.invuln > 0 && Math.floor(pl.invuln * 12) % 2 === 0)) continue
    drawShipBody(ctx, pl, ROSTER_HULL[pi - 1], ROSTER_ACCENT[pi - 1], state.clock, pl.hitFlash)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(pl.x - 16, pl.y - 26, 32, 3)
    ctx.fillStyle = ROSTER_ACCENT[pi - 1]
    ctx.fillRect(pl.x - 16, pl.y - 26, 32 * clamp(pl.hp / pl.maxHp, 0, 1), 3)
  }

  for (const text of state.texts) {
    ctx.globalAlpha = clamp(text.life, 0, 1)
    ctx.fillStyle = text.color
    ctx.font = '800 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }

  // R218 U8: juice 伤害飘字(世界坐标层内)
  drawFloats(ctx, state.juice)

  ctx.restore() // ── R218 U11: 世界层结束,以下 HUD 恒在视口坐标 ──

  const boss = state.enemies.find((enemy) => enemy.kind === 'boss')
  if (boss) {
    // R218 U1/U5: boss 血条走共享胶囊+连续血条(顶边居中,不进中央 60%)
    drawHealthBar(ctx, vp.w / 2 - 160, 52, 320, 10, clamp(boss.hp / boss.maxHp, 0, 1), state.clock, { segments: false })
    ctx.fillStyle = '#f9a8d4'
    ctx.font = '800 12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('BOSS', vp.w / 2, 46)
  }

  // ── R218 U1/U5: 战斗 HUD 胶囊化 + 心数行 → 连续血条(贴边,不进中央 60%) ──
  // 玩家 HP:左上纵向堆叠(P1 起每人一条,渐变+低血脉冲);倒下玩家画空底保位次。
  for (let pi = 0; pi < state.players.length; pi++) {
    const pl = state.players[pi]
    const y = 14 + pi * 18
    drawHealthBar(ctx, 34, y, 132, 11, pl.hp > 0 ? clamp(pl.hp / pl.maxHp, 0, 1) : 0, state.clock)
    ctx.fillStyle = pl.hp > 0 ? (pi === 0 ? '#e2f8ff' : ROSTER_ACCENT[pi - 1]) : 'rgba(159,183,193,0.55)'
    ctx.font = '700 10px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${pi + 1}`, 16, y + 5.5)
  }

  const comboTop = 14 + state.players.length * 18 + 4
  if (state.combo >= 3) {
    drawHudCapsule(ctx, 16, comboTop, 118, 18)
    ctx.fillStyle = state.combo >= 10 ? '#fde68a' : '#e2f8ff'
    ctx.font = `800 ${13 + Math.min(5, Math.floor(state.combo / 4))}px Inter, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`COMBO ×${state.combo}`, 24, comboTop + 9)
  }

  // 右上信息胶囊(波次=岛屿/时间/分数——spec U1 三要素的 Survival 语义)
  const mins = Math.floor(state.time / 60)
  const secs = String(Math.floor(state.time % 60)).padStart(2, '0')
  drawHudCapsule(ctx, vp.w - 216, 14, 200, 20)
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '700 11px Inter, sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(`ISLAND ${state.island}  ${mins}:${secs}  ${state.score}`, vp.w - 24, 24)

  drawHealthBar(ctx, 76, vp.h - 24, vp.w - 112, 8, clamp(state.xp / state.xpNext, 0, 1), state.clock, { segments: false })
  drawHudCapsule(ctx, 16, vp.h - 30, 54, 20)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`LV ${state.level}`, 24, vp.h - 20)

  if (state.banner) {
    ctx.globalAlpha = clamp(state.banner.life / 0.5, 0, 1)
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '800 44px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.banner.text, vp.w / 2, 110)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // R218 U1/U5: 低血(≤25%)呼吸警示 vignette——任一存活玩家触发即亮
  const lowRatio = state.players.reduce((acc, pl) => (pl.hp > 0 ? Math.min(acc, pl.hp / pl.maxHp) : acc), 1)
  if (lowRatio <= 0.25) drawAlertVignette(ctx, vp.w, vp.h, 0.45, state.clock)
  dimScene(ctx, state.phase, vp.w, vp.h)
}

// ── FR-G01(R198): 策略教练 —— 纯函数,key 制文案 ──
import type { CoachHint } from './coach'
import { HIT_STOP, hitStopTick, SpawnWarning, tickWarnings, SPAWN_WARN_SECONDS } from './juice'

export function survivalHints(state: SurvivalState): CoachHint[] {
  const hints: CoachHint[] = []
  if (state.phase !== 'running') return hints
  if (state.player.hp / state.player.maxHp <= 0.35) hints.push({ key: 'sw.hpLow', tone: 'warn', priority: 85 })
  if (state.pendingSpins > 0) hints.push({ key: 'sw.spinReady', tone: 'tip', priority: 75 })
  if (state.bossTimer > BOSS_INTERVAL - 15) hints.push({ key: 'sw.bossSoon', tone: 'warn', priority: 70 })
  if (state.portal !== null) hints.push({ key: 'sw.portal', tone: 'praise', priority: 60 })
  if (state.combo >= 8) hints.push({ key: 'sw.combo', tone: 'praise', priority: 40 })
  return hints
}
