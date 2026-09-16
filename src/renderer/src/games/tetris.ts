// R100.3: "Neon Blocks" — neon Tetris on the shared 900x520 canvas.
// Discrete inputs (move/rotate/hard-drop) arrive through a command queue that
// the tick consumes, while soft-drop reads the held-key set — keeps the engine
// deterministic and unit-testable.
import { playSfx } from './sfx'
import { WIDTH, HEIGHT } from './td'

export type TetrisPhase = 'ready' | 'running' | 'lost'
export type TetrisCommand = 'left' | 'right' | 'rotate' | 'hard'

const COLS = 10
const ROWS = 20
const CELL = 24
const BOARD_X = 300
const BOARD_Y = (HEIGHT - ROWS * CELL) / 2

const BASE_SHAPES: number[][][] = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
]

const KIND_COLORS = ['#67e8f9', '#fde047', '#f0abfc', '#86efac', '#fb7185', '#93c5fd', '#fbbf24']
const LINE_SCORES = [0, 100, 300, 500, 800]
const KICK_OFFSETS = [0, -1, 1, -2, 2]

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
}

interface Flash {
  rows: number[]
  life: number
}

export interface TetrisState {
  phase: TetrisPhase
  clock: number
  score: number
  lines: number
  level: number
  shake: number
  grid: number[][]
  kind: number
  rot: number
  px: number
  py: number
  queue: number[]
  bag: number[]
  dropTimer: number
  commands: TetrisCommand[]
  keys: Set<string>
  particles: Particle[]
  flash: Flash | null
}

function emptyGrid(): number[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0))
}

function refillBag(bag: number[]): void {
  const fresh = [0, 1, 2, 3, 4, 5, 6]
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[fresh[i], fresh[j]] = [fresh[j], fresh[i]]
  }
  bag.push(...fresh)
}

function drawFromBag(state: TetrisState): number {
  if (state.bag.length === 0) refillBag(state.bag)
  return state.bag.shift() as number
}

export function shapeCells(kind: number, rot: number): { x: number; y: number }[] {
  const size = BASE_SHAPES[kind].length
  let matrix = BASE_SHAPES[kind]
  for (let r = 0; r < ((rot % 4) + 4) % 4; r++) {
    matrix = matrix[0].map((_, col) => matrix.map((row) => row[col]).reverse())
  }
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x]) cells.push({ x, y })
    }
  }
  return cells
}

function collides(state: TetrisState, kind: number, rot: number, px: number, py: number): boolean {
  for (const cell of shapeCells(kind, rot)) {
    const gx = px + cell.x
    const gy = py + cell.y
    if (gx < 0 || gx >= COLS || gy >= ROWS) return true
    if (gy >= 0 && state.grid[gy][gx] !== 0) return true
  }
  return false
}

export function ghostY(state: TetrisState): number {
  let y = state.py
  while (!collides(state, state.kind, state.rot, state.px, y + 1)) y += 1
  return y
}

export function dropInterval(level: number): number {
  return Math.max(0.08, 0.8 * Math.pow(0.85, level - 1))
}

export function initialTetrisState(): TetrisState {
  const state: TetrisState = {
    phase: 'ready',
    clock: 0,
    score: 0,
    lines: 0,
    level: 1,
    shake: 0,
    grid: emptyGrid(),
    kind: 0,
    rot: 0,
    px: 3,
    py: 0,
    queue: [],
    bag: [],
    dropTimer: 0,
    commands: [],
    keys: new Set<string>(),
    particles: [],
    flash: null,
  }
  refillBag(state.bag)
  for (let i = 0; i < 4; i++) state.queue.push(drawFromBag(state))
  state.kind = state.queue.shift() as number
  return state
}

export function startTetris(state: TetrisState): void {
  if (state.phase !== 'ready') return
  state.phase = 'running'
  playSfx('wave')
}

function spawnPiece(state: TetrisState): void {
  state.queue.push(drawFromBag(state))
  state.kind = state.queue.shift() as number
  state.rot = 0
  state.px = 3
  state.py = 0
  if (collides(state, state.kind, state.rot, state.px, state.py)) {
    state.phase = 'lost'
    state.shake = 7
    playSfx('gameover')
  }
}

function spawnBurst(state: TetrisState, x: number, y: number, color: string, count: number, power: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.3 + Math.random() * 0.7)
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life: 0.4 + Math.random() * 0.35, maxLife: 0.75, size: 2 + Math.random() * 3, color })
  }
}

function lockPiece(state: TetrisState): void {
  for (const cell of shapeCells(state.kind, state.rot)) {
    const gx = state.px + cell.x
    const gy = state.py + cell.y
    if (gy >= 0) state.grid[gy][gx] = state.kind + 1
  }
  const fullRows: number[] = []
  for (let y = 0; y < ROWS; y++) {
    if (state.grid[y].every((cell) => cell !== 0)) fullRows.push(y)
  }
  if (fullRows.length > 0) {
    for (const row of fullRows) {
      for (let x = 0; x < COLS; x++) {
        const color = KIND_COLORS[(state.grid[row][x] ?? 1) - 1] ?? '#67e8f9'
        spawnBurst(state, BOARD_X + x * CELL + CELL / 2, BOARD_Y + row * CELL + CELL / 2, color, 3, 150)
      }
      state.grid.splice(row, 1)
      state.grid.unshift(Array.from({ length: COLS }, () => 0))
    }
    const cleared = fullRows.length
    state.score += LINE_SCORES[cleared] * state.level
    state.lines += cleared
    state.level = 1 + Math.floor(state.lines / 10)
    state.flash = { rows: [], life: 0.25 }
    state.shake = Math.min(7, 2 + cleared * 1.5)
    playSfx(cleared >= 3 ? 'levelup' : 'pop')
  } else {
    playSfx('hit')
  }
  spawnPiece(state)
}

function applyCommand(state: TetrisState, command: TetrisCommand): void {
  if (state.phase !== 'running') return
  if (command === 'left' && !collides(state, state.kind, state.rot, state.px - 1, state.py)) state.px -= 1
  else if (command === 'right' && !collides(state, state.kind, state.rot, state.px + 1, state.py)) state.px += 1
  else if (command === 'rotate') {
    const nextRot = (state.rot + 1) % 4
    for (const kick of KICK_OFFSETS) {
      if (!collides(state, state.kind, nextRot, state.px + kick, state.py)) {
        state.rot = nextRot
        state.px += kick
        playSfx('xp')
        break
      }
    }
  } else if (command === 'hard') {
    const target = ghostY(state)
    state.score += (target - state.py) * 2
    state.py = target
    lockPiece(state)
  }
}

export function tickTetris(state: TetrisState, dt: number): void {
  state.clock += dt
  state.shake = Math.max(0, state.shake - dt * 14)
  for (const particle of state.particles) {
    particle.x += particle.vx * dt
    particle.y += particle.vy * dt
    particle.vy += 320 * dt
    particle.life -= dt
  }
  state.particles = state.particles.filter((particle) => particle.life > 0)
  if (state.flash) {
    state.flash.life -= dt
    if (state.flash.life <= 0) state.flash = null
  }
  if (state.phase !== 'running') return
  const commands = state.commands
  state.commands = []
  for (const command of commands) applyCommand(state, command)
  if (state.phase !== 'running') return
  let interval = dropInterval(state.level)
  if (state.keys.has('arrowdown')) interval /= 14
  state.dropTimer += dt
  if (state.dropTimer >= interval) {
    state.dropTimer = 0
    if (!collides(state, state.kind, state.rot, state.px, state.py + 1)) {
      state.py += 1
    } else {
      lockPiece(state)
    }
  }
}

function cellRect(x: number, y: number): { x: number; y: number } {
  return { x: BOARD_X + x * CELL, y: BOARD_Y + y * CELL }
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1): void {
  const rect = cellRect(x, y)
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(rect.x + 1, rect.y + 1, CELL - 2, CELL - 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.fillRect(rect.x + 1, rect.y + 1, CELL - 2, 5)
  ctx.globalAlpha = 1
}

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, subtitle: string, footer = ''): void {
  ctx.fillStyle = 'rgba(5, 10, 14, 0.72)'
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

export interface TetrisLabels {
  readySubtitle: string
  lostTitle: string
  replaySuffix: string
}

const TETRIS_LABELS: TetrisLabels = {
  readySubtitle: '← → move · ↑ rotate · ↓ soft drop · Space hard drop',
  lostTitle: 'Stack Out',
  replaySuffix: '— Press Start to play again',
}

export function drawTetris(ctx: CanvasRenderingContext2D, state: TetrisState, best: number, labels: TetrisLabels = TETRIS_LABELS): void {
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
  ctx.fillStyle = '#05090d'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x < WIDTH; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke() }
  for (let y = 0; y < HEIGHT; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke() }

  ctx.fillStyle = '#070d14'
  ctx.fillRect(BOARD_X - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12)
  ctx.strokeStyle = '#265065'
  ctx.lineWidth = 2
  ctx.strokeRect(BOARD_X - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12)
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.06)'
  ctx.lineWidth = 1
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(BOARD_X + x * CELL, BOARD_Y); ctx.lineTo(BOARD_X + x * CELL, BOARD_Y + ROWS * CELL); ctx.stroke() }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(BOARD_X, BOARD_Y + y * CELL); ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + y * CELL); ctx.stroke() }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = state.grid[y][x]
      if (cell !== 0) drawCell(ctx, x, y, KIND_COLORS[cell - 1])
    }
  }

  const ghost = ghostY(state)
  for (const cell of shapeCells(state.kind, state.rot)) {
    const gy = ghost + cell.y
    if (gy >= 0) {
      const rect = cellRect(cell.x + state.px, gy)
      ctx.strokeStyle = 'rgba(226, 248, 255, 0.28)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(rect.x + 2, rect.y + 2, CELL - 4, CELL - 4)
    }
  }
  for (const cell of shapeCells(state.kind, state.rot)) {
    const gy = state.py + cell.y
    if (gy >= 0) {
      ctx.shadowColor = KIND_COLORS[state.kind]
      ctx.shadowBlur = 10
      drawCell(ctx, state.px + cell.x, gy, KIND_COLORS[state.kind])
      ctx.shadowBlur = 0
    }
  }

  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('NEXT', 600, 110)
  state.queue.slice(0, 3).forEach((kind, index) => {
    for (const cell of shapeCells(kind, 0)) {
      const rect = { x: 600 + cell.x * 16, y: 124 + index * 66 + cell.y * 16 }
      ctx.fillStyle = KIND_COLORS[kind]
      ctx.fillRect(rect.x, rect.y, 14, 14)
    }
  })

  ctx.fillStyle = '#e2f8ff'
  ctx.font = '800 26px Inter, sans-serif'
  ctx.fillText(`${state.score}`, 600, 360)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '600 13px Inter, sans-serif'
  ctx.fillText(`LINES ${state.lines}`, 600, 388)
  ctx.fillText(`LEVEL ${state.level}`, 600, 410)
  ctx.fillText(`BEST ${best}`, 600, 432)

  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.restore()
  if (state.phase === 'ready') {
    drawOverlay(ctx, 'Neon Blocks', labels.readySubtitle, best > 0 ? `Best ★${best}` : '')
  } else if (state.phase === 'lost') {
    drawOverlay(ctx, labels.lostTitle, `Level ${state.level} · ${state.lines} lines`, `Score ★${state.score} · Best ★${best} ${labels.replaySuffix}`)
  }
}
