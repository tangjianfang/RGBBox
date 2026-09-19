import { useEffect, useRef, type JSX } from 'react'
import { useI18n } from '../../i18n'
import type { VisionInputHandle } from '../../hooks/useVisionInput'

// R132.2: joystick-style vision overlay — the mobile-game direction pad the
// user asked for. A canvas compositor layer with its OWN rAF loop reading the
// hook's per-frame `frameRef` (never throttled) and `heldRef`, so it animates
// at display rate with ZERO React re-renders; React state (state/handSeen/
// stepId) only rides along via a ref for the status line.
//
// Geometry mirrors DirectionRing.update exactly: dx=(palm.x-center.x)*gainX,
// dy=-(palm.y-center.y)*gainY (camera up = screen up), so what lights up on
// the pad is literally what the engine sees. The gains are the engine's
// defaults (calibration doesn't retune them; the settings panel is a later
// R-N) — keep in sync with gesture_engine.js DirectionRing cfg.

const PAD_W = 168
const PAD_H = 198
const TEXT_H = 46
const R = 62
// DirectionRing defaults (gesture_engine.js) — see header comment
const GAIN_X = 1.4
const GAIN_Y = 1.8

const STATE_COLOR: Record<string, string> = {
  searching: '#8aa0ad',
  calibrating: '#fbbf24',
  active: '#4ade80',
  paused: '#fb923c',
}

/** sector index ↔ its arrow keys (SECTORS in gesture_engine.js, same order) */
const SECTOR_KEYS = [
  ['arrowright'],
  ['arrowup', 'arrowright'],
  ['arrowup'],
  ['arrowup', 'arrowleft'],
  ['arrowleft'],
  ['arrowdown', 'arrowleft'],
  ['arrowdown'],
  ['arrowdown', 'arrowright'],
]

interface PadFrame {
  state: string
  handSeen: boolean
  stepId: 'center' | 'reach' | 'pinch' | null
  label: string
}

type TFn = ReturnType<typeof useI18n>['t']

export function VisionPad({ vision }: { vision: VisionInputHandle }): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visionRef = useRef(vision)
  visionRef.current = vision
  const tRef = useRef<TFn>(t)
  tRef.current = t

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = PAD_W * dpr
    canvas.height = PAD_H * dpr
    ctx.scale(dpr, dpr)
    // R133: the palm target only advances at inference rate (~30Hz); this
    // smoothing state lets the DOT track it at display rate (60fps) so the
    // pad reads as fluid even though the signal is not.
    const smooth = { x: 0, y: 0, seen: false }
    let frame = 0
    const loop = () => {
      try {
        draw(ctx, visionRef.current, tRef.current, smooth)
      } catch {
        // drawing is best-effort — never take the game down with it
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="vision-pad" aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: PAD_W, height: PAD_H }} />
    </div>
  )
}

function statusText(pad: PadFrame, t: TFn): { text: string; color: string } {
  const color = STATE_COLOR[pad.state] ?? '#8aa0ad'
  if (pad.state === 'calibrating' && pad.stepId) {
    return { text: t(`games.vision.hint.${pad.stepId}`), color }
  }
  if (pad.state === 'active' && !pad.handSeen) {
    return { text: t('games.vision.state.searching'), color: '#fb923c' }
  }
  if (pad.state === 'active' || pad.state === 'paused' || pad.state === 'searching') {
    return { text: t(`games.vision.state.${pad.state as 'active' | 'paused' | 'searching'}`), color }
  }
  return { text: pad.label, color }
}

function draw(ctx: CanvasRenderingContext2D, vision: VisionInputHandle, t: TFn, smooth: { x: number; y: number; seen: boolean }): void {
  const now = performance.now()
  const frame = vision.frameRef.current
  const pad: PadFrame = { state: vision.state, handSeen: vision.handSeen, stepId: vision.stepId, label: vision.label }
  ctx.clearRect(0, 0, PAD_W, PAD_H)

  // ── status + perf lines ──────────────────────────────────────────────────
  const status = statusText(pad, t)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = status.color
  ctx.fillText(ellipsize(ctx, status.text, PAD_W - 20), PAD_W / 2, 7)
  ctx.font = '10px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(148,170,184,0.85)'
  const infer = frame?.stats?.infer
  const statsText = infer && infer.n > 0
    ? `${Math.round(frame?.stats?.inferFps ?? 0)}fps · p95 ${Math.round(infer.p95)}ms · ${frame?.stats?.delegate ?? '-'}`
    : '…'
  ctx.fillText(statsText, PAD_W / 2, 24)

  // ── compass ──────────────────────────────────────────────────────────────
  const cx = PAD_W / 2
  const cy = TEXT_H + 4 + R + 8
  const profile = (frame?.profile ?? {}) as {
    center?: { x: number; y: number }
    activeZone?: number
    deadZone?: number
  }
  const center = profile.center ?? { x: 0.5, y: 0.5 }
  const activeZone = profile.activeZone ?? 0.17
  const deadZone = profile.deadZone ?? activeZone * 0.55
  const k = R / (activeZone * 1.7) // active ring at ~59% of R, headroom above

  // state ring (pulse while searching)
  const stateColor = STATE_COLOR[pad.state] ?? '#8aa0ad'
  const pulse = pad.state === 'searching' ? 0.45 + 0.25 * Math.sin(now / 300) : 0.9
  ctx.strokeStyle = withAlpha(stateColor, pulse)
  ctx.lineWidth = 2
  circle(ctx, cx, cy, R, false)

  // dead zone (dashed) + trigger ring
  ctx.strokeStyle = 'rgba(148,170,184,0.35)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  circle(ctx, cx, cy, deadZone * k, false)
  ctx.setLineDash([])
  ctx.strokeStyle = withAlpha(stateColor, 0.55)
  circle(ctx, cx, cy, activeZone * k, false)

  // 8 sector spokes + highlight of the held sector(s)
  const held = vision.heldRef.current
  const pinchHeld = held.has('space')
  for (let s = 0; s < 8; s++) {
    const deg = s * 45
    const rad = (deg * Math.PI) / 180
    const isHeld = SECTOR_KEYS[s].length > 0 && SECTOR_KEYS[s].every((key) => held.has(key))
    const inner = isHeld ? deadZone * k * 0.5 : deadZone * k
    const outer = isHeld ? R + 4 : R - 6
    ctx.strokeStyle = isHeld ? withAlpha(stateColor, 0.95) : 'rgba(148,170,184,0.3)'
    ctx.lineWidth = isHeld ? 2 : 1
    line(ctx, cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner, cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer)
    if (isHeld) {
      // arrowhead just outside the rim, pointing outward
      const ax = cx + Math.cos(rad) * (R + 4)
      const ay = cy + Math.sin(rad) * (R + 4)
      arrow(ctx, ax, ay, rad, stateColor)
    }
  }

  // calibrated center cross
  ctx.strokeStyle = 'rgba(148,170,184,0.7)'
  ctx.lineWidth = 1
  line(ctx, cx - 4, cy, cx + 4, cy)
  line(ctx, cx, cy - 4, cx, cy + 4)

  // live palm dot (same transform as DirectionRing: gain + y-flip), drawn at
  // DISPLAY rate: the target from the latest processed frame is chased with
  // exponential smoothing so ~30Hz inference still reads as fluid motion
  const geom = frame?.geom
  if (geom) {
    const dx = (geom.palm.x - center.x) * GAIN_X
    const dy = -(geom.palm.y - center.y) * GAIN_Y
    let tx = cx + dx * k
    let ty = cy + dy * k
    const rr = Math.hypot(tx - cx, ty - cy)
    if (rr > R - 6) {
      tx = cx + ((tx - cx) / rr) * (R - 6)
      ty = cy + ((ty - cy) / rr) * (R - 6)
    }
    if (!smooth.seen) {
      smooth.x = tx
      smooth.y = ty
      smooth.seen = true
    } else {
      smooth.x += (tx - smooth.x) * 0.35
      smooth.y += (ty - smooth.y) * 0.35
    }
    ctx.strokeStyle = withAlpha(stateColor, 0.4)
    line(ctx, cx, cy, smooth.x, smooth.y)
    ctx.fillStyle = geom.pinch != null && geom.pinch < 0.55 ? '#67e8f9' : '#e2e8f0'
    ctx.shadowColor = '#67e8f9'
    ctx.shadowBlur = 8
    circle(ctx, smooth.x, smooth.y, 5, true)
    ctx.shadowBlur = 0
  } else {
    smooth.seen = false
  }

  // pinch badge (bottom of the pad — thumb-index pinch = Space/hard drop)
  ctx.fillStyle = pinchHeld ? '#67e8f9' : 'rgba(148,170,184,0.4)'
  circle(ctx, cx, PAD_H - 12, 5, true)
  ctx.font = '9px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(148,170,184,0.8)'
  ctx.fillText(pinchHeld ? t('games.vision.padPinch') : t('games.vision.padIdle'), cx, PAD_H - 24)

  // calibration progress arc + provisional center
  if (pad.state === 'calibrating') {
    const p = Math.min(1, Math.max(0, frame?.stepProgress ?? 0))
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, R - 5, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2)
    ctx.stroke()
    const prov = frame?.provisionalCenter
    if (prov) {
      const pdx = (prov.x - center.x) * GAIN_X
      const pdy = -(prov.y - center.y) * GAIN_Y
      ctx.strokeStyle = 'rgba(251,191,36,0.6)'
      ctx.setLineDash([2, 3])
      circle(ctx, cx + pdx * k, cy + pdy * k, 8, false)
      ctx.setLineDash([])
    }
  }
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean): void {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2)
  if (fill) ctx.fill()
  else ctx.stroke()
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(rad) * 5, y + Math.sin(rad) * 5)
  ctx.lineTo(x + Math.cos(rad + 2.5) * 5, y + Math.sin(rad + 2.5) * 5)
  ctx.lineTo(x + Math.cos(rad - 2.5) * 5, y + Math.sin(rad - 2.5) * 5)
  ctx.closePath()
  ctx.fill()
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text.length
  while (cut > 4 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut--
  return `${text.slice(0, cut)}…`
}
