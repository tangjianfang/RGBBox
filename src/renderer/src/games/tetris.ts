// R100.3: "Neon Blocks" — neon Tetris on the shared 900x520 canvas.
// Discrete inputs (move/rotate/hard-drop) arrive through a command queue that
// the tick consumes, while soft-drop reads the held-key set — keeps the engine
// deterministic and unit-testable.
import { playSfx } from './sfx'
import { WIDTH, HEIGHT } from './td'
import { HIT_STOP, hitStopTick } from './juice'
import { mulberry32 } from './daily'

/** FR-G08 race short-run adds 'won': line goal reached before topping out. */
export type TetrisPhase = 'ready' | 'running' | 'won' | 'lost'
export type TetrisCommand = 'left' | 'right' | 'rotate' | 'hard' | 'hold'

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
/** FR-TE03(R199): T-spin 分型线数→基数(TSS/TSD/TST),×level;0 行 T-spin 给小分。 */
const TSPIN_SCORES = [200, 800, 1200, 1600]
const B2B_MULT = 1.5
/** FR-TE01(R199): lock delay 与重置上限(guideline 默认值)。 */
const LOCK_DELAY = 0.5
const MAX_LOCK_RESETS = 15

/**
 * FR-TE02(R199): 标准 SRS 踢墙表,替换旧「横向 ±1/±2 平移尝试」。
 * 偏移为 SRS 惯例的 y-UP 坐标,应用时取 dy 的负值(引擎 y 向下增长)。
 * 旋转态:0=spawn 1=CW(R) 2=180 3=CCW(L);from>>to 覆盖顺/逆双向。
 */
interface KickEntry { from: number; to: number; offsets: Array<[number, number]> }
const SRS_JLSTZ: KickEntry[] = [
  { from: 0, to: 1, offsets: [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]] },
  { from: 1, to: 0, offsets: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]] },
  { from: 1, to: 2, offsets: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]] },
  { from: 2, to: 1, offsets: [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]] },
  { from: 2, to: 3, offsets: [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]] },
  { from: 3, to: 2, offsets: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]] },
  { from: 3, to: 0, offsets: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]] },
  { from: 0, to: 3, offsets: [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]] },
]
const SRS_I: KickEntry[] = [
  { from: 0, to: 1, offsets: [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]] },
  { from: 1, to: 0, offsets: [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]] },
  { from: 1, to: 2, offsets: [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]] },
  { from: 2, to: 1, offsets: [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]] },
  { from: 2, to: 3, offsets: [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]] },
  { from: 3, to: 2, offsets: [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]] },
  { from: 3, to: 0, offsets: [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]] },
  { from: 0, to: 3, offsets: [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]] },
]

export function kickTable(kind: number): KickEntry[] {
  return kind === 0 ? SRS_I : SRS_JLSTZ
}

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
  /** FR-G08 race short-run: clear this many lines to win (undefined = endless
   *  scoring run). View writes it before start; the engine only reads it. */
  raceLines?: number
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
  /** FR-TE01(R199): Hold 槽与单次交换标记(落锁重置)。 */
  holdKind: number | null
  holdUsed: boolean
  /** FR-TE01(R199): 落地锁定延迟累计与重置计数(≤15)。 */
  lockTimer: number
  lockResets: number
  /** FR-TE03(R199): B2B(连续 Tetris/T-spin 消行)、连击、T-spin 累计、
   *  最后一次成功操作是否为旋转(T-spin 判定前提)。 */
  b2b: boolean
  combo: number
  tspins: number
  lastRotate: boolean
  /** FR-TE04(R199): 放置提示(本块已算好的最优落点,spawn/hold 时重算)。 */
  hint: { px: number; rot: number; py: number } | null
  /** R208(FR-MP02): 板绘制原点(双板并排时 B 板偏移;默认单板位)。 */
  boardX: number
  hintPieceId: number
  pieceId: number
  /** R200(FR-G06): hit-stop 冻结剩余(秒)。 */
  hitStop: number
  /** R209 三期(FR-LN05): 种子 RNG(7-bag 洗牌用;undefined=Math.random)。
   *  LAN 对战双方以同一种子开局 → piece 序列一致;纯闭包不序列化。 */
  rng?: () => number
}

function emptyGrid(): number[][] {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 0))
}

function refillBag(state: TetrisState): void {
  const rand = state.rng ?? Math.random
  const fresh = [0, 1, 2, 3, 4, 5, 6]
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[fresh[i], fresh[j]] = [fresh[j], fresh[i]]
  }
  state.bag.push(...fresh)
}

function drawFromBag(state: TetrisState): number {
  if (state.bag.length === 0) refillBag(state)
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

/** R209 三期(FR-LN05): 种子开局——seed 注入 rng(7-bag 洗牌确定性),
 *  LAN 对战双方同 seed → 双方 piece 序列一致。 */
export function initialTetrisState(seed?: number): TetrisState {
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
    holdKind: null,
    holdUsed: false,
    lockTimer: 0,
    lockResets: 0,
    b2b: false,
    combo: -1,
    tspins: 0,
    lastRotate: false,
    hint: null,
    hintPieceId: -1,
    pieceId: 0,
    hitStop: 0,
    boardX: BOARD_X,
  }
  if (seed !== undefined) state.rng = mulberry32(seed)
  refillBag(state)
  for (let i = 0; i < 4; i++) state.queue.push(drawFromBag(state))
  state.kind = state.queue.shift() as number
  refreshHint(state)
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
  state.holdUsed = false
  state.lockTimer = 0
  state.lockResets = 0
  state.lastRotate = false
  state.pieceId += 1
  refreshHint(state)
  if (collides(state, state.kind, state.rot, state.px, state.py)) {
    state.phase = 'lost'
    state.shake = 7
    playSfx('gameover')
  }
}

/**
 * FR-TE03(R199): T-spin 判定——T 块 + 最后成功操作为旋转 + 四角 ≥3 被占
 * (墙/底也计占用)。返回 true 即 T-spin(线数分型在 lockPiece 内)。
 */
export function isTspin(state: TetrisState): boolean {
  if (state.kind !== 2 || !state.lastRotate) return false
  const corners: Array<[number, number]> = [[state.px, state.py], [state.px + 2, state.py], [state.px, state.py + 2], [state.px + 2, state.py + 2]]
  let occupied = 0
  for (const [cx, cy] of corners) {
    if (cx < 0 || cx >= COLS || cy >= ROWS) { occupied += 1; continue }
    if (cy >= 0 && state.grid[cy][cx] !== 0) occupied += 1
  }
  return occupied >= 3
}

function spawnBurst(state: TetrisState, x: number, y: number, color: string, count: number, power: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.3 + Math.random() * 0.7)
    state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60, life: 0.4 + Math.random() * 0.35, maxLife: 0.75, size: 2 + Math.random() * 3, color })
  }
}

function lockPiece(state: TetrisState): void {
  // FR-TE03: 判定要在写入网格前(T-spin 角位检查当前块自身不占角)。
  const tspin = isTspin(state)
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
        spawnBurst(state, state.boardX + x * CELL + CELL / 2, BOARD_Y + row * CELL + CELL / 2, color, 3, 150)
      }
      state.grid.splice(row, 1)
      state.grid.unshift(Array.from({ length: COLS }, () => 0))
    }
    const cleared = fullRows.length
    // R200: 高光顿帧(四消重/T-spin 轻)
    if (cleared === 4 || (tspin && cleared > 0)) state.hitStop = cleared === 4 ? HIT_STOP.heavy : HIT_STOP.medium
    // FR-TE03: 计分矩阵——普通消行 / T-spin 分型(TSS/TSD/TST) / B2B ×1.5 / 连击
    let base = LINE_SCORES[cleared] * state.level
    if (tspin) base = TSPIN_SCORES[Math.min(cleared, 3)] * state.level
    const qualifying = cleared === 4 || (tspin && cleared > 0) // B2B 资格:Tetris 或 T-spin 消行
    let award = base
    if (qualifying && state.b2b) award = Math.round(base * B2B_MULT)
    state.combo += 1
    if (state.combo >= 1) award += 50 * state.combo * state.level
    state.score += award
    if (tspin) state.tspins += 1
    state.b2b = qualifying
    state.lines += cleared
    state.level = 1 + Math.floor(state.lines / 10)
    state.flash = { rows: [], life: 0.25 }
    state.shake = Math.min(7, 2 + cleared * 1.5)
    playSfx(cleared >= 3 || tspin ? 'levelup' : 'pop')
    playSfx(cleared >= 3 ? 'levelup' : 'pop')
    // FR-G08 race: line goal reached → win. Settle BEFORE spawning the next
    // piece so a topped-out board cannot overwrite 'won' with 'lost', and use
    // the level-up jingle instead of the game-over shake/sfx.
    if (state.raceLines !== undefined && state.lines >= state.raceLines) {
      state.phase = 'won'
      playSfx('levelup')
      return
    }
  } else {
    if (tspin) {
      // 零消 T-spin:小分,不计 B2B 也不清 B2B(guideline 惯例)
      state.score += TSPIN_SCORES[0] * state.level
      state.tspins += 1
      playSfx('xp')
    }
    state.combo = -1
    playSfx('hit')
  }
  spawnPiece(state)
}

/** 落地态下成功的移动/旋转 → lock delay 重置(≤15 次,超限强制锁定)。 */
function onGroundMoveReset(state: TetrisState): void {
  const grounded = collides(state, state.kind, state.rot, state.px, state.py + 1)
  if (grounded && state.lockResets < MAX_LOCK_RESETS) {
    state.lockTimer = 0
    state.lockResets += 1
  }
}

/** FR-TE02(R199): SRS 踢墙旋转。dir=1 顺时针 / -1 逆时针(表双向齐备)。 */
export function tryRotate(state: TetrisState, dir: 1 | -1): boolean {
  const nextRot = (state.rot + dir + 4) % 4
  const entry = kickTable(state.kind).find((e) => e.from === state.rot && e.to === nextRot)
  const offsets: Array<[number, number]> = entry?.offsets ?? [[0, 0]]
  for (const [dx, dySrs] of offsets) {
    const nx = state.px + dx
    const ny = state.py - dySrs // SRS y-UP → 引擎 y-DOWN
    if (!collides(state, state.kind, nextRot, nx, ny)) {
      state.rot = nextRot
      state.px = nx
      state.py = ny
      state.lastRotate = true
      onGroundMoveReset(state)
      playSfx('xp')
      return true
    }
  }
  return false
}

/** FR-TE01(R199): Hold——本块限一次;空槽换出新块,非空槽直接对调。 */
export function holdPiece(state: TetrisState): void {
  if (state.phase !== 'running' || state.holdUsed) return
  const current = state.kind
  if (state.holdKind === null) {
    state.holdKind = current
    spawnPiece(state) // 会重置 holdUsed=false/lock 计时/pieceId
  } else {
    const swapped = state.holdKind
    state.holdKind = current
    state.kind = swapped
    state.rot = 0
    state.px = 3
    state.py = 0
    state.lockTimer = 0
    state.lockResets = 0
    state.lastRotate = false
    state.pieceId += 1
    refreshHint(state)
    if (collides(state, state.kind, state.rot, state.px, state.py)) {
      state.phase = 'lost'
      state.shake = 7
      playSfx('gameover')
    }
  }
  state.holdUsed = true
  state.dropTimer = 0
}

/**
 * FR-TE04(R199): 放置提示启发式——洞数(重罚)/聚合高度/崎岖度/消行数,
 * 枚举 rot×px 取最优落点。spawn/hold 时算一次存 state.hint。
 */
export function bestPlacement(state: TetrisState): { px: number; rot: number; py: number } | null {
  let best: { px: number; rot: number; py: number; score: number } | null = null
  for (let rot = 0; rot < 4; rot += 1) {
    for (let px = -2; px <= COLS; px += 1) {
      if (collides(state, state.kind, rot, px, 0)) continue
      let py = 0
      while (!collides(state, state.kind, rot, px, py + 1)) py += 1
      // 在副本网格上落子评估
      const grid = state.grid.map((row) => [...row])
      for (const cell of shapeCells(state.kind, rot)) {
        const gy = py + cell.y
        const gx = px + cell.x
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) grid[gy][gx] = state.kind + 1
      }
      let cleared = 0
      for (let y = ROWS - 1; y >= 0; y -= 1) if (grid[y].every((c) => c !== 0)) cleared += 1
      // 洞:每列首个填充格之下的空格数
      let holes = 0
      let aggHeight = 0
      const heights: number[] = []
      for (let x = 0; x < COLS; x += 1) {
        let top = -1
        for (let y = 0; y < ROWS; y += 1) {
          if (grid[y][x] !== 0) { top = y; break }
        }
        if (top === -1) top = ROWS
        heights.push(ROWS - top)
        aggHeight += ROWS - top
        for (let y = top + 1; y < ROWS; y += 1) if (grid[y][x] === 0) holes += 1
      }
      let bump = 0
      for (let x = 0; x < COLS - 1; x += 1) bump += Math.abs(heights[x] - heights[x + 1])
      const score = -holes * 8 - aggHeight * 0.6 - bump * 0.8 + cleared * 30
      if (best === null || score > best.score) best = { px, rot, py, score }
    }
  }
  if (best === null) return null
  return { px: best.px, rot: best.rot, py: best.py }
}

function refreshHint(state: TetrisState): void {
  state.hint = bestPlacement(state)
  state.hintPieceId = state.pieceId
}

function applyCommand(state: TetrisState, command: TetrisCommand): void {
  if (state.phase !== 'running') return
  if (command === 'left' && !collides(state, state.kind, state.rot, state.px - 1, state.py)) {
    state.px -= 1
    state.lastRotate = false
    onGroundMoveReset(state)
  } else if (command === 'right' && !collides(state, state.kind, state.rot, state.px + 1, state.py)) {
    state.px += 1
    state.lastRotate = false
    onGroundMoveReset(state)
  } else if (command === 'rotate') {
    tryRotate(state, 1)
  } else if (command === 'hold') {
    holdPiece(state)
  } else if (command === 'hard') {
    const target = ghostY(state)
    state.score += (target - state.py) * 2
    state.py = target
    lockPiece(state)
  }
}

export function tickTetris(state: TetrisState, dt: number): void {
  // R200: hit-stop 冻结期间只推进特效,游戏计时静止(4 消/T-spin 高光)
  let gameDt = dt
  if (state.hitStop > 0) {
    const [remain, thaw] = hitStopTick(state.hitStop, dt)
    state.hitStop = remain
    gameDt = thaw
  }
  dt = gameDt
  if (dt === 0) {
    // 特效仍以真实时间衰减,但不推进命令/重力
    for (const particle of state.particles) {
      particle.x += particle.vx * 0
      particle.life -= 0
    }
    return
  }
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
  // FR-TE01(R199): 落地不再立即锁定——lock delay 0.5s,重置上限 15 次;
  // 重力下落到新行时清零重置计数(guideline: move reset)。被动下落不改变
  // lastRotate(T-spin 判定:最后"操作"须为旋转,重力不算操作)。
  const grounded = collides(state, state.kind, state.rot, state.px, state.py + 1)
  if (grounded) {
    state.lockTimer += dt
    if (state.lockTimer >= LOCK_DELAY || state.lockResets >= MAX_LOCK_RESETS) {
      lockPiece(state)
    }
    return
  }
  state.lockTimer = 0
  let interval = dropInterval(state.level)
  if (state.keys.has('arrowdown')) interval /= 14
  state.dropTimer += dt
  if (state.dropTimer >= interval) {
    state.dropTimer = 0
    if (!collides(state, state.kind, state.rot, state.px, state.py + 1)) {
      state.py += 1
      state.lockResets = 0 // 降到新行:重置计数随行清零
    }
  }
}

function cellRect(x: number, y: number, originX = BOARD_X): { x: number; y: number } {
  return { x: originX + x * CELL, y: BOARD_Y + y * CELL }
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1, originX = BOARD_X): void {
  const rect = cellRect(x, y, originX)
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
  /** FR-G08 race: overlay title for phase 'won' (falls back to an inline default). */
  wonTitle?: string
  replaySuffix: string
}

const TETRIS_LABELS: TetrisLabels = {
  readySubtitle: '← → move · ↑ rotate · ↓ soft drop · Space hard drop',
  lostTitle: 'Stack Out',
  wonTitle: 'Race Clear',
  replaySuffix: '— Press Start to play again',
}

export function drawTetris(ctx: CanvasRenderingContext2D, state: TetrisState, best: number, labels: TetrisLabels = TETRIS_LABELS, opts: { noClear?: boolean } = {}): void {
  // R208(FR-MP02): 板原点随 state.boardX(双板并排);noClear 供第二板叠加绘制
  const bx = state.boardX
  if (!opts.noClear) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
  }
  ctx.save()
  if (state.shake > 0.2) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake)
  if (!opts.noClear) {
    ctx.fillStyle = '#05090d'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x < WIDTH; x += 45) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke() }
    for (let y = 0; y < HEIGHT; y += 45) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke() }
  }
  ctx.fillStyle = '#070d14'
  ctx.fillRect(bx - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12)
  ctx.strokeStyle = '#265065'
  ctx.lineWidth = 2
  ctx.strokeRect(bx - 6, BOARD_Y - 6, COLS * CELL + 12, ROWS * CELL + 12)
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.06)'
  ctx.lineWidth = 1
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(bx + x * CELL, BOARD_Y); ctx.lineTo(bx + x * CELL, BOARD_Y + ROWS * CELL); ctx.stroke() }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(bx, BOARD_Y + y * CELL); ctx.lineTo(bx + COLS * CELL, BOARD_Y + y * CELL); ctx.stroke() }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = state.grid[y][x]
      if (cell !== 0) drawCell(ctx, x, y, cell === GARBAGE_CELL ? '#9fb7c1' : KIND_COLORS[cell - 1], 1, bx)
    }
  }

  const ghost = ghostY(state)
  for (const cell of shapeCells(state.kind, state.rot)) {
    const gy = ghost + cell.y
    if (gy >= 0) {
      const rect = cellRect(cell.x + state.px, gy, bx)
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
      drawCell(ctx, state.px + cell.x, gy, KIND_COLORS[state.kind], 1, bx)
      ctx.shadowBlur = 0
    }
  }

  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('NEXT', bx + 300, 110)
  state.queue.slice(0, 3).forEach((kind, index) => {
    for (const cell of shapeCells(kind, 0)) {
      const rect = { x: bx + 300 + cell.x * 16, y: 124 + index * 66 + cell.y * 16 }
      ctx.fillStyle = KIND_COLORS[kind]
      ctx.fillRect(rect.x, rect.y, 14, 14)
    }
  })

  // FR-TE01(R199): HOLD 槽(板左;已用则暗显)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '700 12px Inter, sans-serif'
  ctx.fillText('HOLD', bx - 80, 110)
  if (state.holdKind !== null) {
    ctx.globalAlpha = state.holdUsed ? 0.32 : 1
    for (const cell of shapeCells(state.holdKind, 0)) {
      const rect = { x: bx - 80 + cell.x * 16, y: 124 + cell.y * 16 }
      ctx.fillStyle = KIND_COLORS[state.holdKind]
      ctx.fillRect(rect.x, rect.y, 14, 14)
    }
    ctx.globalAlpha = 1
  }

  // FR-TE04(R199): 放置提示——最优落点星标(仅非当前落点时)
  if (state.hint !== null && (state.hint.px !== state.px || state.hint.rot !== state.rot)) {
    let hx = 0
    let hy = 0
    let n = 0
    for (const cell of shapeCells(state.kind, state.hint.rot)) {
      hx += state.hint.px + cell.x
      hy += state.hint.py + cell.y
      n += 1
    }
    if (n > 0) {
      const c = cellRect(hx / n, hy / n, bx)
      ctx.fillStyle = 'rgba(226, 248, 255, 0.4)'
      ctx.font = '700 16px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✦', c.x + CELL / 2, c.y + CELL / 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
  }

  ctx.fillStyle = '#e2f8ff'
  ctx.font = '800 26px Inter, sans-serif'
  ctx.fillText(`${state.score}`, bx + 300, 360)
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '600 13px Inter, sans-serif'
  ctx.fillText(`LINES ${state.lines}`, bx + 300, 388)
  ctx.fillText(`LEVEL ${state.level}`, bx + 300, 410)
  ctx.fillText(`BEST ${best}`, bx + 300, 432)
  if (state.b2b) ctx.fillText('B2B', bx + 300, 454)
  if (state.combo >= 1) ctx.fillText(`COMBO ×${state.combo}`, bx + 360, 454)
  if (state.tspins > 0) ctx.fillText(`T-SPIN ${state.tspins}`, bx + 300, 476)

  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife)
    ctx.fillStyle = particle.color
    ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
  }
  ctx.restore()
  if (state.phase === 'ready') {
    drawOverlay(ctx, 'Neon Blocks', labels.readySubtitle, best > 0 ? `Best ★${best}` : '')
  } else if (state.phase === 'lost' || state.phase === 'won') {
    // FR-G08 race: 'won' shares the lost overlay (dim + stats) with its own title.
    const title = state.phase === 'won' ? (labels.wonTitle ?? 'Race Clear') : labels.lostTitle
    drawOverlay(ctx, title, `Level ${state.level} · ${state.lines} lines`, `Score ★${state.score} · Best ★${best} ${labels.replaySuffix}`)
  }
}

// ── FR-G01(R198): 策略教练 —— 纯函数,key 制文案 ──
import type { CoachHint } from './coach'

/** 最高堆高(首个填充行距顶)。 */
export function stackHeight(state: TetrisState): number {
  for (let y = 0; y < ROWS; y += 1) {
    if (state.grid[y].some((cell) => cell !== 0)) return ROWS - y
  }
  return 0
}

/** 盘面洞数(每列首个填充格之下的空格)。 */
export function boardHoles(state: TetrisState): number {
  let holes = 0
  for (let x = 0; x < COLS; x += 1) {
    let top = -1
    for (let y = 0; y < ROWS; y += 1) {
      if (state.grid[y][x] !== 0) { top = y; break }
    }
    if (top === -1) continue
    for (let y = top + 1; y < ROWS; y += 1) if (state.grid[y][x] === 0) holes += 1
  }
  return holes
}

export function tetrisHints(state: TetrisState): CoachHint[] {
  const hints: CoachHint[] = []
  if (state.phase !== 'running') return hints
  if (stackHeight(state) >= 14) hints.push({ key: 'te.stackHigh', tone: 'warn', priority: 85 })
  if (boardHoles(state) >= 4) hints.push({ key: 'te.holes', tone: 'tip', priority: 40 })
  if (state.pieceId > 6 && state.holdKind === null) hints.push({ key: 'te.holdUnused', tone: 'tip', priority: 45 })
  if (state.b2b) hints.push({ key: 'te.b2b', tone: 'praise', priority: 50 })
  if (state.combo >= 2) hints.push({ key: 'te.combo', tone: 'praise', priority: 55 })
  return hints
}

// ── R208 (FR-MP02): 双板对战——垃圾行纯函数(guideline 比例) ──

/** 垃圾行格值(KIND_COLORS 之外的灰白色,绘制层单独映射)。 */
export const GARBAGE_CELL = 8

/** guideline 发送比例:1 消不送;2/3/4 消分别送 1/2/4 行。 */
export function garbageFor(lines: number): number {
  if (lines <= 1) return 0
  if (lines === 2) return 1
  if (lines === 3) return 2
  return 4
}

/** 垃圾行入场:底部插入带单洞实心行,板整体上移;当前块冲突时逐行上推。
 *  不改 score/lines(垃圾行不计分);hint 作废(布局已变)。 */
export function applyGarbage(state: TetrisState, lines: number, holeColumn?: number): void {
  if (lines <= 0 || state.phase !== 'running') return
  const hole = holeColumn ?? Math.floor(Math.random() * COLS)
  for (let n = 0; n < lines; n++) {
    state.grid.shift()
    state.grid.push(Array.from({ length: COLS }, (_, c) => (c === hole ? 0 : GARBAGE_CELL)))
  }
  let guard = 0
  while (collides(state, state.kind, state.rot, state.px, state.py) && guard < ROWS + 4) {
    state.py -= 1
    guard += 1
  }
  state.hint = null
}
