// R99.3: "Nova Swarm" — Goobies-style survival arena. Player auto-fires at the
// nearest enemy, kills drop XP orbs, level-ups freeze the run for a pick-one-of-
// three upgrade card, and an adaptive director tightens or eases the spawn pace
// based on how well the run is going.
import { playSfx } from './sfx'
import { WIDTH, HEIGHT } from './td'
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
  kind: 'chaser' | 'sprinter' | 'brute' | 'boss'
  elite: boolean
  hitFlash: number
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
  shake: number
  nextId: number
  player: PlayerState
  stats: PlayerStats
  taken: Record<UpgradeId, number>
  bonuses: Partial<Record<RouletteStat, number>>
  character: CharacterId
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
  banner: Banner | null
  island: number
  portal: Point | null
  keys: Set<string>
  axis: { x: number; y: number }
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
  /** R208(FR-MP01): 二号位玩家(本地合作;null=单人局)。hp≤0 为倒下态。 */
  player2: PlayerState | null
  /** P2 独立输入源(IJKL→p2up/p2down/p2left/p2right,防与 P1 keys 串键)。 */
  keys2: Set<string>
  /** 倒下玩家掉落的复活珠(target=被救者);由存活队友拾取触发复活。 */
  reviveOrbs: Array<{ id: number; x: number; y: number; target: 1 | 2 }>
  /** 各玩家被复活次数(各限 1 次/局,宽恕设计)。 */
  revivesUsed: { p1: number; p2: number }
}

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
    magnet: 70,
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
  stats.magnet = (70 + 45 * taken.magnet + (ctx?.magnetBonus ?? 0)) * (1 + (bonuses?.magnet ?? 0))
  stats.crit = 0.1 * taken.crit + (bonuses?.crit ?? 0)
  stats.bulletSpeed = 420 * (1 + 0.3 * taken.bulletSpeed)
  stats.thorns = taken.thorns + character.innateThorns
  stats.regenInterval = taken.regen === 0 ? 0 : taken.regen === 1 ? 24 : 12
}

export function initialSurvivalState(
  character: CharacterId = 'wisp',
  perm: PermMap = { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 },
  artifacts: ArtifactId[] = [],
): SurvivalState {
  const def = characterById(character)
  const has = (id: ArtifactId) => artifacts.includes(id)
  let maxHp = Math.max(1, 5 + def.hpMod + perm.maxHp)
  if (has('glass')) maxHp = 1
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
    shake: 0,
    nextId: 1,
    player: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, size: 14, hp: maxHp, maxHp, invuln: 0, fireTimer: 0, angle: -Math.PI / 2 },
    stats: baseStats(),
    taken: { fireRate: 0, damage: 0, multishot: 0, pierce: 0, blade: 0, speed: 0, maxHp: 0, magnet: 0, crit: 0, bulletSpeed: 0, thorns: 0, regen: 0 },
    bonuses: {},
    character,
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
    banner: null,
    island: 1,
    portal: null,
    keys: new Set<string>(),
    axis: { x: 0, y: 0 },
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
    eBullets: [],
    player2: null,
    keys2: new Set<string>(),
    reviveOrbs: [],
    revivesUsed: { p1: 0, p2: 0 },
  }
  recomputeStats(state.stats, state.taken, { character: state.character, perm: state.perm, bonuses: state.bonuses, magnetBonus: state.magnetBonus })
  return state
}

/** R208(FR-MP01): 部署二号位——独立 HP/无敌帧/开火计时,位置与 P1 分侧。
 *  共享 build(升级/轮盘对两人同时生效),仅实体与输入独立。 */
export function deployPlayer2(state: SurvivalState): void {
  state.player2 = {
    x: WIDTH / 2 - 60, y: HEIGHT / 2 + 40, vx: 0, vy: 0, size: 14,
    hp: state.player.maxHp, maxHp: state.player.maxHp, invuln: 2,
    fireTimer: 0, angle: -Math.PI / 2,
  }
  state.keys2 = new Set<string>()
}

function key(state: SurvivalState, value: string): boolean {
  return state.keys.has(value)
}

// ── R208(FR-MP01): 存活玩家集合/最近存活者(敌人索敌与磁吸以存活者为准) ──
function alivePlayers(state: SurvivalState): PlayerState[] {
  const list: PlayerState[] = []
  if (state.player.hp > 0) list.push(state.player)
  if (state.player2 !== null && state.player2.hp > 0) list.push(state.player2)
  return list
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

/** 玩家倒下:爆散+掉复活珠(该玩家本局未被复活过时);全员倒下由调用方判负。 */
function playerDown(state: SurvivalState, which: 1 | 2): void {
  const p = which === 1 ? state.player : state.player2
  if (p === null || p.hp > 0) return
  spawnBurst(state, p.x, p.y, '#f87171', 22, 210)
  addText(state, p.x, p.y - 30, which === 1 ? 'P1 DOWN' : 'P2 DOWN', '#f87171')
  if (state.revivesUsed[which === 1 ? 'p1' : 'p2'] < 1) {
    state.reviveOrbs.push({ id: state.nextId++, x: clamp(p.x, 30, WIDTH - 30), y: clamp(p.y, 30, HEIGHT - 30), target: which })
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
  const factor = state.player.hp <= 1 ? 1.25 : state.player.hp >= state.player.maxHp ? 0.85 : 1
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
  state.shake = 5
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

function spawnEnemy(state: SurvivalState): void {
  const side = Math.floor(Math.random() * 4)
  // R200: 出生预警——下一次入场的敌人先在对应边缘亮 0.5s 红箭头(登记在生成前)
  state.warnings.push({ edge: side as 0 | 1 | 2 | 3, t: SPAWN_WARN_SECONDS })
  const x = side === 0 ? -30 : side === 1 ? WIDTH + 30 : Math.random() * WIDTH
  const y = side === 2 ? -30 : side === 3 ? HEIGHT + 30 : Math.random() * HEIGHT
  const elite = state.time > 60 && Math.random() < 0.08
  const islandMult = 1 + 0.25 * (state.island - 1)
  const scale = (elite ? 2.5 : 1) * islandMult
  const roll = Math.random()
  if (state.time > 90 && roll < 0.12) {
    const hp = Math.round((10 + Math.floor(state.time / 15)) * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 20, hp, maxHp: hp, kind: 'brute', elite, hitFlash: 0 })
  } else if (state.time > 40 && roll < 0.34) {
    const hp = Math.round(2 * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 11, hp, maxHp: hp, kind: 'sprinter', elite, hitFlash: 0 })
  } else {
    const hp = Math.round((3 + Math.floor(state.time / 25)) * scale)
    state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 14, hp, maxHp: hp, kind: 'chaser', elite, hitFlash: 0 })
  }
}

/** R202(FR-SW02): boss 弹幕——放射(12 向)/瞄准扇形(5 发)/环形(16 发)循环。 */
function bossBarrage(state: SurvivalState, boss: Enemy): void {
  const pattern = Math.floor(state.bossBulletTimer) % 3
  if (pattern === 0) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, size: 6, life: 4 })
    }
  } else if (pattern === 1) {
    const base = Math.atan2(state.player.y - boss.y, state.player.x - boss.x)
    for (let i = -2; i <= 2; i += 1) {
      const a = base + i * 0.18
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, size: 7, life: 4 })
    }
  } else {
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2 + 0.2
      state.eBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, size: 5, life: 5 })
    }
  }
}

function spawnBoss(state: SurvivalState): void {
  const hp = 60 + Math.floor(state.time / 10) * 6
  const side = Math.floor(Math.random() * 4)
  const x = side === 0 ? -50 : side === 1 ? WIDTH + 50 : Math.random() * WIDTH
  const y = side === 2 ? -50 : side === 3 ? HEIGHT + 50 : Math.random() * HEIGHT
  state.enemies.push({ id: state.nextId++, x, y, vx: 0, vy: 0, size: 34, hp, maxHp: hp, kind: 'boss', elite: false, hitFlash: 0 })
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
    state.portal = { x: clamp(enemy.x, 60, WIDTH - 60), y: clamp(enemy.y, 60, HEIGHT - 60) }
    state.banner = { text: 'BOSS DOWN — ROULETTE +1', life: 1.8 }
    state.shake = 8
    playSfx('levelup')
    return
  }
  const color = enemy.kind === 'brute' ? '#f472b6' : enemy.kind === 'sprinter' ? '#fbbf24' : '#fb7185'
  spawnBurst(state, enemy.x, enemy.y, color, enemy.kind === 'brute' ? 18 : 9, 140)
  const drops = enemy.elite || enemy.kind === 'brute' ? 3 : 1
  for (let i = 0; i < drops; i++) {
    state.orbs.push({ id: state.nextId++, x: enemy.x + (Math.random() - 0.5) * 18, y: enemy.y + (Math.random() - 0.5) * 18, value: 1 })
  }
}

export function tickSurvival(state: SurvivalState, dt: number): void {
  // R200: hit-stop(进化/boss 击杀);预警条目独立于冻结推进
  state.warnings = tickWarnings(state.warnings, dt)
  // R202(FR-SW02): boss 弹幕三型循环(放射/瞄准扇形/环形,每 1.2s)
  state.bossBulletTimer += dt
  for (const enemy of state.enemies) {
    if (enemy.kind === 'boss' && state.bossBulletTimer >= 1.2) {
      bossBarrage(state, enemy)
    }
  }
  if (state.bossBulletTimer >= 1.2) state.bossBulletTimer = 0
  // 弹幕运动/寿命/命中
  for (const eb of state.eBullets) {
    eb.x += eb.vx * dt
    eb.y += eb.vy * dt
    eb.life -= dt
  }
  state.eBullets = state.eBullets.filter((eb) => eb.life > 0 && eb.x > -40 && eb.x < WIDTH + 40 && eb.y > -40 && eb.y < HEIGHT + 40)
  for (const eb of state.eBullets) {
    // R208: 弹幕对任一存活玩家结算(独立无敌帧)
    for (const pl of alivePlayers(state)) {
      if (pl.invuln <= 0 && Math.hypot(eb.x - pl.x, eb.y - pl.y) < pl.size + eb.size) {
        pl.hp -= 1
        pl.invuln = state.invulnWindow
        state.shake = Math.min(8, state.shake + 4)
        eb.life = 0
        playSfx('hurt')
        if (pl.hp <= 0) {
          playerDown(state, pl === state.player ? 1 : 2)
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
  state.shake = Math.max(0, state.shake - dt * 14)
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
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
  state.score = Math.floor((state.kills * 10 + state.comboBonus + Math.floor(state.time)) * state.scoreMult)
  // FR-G08 sprint: a time-capped run settles through the existing end path —
  // 'lost' reads as "time up", and the score earned so far stays on the board.
  if (state.sprintSeconds !== undefined && state.time >= state.sprintSeconds) {
    state.phase = 'lost'
    return
  }
  const player = state.player
  const stats = state.stats
  player.invuln = Math.max(0, player.invuln - dt)

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
    player.x = clamp(player.x + (moveX / moveLen) * moveScale * stats.moveSpeed * dt, 16, WIDTH - 16)
    player.y = clamp(player.y + (moveY / moveLen) * moveScale * stats.moveSpeed * dt, 16, HEIGHT - 16)
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

  // ── R208(FR-MP01): 二号位——独立移动(IJKL→keys2)/无敌帧/自动索敌开火 ──
  // 共享弹池与 stats(build 对两人同时生效);P2 开火不叠 sfx(音频预算)。
  const p2 = state.player2
  if (p2 !== null && p2.hp > 0) {
    p2.invuln = Math.max(0, p2.invuln - dt)
    const d2x = (state.keys2.has('p2right') ? 1 : 0) - (state.keys2.has('p2left') ? 1 : 0)
    const d2y = (state.keys2.has('p2down') ? 1 : 0) - (state.keys2.has('p2up') ? 1 : 0)
    const len2 = Math.hypot(d2x, d2y)
    if (len2 > 0.0001) {
      p2.x = clamp(p2.x + (d2x / len2) * stats.moveSpeed * dt, 16, WIDTH - 16)
      p2.y = clamp(p2.y + (d2y / len2) * stats.moveSpeed * dt, 16, HEIGHT - 16)
      p2.angle = Math.atan2(d2y, d2x)
      if (Math.random() < dt * 40) state.particles.push({ x: p2.x - Math.cos(p2.angle) * 14, y: p2.y - Math.sin(p2.angle) * 14, vx: -Math.cos(p2.angle) * 60, vy: -Math.sin(p2.angle) * 60, life: 0.3, maxLife: 0.3, size: 2.5, color: '#fbbf24' })
    }
    p2.fireTimer -= dt
    if (p2.fireTimer <= 0 && state.enemies.length > 0) {
      let nearest2: Enemy | undefined
      let bestDist2 = Number.POSITIVE_INFINITY
      for (const enemy of state.enemies) {
        const dist = distance(p2, enemy)
        if (dist < bestDist2) {
          nearest2 = enemy
          bestDist2 = dist
        }
      }
      if (nearest2) {
        const baseAngle = Math.atan2(nearest2.y - p2.y, nearest2.x - p2.x)
        const shots = stats.multishot
        for (let i = 0; i < shots; i++) {
          const spread = (i - (shots - 1) / 2) * (Math.PI / 14)
          const angle = baseAngle + spread
          const crit = Math.random() < stats.crit
          state.bullets.push({ id: state.nextId++, x: p2.x, y: p2.y, vx: Math.cos(angle) * stats.bulletSpeed, vy: Math.sin(angle) * stats.bulletSpeed, damage: crit ? stats.damage * 2 : stats.damage, pierce: stats.pierce, crit, life: 1.2 })
        }
      }
      p2.fireTimer = 1 / stats.fireRate
    }
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
        if (distance({ x: bx, y: by }, enemy) < 16 + enemy.size) {
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
      if (distance(bullet, enemy) < 5 + enemy.size) {
        enemy.hp -= bullet.damage
        enemy.hitFlash = 0.1
        enemy.x += bullet.vx * dt * 0.5
        enemy.y += bullet.vy * dt * 0.5
        bullet.pierce -= 1
        spawnBurst(state, bullet.x, bullet.y, bullet.crit ? '#fbbf24' : '#67e8f9', 3, 60)
        playSfx('hit')
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && bullet.pierce >= 0 && bullet.x > -20 && bullet.x < WIDTH + 20 && bullet.y > -20 && bullet.y < HEIGHT + 20)

  const speedFor = (enemy: Enemy): number => {
    if (enemy.kind === 'sprinter') return 132 * state.enemySpeedMult
    if (enemy.kind === 'brute') return 40 * state.enemySpeedMult
    if (enemy.kind === 'boss') return 34 * state.enemySpeedMult
    return Math.min(112, 64 + state.time * 0.12) * state.enemySpeedMult
  }
  for (const enemy of state.enemies) {
    // R208(FR-MP01): 敌人追最近存活玩家(单人局退化原行为)
    const target = nearestAlive(state, enemy) ?? player
    const dist = Math.max(1, distance(enemy, target))
    const speed = speedFor(enemy)
    enemy.x += ((target.x - enemy.x) / dist) * speed * dt
    enemy.y += ((target.y - enemy.y) / dist) * speed * dt
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
    if (target.invuln <= 0 && distance(enemy, target) < enemy.size + target.size) {
      target.hp -= 1
      target.invuln = state.invulnWindow
      state.shake = enemy.kind === 'boss' ? 9 : 6
      playSfx('hurt')
      spawnBurst(state, target.x, target.y, '#f87171', 12, 150)
      enemy.x -= (target.x - enemy.x) / dist * 46
      enemy.y -= (target.y - enemy.y) / dist * 46
      if (stats.thorns > 0) {
        enemy.hp -= stats.thorns
        enemy.hitFlash = 0.1
      }
      if (target.hp <= 0) {
        playerDown(state, target === state.player ? 1 : 2)
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
    if (dist < holder.size + 8) {
      state.xp += orb.value * state.xpMult
      playSfx('xp')
      return false
    }
    return true
  })

  // ── R208(FR-MP01): 复活珠——队友靠近磁吸,拾取复活倒下方(各 1 次/局) ──
  state.reviveOrbs = state.reviveOrbs.filter((orb) => {
    const target = orb.target === 1 ? state.player : state.player2
    const rescuer = orb.target === 1 ? state.player2 : state.player
    if (target === null || rescuer === null || rescuer.hp <= 0) return true
    const dist = distance(orb, rescuer)
    if (dist < stats.magnet) {
      const speed = 240
      orb.x += ((rescuer.x - orb.x) / dist) * speed * dt
      orb.y += ((rescuer.y - orb.y) / dist) * speed * dt
    }
    if (dist < rescuer.size + 10) {
      target.hp = Math.max(1, Math.ceil(target.maxHp / 2))
      target.invuln = 2
      target.x = clamp(rescuer.x + (Math.random() - 0.5) * 64, 16, WIDTH - 16)
      target.y = clamp(rescuer.y + (Math.random() - 0.5) * 64, 16, HEIGHT - 16)
      state.revivesUsed[orb.target === 1 ? 'p1' : 'p2'] += 1
      addText(state, rescuer.x, rescuer.y - 34, orb.target === 1 ? 'P1 REVIVED' : 'P2 REVIVED', '#4ade80')
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

const STARS = Array.from({ length: 42 }, (_, i) => ({
  x: (Math.sin(i * 127.3) * 0.5 + 0.5) * WIDTH,
  y: (Math.sin(i * 311.7) * 0.5 + 0.5) * HEIGHT,
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

function dimScene(ctx: CanvasRenderingContext2D, phase: SurvivalPhase): void {
  if (phase === 'ready' || phase === 'lost') {
    ctx.fillStyle = 'rgba(5, 10, 14, 0.68)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  } else if (phase === 'roulette') {
    ctx.fillStyle = 'rgba(5, 10, 14, 0.55)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }
}

export function drawSurvival(ctx: CanvasRenderingContext2D, state: SurvivalState): void {
  // R202: boss 弹幕绘制
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
  drawSurvivalBody(ctx, state)
  // R200(FR-G06.2): 出生预警——边缘红色箭头(0.5s)
  for (const w of state.warnings) {
    const alpha = Math.min(1, w.t / 0.5)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#fb7185'
    ctx.font = '800 26px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cx = w.edge === 1 ? WIDTH - 46 : w.edge === 3 ? 46 : WIDTH / 2
    const cy = w.edge === 0 ? 46 : w.edge === 2 ? HEIGHT - 46 : HEIGHT / 2
    const glyph = w.edge === 0 ? '▲' : w.edge === 1 ? '▶' : w.edge === 2 ? '▼' : '◀'
    ctx.fillText(glyph, cx, cy)
    ctx.restore()
  }
}

function drawSurvivalBody(ctx: CanvasRenderingContext2D, state: SurvivalState): void {
  const player = state.player
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
  const theme = ISLAND_THEMES[(state.island - 1) % ISLAND_THEMES.length]
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (const star of STARS) {
    ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(state.clock * 2 + star.phase))
    ctx.fillStyle = theme.star
    ctx.fillRect(star.x - player.x * 0.02, star.y - player.y * 0.02, star.size, star.size)
  }
  ctx.globalAlpha = 1

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
    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.kind === 'brute' ? '#f472b6' : enemy.kind === 'sprinter' ? '#fbbf24' : '#fb7185'
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
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-9, -8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill()
      ctx.restore()
    } else if (enemy.kind === 'brute') {
      ctx.fillRect(enemy.x - enemy.size, enemy.y - enemy.size, enemy.size * 2, enemy.size * 2)
    } else {
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.shadowBlur = 0
    if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28, 3)
      ctx.fillStyle = '#86efac'
      ctx.fillRect(enemy.x - 14, enemy.y - enemy.size - 10, 28 * (enemy.hp / enemy.maxHp), 3)
    }
  }

  const boss = state.enemies.find((enemy) => enemy.kind === 'boss')
  if (boss) {
    ctx.fillStyle = 'rgba(219, 39, 119, 0.25)'
    ctx.fillRect(WIDTH / 2 - 160, 64, 320, 10)
    ctx.fillStyle = '#f472b6'
    ctx.fillRect(WIDTH / 2 - 160, 64, 320 * clamp(boss.hp / boss.maxHp, 0, 1), 10)
    ctx.fillStyle = '#f9a8d4'
    ctx.font = '800 12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('BOSS', WIDTH / 2, 58)
  }

  for (const particle of state.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }

  if (!(player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0)) {
    ctx.save()
    ctx.translate(player.x, player.y)
    ctx.rotate(player.angle)
    ctx.fillStyle = '#e2f8ff'
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#67e8f9'
    ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // R208(FR-MP01): 二号位实体(琥珀色区别 P1 青白)+头顶 HP 条
  const p2d = state.player2
  if (p2d !== null && p2d.hp > 0 && !(p2d.invuln > 0 && Math.floor(p2d.invuln * 12) % 2 === 0)) {
    ctx.save()
    ctx.translate(p2d.x, p2d.y)
    ctx.rotate(p2d.angle)
    ctx.fillStyle = '#fff7e2'
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#fbbf24'
    ctx.beginPath(); ctx.arc(2, 0, 4, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(p2d.x - 16, p2d.y - 26, 32, 3)
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(p2d.x - 16, p2d.y - 26, 32 * clamp(p2d.hp / p2d.maxHp, 0, 1), 3)
  }

  for (const text of state.texts) {
    ctx.globalAlpha = clamp(text.life, 0, 1)
    ctx.fillStyle = text.color
    ctx.font = '800 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }

  for (let i = 0; i < player.hp; i++) {
    ctx.fillStyle = '#f87171'
    ctx.beginPath()
    ctx.arc(28 + i * 22, 30, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#050a12'
    ctx.beginPath()
    ctx.arc(28 + i * 22, 30, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // R208(FR-MP01): P2 HP 第二行(琥珀空心圆,P1 行正下方)
  if (state.player2 !== null) {
    for (let i = 0; i < state.player2.maxHp; i++) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(28 + i * 22, 52, 7, 0, Math.PI * 2)
      ctx.stroke()
      if (i < state.player2.hp) {
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath()
        ctx.arc(28 + i * 22, 52, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (state.combo >= 3) {
    ctx.fillStyle = state.combo >= 10 ? '#fde68a' : '#e2f8ff'
    ctx.font = `800 ${14 + Math.min(6, Math.floor(state.combo / 4))}px Inter, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`COMBO ×${state.combo}`, 26, 62)
  }

  ctx.fillStyle = 'rgba(74, 222, 128, 0.18)'
  ctx.fillRect(40, HEIGHT - 22, WIDTH - 80, 8)
  ctx.fillStyle = '#4ade80'
  ctx.fillRect(40, HEIGHT - 22, (WIDTH - 80) * clamp(state.xp / state.xpNext, 0, 1), 8)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`LV ${state.level}`, 40, HEIGHT - 34)

  if (state.banner) {
    ctx.globalAlpha = clamp(state.banner.life / 0.5, 0, 1)
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '800 44px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(state.banner.text, WIDTH / 2, 110)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  dimScene(ctx, state.phase)
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
