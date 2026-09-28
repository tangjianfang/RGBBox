// 「光刃斩击」(R142-E4 / R141-C) — the gesture-native game. Design follows
// the Beat Saber / Fruit Ninja evidence: BIG targets, low precision demands,
// direction-marked, rhythm-tolerant — the input IS the game. It reuses the
// EXISTING vision primitives with zero new gesture code: a decisive directional
// sweep already fires Arrow* events (8-way ring), pinch already fires Space.
// Keyboard arrows/space work identically (parity for tests & no-camera play).
//
// Momentum (R142-L5): every slash spawns an inertial streak — velocity-carrying
// particles that coast and decay, the physical feel missing from binary input.

export const WIDTH = 900
export const HEIGHT = 520
export const RUN_SECONDS = 60

/** 8 directions in ring order (matches gesture SECTORS: 0=right, CCW to 7=down-right) */
export const DIRS: Array<{ x: number; y: number; glyph: string }> = [
  { x: 1, y: 0, glyph: '→' }, { x: 0.71, y: -0.71, glyph: '↗' }, { x: 0, y: -1, glyph: '↑' },
  { x: -0.71, y: -0.71, glyph: '↖' }, { x: -1, y: 0, glyph: '←' }, { x: -0.71, y: 0.71, glyph: '↙' },
  { x: 0, y: 1, glyph: '↓' }, { x: 0.71, y: 0.71, glyph: '↘' },
]

export type SlashPhase = 'ready' | 'running' | 'lost'

export interface Block {
  id: number
  dir: number
  /** 0 = spawn edge, 1 = the strike ring */
  t: number
  speed: number
  hue: number
  bonus: boolean
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
  /** R203(FR-SL01): 三心制(标准 3/休闲 5;漏块 -1,归零失败)。 */
  hearts: number
  maxHearts: number
  /** R203(FR-SL02): 连锁块(击中后触发相邻同向块连爆)。 */
  chainEnabled: boolean
}

export function initialSlashState(): SlashState {
  return {
    hitStop: 0,
    trail: [],
    hearts: 3,
    maxHearts: 3,
    chainEnabled: true,
    phase: 'ready', score: 0, combo: 0, bestCombo: 0, timeLeft: RUN_SECONDS,
    blocks: [], streaks: [], spawnTimer: 0.4, nextId: 1, bombCd: 0, flash: 0, shake: 0,
  }
}

export function startSlash(s: SlashState): void {
  const fresh = initialSlashState()
  Object.assign(s, fresh)
  s.phase = 'running'
}

/** Spawn a block flying inward from a random edge, marked with a direction. */
function spawnBlock(s: SlashState): void {
  // easier early, denser later — the difficulty curve
  const hard = Math.min(1, (RUN_SECONDS - s.timeLeft) / RUN_SECONDS)
  const dir = Math.floor(Math.random() * 8)
  s.blocks.push({
    id: s.nextId++,
    dir,
    t: 0,
    speed: 0.14 + hard * 0.16 + Math.random() * 0.05,
    hue: (dir * 45 + 180) % 360,
    bonus: Math.random() < 0.08,
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

/**
 * A slash in direction `dir` (0..7). Kills blocks whose marker matches AND
 * that reached the strike zone; a wrong-direction slash in the zone breaks
 * the combo (accuracy pressure without punishing speed).
 */
export function slash(s: SlashState, dir: number): 'hit' | 'wrong' | 'miss' {
  if (s.phase !== 'running' || dir < 0 || dir > 7) return 'miss'
  let hit: Block | null = null
  for (const b of s.blocks) {
    if (b.t >= 0.72 && b.t <= 1.08) { hit = b; break }
  }
  // momentum streak: the blade trail itself carries inertia (R142-L5)
  const d = DIRS[dir]
  burst(s, cx() - d.x * 60, cy() - d.y * 60, (dir * 45 + 180) % 360, 10, 220)
  if (!hit) return 'miss'
  if (hit.dir !== dir) {
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
  s.score += Math.round((hit.bonus ? 50 : 10) * mult)
  burst(s, p.x, p.y, hit.hue, hit.bonus ? 26 : 14, hit.bonus ? 320 : 200)
  // R203(FR-SL02): 连锁块——同向且接近判定圈的块被连带引爆(+5/块,不计连击)
  if (s.chainEnabled) {
    const chained = s.blocks.filter((b) => b.dir === dir && Math.abs(b.t - hit!.t) < 0.18)
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

export function tickSlash(s: SlashState, dt: number): void {
  // R200: hit-stop(CHAIN/金块)冻结游戏计时
  if (s.hitStop > 0) {
    const [remain, thaw] = hitStopTick(s.hitStop, dt)
    s.hitStop = remain
    if (thaw === 0) { s.trail = tickTrail(s.trail, dt); return }
    dt = thaw
  }
  s.trail = tickTrail(s.trail, dt)
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
  let missed = false
  for (const b of s.blocks) {
    b.t += b.speed * dt
    if (b.t > 1.12) missed = true
  }
  if (missed) {
    // R203(FR-SL01): 漏块 -1 心;归零失败
    s.combo = 0
    s.flash = 0.2
    s.hearts -= 1
    s.shake = Math.min(8, s.shake + 4)
    s.blocks = s.blocks.filter((b) => b.t <= 1.12)
    if (s.hearts <= 0) {
      s.hearts = 0
      s.phase = 'lost'
      return
    }
  }
  s.spawnTimer -= dt
  if (s.spawnTimer <= 0) {
    spawnBlock(s)
    const hard = Math.min(1, (RUN_SECONDS - s.timeLeft) / RUN_SECONDS)
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

function drawSlashBody(ctx: CanvasRenderingContext2D, s: SlashState, time: number): void {
  // R203(FR-SL01): 心形 HUD(左上)
  if (s.phase === 'running' || s.phase === 'lost') {
    ctx.save()
    ctx.font = '700 18px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < s.maxHearts; i += 1) {
      ctx.fillStyle = i < s.hearts ? '#fb7185' : 'rgba(251, 113, 133, 0.2)'
      ctx.fillText('♥', 16 + i * 22, 26)
    }
    ctx.restore()
  }
  ctx.save()
  if (s.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake)
  }
  // backdrop
  const g = ctx.createRadialGradient(cx(), cy(), 40, cx(), cy(), 520)
  g.addColorStop(0, '#101b22')
  g.addColorStop(1, '#0a1116')
  ctx.fillStyle = g
  ctx.fillRect(-12, -12, WIDTH + 24, HEIGHT + 24)

  // strike ring
  ctx.strokeStyle = 'rgba(103,232,249,0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 8])
  ctx.beginPath()
  ctx.arc(cx(), cy(), Math.min(WIDTH, HEIGHT) * 0.33, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // blocks with direction glyphs
  for (const b of s.blocks) {
    const p = blockPos(b)
    const size = 18 + b.t * 14
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(Math.atan2(DIRS[b.dir].y, DIRS[b.dir].x))
    ctx.strokeStyle = `hsl(${b.hue} 85% 62%)`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect?.(-size, -size, size * 2, size * 2, 8)
    if (!ctx.roundRect) ctx.rect(-size, -size, size * 2, size * 2)
    ctx.stroke()
    if (b.bonus) {
      ctx.fillStyle = `hsl(${b.hue} 85% 62%)`
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
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
