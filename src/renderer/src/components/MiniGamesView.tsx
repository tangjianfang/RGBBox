import { Crosshair, Heart, Play, RotateCcw, Shield, Zap } from 'lucide-react'
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

const WIDTH = 900
const HEIGHT = 520
const MAX_WAVE = 12

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
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq))
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

function addText(state: GameState, x: number, y: number, text: string, color: string): void {
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
    state.projectiles.push({
      id: state.nextId++,
      x: tower.x,
      y: tower.y,
      targetId: target.id,
      speed: tower.kind === 'storm' ? 420 : 520,
      damage: tower.damage,
      color: def.color,
      slow: tower.kind === 'frost',
      splash: tower.kind === 'storm',
    })
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
      const hitBalloons = projectile.splash
        ? state.balloons.filter((balloon) => distance(pointAtProgress(balloon.progress), targetPos) <= 44)
        : [target]
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

function drawGame(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT)
  gradient.addColorStop(0, '#071118')
  gradient.addColorStop(0.55, '#0c1723')
  gradient.addColorStop(1, '#141025')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.strokeStyle = 'rgba(72, 187, 255, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x < WIDTH; x += 36) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y < HEIGHT; y += 36) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(WIDTH, y)
    ctx.stroke()
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  PATH.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y))
  ctx.strokeStyle = '#263746'
  ctx.lineWidth = 54
  ctx.stroke()
  ctx.strokeStyle = '#4b6576'
  ctx.lineWidth = 38
  ctx.stroke()
  ctx.setLineDash([16, 18])
  ctx.strokeStyle = 'rgba(148, 221, 255, 0.24)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])

  for (const tower of state.towers) {
    const def = TOWER_DEFINITIONS.find((item) => item.kind === tower.kind) ?? TOWER_DEFINITIONS[0]
    ctx.beginPath()
    ctx.arc(tower.x, tower.y, tower.range, 0, Math.PI * 2)
    ctx.fillStyle = `${def.color}12`
    ctx.fill()
    ctx.strokeStyle = `${def.color}44`
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(tower.x, tower.y, 18, 0, Math.PI * 2)
    ctx.fillStyle = '#0f1720'
    ctx.fill()
    ctx.strokeStyle = def.color
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.fillStyle = def.color
    ctx.font = '700 12px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(tower.kind === 'dart' ? 'D' : tower.kind === 'frost' ? 'F' : 'S', tower.x, tower.y)
  }

  for (const projectile of state.projectiles) {
    ctx.beginPath()
    ctx.arc(projectile.x, projectile.y, projectile.splash ? 5 : 4, 0, Math.PI * 2)
    ctx.fillStyle = projectile.color
    ctx.shadowColor = projectile.color
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.shadowBlur = 0
  }

  for (const balloon of state.balloons) {
    const pos = pointAtProgress(balloon.progress)
    const radius = 13 + Math.min(8, balloon.maxHp * 1.2)
    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y, radius * 0.82, radius, 0, 0, Math.PI * 2)
    ctx.fillStyle = balloon.slowUntil > 0 ? '#bfdbfe' : balloon.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.76)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y + radius)
    ctx.lineTo(pos.x - 5, pos.y + radius + 9)
    ctx.lineTo(pos.x + 5, pos.y + radius + 9)
    ctx.closePath()
    ctx.fillStyle = balloon.slowUntil > 0 ? '#93c5fd' : balloon.color
    ctx.fill()
    if (balloon.hp < balloon.maxHp) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)'
      ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32, 4)
      ctx.fillStyle = '#86efac'
      ctx.fillRect(pos.x - 16, pos.y - radius - 10, 32 * (balloon.hp / balloon.maxHp), 4)
    }
  }

  for (const text of state.texts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, text.life))
    ctx.fillStyle = text.color
    ctx.font = '800 13px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text.text, text.x, text.y)
    ctx.globalAlpha = 1
  }

  if (state.phase !== 'running') {
    ctx.fillStyle = 'rgba(5, 10, 14, 0.68)'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = '#e2f8ff'
    ctx.font = '800 34px Inter, sans-serif'
    ctx.textAlign = 'center'
    const label = state.phase === 'won' ? 'Defense Perfect' : state.phase === 'lost' ? 'Core Breached' : 'Balloon TD Arena'
    ctx.fillText(label, WIDTH / 2, HEIGHT / 2 - 18)
    ctx.fillStyle = '#9fb7c1'
    ctx.font = '500 15px Inter, sans-serif'
    ctx.fillText('Place RGB towers, pop waves, protect the desktop core.', WIDTH / 2, HEIGHT / 2 + 14)
  }
}

export function MiniGamesView(): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<GameState>(initialState())
  const [selectedTower, setSelectedTower] = useState<TowerKind>('dart')
  const [snapshot, setSnapshot] = useState<GameState>(() => ({ ...stateRef.current }))

  const publishSnapshot = useCallback(() => {
    setSnapshot({ ...stateRef.current, towers: [...stateRef.current.towers], balloons: [...stateRef.current.balloons] })
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

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      tickGame(stateRef.current, dt)
      drawGame(ctx, stateRef.current)
      snapshotTimer += dt
      if (snapshotTimer > 0.18) {
        publishSnapshot()
        snapshotTimer = 0
      }
      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [publishSnapshot])

  const startOrNextWave = useCallback(() => {
    const state = stateRef.current
    if (state.phase === 'ready') {
      state.phase = 'running'
      if (state.wave === 0) launchWave(state)
    } else if (state.phase === 'running' && state.waveQueue === 0 && state.balloons.length === 0) {
      launchWave(state)
    }
    publishSnapshot()
  }, [publishSnapshot])

  const restart = useCallback(() => {
    stateRef.current = initialState()
    publishSnapshot()
  }, [publishSnapshot])

  const handleCanvasClick = useCallback((event: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
    const def = TOWER_DEFINITIONS.find((item) => item.kind === selectedTower) ?? TOWER_DEFINITIONS[0]
    const state = stateRef.current
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
    state.towers.push({
      id: state.nextId++,
      kind: def.kind,
      x: point.x,
      y: point.y,
      range: def.range,
      cooldown: 0,
      fireRate: def.fireRate,
      damage: def.damage,
    })
    if (state.phase === 'ready') state.phase = 'running'
    if (state.wave === 0) launchWave(state)
    publishSnapshot()
  }, [publishSnapshot, selectedTower])

  const phaseLabel = snapshot.phase === 'won'
    ? t('games.statusWon')
    : snapshot.phase === 'lost'
      ? t('games.statusLost')
      : snapshot.phase === 'ready'
        ? t('games.statusReady')
        : t('games.statusRunning')

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
            {snapshot.wave === 0 ? t('games.start') : t('games.nextWave')}
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
          <h3>Balloon TD Arena</h3>
          <p>{t('games.description')}</p>
        </div>
        <div className="games-stat-grid">
          <span><Shield size={15} />{phaseLabel}</span>
          <span><Zap size={15} />{t('games.wave')} {snapshot.wave}/{MAX_WAVE}</span>
          <span><Heart size={15} />{snapshot.lives}</span>
          <span>◎ {snapshot.coins}</span>
          <span>★ {snapshot.score}</span>
        </div>
      </section>

      <div className="games-layout">
        <section className="games-canvas-panel panel">
          <canvas ref={canvasRef} className="games-canvas" onClick={handleCanvasClick} aria-label="Balloon tower defense game board" />
        </section>
        <aside className="games-control-panel panel">
          <h3>{t('games.towers')}</h3>
          <p className="games-help">{t('games.help')}</p>
          <div className="tower-card-list">
            {TOWER_DEFINITIONS.map((tower) => (
              <button
                className={`tower-card ${selectedTower === tower.kind ? 'selected' : ''}`}
                key={tower.kind}
                type="button"
                onClick={() => setSelectedTower(tower.kind)}
              >
                <span className="tower-orb" style={{ background: tower.color }}><Crosshair size={15} /></span>
                <span>
                  <strong>{tower.label}</strong>
                  <small>{tower.description}</small>
                </span>
                <b>◎{tower.cost}</b>
              </button>
            ))}
          </div>
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
