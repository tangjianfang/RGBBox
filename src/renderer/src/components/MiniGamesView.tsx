import { Crosshair, Heart, Play, RotateCcw, Shield, Trophy, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX, type MouseEvent } from 'react'
import { useI18n } from '../i18n'

type GamePhase = 'ready' | 'running' | 'won' | 'lost'
type TowerKind = 'dart' | 'frost' | 'storm'

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

interface GameState {
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

const WIDTH = 900
const HEIGHT = 520
const MAX_WAVE = 12
const AUTO_WAVE_SECONDS = 8
const TOWER_MAX_LEVEL = 3
const SELL_REFUND = 0.7
const BEST_KEY = 'rgbbox:gamesBest:balloon'

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

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readBest(): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const value = raw === null ? 0 : Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function writeBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(score)))
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
  }
}

function addText(state: GameState, x: number, y: number, text: string, color: string): void {
  state.texts.push({ id: state.nextId++, x, y, text, color, life: 0.9 })
}

function spawnBurst(state: GameState, x: number, y: number, color: string, count = 10, power = 130): void {
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
  state.banner = { text: `WAVE ${state.wave}`, life: 1.7 }
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
  tower.spent += cost
  tower.level += 1
  tower.damage = Math.max(1, Math.round(def.damage * (1 + 0.6 * (tower.level - 1))))
  tower.range = Math.round(def.range * (1 + 0.16 * (tower.level - 1)))
  tower.fireRate = def.fireRate / (1 + 0.22 * (tower.level - 1))
  return true
}

export function sellTower(state: GameState, tower: Tower): void {
  const refund = Math.round(tower.spent * SELL_REFUND)
  state.coins += refund
  state.towers = state.towers.filter((item) => item.id !== tower.id)
  spawnBurst(state, tower.x, tower.y, '#9fb7c1', 12, 100)
  addText(state, tower.x, tower.y - 20, `+${refund}`, '#86efac')
}

function makeProjectile(state: GameState, tower: Tower, target: Balloon, def: TowerDefinition): void {
  state.projectiles.push({ id: state.nextId++, x: tower.x, y: tower.y, targetId: target.id, speed: tower.kind === 'storm' ? 420 : 520, damage: tower.damage, color: def.color, slow: tower.kind === 'frost', splash: tower.kind === 'storm', lx: tower.x, ly: tower.y })
}

export function tickGame(state: GameState, dt: number): void {
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
    balloon.progress += balloon.speed * slowFactor * dt
    balloon.slowUntil = Math.max(0, balloon.slowUntil - dt)
  }
  const escaped = state.balloons.filter((balloon) => balloon.progress >= 1)
  if (escaped.length > 0) {
    state.lives -= escaped.length
    state.balloons = state.balloons.filter((balloon) => balloon.progress < 1)
    spawnBurst(state, 880, 328, '#f87171', 10, 150)
    state.shake = Math.min(7, 2.5 + escaped.length)
  }
  for (const tower of state.towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt)
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
      spawnBurst(state, targetPos.x, targetPos.y, projectile.color, 6, 90)
      addText(state, targetPos.x, targetPos.y - 12, projectile.splash ? 'ARC' : `-${projectile.damage}`, projectile.color)
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
    for (const balloon of popped) {
      const pos = pointAtProgress(balloon.progress)
      state.coins += balloon.reward
      state.score += balloon.reward * 5
      spawnBurst(state, pos.x, pos.y, balloon.color, 10, 140)
      addText(state, pos.x, pos.y, `+${balloon.reward}`, '#86efac')
    }
    state.balloons = state.balloons.filter((balloon) => balloon.hp > 0)
  }
  if (state.lives <= 0) {
    state.lives = 0
    state.phase = 'lost'
    spawnBurst(state, WIDTH / 2, HEIGHT / 2, '#f87171', 26, 220)
    return
  }
  if (state.wave >= MAX_WAVE && state.waveQueue === 0 && state.balloons.length === 0) {
    state.phase = 'won'
    spawnBurst(state, WIDTH / 2, HEIGHT / 2 - 40, '#67e8f9', 22, 200)
    spawnBurst(state, WIDTH / 2 - 120, HEIGHT / 2 + 40, '#86efac', 16, 160)
    spawnBurst(state, WIDTH / 2 + 120, HEIGHT / 2 + 40, '#fde68a', 16, 160)
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

function drawGame(ctx: CanvasRenderingContext2D, state: GameState, selectedTowerId: number | null, best: number): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
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
    if (tower.id === selectedTowerId) {
      ctx.setLineDash([8, 8])
      ctx.beginPath(); ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2); ctx.fillStyle = `${def.color}0d`; ctx.fill(); ctx.strokeStyle = `${def.color}99`; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.save()
    ctx.translate(tower.x, tower.y)
    ctx.rotate(tower.angle)
    ctx.fillStyle = '#1c2b36'
    ctx.fillRect(2, -5, 30, 10)
    ctx.fillStyle = def.color
    ctx.fillRect(24, -4, 8, 8)
    ctx.restore()
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 17, 0, Math.PI * 2); ctx.fillStyle = '#0f1720'; ctx.fill(); ctx.strokeStyle = '#31485a'; ctx.lineWidth = 5; ctx.stroke()
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 12, 0, Math.PI * 2); ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.stroke()
    ctx.beginPath(); ctx.arc(tower.x, tower.y, 4.5, 0, Math.PI * 2); ctx.fillStyle = def.color; ctx.fill()
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
  if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0 && state.wave < MAX_WAVE) {
    const bonus = Math.max(0, Math.round(state.waveCooldown * 4))
    ctx.fillStyle = '#9fb7c1'
    ctx.font = '600 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`Next wave in ${Math.ceil(Math.max(0, state.waveCooldown))}s  ·  early start +${bonus}`, WIDTH / 2, 58)
  }
  ctx.restore()
  if (state.phase !== 'running') {
    const title = state.phase === 'won' ? 'Defense Perfect' : state.phase === 'lost' ? 'Core Breached' : 'Balloon TD Arena'
    const subtitle = state.phase === 'ready' ? 'Place RGB towers, pop waves, protect the desktop core.' : `Wave ${state.wave}/${MAX_WAVE}`
    const footer = state.phase === 'ready' ? (best > 0 ? `Best ★${best}` : '') : `Score ★${state.score} · Best ★${best} — Press Start to play again`
    drawOverlay(ctx, title, subtitle, footer)
  }
}

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const tdStateRef = useRef<GameState>(initialState())
  const bestRef = useRef<number>(readBest())
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [tdSpeed, setTdSpeed] = useState<1 | 2>(1)
  const [best, setBest] = useState<number>(bestRef.current)
  const [tdSnapshot, setTdSnapshot] = useState<GameState>(() => ({ ...tdStateRef.current }))

  const publishSnapshot = useCallback(() => {
    setTdSnapshot({ ...tdStateRef.current, towers: [...tdStateRef.current.towers], balloons: [...tdStateRef.current.balloons], projectiles: [...tdStateRef.current.projectiles] })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = WIDTH
    canvas.height = HEIGHT
    let frame = 0
    let last = performance.now()
    let snapshotTimer = 0
    let lastPhase: GamePhase = tdStateRef.current.phase
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      tickGame(tdStateRef.current, dt * tdSpeed)
      const phase = tdStateRef.current.phase
      if ((phase === 'won' || phase === 'lost') && lastPhase !== phase) {
        const finalScore = tdStateRef.current.score
        if (finalScore > bestRef.current) {
          bestRef.current = finalScore
          writeBest(finalScore)
          setBest(finalScore)
          addText(tdStateRef.current, WIDTH / 2, HEIGHT / 2 + 96, 'NEW BEST!', '#fde68a')
        }
      }
      lastPhase = phase
      drawGame(ctx, tdStateRef.current, selectedTowerId, bestRef.current)
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        publishSnapshot()
        snapshotTimer = 0
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [publishSnapshot, selectedTowerId, tdSpeed])

  const startOrNextWave = useCallback(() => {
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
  }, [publishSnapshot])

  const restart = useCallback(() => {
    tdStateRef.current = initialState()
    setSelectedTowerId(null)
    publishSnapshot()
  }, [publishSnapshot])

  const upgradeSelected = useCallback(() => {
    const state = tdStateRef.current
    const tower = state.towers.find((item) => item.id === selectedTowerId)
    if (!tower) return
    if (upgradeTower(state, tower)) {
      spawnBurst(state, tower.x, tower.y, '#86efac', 10, 110)
      addText(state, tower.x, tower.y - 28, `Lv${tower.level}`, '#86efac')
    }
    publishSnapshot()
  }, [publishSnapshot, selectedTowerId])

  const sellSelected = useCallback(() => {
    const state = tdStateRef.current
    const tower = state.towers.find((item) => item.id === selectedTowerId)
    if (!tower) return
    sellTower(state, tower)
    setSelectedTowerId(null)
    publishSnapshot()
  }, [publishSnapshot, selectedTowerId])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
    const state = tdStateRef.current
    const tower = state.towers.find((item) => distance(item, point) < 22)
    if (tower) {
      setSelectedTowerId(tower.id === selectedTowerId ? null : tower.id)
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
    state.towers.push({ id: state.nextId++, kind: def.kind, level: 1, spent: def.cost, angle: -Math.PI / 2, x: point.x, y: point.y, range: def.range, cooldown: 0, fireRate: def.fireRate, damage: def.damage })
    if (state.phase === 'ready') state.phase = 'running'
    if (state.wave === 0) launchWave(state)
    spawnBurst(state, point.x, point.y, def.color, 12, 120)
    publishSnapshot()
  }, [publishSnapshot, selectedTower, selectedTowerId])

  const selectedDetail = tdSnapshot.towers.find((tower) => tower.id === selectedTowerId) ?? null
  const intermission = tdSnapshot.phase === 'running' && tdSnapshot.waveQueue === 0 && tdSnapshot.balloons.length === 0 && tdSnapshot.wave < MAX_WAVE
  const phaseLabel = tdSnapshot.phase === 'won' ? t('games.statusWon') : tdSnapshot.phase === 'lost' ? t('games.statusLost') : tdSnapshot.phase === 'ready' ? t('games.statusReady') : t('games.statusRunning')
  const statusAria = t('games.ariaStatus').replace('{value}', phaseLabel)
  const waveAria = t('games.ariaWave').replace('{current}', String(tdSnapshot.wave)).replace('{max}', String(MAX_WAVE))
  const livesAria = t('games.ariaLives').replace('{value}', String(tdSnapshot.lives))
  const coinsAria = t('games.ariaCoins').replace('{value}', String(tdSnapshot.coins))
  const scoreAria = t('games.ariaScore').replace('{value}', String(tdSnapshot.score))
  const bestAria = t('games.ariaBest').replace('{value}', String(best))
  const balloonsLeft = tdSnapshot.waveQueue + tdSnapshot.balloons.length

  return (
    <div className="games-view">
      <header className="workspace-header games-header">
        <div>
          <p className="eyebrow">{t('games.eyebrow')}</p>
          <h2>{t('games.title')}</h2>
        </div>
        <div className="games-header-actions">
          <button className="aspect-lock-btn" type="button" aria-label={t('games.speed')} title={t('games.speed')} onClick={() => setTdSpeed((speed) => (speed === 1 ? 2 : 1))}>
            <Zap aria-hidden="true" size={13} />
            {tdSpeed}×
          </button>
          <button className="aspect-lock-btn" type="button" onClick={startOrNextWave}>
            <Play size={13} />
            {tdSnapshot.wave > 0 ? t('games.nextWave') : t('games.start')}
          </button>
          <button className="aspect-lock-btn" type="button" onClick={restart}>
            <RotateCcw size={13} />
            {t('games.restart')}
          </button>
        </div>
      </header>

      <div className="games-stat-grid" role="list">
        <span aria-label={statusAria} role="listitem" title={statusAria}><Shield aria-hidden="true" size={15} />{phaseLabel}</span>
        <span aria-label={waveAria} role="listitem" title={waveAria}><Zap aria-hidden="true" size={15} />{t('games.wave')} {tdSnapshot.wave}/{MAX_WAVE}</span>
        <span aria-label={livesAria} role="listitem" title={livesAria}><Heart aria-hidden="true" size={15} />{tdSnapshot.lives}</span>
        <span aria-label={coinsAria} role="listitem" title={coinsAria}><span aria-hidden="true">◎</span> {tdSnapshot.coins}</span>
        <span aria-label={scoreAria} role="listitem" title={scoreAria}><span aria-hidden="true">★</span> {tdSnapshot.score}</span>
        <span aria-label={bestAria} role="listitem" title={bestAria}><Trophy aria-hidden="true" size={15} />{best}</span>
      </div>

      <div className="games-layout">
        <section className="games-canvas-panel panel">
          <canvas
            ref={canvasRef}
            className="games-canvas"
            onClick={handleCanvasClick}
            aria-label="Balloon TD Arena game board"
          />
          <div className="games-canvas-status">
            <span>
              {t('games.wave')} {tdSnapshot.wave}/{MAX_WAVE}
              {tdSnapshot.phase === 'running' && balloonsLeft > 0 ? ` · ${t('games.balloonsLeft').replace('{value}', String(balloonsLeft))}` : ''}
            </span>
            <span>
              {intermission
                ? `${t('games.nextIn').replace('{seconds}', String(Math.ceil(Math.max(0, tdSnapshot.waveCooldown))))} · ${t('games.earlyBonus').replace('{bonus}', String(Math.max(0, Math.round(tdSnapshot.waveCooldown * 4))))}`
                : phaseLabel}
            </span>
          </div>
        </section>
        <aside className="games-control-panel panel">
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
          {selectedDetail ? (
            <div className="tower-detail">
              <div className="tower-detail-head">
                <strong>{TOWER_DEFINITIONS.find((item) => item.kind === selectedDetail.kind)?.label}</strong>
                <span>Lv{selectedDetail.level}</span>
              </div>
              <div className="tower-stats">
                <span>{t('games.statDamage')}<b>{selectedDetail.damage}</b></span>
                <span>{t('games.statRange')}<b>{selectedDetail.range}</b></span>
                <span>{t('games.statRate')}<b>{(1 / selectedDetail.fireRate).toFixed(1)}/s</b></span>
              </div>
              <div className="tower-detail-actions">
                {selectedDetail.level >= TOWER_MAX_LEVEL ? (
                  <button className="aspect-lock-btn" type="button" disabled>{t('games.maxLevel')}</button>
                ) : (
                  <button className="aspect-lock-btn" type="button" disabled={tdSnapshot.coins < towerUpgradeCost(selectedDetail)} onClick={upgradeSelected}>
                    {t('games.upgrade')} ◎{towerUpgradeCost(selectedDetail)}
                  </button>
                )}
                <button className="aspect-lock-btn" type="button" onClick={sellSelected}>
                  {t('games.sell')} +◎{Math.round(selectedDetail.spent * SELL_REFUND)}
                </button>
              </div>
            </div>
          ) : null}
          <div className="games-rules">
            <strong>{t('games.rulesTitle')}</strong>
            <ul>
              <li>{t('games.rulePlace')}</li>
              <li>{t('games.ruleEarn')}</li>
              <li>{t('games.ruleWin')}</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
