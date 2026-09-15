import { Crosshair, Gamepad2, Heart, Play, RotateCcw, Shield, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import { useI18n } from '../i18n'

type GamePhase = 'ready' | 'running' | 'won' | 'lost'
type TowerKind = 'dart' | 'frost' | 'storm'
type GameId = 'balloon' | 'helicopter' | 'motherload'
type ArcadeGameId = Exclude<GameId, 'balloon'>

interface Point {
  x: number
  y: number
}

interface Balloon {
  id: number
  progress: number
  speed: number
  hp: number
  maxHp: number
  reward: number
  slowUntil: number
  color: string
}

export interface Tower extends Point {
  id: number
  kind: TowerKind
  level: number
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
}

interface FloatingText extends Point {
  id: number
  text: string
  life: number
  color: string
}

interface FloatingTextManager {
  texts: FloatingText[]
  nextId: number
}

interface GameState {
  phase: GamePhase
  wave: number
  lives: number
  coins: number
  score: number
  nextId: number
  waveQueue: number
  spawnTimer: number
  waveCooldown: number
  balloons: Balloon[]
  towers: Tower[]
  projectiles: Projectile[]
  texts: FloatingText[]
}

interface TowerDefinition {
  kind: TowerKind
  label: string
  cost: number
  range: number
  fireRate: number
  damage: number
  color: string
  description: string
}

interface GameDefinition {
  id: GameId
  title: string
  summary: string
  controls: string
  classic: string
  accent: string
}

interface ArcadeEntity extends Point {
  id: number
  vx: number
  vy: number
  size: number
  hp?: number
  kind?: string
  value?: number
  cooldown?: number
}

interface ArcadeState {
  phase: GamePhase
  score: number
  lives: number
  time: number
  nextId: number
  player: ArcadeEntity
  distance: number
  fuel: number
  resources: number
  mouseDown: boolean
  mouse: Point
  keys: Set<string>
  obstacles: ArcadeEntity[]
  pickups: ArcadeEntity[]
  texts: FloatingText[]
  message: string
  invuln: number
  milestone: number
  starTimer: number
  cameraY: number
  depth: number
  cargo: number
}

const WIDTH = 900
const HEIGHT = 520
const MAX_WAVE = 12
const AUTO_WAVE_SECONDS = 8
const TOWER_MAX_LEVEL = 3
const MINE_DEPTH = 1520
const ORE_COUNT = 96
const CARGO_CAP = 60
const MOTHERLOAD_GOAL = 260
const BEST_KEY_PREFIX = 'rgbbox:gamesBest:'
const GAME_KEYS = new Set(['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])

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

const TOWER_DEFINITIONS: TowerDefinition[] = [
  { kind: 'dart', label: 'Pulse Dart', cost: 70, range: 126, fireRate: 0.62, damage: 1, color: '#67e8f9', description: 'Fast single-target shots.' },
  { kind: 'frost', label: 'Frost Prism', cost: 105, range: 112, fireRate: 1.05, damage: 1, color: '#93c5fd', description: 'Slows dense balloon packs.' },
  { kind: 'storm', label: 'Storm Coil', cost: 145, range: 146, fireRate: 1.32, damage: 2, color: '#f0abfc', description: 'High damage with splash arcs.' },
]

const GAME_DEFINITIONS: GameDefinition[] = [
  { id: 'balloon', title: 'Balloon TD Arena', summary: 'Place RGB towers, pop waves, and protect the desktop core.', controls: 'Click open ground to build towers. Start advances waves.', classic: 'Bloons-inspired TD', accent: '#67e8f9' },
  { id: 'helicopter', title: 'Helicopter Game', summary: 'Hold to climb, release to dive, and thread neon cave gaps.', controls: 'Hold mouse or Space to rise. Release to descend.', classic: 'Classic index ★★★★★', accent: '#22c55e' },
  { id: 'motherload', title: 'Motherload', summary: 'Drill underground, collect ore, return to the surface before fuel runs dry.', controls: 'Arrows dig and steer. Surface refuels and banks ore.', classic: 'Classic index ★★★★★', accent: '#f97316' },
]

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readBest(id: GameId): number {
  try {
    const raw = localStorage.getItem(BEST_KEY_PREFIX + id)
    const value = raw === null ? 0 : Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeBest(id: GameId, score: number): void {
  try {
    localStorage.setItem(BEST_KEY_PREFIX + id, String(Math.floor(score)))
  } catch {
    return
  }
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

function distanceToPath(point: Point): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < PATH.length - 1; i++) min = Math.min(min, distanceToSegment(point, PATH[i], PATH[i + 1]))
  return min
}

export function initialState(): GameState {
  return {
    phase: 'ready',
    wave: 0,
    lives: 20,
    coins: 220,
    score: 0,
    nextId: 1,
    waveQueue: 0,
    spawnTimer: 0,
    waveCooldown: AUTO_WAVE_SECONDS,
    balloons: [],
    towers: [],
    projectiles: [],
    texts: [],
  }
}

export function createArcadeState(id: ArcadeGameId): ArcadeState {
  const player: ArcadeEntity = { id: 1, x: 150, y: 320, vx: 0, vy: 0, size: 18, hp: 5 }
  const base: ArcadeState = {
    phase: 'ready',
    score: 0,
    lives: 3,
    time: 0,
    nextId: 2,
    player,
    distance: 0,
    fuel: 100,
    resources: 0,
    mouseDown: false,
    mouse: { x: WIDTH / 2, y: HEIGHT / 2 },
    keys: new Set<string>(),
    obstacles: [],
    pickups: [],
    texts: [],
    message: 'Press Start',
    invuln: 0,
    milestone: 0,
    starTimer: 1.2,
    cameraY: 0,
    depth: 0,
    cargo: 0,
  }

  if (id === 'helicopter') {
    base.player = { ...player, x: 150, y: HEIGHT / 2, size: 16 }
    base.lives = 3
    base.obstacles = Array.from({ length: 7 }, (_, index) => makeCaveColumn(base, 360 + index * 150))
  }
  if (id === 'motherload') {
    base.player = { ...player, x: WIDTH / 2, y: 82, size: 17 }
    base.obstacles = Array.from({ length: ORE_COUNT }, () => makeOre(base, 150, 100 + MINE_DEPTH))
  }
  return base
}

function createArcadeStateMap(): Record<ArcadeGameId, ArcadeState> {
  return {
    helicopter: createArcadeState('helicopter'),
    motherload: createArcadeState('motherload'),
  }
}

function addText(state: FloatingTextManager, x: number, y: number, text: string, color: string): void {
  state.texts.push({ id: state.nextId++, x, y, text, color, life: 0.9 })
}

function spawnBalloon(state: GameState): void {
  const wavePower = Math.max(1, state.wave)
  const elite = wavePower > 4 && state.waveQueue % 5 === 0
  const hp = elite ? 3 + Math.floor(wavePower / 2) : 1 + Math.floor(wavePower / 3)
  state.balloons.push({
    id: state.nextId++,
    progress: 0,
    speed: (elite ? 0.035 : 0.046) + wavePower * 0.002,
    hp,
    maxHp: hp,
    reward: elite ? 18 : 10,
    slowUntil: 0,
    color: elite ? '#f97316' : ['#fb7185', '#38bdf8', '#facc15', '#a78bfa'][wavePower % 4],
  })
}

function launchWave(state: GameState): void {
  if (state.wave >= MAX_WAVE) return
  state.wave += 1
  state.waveQueue = 12 + state.wave * 3
  state.spawnTimer = 0.2
  state.waveCooldown = AUTO_WAVE_SECONDS
  state.phase = 'running'
}

function nearestTarget(tower: Tower, balloons: Balloon[]): Balloon | undefined {
  let target: Balloon | undefined
  let bestProgress = -1
  for (const balloon of balloons) {
    const pos = pointAtProgress(balloon.progress)
    if (distance(tower, pos) <= tower.range && balloon.progress > bestProgress) {
      target = balloon
      bestProgress = balloon.progress
    }
  }
  return target
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
  tower.level += 1
  tower.damage = Math.max(1, Math.round(def.damage * (1 + 0.6 * (tower.level - 1))))
  tower.range = Math.round(def.range * (1 + 0.16 * (tower.level - 1)))
  tower.fireRate = def.fireRate / (1 + 0.22 * (tower.level - 1))
  return true
}

function makeEntity(state: ArcadeState, x: number, y: number, vx: number, vy: number, size: number, kind?: string, value?: number): ArcadeEntity {
  return { id: state.nextId++, x, y, vx, vy, size, kind, value, hp: value ?? 1 }
}

export function caveGapHalf(distance: number): number {
  return clamp(96 - distance * 0.024, 58, 96)
}

export function caveSpeed(distance: number): number {
  return 190 + Math.min(120, distance * 0.055)
}

function makeCaveColumn(state: ArcadeState, x: number): ArcadeEntity {
  return makeEntity(state, x, 130 + Math.random() * 230, -caveSpeed(state.distance), 0, caveGapHalf(state.distance) + Math.random() * 10, 'cave')
}

function makeOre(state: ArcadeState, minY: number, maxY: number): ArcadeEntity {
  const y = minY + Math.random() * Math.max(1, maxY - minY)
  const depthFrac = clamp((y - 100) / MINE_DEPTH, 0, 1)
  const gem = Math.random() < 0.16 + depthFrac * 0.34
  const value = gem ? Math.round(24 + depthFrac * 36) : Math.round(10 + depthFrac * 16)
  return makeEntity(state, 50 + Math.random() * (WIDTH - 100), y, 0, 0, gem ? 9 : 13, gem ? 'gem' : 'ore', value)
}

function key(state: ArcadeState, value: string): boolean {
  return state.keys.has(value.toLowerCase())
}

function startArcade(state: ArcadeState): void {
  if (state.phase === 'won' || state.phase === 'lost') return
  state.phase = 'running'
  state.message = 'Go!'
}

function loseArcade(state: ArcadeState, message: string): void {
  state.phase = 'lost'
  state.message = message
}

function winArcade(state: ArcadeState, message: string): void {
  state.phase = 'won'
  state.message = message
}

function updateFloatingTexts(state: ArcadeState, dt: number): void {
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
}

function updateArcade(state: ArcadeState, id: ArcadeGameId, dt: number): void {
  updateFloatingTexts(state, dt)
  if (state.phase !== 'running') return
  state.time += dt
  state.score = Math.max(0, Math.floor(state.distance + state.resources * 3 + state.time * 6))

  switch (id) {
    case 'helicopter':
      updateHelicopter(state, dt)
      break
    case 'motherload':
      updateMotherload(state, dt)
      break
  }
}

function helicopterCrash(state: ArcadeState): void {
  state.lives -= 1
  if (state.lives <= 0) {
    loseArcade(state, 'Cave crash')
    return
  }
  state.invuln = 1.6
  state.player.y = HEIGHT / 2
  state.player.vy = 0
  addText(state, state.player.x, state.player.y - 34, 'Shields!', '#fca5a5')
}

export function updateHelicopter(state: ArcadeState, dt: number): void {
  const player = state.player
  state.invuln = Math.max(0, state.invuln - dt)
  player.vy += (state.mouseDown || key(state, ' ') || key(state, 'space') ? -820 : 560) * dt
  player.vy = clamp(player.vy, -310, 330)
  player.y += player.vy * dt
  state.distance += 150 * dt
  for (const column of state.obstacles) {
    column.x += column.vx * dt
    if (column.x < -60) Object.assign(column, makeCaveColumn(state, WIDTH + 70))
    const gap = column.size
    if (state.invuln <= 0 && Math.abs(player.x - column.x) < 28 && (player.y < column.y - gap || player.y > column.y + gap)) {
      helicopterCrash(state)
      if (state.phase !== 'running') return
    }
  }
  if (state.invuln <= 0 && (player.y < 18 || player.y > HEIGHT - 18)) {
    helicopterCrash(state)
    if (state.phase !== 'running') return
  }
  state.starTimer -= dt
  if (state.starTimer <= 0) {
    state.pickups.push(makeEntity(state, WIDTH + 40, 90 + Math.random() * (HEIGHT - 180), -caveSpeed(state.distance), 0, 9, 'star', 30))
    state.starTimer = 1.6 + Math.random() * 1.2
  }
  state.pickups = state.pickups.filter((star) => {
    star.x += star.vx * dt
    if (distance(player, star) < player.size + star.size) {
      state.resources += star.value ?? 30
      addText(state, star.x, star.y, `+${star.value ?? 30}`, '#fde68a')
      return false
    }
    return star.x > -30
  })
  if (state.distance >= state.milestone + 500) {
    state.milestone += 500
    addText(state, player.x + 60, player.y - 40, `${state.milestone}m`, '#86efac')
  }
  state.score = Math.floor(state.distance) + state.resources
  if (state.distance > 1800) winArcade(state, 'Clean flight')
}

export function updateMotherload(state: ArcadeState, dt: number): void {
  const player = state.player
  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  player.x = clamp(player.x + dx * 150 * dt, 24, WIDTH - 24)
  player.y = clamp(player.y + dy * 130 * dt, 70, 100 + MINE_DEPTH - 14)
  const moving = dx !== 0 || dy !== 0
  state.fuel -= (moving ? Math.abs(dx) + Math.abs(dy) * 1.3 : 0.15) * 4 * dt
  state.depth = Math.max(state.depth, player.y - 100)
  state.cameraY = clamp(player.y - HEIGHT * 0.45, 0, 100 + MINE_DEPTH - HEIGHT)
  if (player.y <= 78) {
    state.fuel = Math.min(100, state.fuel + 42 * dt)
    if (state.cargo > 0) {
      state.resources += state.cargo
      addText(state, player.x, player.y - 28, `Bank +${state.cargo}`, '#86efac')
      state.cargo = 0
    }
    if (state.fuel > 40) state.milestone = 0
  }
  for (const ore of state.obstacles) {
    if (distance(player, ore) < player.size + ore.size) {
      const value = ore.value ?? 10
      if (state.cargo + value <= CARGO_CAP) {
        state.cargo += value
        addText(state, ore.x, ore.y, `+${value}`, ore.kind === 'gem' ? '#67e8f9' : '#fb923c')
        Object.assign(ore, makeOre(state, Math.max(150, ore.y - 60), Math.min(100 + MINE_DEPTH - 20, ore.y + 60)))
      }
    }
  }
  if (state.fuel < 25 && state.fuel > 0 && state.milestone === 0) {
    state.milestone = 1
    addText(state, player.x, player.y - 34, 'Low fuel!', '#fca5a5')
  }
  state.score = state.resources * 2 + Math.floor(state.depth * 0.6)
  state.distance = state.depth
  if (state.fuel <= 0) loseArcade(state, 'Out of fuel')
  if (state.resources >= MOTHERLOAD_GOAL) winArcade(state, 'Motherlode found')
}

function drawGame(ctx: CanvasRenderingContext2D, state: GameState, best: number): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
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
  ctx.setLineDash([16, 18]); ctx.strokeStyle = 'rgba(148, 221, 255, 0.24)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([])

  for (const tower of state.towers) {
    const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
    ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2); ctx.fillStyle = `${def.color}12`; ctx.fill(); ctx.strokeStyle = `${def.color}44`; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 18, 0, Math.PI * 2); ctx.fillStyle = '#0f1720'; ctx.fill(); ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.stroke()
    ctx.fillStyle = def.color; ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${tower.kind === 'dart' ? 'D' : tower.kind === 'frost' ? 'F' : 'S'}${tower.level > 1 ? tower.level : ''}`, tower.x, tower.y)
  }

  for (const projectile of state.projectiles) {
    ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.splash ? 5 : 4, 0, Math.PI * 2); ctx.fillStyle = projectile.color; ctx.shadowColor = projectile.color; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0
  }

  for (const balloon of state.balloons) {
    const pos = pointAtProgress(balloon.progress)
    const radius = 13 + Math.min(8, balloon.maxHp * 1.2)
    ctx.beginPath(); ctx.ellipse(pos.x, pos.y, radius * 0.82, radius, 0, 0, Math.PI * 2); ctx.fillStyle = balloon.slowUntil > 0 ? '#bfdbfe' : balloon.color; ctx.fill(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y + radius); ctx.lineTo(pos.x - 5, pos.y + radius + 9); ctx.lineTo(pos.x + 5, pos.y + radius + 9); ctx.closePath(); ctx.fillStyle = balloon.slowUntil > 0 ? '#93c5fd' : balloon.color; ctx.fill()
    if (balloon.hp < balloon.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'; ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32, 4)
      ctx.fillStyle = '#86efac'; ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32 * (balloon.hp / balloon.maxHp), 4)
    }
  }

  drawTexts(ctx, state.texts)
  if (state.phase !== 'running') {
    const title = state.phase === 'won' ? 'Defense Perfect' : state.phase === 'lost' ? 'Core Breached' : 'Balloon TD Arena'
    const subtitle = state.phase === 'ready' ? 'Place RGB towers, pop waves, protect the desktop core.' : `Wave ${state.wave}/${MAX_WAVE}`
    const footer = state.phase === 'ready' ? (best > 0 ? `Best ★${best}` : '') : `Score ★${state.score} · Best ★${best} — Press Start to play again`
    drawOverlay(ctx, title, subtitle, footer)
  }
}

export function tickGame(state: GameState, dt: number): void {
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
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
    balloon.progress += balloon.speed * slowFactor * dt
    balloon.slowUntil = Math.max(0, balloon.slowUntil - dt)
  }
  const escaped = state.balloons.filter((balloon) => balloon.progress >= 1)
  if (escaped.length > 0) {
    state.lives -= escaped.length
    state.balloons = state.balloons.filter((balloon) => balloon.progress < 1)
  }
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt)
    if (tower.cooldown > 0) continue
    const target = nearestTarget(tower, state.balloons)
    if (!target) continue
    const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
    state.projectiles.push({ id: state.nextId++, x: tower.x, y: tower.y, targetId: target.id, speed: tower.kind === 'storm' ? 420 : 520, damage: tower.damage, color: def.color, slow: tower.kind === 'frost', splash: tower.kind === 'storm' })
    tower.cooldown = tower.fireRate
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
      for (const balloon of hitBalloons) {
        balloon.hp -= projectile.damage
        if (projectile.slow) balloon.slowUntil = 1.5
      }
      addText(state, targetPos.x, targetPos.y - 12, projectile.splash ? 'ARC' : `-${projectile.damage}`, projectile.color)
    } else {
      projectile.x += (dx / dist) * step
      projectile.y += (dy / dist) * step
      remainingProjectiles.push(projectile)
    }
  }
  state.projectiles = remainingProjectiles
  const popped = state.balloons.filter((balloon) => balloon.hp <= 0)
  if (popped.length > 0) {
    for (const balloon of popped) {
      const pos = pointAtProgress(balloon.progress)
      state.coins += balloon.reward
      state.score += balloon.reward * 5
      addText(state, pos.x, pos.y, `+${balloon.reward}`, '#86efac')
    }
    state.balloons = state.balloons.filter((balloon) => balloon.hp > 0)
  }
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'lost'
    return
  }
  if (state.wave >= MAX_WAVE && state.waveQueue === 0 && state.balloons.length === 0) {
    state.phase = 'won'
    return
  }
  if (state.waveQueue === 0 && state.balloons.length === 0 && state.wave < MAX_WAVE) {
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

function drawArcade(ctx: CanvasRenderingContext2D, state: ArcadeState, id: ArcadeGameId, def: GameDefinition, best: number): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  drawPanelBackground(ctx, '#08111a', '#171225')
  ctx.save()
  switch (id) {
    case 'helicopter': drawHelicopter(ctx, state); break
    case 'motherload': drawMotherload(ctx, state); break
  }
  ctx.restore()
  drawTexts(ctx, state.texts)
  drawHud(ctx, state, def)
  if (state.phase !== 'running') {
    const title = state.phase === 'won' || state.phase === 'lost' ? state.message : def.title
    const subtitle = state.phase === 'ready' ? def.controls : 'Run complete'
    const footer = state.phase === 'ready' ? (best > 0 ? `Best ★${best}` : '') : `Score ★${Math.floor(state.score)} · Best ★${best} — Press Start to play again`
    drawOverlay(ctx, title, subtitle, footer)
  }
}

function drawHud(ctx: CanvasRenderingContext2D, state: ArcadeState, def: GameDefinition): void {
  ctx.fillStyle = 'rgba(2, 6, 12, 0.62)'
  ctx.fillRect(14, 14, 270, 40)
  ctx.strokeStyle = `${def.accent}88`
  ctx.strokeRect(14, 14, 270, 40)
  ctx.fillStyle = '#e5f6ff'
  ctx.font = '800 13px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${def.title}  ★ ${Math.floor(state.score)}`, 28, 35)
}

function drawHelicopter(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#052e16'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (const column of state.obstacles) {
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(column.x - 22, 0, 44, column.y - column.size)
    ctx.fillRect(column.x - 22, column.y + column.size, 44, HEIGHT)
    ctx.fillStyle = 'rgba(190, 255, 205, 0.55)'
    ctx.fillRect(column.x - 22, column.y - column.size - 5, 44, 5)
    ctx.fillRect(column.x - 22, column.y + column.size, 44, 5)
  }
  for (const star of state.pickups) {
    ctx.save()
    ctx.translate(star.x, star.y)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(-star.size * 0.7, -star.size * 0.7, star.size * 1.4, star.size * 1.4)
    ctx.restore()
  }
  const p = state.player
  if (state.invuln > 0 && Math.floor(state.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35
  ctx.fillStyle = '#fde68a'; ctx.fillRect(p.x - 20, p.y - 8, 38, 17); ctx.fillStyle = '#f97316'; ctx.fillRect(p.x + 18, p.y - 3, 14, 6); ctx.strokeStyle = '#fef3c7'; ctx.beginPath(); ctx.moveTo(p.x - 26, p.y - 13); ctx.lineTo(p.x + 14, p.y - 13); ctx.stroke()
  ctx.globalAlpha = 1
  for (let i = 0; i < state.lives; i++) {
    ctx.beginPath(); ctx.arc(WIDTH - 28 - i * 20, 30, 6, 0, Math.PI * 2); ctx.fillStyle = '#f87171'; ctx.fill()
  }
}

const MINE_STRATA = ['#7c4a1e', '#6b3f16', '#5a3410', '#4a2b0c', '#3a2209', '#2c1a07']

function drawMotherload(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, WIDTH, 100)
  ctx.save()
  ctx.translate(0, -state.cameraY)
  const bandHeight = MINE_DEPTH / MINE_STRATA.length
  for (let index = 0; index < MINE_STRATA.length; index++) {
    ctx.fillStyle = MINE_STRATA[index]
    ctx.fillRect(0, 100 + index * bandHeight, WIDTH, bandHeight + 2)
  }
  const viewTop = state.cameraY
  const viewBottom = state.cameraY + HEIGHT
  for (let y = Math.max(140, Math.ceil(viewTop / 50) * 50); y < Math.min(100 + MINE_DEPTH, viewBottom); y += 50) {
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.18)'
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke()
  }
  for (const ore of state.obstacles) {
    if (ore.y < viewTop - 20 || ore.y > viewBottom + 20) continue
    ctx.fillStyle = ore.kind === 'gem' ? '#67e8f9' : '#fb923c'
    if (ore.kind === 'gem') {
      ctx.shadowColor = '#67e8f9'
      ctx.shadowBlur = 8
    }
    ctx.beginPath(); ctx.arc(ore.x, ore.y, ore.size, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }
  const p = state.player
  ctx.fillStyle = '#eab308'; ctx.fillRect(p.x - 17, p.y - 14, 34, 28); ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 20); ctx.lineTo(p.x - 12, p.y + 4); ctx.lineTo(p.x + 12, p.y + 4); ctx.fill()
  ctx.restore()
  ctx.fillStyle = state.fuel < 25 ? '#ef4444' : '#22c55e'
  ctx.fillRect(24, 70, state.fuel * 2, 8)
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(24, 86, (state.cargo / CARGO_CAP) * 120, 6)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 10px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('FUEL', 24, 64)
  ctx.fillText('ORE', 24, 102)
  ctx.textAlign = 'right'
  ctx.font = '700 14px Inter, sans-serif'
  ctx.fillStyle = '#e5f6ff'
  ctx.fillText(`${Math.floor(state.depth)}m`, WIDTH - 24, 40)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '600 11px Inter, sans-serif'
  ctx.fillText(`Banked ${state.resources}/${MOTHERLOAD_GOAL}`, WIDTH - 24, 58)
}

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tdStateRef = useRef<GameState>(initialState())
  const arcadeStatesRef = useRef<Record<ArcadeGameId, ArcadeState>>(createArcadeStateMap())
  const arcadeRef = useRef<ArcadeState>(arcadeStatesRef.current.helicopter)
  const bestRef = useRef<Record<GameId, number>>({
    balloon: readBest('balloon'),
    helicopter: readBest('helicopter'),
    motherload: readBest('motherload'),
  })
  const [activeGame, setActiveGame] = useState<GameId>('balloon')
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [tdSpeed, setTdSpeed] = useState<1 | 2>(1)
  const [tdSnapshot, setTdSnapshot] = useState<GameState>(() => ({ ...tdStateRef.current }))
  const [arcadeSnapshot, setArcadeSnapshot] = useState<ArcadeState>(() => ({ ...arcadeRef.current, keys: new Set() }))

  const activeDefinition = useMemo(() => GAME_DEFINITIONS.find((game) => game.id === activeGame) ?? GAME_DEFINITIONS[0], [activeGame])
  const isBalloon = activeGame === 'balloon'

  const publishSnapshot = useCallback(() => {
    setTdSnapshot({ ...tdStateRef.current, towers: [...tdStateRef.current.towers], balloons: [...tdStateRef.current.balloons] })
    setArcadeSnapshot({ ...arcadeRef.current, keys: new Set(arcadeRef.current.keys), obstacles: [...arcadeRef.current.obstacles], pickups: [...arcadeRef.current.pickups] })
  }, [])

  useEffect(() => {
    if (activeGame !== 'balloon') arcadeRef.current = arcadeStatesRef.current[activeGame]
    publishSnapshot()
  }, [activeGame, publishSnapshot])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = WIDTH
    canvas.height = HEIGHT
    let frame = 0
    let last = performance.now()
    let snapshotTimer = 0
    let lastPhase: GamePhase = activeGame === 'balloon' ? tdStateRef.current.phase : arcadeRef.current.phase
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let phase: GamePhase
      if (activeGame === 'balloon') {
        tickGame(tdStateRef.current, dt * tdSpeed)
        phase = tdStateRef.current.phase
        drawGame(ctx, tdStateRef.current, bestRef.current.balloon)
      } else {
        updateArcade(arcadeRef.current, activeGame, dt)
        phase = arcadeRef.current.phase
        drawArcade(ctx, arcadeRef.current, activeGame, activeDefinition, bestRef.current[activeGame])
      }
      if ((phase === 'won' || phase === 'lost') && lastPhase !== phase) {
        const finalScore = activeGame === 'balloon' ? tdStateRef.current.score : arcadeRef.current.score
        if (finalScore > bestRef.current[activeGame]) {
          bestRef.current[activeGame] = finalScore
          writeBest(activeGame, finalScore)
          addText(activeGame === 'balloon' ? tdStateRef.current : arcadeRef.current, WIDTH / 2, HEIGHT / 2 + 96, 'NEW BEST!', '#fde68a')
        }
      }
      lastPhase = phase
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        publishSnapshot()
        snapshotTimer = 0
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [activeDefinition, activeGame, publishSnapshot, tdSpeed])

  useEffect(() => {
    const normalizeKey = (event: KeyboardEvent) => event.code === 'Space' ? 'space' : event.key.toLowerCase()
    const down = (event: KeyboardEvent) => {
      const normalized = normalizeKey(event)
      if (GAME_KEYS.has(normalized) && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault()
      arcadeRef.current.keys.add(normalized)
    }
    const up = (event: KeyboardEvent) => {
      arcadeRef.current.keys.delete(normalizeKey(event))
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const startOrNextWave = useCallback(() => {
    if (activeGame !== 'balloon') {
      const arcade = arcadeRef.current
      if (arcade.phase === 'won' || arcade.phase === 'lost') {
        arcadeStatesRef.current[activeGame] = createArcadeState(activeGame)
        arcadeRef.current = arcadeStatesRef.current[activeGame]
      }
      startArcade(arcadeRef.current)
      publishSnapshot()
      return
    }
    if (tdStateRef.current.phase === 'won' || tdStateRef.current.phase === 'lost') {
      tdStateRef.current = initialState()
    }
    const state = tdStateRef.current
    if (state.phase === 'ready') {
      state.phase = 'running'
      if (state.wave === 0) launchWave(state)
    } else if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0 && state.wave < MAX_WAVE) {
      const bonus = Math.max(0, Math.round(state.waveCooldown * 4))
      if (bonus > 0) {
        state.coins += bonus
        addText(state, WIDTH / 2, 96, `Early +${bonus}`, '#fde68a')
      }
      launchWave(state)
    }
    publishSnapshot()
  }, [activeGame, publishSnapshot])

  const restart = useCallback(() => {
    if (activeGame === 'balloon') tdStateRef.current = initialState()
    else {
      arcadeStatesRef.current[activeGame] = createArcadeState(activeGame)
      arcadeRef.current = arcadeStatesRef.current[activeGame]
    }
    publishSnapshot()
  }, [activeGame, publishSnapshot])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
    if (activeGame !== 'balloon') {
      arcadeRef.current.mouse = point
      return
    }
    const state = tdStateRef.current
    const tower = state.towers.find((item) => distance(item, point) < 22)
    if (tower) {
      if (tower.level >= TOWER_MAX_LEVEL) addText(state, tower.x, tower.y - 26, 'Max level', '#9fb7c1')
      else if (upgradeTower(state, tower)) addText(state, tower.x, tower.y - 26, `Lv${tower.level}`, '#86efac')
      else addText(state, tower.x, tower.y - 26, 'Need coins', '#fca5a5')
      publishSnapshot()
      return
    }
    const def = TOWER_DEFINITIONS.find((item) => item.kind === selectedTower) ?? TOWER_DEFINITIONS[0]
    if (state.coins < def.cost) {
      addText(state, point.x, point.y, 'Need coins', '#fca5a5')
      publishSnapshot()
      return
    }
    if (distanceToPath(point) < 42 || state.towers.some((item) => distance(item, point) < 44)) {
      addText(state, point.x, point.y, 'Blocked', '#fca5a5')
      publishSnapshot()
      return
    }
    state.coins -= def.cost
    state.towers.push({ id: state.nextId++, kind: def.kind, level: 1, x: point.x, y: point.y, range: def.range, cooldown: 0, fireRate: def.fireRate, damage: def.damage })
    if (state.phase === 'ready') state.phase = 'running'
    if (state.wave === 0) launchWave(state)
    publishSnapshot()
  }, [activeGame, publishSnapshot, selectedTower])

  const handleMouse = useCallback((event: MouseEvent<HTMLCanvasElement>, down?: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    arcadeRef.current.mouse = { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT }
    if (typeof down === 'boolean') arcadeRef.current.mouseDown = down
  }, [])

  const phaseLabel = isBalloon
    ? tdSnapshot.phase === 'won' ? t('games.statusWon') : tdSnapshot.phase === 'lost' ? t('games.statusLost') : tdSnapshot.phase === 'ready' ? t('games.statusReady') : t('games.statusRunning')
    : arcadeSnapshot.phase === 'won' ? t('games.statusWon') : arcadeSnapshot.phase === 'lost' ? t('games.statusLost') : arcadeSnapshot.phase === 'ready' ? t('games.statusReady') : t('games.statusRunning')
  const statusAria = t('games.ariaStatus').replace('{value}', phaseLabel)
  const waveAria = t('games.ariaWave').replace('{current}', String(tdSnapshot.wave)).replace('{max}', String(MAX_WAVE))
  const lives = isBalloon ? tdSnapshot.lives : arcadeSnapshot.lives
  const score = isBalloon ? tdSnapshot.score : arcadeSnapshot.score
  const currency = isBalloon ? tdSnapshot.coins : Math.floor(activeGame === 'motherload' ? arcadeSnapshot.fuel : arcadeSnapshot.resources)
  const livesAria = t('games.ariaLives').replace('{value}', String(lives))
  const coinsAria = t('games.ariaCoins').replace('{value}', String(currency))
  const scoreAria = t('games.ariaScore').replace('{value}', String(score))

  return (
    <div className="games-view">
      <header className="workspace-header games-header">
        <div>
          <p className="eyebrow">{t('games.eyebrow')}</p>
          <h2>{t('games.title')}</h2>
        </div>
        <div className="games-header-actions">
          {isBalloon ? (
            <button className="aspect-lock-btn" type="button" aria-label={t('games.speed')} title={t('games.speed')} onClick={() => setTdSpeed((speed) => (speed === 1 ? 2 : 1))}>
              <Zap aria-hidden="true" size={13} />
              {tdSpeed}×
            </button>
          ) : null}
          <button className="aspect-lock-btn" type="button" onClick={startOrNextWave}>
            <Play size={13} />
            {isBalloon && tdSnapshot.wave > 0 ? t('games.nextWave') : t('games.start')}
          </button>
          <button className="aspect-lock-btn" type="button" onClick={restart}>
            <RotateCcw size={13} />
            {t('games.restart')}
          </button>
        </div>
      </header>

      <section className="games-hero panel">
        <div>
          <p className="eyebrow">{t('games.featured')}</p>
          <h3>{activeDefinition.title}</h3>
          <p>{activeDefinition.summary}</p>
        </div>
        <div className="games-stat-grid" role="list">
          <span aria-label={statusAria} role="listitem" title={statusAria}><Shield aria-hidden="true" size={15} />{phaseLabel}</span>
          <span aria-label={isBalloon ? waveAria : activeDefinition.classic} role="listitem" title={isBalloon ? waveAria : activeDefinition.classic}><Zap aria-hidden="true" size={15} />{isBalloon ? `${t('games.wave')} ${tdSnapshot.wave}/${MAX_WAVE}` : activeDefinition.classic}</span>
          <span aria-label={livesAria} role="listitem" title={livesAria}><Heart aria-hidden="true" size={15} />{lives}</span>
          <span aria-label={coinsAria} role="listitem" title={coinsAria}><span aria-hidden="true">◎</span> {currency}</span>
          <span aria-label={scoreAria} role="listitem" title={scoreAria}><span aria-hidden="true">★</span> {score}</span>
        </div>
      </section>

      <div className="games-layout">
        <section className="games-canvas-panel panel">
          <canvas
            ref={canvasRef}
            className="games-canvas"
            onClick={handleCanvasClick}
            onMouseDown={(event) => handleMouse(event, true)}
            onMouseLeave={(event) => handleMouse(event, false)}
            onMouseMove={(event) => handleMouse(event)}
            onMouseUp={(event) => handleMouse(event, false)}
            aria-label={`${activeDefinition.title} game board`}
          />
        </section>
        <aside className="games-control-panel panel">
          <h3>{t('games.libraryTitle')}</h3>
          <div className="game-card-list">
            {GAME_DEFINITIONS.map((game) => (
              <button
                className={`game-card ${activeGame === game.id ? 'selected' : ''}`}
                key={game.id}
                style={{ '--game-accent': game.accent } as CSSProperties}
                type="button"
                onClick={() => setActiveGame(game.id)}
              >
                <span className="tower-orb" style={{ background: game.accent }}><Gamepad2 aria-hidden="true" size={15} /></span>
                <span>
                  <strong>{game.title}</strong>
                  <small>{game.summary}</small>
                </span>
              </button>
            ))}
          </div>
          {isBalloon ? (
            <>
              <h3>{t('games.towers')}</h3>
              <p className="games-help">{t('games.help')}</p>
              <div className="tower-card-list">
                {TOWER_DEFINITIONS.map((tower) => (
                  <button className={`tower-card ${selectedTower === tower.kind ? 'selected' : ''}`} key={tower.kind} type="button" aria-label={t('games.ariaTower').replace('{name}', tower.label).replace('{cost}', String(tower.cost))} onClick={() => setSelectedTower(tower.kind)}>
                    <span className="tower-orb" style={{ background: tower.color }}><Crosshair aria-hidden="true" size={15} /></span>
                    <span><strong>{tower.label}</strong><small>{tower.description}</small></span>
                    <b>◎{tower.cost}</b>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="games-rules">
              <strong>{t('games.controlsTitle')}</strong>
              <p>{activeDefinition.controls}</p>
            </div>
          )}
          <div className="games-rules">
            <strong>{t('games.rulesTitle')}</strong>
            <ul>
              <li>{isBalloon ? t('games.rulePlace') : t('games.ruleChoose')}</li>
              <li>{isBalloon ? t('games.ruleEarn') : t('games.ruleLocal')}</li>
              <li>{isBalloon ? t('games.ruleWin') : t('games.ruleRestart')}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
