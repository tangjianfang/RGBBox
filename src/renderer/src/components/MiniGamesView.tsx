import { Crosshair, Gamepad2, Heart, Play, RotateCcw, Shield, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type MouseEvent } from 'react'
import { useI18n } from '../i18n'

type GamePhase = 'ready' | 'running' | 'won' | 'lost'
type TowerKind = 'dart' | 'frost' | 'storm'
type GameId = 'balloon' | 'fancy' | 'lineRider' | 'helicopter' | 'clubPenguin' | 'run' | 'ageOfWar' | 'boxhead' | 'motherload' | 'qwop'
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

interface Tower extends Point {
  id: number
  kind: TowerKind
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

interface TextContainer {
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

interface RiderLine {
  start: Point
  end: Point
}

interface ArcadeState {
  phase: GamePhase
  score: number
  lives: number
  time: number
  nextId: number
  player: ArcadeEntity
  camera: number
  distance: number
  energy: number
  fuel: number
  resources: number
  era: number
  gravitySide: number
  mouseDown: boolean
  mouse: Point
  keys: Set<string>
  lines: RiderLine[]
  trail: Point[]
  obstacles: ArcadeEntity[]
  enemies: ArcadeEntity[]
  bullets: ArcadeEntity[]
  texts: FloatingText[]
  playerBase: number
  enemyBase: number
  spawnTimer: number
  actionTimer: number
  message: string
}

const WIDTH = 900
const HEIGHT = 520
const MAX_WAVE = 12
const ARCADE_GROUND_Y = 420
const GRAVITY_ROTATION_COOLDOWN = 0.16

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
  { id: 'fancy', title: 'The Fancy Pants Adventures', summary: 'A hand-drawn parkour sprint with momentum, wall hops, and spiral pickups.', controls: 'A/D or ←/→ run, Space jump. Keep speed and collect curls.', classic: 'Classic index ★★★★★', accent: '#f59e0b' },
  { id: 'lineRider', title: 'Line Rider', summary: 'Draw rails, then send a tiny sled rider through your sketch.', controls: 'Click to place rail points, Start to ride, Restart to redraw.', classic: 'Classic index ★★★★★', accent: '#e5e7eb' },
  { id: 'helicopter', title: 'Helicopter Game', summary: 'Hold to climb, release to dive, and thread neon cave gaps.', controls: 'Hold mouse or Space to rise. Release to descend.', classic: 'Classic index ★★★★★', accent: '#22c55e' },
  { id: 'clubPenguin', title: 'Club Penguin', summary: 'Waddle through a cozy plaza, collect fish, and dodge rolling snowballs.', controls: 'WASD or arrows move. Gather fish for community points.', classic: 'Classic index ★★★★★', accent: '#60a5fa' },
  { id: 'run', title: 'Run', summary: 'Dash through a rotating space tunnel where gravity flips around the track.', controls: 'A/D rotate gravity, Space jump, avoid missing tiles.', classic: 'Classic index ★★★★★', accent: '#a78bfa' },
  { id: 'ageOfWar', title: 'Age of War', summary: 'Spawn lane fighters, earn XP, and evolve from stone age to laser future.', controls: 'Click the battlefield or press Space to train units.', classic: 'Classic index ★★★★★', accent: '#fb7185' },
  { id: 'boxhead', title: 'Boxhead', summary: 'Top-down zombie survival with crisp movement and rapid blaster shots.', controls: 'WASD move, click or Space shoot toward the cursor.', classic: 'Classic index ★★★★★', accent: '#ef4444' },
  { id: 'motherload', title: 'Motherload', summary: 'Drill underground, collect ore, return to the surface before fuel runs dry.', controls: 'Arrows dig and steer. Surface refuels and banks ore.', classic: 'Classic index ★★★★★', accent: '#f97316' },
  { id: 'qwop', title: 'QWOP', summary: 'Coordinate awkward runner limbs and try to move without face-planting.', controls: 'Q/W swing thighs, O/P drive calves. Balance is the challenge.', classic: 'Classic index ★★★★★', accent: '#38bdf8' },
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

function distanceToPath(point: Point): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < PATH.length - 1; i++) min = Math.min(min, distanceToSegment(point, PATH[i], PATH[i + 1]))
  return min
}

function initialState(): GameState {
  return {
    phase: 'ready',
    wave: 0,
    lives: 20,
    coins: 220,
    score: 0,
    nextId: 1,
    waveQueue: 0,
    spawnTimer: 0,
    waveCooldown: 0,
    balloons: [],
    towers: [],
    projectiles: [],
    texts: [],
  }
}

function createArcadeState(id: ArcadeGameId): ArcadeState {
  const player: ArcadeEntity = { id: 1, x: 150, y: 320, vx: 0, vy: 0, size: 18, hp: 5 }
  const base: ArcadeState = {
    phase: 'ready',
    score: 0,
    lives: 3,
    time: 0,
    nextId: 2,
    player,
    camera: 0,
    distance: 0,
    energy: 0,
    fuel: 100,
    resources: 45,
    era: 0,
    gravitySide: 2,
    mouseDown: false,
    mouse: { x: WIDTH / 2, y: HEIGHT / 2 },
    keys: new Set<string>(),
    lines: [],
    trail: [],
    obstacles: [],
    enemies: [],
    bullets: [],
    texts: [],
    playerBase: 120,
    enemyBase: 120,
    spawnTimer: 0.8,
    actionTimer: 0,
    message: 'Press Start',
  }

  if (id === 'lineRider') {
    base.lines = [
      { start: { x: 80, y: 210 }, end: { x: 260, y: 260 } },
      { start: { x: 260, y: 260 }, end: { x: 430, y: 235 } },
      { start: { x: 430, y: 235 }, end: { x: 690, y: 330 } },
    ]
    base.player = { ...player, x: 86, y: 180, size: 12 }
    base.message = 'Draw rails before starting'
  }
  if (id === 'helicopter') {
    base.player = { ...player, x: 150, y: HEIGHT / 2, size: 16 }
    base.lives = 1
    base.obstacles = Array.from({ length: 7 }, (_, index) => makeCaveColumn(base, 360 + index * 150))
  }
  if (id === 'clubPenguin') {
    base.player = { ...player, x: WIDTH / 2, y: HEIGHT / 2, size: 20 }
    base.obstacles = Array.from({ length: 10 }, () => makeCollectible(base, 'fish'))
    base.enemies = Array.from({ length: 5 }, () => makeSnowball(base))
  }
  if (id === 'run') {
    base.player = { ...player, x: WIDTH / 2, y: HEIGHT / 2 + 120, size: 16 }
    base.lives = 1
  }
  if (id === 'ageOfWar') {
    base.resources = 65
    base.playerBase = 140
    base.enemyBase = 140
    base.spawnTimer = 1.4
    base.message = 'Train units and evolve'
  }
  if (id === 'boxhead') {
    base.player = { ...player, x: WIDTH / 2, y: HEIGHT / 2, size: 17, hp: 6 }
    base.lives = 6
    base.spawnTimer = 0.4
  }
  if (id === 'motherload') {
    base.player = { ...player, x: WIDTH / 2, y: 82, size: 17 }
    base.fuel = 100
    base.resources = 0
    base.obstacles = Array.from({ length: 34 }, () => makeOre(base))
  }
  if (id === 'qwop') {
    base.player = { ...player, x: 170, y: ARCADE_GROUND_Y - 38, size: 18 }
    base.energy = 0.5
    base.lives = 1
    base.message = 'Coordinate Q W O P'
  }
  return base
}

function createArcadeStateMap(): Record<ArcadeGameId, ArcadeState> {
  return {
    fancy: createArcadeState('fancy'),
    lineRider: createArcadeState('lineRider'),
    helicopter: createArcadeState('helicopter'),
    clubPenguin: createArcadeState('clubPenguin'),
    run: createArcadeState('run'),
    ageOfWar: createArcadeState('ageOfWar'),
    boxhead: createArcadeState('boxhead'),
    motherload: createArcadeState('motherload'),
    qwop: createArcadeState('qwop'),
  }
}

function addText(state: TextContainer, x: number, y: number, text: string, color: string): void {
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
  state.waveCooldown = 0
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

function makeEntity(state: ArcadeState, x: number, y: number, vx: number, vy: number, size: number, kind?: string, value?: number): ArcadeEntity {
  return { id: state.nextId++, x, y, vx, vy, size, kind, value, hp: value }
}

function makeCaveColumn(state: ArcadeState, x: number): ArcadeEntity {
  return makeEntity(state, x, 130 + Math.random() * 230, -190, 0, 78 + Math.random() * 34, 'cave')
}

function makeCollectible(state: ArcadeState, kind: string): ArcadeEntity {
  return makeEntity(state, 54 + Math.random() * (WIDTH - 108), 86 + Math.random() * (HEIGHT - 150), 0, 0, 12, kind, 10)
}

function makeSnowball(state: ArcadeState): ArcadeEntity {
  const edge = Math.random() < 0.5 ? -24 : WIDTH + 24
  return makeEntity(state, edge, 70 + Math.random() * (HEIGHT - 130), edge < 0 ? 65 + Math.random() * 55 : -65 - Math.random() * 55, -20 + Math.random() * 40, 16, 'snow')
}

function makeOre(state: ArcadeState): ArcadeEntity {
  return makeEntity(state, 50 + Math.random() * (WIDTH - 100), 150 + Math.random() * 320, 0, 0, 14, Math.random() > 0.72 ? 'gem' : 'ore', Math.random() > 0.72 ? 25 : 10)
}

function key(state: ArcadeState, value: string): boolean {
  return state.keys.has(value.toLowerCase())
}

function startArcade(state: ArcadeState, id: ArcadeGameId): void {
  if (state.phase === 'won' || state.phase === 'lost') return
  state.phase = 'running'
  state.message = id === 'lineRider' ? 'Ride!' : 'Go!'
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
    case 'fancy':
      updateFancy(state, dt)
      break
    case 'lineRider':
      updateLineRider(state, dt)
      break
    case 'helicopter':
      updateHelicopter(state, dt)
      break
    case 'clubPenguin':
      updateClubPenguin(state, dt)
      break
    case 'run':
      updateRun(state, dt)
      break
    case 'ageOfWar':
      updateAgeOfWar(state, dt)
      break
    case 'boxhead':
      updateBoxhead(state, dt)
      break
    case 'motherload':
      updateMotherload(state, dt)
      break
    case 'qwop':
      updateQwop(state, dt)
      break
  }
}

function updateFancy(state: ArcadeState, dt: number): void {
  const player = state.player
  const run = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  player.vx = clamp(player.vx + run * 900 * dt, -330, 390)
  player.vx *= run === 0 ? 0.93 : 0.985
  player.vy += 980 * dt
  const ground = ARCADE_GROUND_Y + Math.sin((player.x + 80) / 95) * 32
  if ((key(state, ' ') || key(state, 'space')) && player.y >= ground - 2) player.vy = -475
  player.x += player.vx * dt
  player.y += player.vy * dt
  if (player.y > ground) {
    player.y = ground
    player.vy = 0
  }
  state.camera = Math.max(0, player.x - 250)
  state.distance = Math.max(state.distance, player.x - 150)
  if (state.obstacles.length < 16) {
    const x = state.camera + WIDTH + Math.random() * 900
    state.obstacles.push(makeEntity(state, x, ARCADE_GROUND_Y - 80 - Math.random() * 120, 0, 0, 13, 'curl', 18))
  }
  for (const item of state.obstacles) {
    if (distance(player, item) < player.size + item.size) {
      state.resources += 1
      addText(state, item.x - state.camera, item.y, '+curl', '#facc15')
      item.x = state.camera + WIDTH + Math.random() * 1000
      item.y = ARCADE_GROUND_Y - 80 - Math.random() * 150
    }
  }
  if (player.y > HEIGHT + 40) loseArcade(state, 'Ink spill!')
  if (state.distance > 2200) winArcade(state, 'Fancy finish!')
}

function updateLineRider(state: ArcadeState, dt: number): void {
  const player = state.player
  player.vy += 520 * dt
  player.x += player.vx * dt
  player.y += player.vy * dt
  for (const line of state.lines) {
    const near = distanceToSegment(player, line.start, line.end)
    if (near < player.size + 3 && player.vy >= -120) {
      const dx = line.end.x - line.start.x
      const dy = line.end.y - line.start.y
      const len = Math.hypot(dx, dy) || 1
      const tx = dx / len
      const ty = dy / len
      const speed = Math.max(90, player.vx * tx + player.vy * ty + 120 * Math.max(0.2, ty + 0.8))
      player.vx = tx * speed
      player.vy = ty * speed - 22
      const t = clamp(((player.x - line.start.x) * dx + (player.y - line.start.y) * dy) / (len * len), 0, 1)
      player.x = line.start.x + dx * t
      player.y = line.start.y + dy * t - player.size
    }
  }
  state.trail.push({ x: player.x, y: player.y })
  state.trail = state.trail.slice(-80)
  state.distance = Math.max(state.distance, player.x - 80)
  if (player.y > HEIGHT + 80 || player.x > WIDTH + 40) winArcade(state, 'Sketch complete')
}

function updateHelicopter(state: ArcadeState, dt: number): void {
  const player = state.player
  player.vy += (state.mouseDown || key(state, ' ') || key(state, 'space') ? -820 : 560) * dt
  player.vy = clamp(player.vy, -310, 330)
  player.y += player.vy * dt
  state.distance += 150 * dt
  for (const column of state.obstacles) {
    column.x += column.vx * dt
    if (column.x < -60) Object.assign(column, makeCaveColumn(state, WIDTH + 70))
    const gap = column.size
    if (Math.abs(player.x - column.x) < 28 && (player.y < column.y - gap || player.y > column.y + gap)) loseArcade(state, 'Cave crash')
  }
  if (player.y < 18 || player.y > HEIGHT - 18) loseArcade(state, 'Cave crash')
  if (state.distance > 1800) winArcade(state, 'Clean flight')
}

function updateClubPenguin(state: ArcadeState, dt: number): void {
  const player = state.player
  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  player.x = clamp(player.x + dx * 180 * dt, 28, WIDTH - 28)
  player.y = clamp(player.y + dy * 180 * dt, 56, HEIGHT - 28)
  for (const fish of state.obstacles) {
    if (distance(player, fish) < player.size + fish.size) {
      state.resources += 4
      addText(state, fish.x, fish.y, '+fish', '#bfdbfe')
      Object.assign(fish, makeCollectible(state, 'fish'))
    }
  }
  for (const snow of state.enemies) {
    snow.x += snow.vx * dt
    snow.y += snow.vy * dt
    if (snow.x < -40 || snow.x > WIDTH + 40 || snow.y < 40 || snow.y > HEIGHT + 20) Object.assign(snow, makeSnowball(state))
    if (distance(player, snow) < player.size + snow.size) {
      state.lives -= 1
      Object.assign(snow, makeSnowball(state))
      addText(state, player.x, player.y - 20, 'snow!', '#fca5a5')
      if (state.lives <= 0) loseArcade(state, 'Snowed in')
    }
  }
  state.distance = state.resources * 24
  if (state.resources >= 40) winArcade(state, 'Igloo party!')
}

function updateRun(state: ArcadeState, dt: number): void {
  const player = state.player
  state.actionTimer = Math.max(0, state.actionTimer - dt)
  if (state.actionTimer <= 0 && (key(state, 'arrowleft') || key(state, 'a'))) {
    state.gravitySide = (state.gravitySide + 3) % 4
    state.actionTimer = GRAVITY_ROTATION_COOLDOWN
  } else if (state.actionTimer <= 0 && (key(state, 'arrowright') || key(state, 'd'))) {
    state.gravitySide = (state.gravitySide + 1) % 4
    state.actionTimer = GRAVITY_ROTATION_COOLDOWN
  }
  const targetAngle = (state.gravitySide * Math.PI) / 2
  state.energy += (targetAngle - state.energy) * 5 * dt
  state.distance += 240 * dt
  const radius = 126 + Math.sin(state.distance / 180) * 18
  player.x = WIDTH / 2 + Math.cos(state.energy + Math.PI / 2) * radius
  player.y = HEIGHT / 2 + Math.sin(state.energy + Math.PI / 2) * radius
  const hazard = Math.sin(state.distance / 95 + state.gravitySide * 1.7)
  if (hazard > 0.94) loseArcade(state, 'Missed tile')
  if (state.distance > 2300) winArcade(state, 'Tunnel cleared')
}

function spawnAgeUnit(state: ArcadeState, friendly: boolean): void {
  const eraScale = 1 + state.era * 0.45
  const unit = makeEntity(state, friendly ? 74 : WIDTH - 74, 354, friendly ? 42 + state.era * 10 : -35 - state.era * 6, 0, 16, friendly ? 'ally' : 'enemy', 18 * eraScale)
  unit.hp = 24 * eraScale
  state.enemies.push(unit)
}

function updateAgeOfWar(state: ArcadeState, dt: number): void {
  state.resources += dt * (6 + state.era * 2)
  state.spawnTimer -= dt
  state.actionTimer = Math.max(0, state.actionTimer - dt)
  if (state.spawnTimer <= 0) {
    spawnAgeUnit(state, false)
    state.spawnTimer = Math.max(0.55, 1.9 - state.time * 0.02)
  }
  if ((key(state, ' ') || key(state, 'space')) && state.actionTimer <= 0 && state.resources >= 22) {
    state.resources -= 22
    state.actionTimer = 0.38
    spawnAgeUnit(state, true)
  }
  for (const unit of state.enemies) {
    unit.x += unit.vx * dt
    const foe = state.enemies.find((other) => other.kind !== unit.kind && distance(other, unit) < 34)
    if (foe) {
      unit.x -= unit.vx * dt
      foe.hp = (foe.hp ?? 0) - (9 + state.era * 2) * dt
    }
    if (unit.kind === 'ally' && unit.x > WIDTH - 54) {
      state.enemyBase -= 18 * dt
      unit.x = WIDTH - 55
    }
    if (unit.kind === 'enemy' && unit.x < 54) {
      state.playerBase -= 13 * dt
      unit.x = 55
    }
  }
  state.enemies = state.enemies.filter((unit) => (unit.hp ?? 1) > 0)
  if (state.resources > 120 && state.era < 4) {
    state.resources -= 90
    state.era += 1
    addText(state, WIDTH / 2, 130, `Era ${state.era + 1}`, '#fde68a')
  }
  state.distance = (140 - state.enemyBase) * 14 + state.era * 120
  if (state.playerBase <= 0) loseArcade(state, 'Base destroyed')
  if (state.enemyBase <= 0) winArcade(state, 'Future secured')
}

function updateBoxhead(state: ArcadeState, dt: number): void {
  const player = state.player
  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  player.x = clamp(player.x + dx * 210 * dt, 24, WIDTH - 24)
  player.y = clamp(player.y + dy * 210 * dt, 54, HEIGHT - 24)
  state.spawnTimer -= dt
  state.actionTimer = Math.max(0, state.actionTimer - dt)
  if (state.spawnTimer <= 0) {
    const side = Math.floor(Math.random() * 4)
    const x = side === 0 ? -30 : side === 1 ? WIDTH + 30 : Math.random() * WIDTH
    const y = side === 2 ? -30 : side === 3 ? HEIGHT + 30 : Math.random() * HEIGHT
    state.enemies.push(makeEntity(state, x, y, 0, 0, 17, 'zombie', 2))
    state.spawnTimer = Math.max(0.34, 1.1 - state.time * 0.015)
  }
  if ((key(state, ' ') || key(state, 'space')) && state.actionTimer <= 0) shootBoxhead(state, state.mouse)
  for (const zombie of state.enemies) {
    const dist = Math.max(1, distance(zombie, player))
    zombie.x += ((player.x - zombie.x) / dist) * (64 + state.time * 2) * dt
    zombie.y += ((player.y - zombie.y) / dist) * (64 + state.time * 2) * dt
    if (dist < player.size + zombie.size) {
      state.lives -= 1
      zombie.x = -80
      if (state.lives <= 0) loseArcade(state, 'Overrun')
    }
  }
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt
    bullet.y += bullet.vy * dt
    for (const zombie of state.enemies) {
      if (distance(bullet, zombie) < bullet.size + zombie.size) {
        zombie.hp = (zombie.hp ?? 1) - 1
        bullet.hp = 0
        if ((zombie.hp ?? 0) <= 0) {
          state.resources += 2
          addText(state, zombie.x, zombie.y, '+z', '#fca5a5')
        }
      }
    }
  }
  state.enemies = state.enemies.filter((zombie) => (zombie.hp ?? 1) > 0 && zombie.x > -100)
  state.bullets = state.bullets.filter((bullet) => (bullet.hp ?? 1) > 0 && bullet.x > -20 && bullet.x < WIDTH + 20 && bullet.y > -20 && bullet.y < HEIGHT + 20)
  state.distance = state.resources * 55
  if (state.resources >= 34) winArcade(state, 'Block cleared')
}

function shootBoxhead(state: ArcadeState, target: Point): void {
  const player = state.player
  const angle = Math.atan2(target.y - player.y, target.x - player.x)
  state.bullets.push(makeEntity(state, player.x, player.y, Math.cos(angle) * 520, Math.sin(angle) * 520, 5, 'bullet', 1))
  state.actionTimer = 0.18
}

function updateMotherload(state: ArcadeState, dt: number): void {
  const player = state.player
  const dx = (key(state, 'arrowright') || key(state, 'd') ? 1 : 0) - (key(state, 'arrowleft') || key(state, 'a') ? 1 : 0)
  const dy = (key(state, 'arrowdown') || key(state, 's') ? 1 : 0) - (key(state, 'arrowup') || key(state, 'w') ? 1 : 0)
  player.x = clamp(player.x + dx * 150 * dt, 24, WIDTH - 24)
  player.y = clamp(player.y + dy * 130 * dt, 70, HEIGHT - 26)
  state.fuel -= (Math.abs(dx) + Math.abs(dy) * 1.3) * dt * 4
  if (player.y <= 78) {
    state.fuel = Math.min(100, state.fuel + 42 * dt)
    state.distance = Math.max(state.distance, state.resources * 35)
  }
  for (const ore of state.obstacles) {
    if (distance(player, ore) < player.size + ore.size) {
      state.resources += ore.value ?? 10
      addText(state, ore.x, ore.y, ore.kind === 'gem' ? '+gem' : '+ore', ore.kind === 'gem' ? '#67e8f9' : '#fb923c')
      Object.assign(ore, makeOre(state))
    }
  }
  if (state.fuel <= 0) loseArcade(state, 'Out of fuel')
  if (state.resources >= 220) winArcade(state, 'Motherlode found')
}

function updateQwop(state: ArcadeState, dt: number): void {
  const player = state.player
  const drive = (key(state, 'q') ? 1 : 0) - (key(state, 'w') ? 1 : 0) + ((key(state, 'o') ? 1 : 0) - (key(state, 'p') ? 1 : 0)) * 0.8
  const balance = (key(state, 'q') || key(state, 'p') ? 1 : 0) - (key(state, 'w') || key(state, 'o') ? 1 : 0)
  player.vx = clamp(player.vx + drive * 145 * dt, -70, 155)
  player.x += player.vx * dt
  state.energy += balance * dt * 2.4 + player.vx * dt * 0.012
  player.vx *= 0.985
  state.distance = Math.max(state.distance, player.x - 170)
  if (Math.abs(state.energy) > 1.35 || player.vx < -62) loseArcade(state, 'Face plant')
  if (state.distance > 100) winArcade(state, '100m somehow')
}

function drawGame(ctx: CanvasRenderingContext2D, state: GameState): void {
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
    ctx.fillStyle = def.color; ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tower.kind === 'dart' ? 'D' : tower.kind === 'frost' ? 'F' : 'S', tower.x, tower.y)
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
  if (state.phase !== 'running') drawOverlay(ctx, state.phase === 'won' ? 'Defense Perfect' : state.phase === 'lost' ? 'Core Breached' : 'Balloon TD Arena', 'Place RGB towers, pop waves, protect the desktop core.')
}

function tickGame(state: GameState, dt: number): void {
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
  for (const text of state.texts) {
    text.y -= 28 * dt
    text.life -= dt
  }
  state.texts = state.texts.filter((text) => text.life > 0)
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'lost'
    return
  }
  if (state.wave >= MAX_WAVE && state.waveQueue === 0 && state.balloons.length === 0) {
    state.phase = 'won'
    return
  }
  if (state.waveQueue === 0 && state.balloons.length === 0) {
    state.waveCooldown += dt
    if (state.waveCooldown > 2.4) launchWave(state)
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

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, subtitle: string): void {
  ctx.fillStyle = 'rgba(5, 10, 14, 0.68)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#e2f8ff'
  ctx.font = '800 34px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 18)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '500 15px Inter, sans-serif'
  ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 + 18)
}

function drawArcade(ctx: CanvasRenderingContext2D, state: ArcadeState, id: ArcadeGameId, def: GameDefinition): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  drawPanelBackground(ctx, '#08111a', '#171225')
  ctx.save()
  switch (id) {
    case 'fancy': drawFancy(ctx, state); break
    case 'lineRider': drawLineRider(ctx, state); break
    case 'helicopter': drawHelicopter(ctx, state); break
    case 'clubPenguin': drawClubPenguin(ctx, state); break
    case 'run': drawRun(ctx, state); break
    case 'ageOfWar': drawAgeOfWar(ctx, state); break
    case 'boxhead': drawBoxhead(ctx, state); break
    case 'motherload': drawMotherload(ctx, state); break
    case 'qwop': drawQwop(ctx, state); break
  }
  ctx.restore()
  drawTexts(ctx, state.texts)
  drawHud(ctx, state, def)
  if (state.phase !== 'running') drawOverlay(ctx, state.phase === 'won' ? state.message : state.phase === 'lost' ? state.message : def.title, def.controls)
}

function drawHud(ctx: CanvasRenderingContext2D, state: ArcadeState, def: GameDefinition): void {
  ctx.fillStyle = 'rgba(2, 6, 12, 0.62)'
  ctx.fillRect(14, 14, 270, 40)
  ctx.strokeStyle = `${def.accent}88`
  ctx.strokeRect(14, 14, 270, 40)
  ctx.fillStyle = '#e5f6ff'
  ctx.font = '800 13px Inter, sans-serif'
  ctx.fillText(`${def.title}  ★ ${Math.floor(state.score)}`, 28, 39)
}

function drawFancy(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.translate(-state.camera, 0)
  ctx.strokeStyle = '#fef3c7'
  ctx.lineWidth = 4
  ctx.beginPath()
  for (let x = state.camera - 80; x < state.camera + WIDTH + 120; x += 20) {
    const y = ARCADE_GROUND_Y + Math.sin((x + 80) / 95) * 32
    if (x === state.camera - 80) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  for (const curl of state.obstacles) {
    ctx.beginPath(); ctx.arc(curl.x, curl.y, curl.size, 0, Math.PI * 1.7); ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke()
  }
  const p = state.player
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y - 24, 13, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x - 12, p.y + 10); ctx.lineTo(p.x + 18, p.y + 8); ctx.stroke()
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 18, p.y - 42, 36, 44)
}

function drawLineRider(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 3; ctx.lineCap = 'round'
  for (const line of state.lines) { ctx.beginPath(); ctx.moveTo(line.start.x, line.start.y); ctx.lineTo(line.end.x, line.end.y); ctx.stroke() }
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.beginPath(); state.trail.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)); ctx.stroke()
  const p = state.player
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(p.x - 22, p.y + 12, 44, 5)
}

function drawHelicopter(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#052e16'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (const column of state.obstacles) {
    ctx.fillStyle = '#22c55e'
    ctx.fillRect(column.x - 22, 0, 44, column.y - column.size)
    ctx.fillRect(column.x - 22, column.y + column.size, 44, HEIGHT)
  }
  const p = state.player
  ctx.fillStyle = '#fde68a'; ctx.fillRect(p.x - 20, p.y - 8, 38, 17); ctx.fillStyle = '#f97316'; ctx.fillRect(p.x + 18, p.y - 3, 14, 6); ctx.strokeStyle = '#fef3c7'; ctx.beginPath(); ctx.moveTo(p.x - 26, p.y - 13); ctx.lineTo(p.x + 14, p.y - 13); ctx.stroke()
}

function drawClubPenguin(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#dbeafe'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#93c5fd'; ctx.beginPath(); ctx.arc(160, 120, 75, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(620, 78, 150, 100)
  for (const fish of state.obstacles) { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.ellipse(fish.x, fish.y, 15, 7, 0, 0, Math.PI * 2); ctx.fill() }
  for (const snow of state.enemies) { ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(snow.x, snow.y, snow.size, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#bfdbfe'; ctx.stroke() }
  const p = state.player
  ctx.fillStyle = '#1d4ed8'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 18, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(p.x, p.y - 8, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(p.x - 7, p.y - 4); ctx.lineTo(p.x + 7, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.fill()
}

function drawRun(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.translate(WIDTH / 2, HEIGHT / 2)
  for (let i = 0; i < 10; i++) {
    const size = 290 - i * 22
    ctx.strokeStyle = i % 2 === 0 ? '#4c1d95' : '#7c3aed'
    ctx.lineWidth = 9
    ctx.strokeRect(-size / 2, -size / 2, size, size)
  }
  ctx.rotate(state.energy)
  ctx.fillStyle = '#020617'
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-42, 126, 84, 24) }
  ctx.rotate(-state.energy)
  ctx.translate(-WIDTH / 2, -HEIGHT / 2)
  const p = state.player
  ctx.fillStyle = '#e9d5ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill()
}

function drawAgeOfWar(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = ['#365314', '#854d0e', '#475569', '#1e3a8a', '#312e81'][state.era]; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#422006'; ctx.fillRect(0, 372, WIDTH, 60)
  ctx.fillStyle = '#60a5fa'; ctx.fillRect(22, 250, 56, 122); ctx.fillStyle = '#f87171'; ctx.fillRect(WIDTH - 78, 250, 56, 122)
  ctx.fillStyle = '#22c55e'; ctx.fillRect(22, 230, state.playerBase, 8); ctx.fillStyle = '#ef4444'; ctx.fillRect(WIDTH - 22 - state.enemyBase, 230, state.enemyBase, 8)
  for (const unit of state.enemies) { ctx.fillStyle = unit.kind === 'ally' ? '#bfdbfe' : '#fecaca'; ctx.fillRect(unit.x - 13, unit.y - 28, 26, 34); ctx.fillStyle = '#111827'; ctx.fillRect(unit.x - 16, unit.y - 35, 32 * ((unit.hp ?? 1) / Math.max(1, unit.value ?? 1)), 4) }
}

function drawBoxhead(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.strokeStyle = '#1f2937'; for (let x = 0; x < WIDTH; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke() }
  for (const bullet of state.bullets) { ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.size, 0, Math.PI * 2); ctx.fill() }
  for (const zombie of state.enemies) { ctx.fillStyle = '#16a34a'; ctx.fillRect(zombie.x - 14, zombie.y - 14, 28, 28); ctx.fillStyle = '#dcfce7'; ctx.fillRect(zombie.x - 5, zombie.y - 5, 4, 4); ctx.fillRect(zombie.x + 5, zombie.y - 5, 4, 4) }
  const p = state.player
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(p.x - 16, p.y - 16, 32, 32); ctx.fillStyle = '#ef4444'; ctx.fillRect(p.x + 8, p.y - 4, 20, 8)
}

function drawMotherload(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, WIDTH, 100); ctx.fillStyle = '#78350f'; ctx.fillRect(0, 100, WIDTH, HEIGHT - 100)
  for (let y = 140; y < HEIGHT; y += 50) { ctx.strokeStyle = 'rgba(251, 146, 60, 0.18)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke() }
  for (const ore of state.obstacles) { ctx.fillStyle = ore.kind === 'gem' ? '#67e8f9' : '#fb923c'; ctx.beginPath(); ctx.arc(ore.x, ore.y, ore.size, 0, Math.PI * 2); ctx.fill() }
  const p = state.player
  ctx.fillStyle = '#eab308'; ctx.fillRect(p.x - 17, p.y - 14, 34, 28); ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(p.x, p.y + 20); ctx.lineTo(p.x - 12, p.y + 4); ctx.lineTo(p.x + 12, p.y + 4); ctx.fill()
  ctx.fillStyle = '#22c55e'; ctx.fillRect(24, 70, state.fuel * 2, 8)
}

function drawQwop(ctx: CanvasRenderingContext2D, state: ArcadeState): void {
  ctx.fillStyle = '#e0f2fe'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.fillStyle = '#0f172a'; ctx.fillRect(0, ARCADE_GROUND_Y + 12, WIDTH, 8)
  const p = state.player
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(state.energy)
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -34, 11, 0, Math.PI * 2); ctx.moveTo(0, -22); ctx.lineTo(0, 8); ctx.moveTo(0, 8); ctx.lineTo(-18, 36); ctx.moveTo(0, 8); ctx.lineTo(22, 34); ctx.moveTo(0, -8); ctx.lineTo(-22, 8); ctx.moveTo(0, -8); ctx.lineTo(24, 7); ctx.stroke(); ctx.restore()
  ctx.fillStyle = '#0f172a'; ctx.font = '700 15px Inter, sans-serif'; ctx.fillText(`${Math.max(0, Math.floor(state.distance))}m`, 760, 44)
}

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tdStateRef = useRef<GameState>(initialState())
  const arcadeStatesRef = useRef<Record<ArcadeGameId, ArcadeState>>(createArcadeStateMap())
  const arcadeRef = useRef<ArcadeState>(arcadeStatesRef.current.fancy)
  const [activeGame, setActiveGame] = useState<GameId>('balloon')
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [tdSnapshot, setTdSnapshot] = useState<GameState>(() => ({ ...tdStateRef.current }))
  const [arcadeSnapshot, setArcadeSnapshot] = useState<ArcadeState>(() => ({ ...arcadeRef.current, keys: new Set() }))

  const activeDefinition = useMemo(() => GAME_DEFINITIONS.find((game) => game.id === activeGame) ?? GAME_DEFINITIONS[0], [activeGame])
  const isBalloon = activeGame === 'balloon'

  const publishSnapshot = useCallback(() => {
    setTdSnapshot({ ...tdStateRef.current, towers: [...tdStateRef.current.towers], balloons: [...tdStateRef.current.balloons] })
    setArcadeSnapshot({ ...arcadeRef.current, keys: new Set(arcadeRef.current.keys), obstacles: [...arcadeRef.current.obstacles], enemies: [...arcadeRef.current.enemies] })
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
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (activeGame === 'balloon') {
        tickGame(tdStateRef.current, dt)
        drawGame(ctx, tdStateRef.current)
      } else {
        updateArcade(arcadeRef.current, activeGame, dt)
        drawArcade(ctx, arcadeRef.current, activeGame, activeDefinition)
      }
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        publishSnapshot()
        snapshotTimer = 0
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [activeDefinition, activeGame, publishSnapshot])

  useEffect(() => {
    const normalizeKey = (event: KeyboardEvent) => event.code === 'Space' ? 'space' : event.key.toLowerCase()
    const down = (event: KeyboardEvent) => {
      arcadeRef.current.keys.add(normalizeKey(event))
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
      startArcade(arcadeRef.current, activeGame)
      publishSnapshot()
      return
    }
    const state = tdStateRef.current
    if (state.phase === 'ready') {
      state.phase = 'running'
      if (state.wave === 0) launchWave(state)
    } else if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0) {
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
      const arcade = arcadeRef.current
      arcade.mouse = point
      if (activeGame === 'lineRider' && arcade.phase !== 'running') {
        const last = arcade.lines.length > 0 ? arcade.lines[arcade.lines.length - 1].end : point
        if (distance(last, point) > 8) arcade.lines.push({ start: last, end: point })
      }
      if (activeGame === 'ageOfWar' && arcade.resources >= 22) {
        arcade.resources -= 22
        spawnAgeUnit(arcade, true)
      }
      if (activeGame === 'boxhead' && arcade.phase === 'running' && arcade.actionTimer <= 0) shootBoxhead(arcade, point)
      publishSnapshot()
      return
    }
    const def = TOWER_DEFINITIONS.find((item) => item.kind === selectedTower) ?? TOWER_DEFINITIONS[0]
    const state = tdStateRef.current
    if (state.coins < def.cost) {
      addText(state, point.x, point.y, 'Need coins', '#fca5a5')
      publishSnapshot()
      return
    }
    if (distanceToPath(point) < 42 || state.towers.some((tower) => distance(tower, point) < 44)) {
      addText(state, point.x, point.y, 'Blocked', '#fca5a5')
      publishSnapshot()
      return
    }
    state.coins -= def.cost
    state.towers.push({ id: state.nextId++, kind: def.kind, x: point.x, y: point.y, range: def.range, cooldown: 0, fireRate: def.fireRate, damage: def.damage })
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
