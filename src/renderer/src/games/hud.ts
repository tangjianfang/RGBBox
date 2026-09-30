/**
 * R218 U1/U5/U8 shared HUD toolkit — one design language across all four
 * games: translucent capsule containers, continuous health bars, alert
 * vignette, toast queue and juice helpers (hit-stop / shake / float text).
 *
 * Design contract (spec §U1):
 *  - capsule backgrounds 8-14% alpha, 1px semantic border, edge-anchored,
 *    never inside the central 60% attention zone;
 *  - foreground contrast ≥ 4.5:1 (colors chosen against the deep stage bg);
 *  - parallax comfort zone and pulse cadence tuned to avoid motion sickness.
 *
 * Everything here is a pure drawing/state helper over the shared 900×520
 * logical canvas space — no DOM, no engine logic.
 */

/** Difficulty tiers (R218 U4) — shared by all four games. */
export type GameDifficulty = 'casual' | 'standard' | 'hard' | 'insane'

export const GAME_DIFFICULTIES: readonly GameDifficulty[] = ['casual', 'standard', 'hard', 'insane']

export function isGameDifficulty (v: unknown): v is GameDifficulty {
  return typeof v === 'string' && (GAME_DIFFICULTIES as readonly string[]).includes(v)
}

/** Score multiplier per tier (R218 U4) — hooks the arcade profile. */
export const DIFFICULTY_SCORE_MULT: Record<GameDifficulty, number> = {
  casual: 1,
  standard: 1.5,
  hard: 2,
  insane: 3
}

export interface HudCapsuleOpts {
  /** Background alpha, default 0.1 (spec: 8-14%). */
  alpha?: number
  /** Border color; defaults to a translucent stage-line tone. */
  border?: string
  radius?: number
}

/** Translucent HUD capsule container (spec U1). Edge-anchored by callers. */
export function drawHudCapsule (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: HudCapsuleOpts = {}
): void {
  const { alpha = 0.1, border = 'rgba(255,255,255,0.18)', radius = 8 } = opts
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
  ctx.fillStyle = `rgba(8,12,20,${alpha})`
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = border
  ctx.stroke()
  ctx.restore()
}

export interface HealthBarOpts {
  /** Show thin segment ticks every 25% (default true). */
  segments?: boolean
  /** Pulse when ratio ≤ threshold (default 0.25). */
  pulseThreshold?: number
}

/**
 * Continuous health bar (spec U5): green→yellow→red gradient by ratio, low
 * health pulse (~1.2 Hz), white flash overlay when `flash` > 0.
 */
export function drawHealthBar (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number, t: number, opts: HealthBarOpts = {}
): void {
  const { segments = true, pulseThreshold = 0.25 } = opts
  const r = Math.max(0, Math.min(1, ratio))
  drawHudCapsule(ctx, x, y, w, h, { alpha: 0.14 })
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x + 1.5, y + 1.5, Math.max(0, (w - 3) * r), h - 3, 6)
  // R218: 测试环境(happy-dom noop ctx)的 createLinearGradient 可能返回
  // undefined——退回首 stop 纯色(与 games/scene.ts vgrad 同一防御模式)。
  const g = ctx.createLinearGradient(x, y, x + w, y)
  if (g) {
    if (r > 0.5) { g.addColorStop(0, '#34d399'); g.addColorStop(1, '#6ee7a9') }
    else if (r > 0.25) { g.addColorStop(0, '#fbbf24'); g.addColorStop(1, '#fcd34d') }
    else { g.addColorStop(0, '#f87171'); g.addColorStop(1, '#fca5a5') }
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = r > 0.5 ? '#34d399' : r > 0.25 ? '#fbbf24' : '#f87171'
  }
  if (r <= pulseThreshold) {
    ctx.globalAlpha = 0.72 + 0.28 * Math.abs(Math.sin(t * Math.PI * 2 * 1.2))
  }
  ctx.fill()
  if (segments) {
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = 'rgba(8,12,20,0.9)'
    ctx.lineWidth = 1
    for (let s = 1; s <= 3; s++) {
      const sx = Math.round(x + (w * s) / 4)
      ctx.beginPath()
      ctx.moveTo(sx, y + 1.5)
      ctx.lineTo(sx, y + h - 1.5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Alert vignette (spec U1) — edge breathing red when intensity > 0. */
export function drawAlertVignette (
  ctx: CanvasRenderingContext2D,
  w: number, h: number, intensity: number, t: number
): void {
  if (intensity <= 0) return
  const a = Math.min(0.5, intensity) * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 2 * 0.8)))
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.72)
  ctx.save()
  if (g) {
    g.addColorStop(0, 'rgba(248,113,113,0)')
    g.addColorStop(1, `rgba(248,113,113,${a})`)
    ctx.fillStyle = g
  } else {
    // R218: noop ctx(测试环境)退化为低透明度平涂(防御,同 scene.ts vgrad 模式)
    ctx.fillStyle = `rgba(248,113,113,${a * 0.25})`
  }
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Toast entry — auto-expiring hint capsule (spec U1). */
export interface HudToast {
  text: string
  life: number
  maxLife: number
  color: string
}

export function pushToast (toasts: HudToast[], text: string, seconds = 3, color = '#e2e8f0'): void {
  if (toasts.length >= 4) toasts.shift()
  toasts.push({ text, life: seconds, maxLife: seconds, color })
}

export function tickToasts (toasts: HudToast[], dt: number): void {
  for (let i = toasts.length - 1; i >= 0; i--) {
    toasts[i].life -= dt
    if (toasts[i].life <= 0) toasts.splice(i, 1)
  }
}

/** Draw the toast stack bottom-centre, fading out over the last 30%. */
export function drawToasts (ctx: CanvasRenderingContext2D, w: number, h: number, toasts: HudToast[]): void {
  const bw = Math.min(420, w - 40)
  let y = h - 18
  for (let i = toasts.length - 1; i >= 0; i--) {
    const toast = toasts[i]
    y -= 26
    const fade = Math.min(1, toast.life / (toast.maxLife * 0.3))
    drawHudCapsule(ctx, w / 2 - bw / 2, y, bw, 22, { alpha: 0.12 * fade + 0.04 })
    ctx.save()
    ctx.globalAlpha = fade
    ctx.fillStyle = toast.color
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(toast.text, w / 2, y + 11, bw - 16)
    ctx.restore()
  }
}

/** Juice helpers (spec U8) — all optional, all cheap. */
export interface JuiceState {
  /** Remaining hit-stop seconds (freeze ticks while > 0). */
  hitStop: number
  /** Screen-shake amplitude in logical px; decays exponentially. */
  shake: number
  /** Ambient float texts (damage numbers / pickups). */
  floats: { x: number, y: number, vy: number, life: number, maxLife: number, text: string, color: string }[]
}

export function emptyJuice (): JuiceState {
  return { hitStop: 0, shake: 0, floats: [] }
}

export function hitStop (juice: JuiceState, seconds = 0.03): void {
  juice.hitStop = Math.max(juice.hitStop, seconds)
}

export function shake (juice: JuiceState, power = 4): void {
  juice.shake = Math.min(10, juice.shake + power)
}

export function floatText (juice: JuiceState, x: number, y: number, text: string, color = '#fde68a'): void {
  if (juice.floats.length >= 40) juice.floats.shift()
  juice.floats.push({ x, y, vy: -34, life: 0.8, maxLife: 0.8, text, color })
}

export function tickJuice (juice: JuiceState, dt: number): void {
  juice.hitStop = Math.max(0, juice.hitStop - dt)
  juice.shake *= Math.pow(0.0015, dt)
  if (juice.shake < 0.05) juice.shake = 0
  for (let i = juice.floats.length - 1; i >= 0; i--) {
    const f = juice.floats[i]
    f.life -= dt
    f.y += f.vy * dt
    if (f.life <= 0) juice.floats.splice(i, 1)
  }
}

/** Apply the shake offset for this frame (call inside a save/restore pair). */
export function applyShake (ctx: CanvasRenderingContext2D, juice: JuiceState): void {
  if (juice.shake <= 0) return
  ctx.translate((Math.random() - 0.5) * 2 * juice.shake, (Math.random() - 0.5) * 2 * juice.shake)
}

export function drawFloats (ctx: CanvasRenderingContext2D, juice: JuiceState): void {
  ctx.save()
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (const f of juice.floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, f.x, f.y)
  }
  ctx.restore()
}
