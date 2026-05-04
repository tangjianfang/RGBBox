import type { EffectLayer, RgbColor } from '../shared/types'
import { adjustSaturationAndContrast, clampUnit, hexToRgb, hslToRgb, lerpColor } from './color'
import { getTextMask } from './textRenderer'

export interface EffectContext {
  x: number
  y: number
  columns: number
  rows: number
  now: number
  _audioBass?: number
  _audioMid?: number
  _audioHigh?: number
  _audioBeat?: number
  _audioFreqBands?: number[]
  _screenPixel?: { r: number; g: number; b: number }
  _textMask?: boolean[]
}

// Deterministic hash for stable per-pixel randomness
function hash(seed: number): number {
  const s = Math.sin(seed) * 43758.5453123
  return s - Math.floor(s)
}

function hash2(x: number, y: number): number {
  return hash(x * 127.1 + y * 311.7)
}

// ── Fire per-column / per-frame cache ──────────────────────────────────────
// colSlow / colFast (and everything derived: colH, burstH, heightScale, tipFy)
// have NO dependency on fy (row coordinate) — they are identical for every row
// in the same column.  Similarly, the gust-event state is the same for every
// pixel in a frame.  Both are expensive (8 Math.sin calls per pixel currently),
// so we precompute them once per frame and cache by layerId.
interface _FireColCache {
  t: number          // context.now * speed at cache-build time
  cols: number       // columns at cache-build time (invalidated on grid resize)
  heightScaleArr: Float32Array
  tipFyArr: Float32Array
}
const _fireColCacheMap = new Map<string, _FireColCache>()

/**
 * Returns a 0..1 coordinate projected along the given direction angle (degrees, 0 = right, 90 = down).
 * Accounts for aspect ratio so that angle 45° looks visually diagonal regardless of grid shape.
 */
function dirT(ctx: EffectContext, angleDeg: number): number {
  const rad = (angleDeg * Math.PI) / 180
  // Normalize to -0.5..0.5, aspect-correct so 45° is visually diagonal
  const aspect = ctx.columns / Math.max(1, ctx.rows)
  const nx = (ctx.x / Math.max(1, ctx.columns - 1) - 0.5) * aspect
  const ny = ctx.y / Math.max(1, ctx.rows - 1) - 0.5
  // Project and normalize by the aspect-corrected half-diagonal so full range ≈ 0..1
  const halfDiag = Math.max(0.5 * aspect * Math.abs(Math.cos(rad)) + 0.5 * Math.abs(Math.sin(rad)), 0.0001)
  return (nx * Math.cos(rad) + ny * Math.sin(rad)) / halfDiag * 0.5 + 0.5
}

export function renderEffectPixel(layer: EffectLayer, context: EffectContext): RgbColor {
  switch (layer.kind) {

    // ── Classic ──────────────────────────────────────────────────────────────

    case 'static': {
      const text = String(layer.parameters.text ?? '')
      const bgColor = hexToRgb(String(layer.parameters.color ?? '#ffffff'))
      if (text.trim()) {
        const textX = Number(layer.parameters.textX ?? 0.5)
        const textY = Number(layer.parameters.textY ?? 0.5)
        const textScale = Number(layer.parameters.textScale ?? 1)
        const textColor = hexToRgb(String(layer.parameters.textColor ?? '#ffffff'))
        const mask = context._textMask ?? getTextMask(text, context.columns, context.rows, textX, textY, textScale)
        return mask[context.y * context.columns + context.x] ? textColor : bgColor
      }
      return bgColor
    }

    case 'breathing': {
      const speed = Number(layer.parameters.speed ?? 0.45)
      const base = hexToRgb(String(layer.parameters.color ?? '#ff4f87'))
      const pulse = 0.45 + Math.sin(context.now * speed * Math.PI * 2) * 0.35

      return { r: base.r * pulse, g: base.g * pulse, b: base.b * pulse }
    }

    case 'rainbow': {
      const speed = Number(layer.parameters.speed ?? 0.35)
      const spread = Number(layer.parameters.spread ?? 1.2)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const angle = Number(layer.parameters.angle ?? 0)
      const hue = (dirT(context, angle) * 300 * spread + context.now * speed * 120 + hueShift) % 360

      return hslToRgb(hue, 0.88, 0.54)
    }

    case 'wave': {
      const speed = Number(layer.parameters.speed ?? 0.5)
      const width = Number(layer.parameters.width ?? 0.35)
      const color = hexToRgb(String(layer.parameters.color ?? '#00ccff'))
      const angle = Number(layer.parameters.angle ?? 45)
      const wave = Math.sin((dirT(context, angle) + context.now * speed) * Math.PI * 2)
      // only the positive half of the wave is bright; width scales peak brightness
      const brightness = clampUnit(0.04 + Math.max(0, wave) * width * 2.7)

      return {
        r: Math.round(color.r * brightness),
        g: Math.round(color.g * brightness),
        b: Math.round(color.b * brightness)
      }
    }

    case 'zone-gradient': {
      const from = hexToRgb(String(layer.parameters.from ?? '#2cff9a'))
      const to = hexToRgb(String(layer.parameters.to ?? '#ffcf40'))
      const angle = Number(layer.parameters.angle ?? 45)
      const ratio = clampUnit(dirT(context, angle))

      return {
        r: from.r * (1 - ratio) + to.r * ratio,
        g: from.g * (1 - ratio) + to.g * ratio,
        b: from.b * (1 - ratio) + to.b * ratio
      }
    }

    // ── Advanced ─────────────────────────────────────────────────────────────

    case 'fire': {
      const speed     = Number(layer.parameters.speed     ?? 0.7)
      const intensity = Number(layer.parameters.intensity ?? 0.85)
      const spread    = Number(layer.parameters.spread    ?? 1.2)
      const color     = hexToRgb(String(layer.parameters.color ?? '#ff4400'))
      const t         = context.now * speed

      // fy: 0 = top row (cool tip), 1 = bottom row (hot base) → fire rises upward
      const fy = context.y / Math.max(1, context.rows - 1)
      const fx = (context.x / Math.max(1, context.columns - 1) - 0.5) * spread

      // Smooth value noise: hash-based bilinear interpolation.
      // Produces organic shapes without the stripe artefacts of sin/cos.
      const vn = (nx: number, ny: number): number => {
        const ix = Math.floor(nx), iy = Math.floor(ny)
        const ux = nx - ix,         uy = ny - iy
        const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy)
        const a = hash2(ix,     iy),     b = hash2(ix + 1, iy)
        const c = hash2(ix,     iy + 1), d = hash2(ix + 1, iy + 1)
        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
      }

      // Upward drift: subtract time from noise y-coord so flames appear to rise
      const drift = t * 1.8
      const n1 = vn(fx * 3.0 + t * 0.4,  fy * 2.5 - drift)
      const n2 = vn(fx * 6.5 - t * 0.6,  fy * 5.0 - drift * 2.1) * 0.5
      const n3 = vn(fx * 13.0 + t * 0.9, fy * 10.0 - drift * 3.8) * 0.25
      const turbulence = (n1 + n2 + n3) / 1.75

      // ── Per-frame + per-column precompute cache ───────────────────────────
      // colSlow/colFast have no fy-dependence: compute once per column per frame.
      // Gust state has no x/y dependence: compute once per frame.
      // Both are cached in _fireColCacheMap and invalidated when t or column count changes.
      let colCache = _fireColCacheMap.get(layer.id)
      if (!colCache || colCache.cols !== context.columns || colCache.t !== t) {
        const cols = context.columns

        // Gust event state (per-frame, identical for all pixels)
        const evRate   = 0.55
        const evBucket = Math.floor(t * evRate)
        const evFrac   = t * evRate - evBucket
        const evCur    = hash(evBucket       * 4.13 + 1.7)
        const evNext   = hash((evBucket + 1) * 4.13 + 1.7)
        const xf       = Math.min(1.0, evFrac / 0.18)
        const xfSm     = xf * xf * (3 - 2 * xf)
        const evBlend  = evCur * (1 - xfSm) + evNext * xfSm
        const evShaped = evBlend < 0.5
          ? Math.pow(evBlend * 2, 2.5) * 0.5
          : 1.0 - Math.pow((1.0 - evBlend) * 2, 2.5) * 0.5
        const globalH  = 0.03 + evShaped * 1.42

        // Per-column arrays (no fy term → O(cols) instead of O(cols×rows))
        const heightScaleArr = new Float32Array(cols)
        const tipFyArr       = new Float32Array(cols)
        for (let cx = 0; cx < cols; cx++) {
          const cfx     = (cx / Math.max(1, cols - 1) - 0.5) * spread
          const colSlow   = vn(cfx * 2.0 + t * 0.32, t * 0.20)
          const colShaped = Math.pow(colSlow, 1.8)
          const colH      = 0.04 + colShaped * 0.96
          const colFast   = vn(cfx * 3.5 - t * 0.90, t * 0.62 + 5.7)
          const burstH    = 0.12 + colFast * 0.88
          const hs        = globalH * Math.sqrt(colH * burstH)
          heightScaleArr[cx] = hs
          tipFyArr[cx]       = Math.max(0.0, 1.0 - hs * 0.88)
        }

        colCache = { t, cols, heightScaleArr, tipFyArr }
        _fireColCacheMap.set(layer.id, colCache)
      }

      const heightScale = colCache.heightScaleArr[context.x]
      const tipFy       = colCache.tipFyArr[context.x]

      // Micro-flicker: very fast per-pixel shimmer for live glowing look
      const flicker  = vn(fx * 9.0 + t * 2.4, fy * 5.5 - drift * 0.4) * 0.20 + 0.80  // 0.80..1.0

      // flameFy: normalised 0 (tip) → 1 (base) within the live flame body
      const flameFy  = clampUnit((fy - tipFy) / Math.max(0.01, 1.0 - tipFy))

      // Wisp zone: turbulence pushes tendrils slightly above nominal tip
      const aboveTip = Math.max(0, tipFy - fy)           // positive only above tip
      const wispZone = Math.max(0, 1.0 - aboveTip * 7)   // 1 just above tip, 0 far above
      const wisp     = turbulence * wispZone * heightScale * 0.28

      const temperature = clampUnit(
        (flameFy * flameFy * 1.5 + turbulence * (flameFy * 0.55 + 0.04) + wisp - 0.03) * intensity * flicker
      )

      // 4-stop realistic fire palette: black → user color → orange → yellow → white
      if (temperature < 0.35) {
        const p = temperature / 0.35
        return { r: Math.round(color.r * p), g: Math.round(color.g * p), b: Math.round(color.b * p) }
      } else if (temperature < 0.65) {
        // user color → orange (#ff8800)
        const p = (temperature - 0.35) / 0.30
        return {
          r: Math.min(255, Math.round(color.r + (255 - color.r) * p)),
          g: Math.min(255, Math.round(color.g + (136 - color.g) * p)),
          b: Math.round(color.b * (1 - p))
        }
      } else if (temperature < 0.85) {
        // orange (#ff8800) → yellow (#ffe000)
        const p = (temperature - 0.65) / 0.20
        return { r: 255, g: Math.round(136 + (224 - 136) * p), b: Math.round(24 * p) }
      } else {
        // yellow (#ffe000) → white (#ffffff)
        const p = (temperature - 0.85) / 0.15
        return { r: 255, g: Math.round(224 + (255 - 224) * p), b: Math.round(24 + (255 - 24) * p) }
      }
    }

    case 'starlight': {
      const density = Number(layer.parameters.density ?? 0.25)
      const speed = Number(layer.parameters.speed ?? 0.5)
      const color = hexToRgb(String(layer.parameters.color ?? '#ffffff'))

      const h1 = hash2(context.x, context.y)
      const h2 = hash2(context.y + 100, context.x + 200)

      if (h1 > density) return { r: 0, g: 0, b: 0 }

      const phase = h2 * Math.PI * 4
      const freq = 0.5 + h1 * 2.5
      const twinkle = 0.5 + Math.sin(context.now * freq * speed * Math.PI * 2 + phase) * 0.5
      const brightness = Math.pow(twinkle, 2.4)

      return {
        r: Math.round(color.r * brightness),
        g: Math.round(color.g * brightness),
        b: Math.round(color.b * brightness)
      }
    }

    case 'ripple': {
      const speed = Number(layer.parameters.speed ?? 0.45)
      const frequency = Number(layer.parameters.frequency ?? 3.5)
      const color = hexToRgb(String(layer.parameters.color ?? '#00e5ff'))

      // Default idle center (0..1 normalised, default = grid center)
      const cxN = Number(layer.parameters.cx ?? 0.5)
      const cyN = Number(layer.parameters.cy ?? 0.5)
      const cx = cxN * (context.columns - 1)
      const cy = cyN * (context.rows - 1)
      const dx = (context.x - cx) / Math.max(1, context.columns / 2)
      const dy = (context.y - cy) / Math.max(1, context.rows / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)

      const wave = Math.sin((dist * frequency - context.now * speed) * Math.PI * 2)
      let brightness = clampUnit((wave + 1) / 2) * Math.max(0, 1 - dist * 0.65)

      // Burst ripple: click injects burstAge (seconds since click, computed in renderer) + burstCx/burstCy
      const burstAge = Number(layer.parameters.burstAge ?? -1)
      const burstDuration = 2.5
      if (burstAge >= 0 && burstAge < burstDuration) {
        const bcxN = Number(layer.parameters.burstCx ?? 0.5)
        const bcyN = Number(layer.parameters.burstCy ?? 0.5)
        const bcx = bcxN * (context.columns - 1)
        const bcy = bcyN * (context.rows - 1)
        const bdx = (context.x - bcx) / Math.max(1, context.columns / 2)
        const bdy = (context.y - bcy) / Math.max(1, context.rows / 2)
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy)
        const burstSpeed = 1.1
        const burstFreq = Number(layer.parameters.frequency ?? 3.5) * 1.4
        const burstWave = Math.sin((bdist * burstFreq - burstAge * burstSpeed) * Math.PI * 2)
        const decay = Math.max(0, 1 - burstAge / burstDuration)
        const burstB = clampUnit((burstWave + 1) / 2) * Math.max(0, 1 - bdist * 0.55) * decay
        brightness = Math.min(1, brightness + burstB)
      }

      return {
        r: Math.round(color.r * brightness),
        g: Math.round(color.g * brightness),
        b: Math.round(color.b * brightness)
      }
    }

    case 'spectrum': {
      const speed = Number(layer.parameters.speed ?? 0.25)
      const saturation = Number(layer.parameters.saturation ?? 0.95)
      const hueShift = Number(layer.parameters.hueShift ?? 0)

      // Each pixel has a unique ±20° hue offset so the grid looks like a glittery wash
      // rather than a flat solid colour that cycles.
      const pixOff     = (hash2(context.x, context.y) - 0.5) * 40
      const hue        = (context.now * speed * 360 + hueShift + pixOff + 360) % 360

      // Independent per-pixel brightness shimmer
      const shimFreq   = 0.5 + hash2(context.x + 5,  context.y + 7)  * 1.5
      const shimPhase  = hash2(context.x + 99, context.y + 33) * Math.PI * 2
      const shimmer    = 0.75 + Math.sin(context.now * shimFreq + shimPhase) * 0.25

      return hslToRgb(hue, saturation, 0.50 * shimmer)
    }

    case 'comet': {
      const speed = Number(layer.parameters.speed ?? 0.45)
      const tail  = Number(layer.parameters.tail  ?? 0.35)
      const color = hexToRgb(String(layer.parameters.color ?? '#ffffff'))
      const angle = Number(layer.parameters.angle ?? 0)

      const axisPos  = dirT(context, angle)
      const crossPos = dirT(context, (angle + 90) % 360)
      const crossDist = Math.abs(crossPos - 0.5) * 2

      let brightness = 0
      let whiteBlend = 0

      // Two comets 180° apart keep the grid continuously lit
      for (let i = 0; i < 2; i++) {
        const headPos = ((context.now * speed) + i * 0.5) % 1
        const behind  = (axisPos - headPos + 1) % 1
        if (behind >= tail) continue

        const tailFall  = Math.exp(-behind * 6 / tail)
        const crossFade = Math.max(0, 1 - crossDist * 4)  // slightly wider glow
        const b = tailFall * crossFade
        if (b > brightness) {
          brightness = b
          whiteBlend = 1 - clampUnit(behind / Math.max(0.01, tail))
        }
      }

      return {
        r: Math.round((color.r + (255 - color.r) * whiteBlend) * brightness),
        g: Math.round((color.g + (255 - color.g) * whiteBlend) * brightness),
        b: Math.round((color.b + (255 - color.b) * whiteBlend) * brightness)
      }
    }

    case 'lightning': {
      const color = hexToRgb(String(layer.parameters.color ?? '#a8c8ff'))
      const speed = Number(layer.parameters.speed ?? 0.2)
      const intensity = Number(layer.parameters.intensity ?? 0.9)

      const cycle = (context.now * speed * 1.3) % 1
      const flashOn = cycle < 0.08 || (cycle > 0.52 && cycle < 0.57)

      if (!flashOn) return { r: 0, g: 0, b: 0 }

      const nx = context.x / context.columns
      const ny = context.y / context.rows

      const boltX = 0.5
        + Math.sin(ny * 6.3 + context.now * 9.1) * 0.09
        + Math.sin(ny * 14.7 - context.now * 5.3) * 0.05
        + Math.sin(ny * 27.1 + context.now * 13.7) * 0.025

      const dist = Math.abs(nx - boltX)
      const glow = Math.max(0, 1 - dist * context.columns * 1.6) * intensity

      return {
        r: Math.min(255, Math.round(color.r * glow + 255 * glow * 0.4)),
        g: Math.min(255, Math.round(color.g * glow + 255 * glow * 0.5)),
        b: Math.min(255, Math.round(color.b * glow + 255 * glow * 0.6))
      }
    }

    case 'aurora': {
      const speed     = Number(layer.parameters.speed     ?? 0.12)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const hueShift  = Number(layer.parameters.hueShift  ?? 0)

      const hFraction = context.x / Math.max(1, context.columns - 1)
      const vFraction = context.y / Math.max(1, context.rows - 1)

      // Curtain: strong at top, fades toward bottom
      const curtain = Math.pow(clampUnit(1 - vFraction * 1.4), 0.55)

      const t = context.now * speed
      // Slow undulating ribbons + fast shimmer, modulated by slowly-varying phase
      const w1 = Math.sin(hFraction * Math.PI * 2.7 + t * 0.9  + Math.sin(t * 0.31) * 1.2) * 0.5 + 0.5
      const w2 = Math.sin(hFraction * Math.PI * 5.1 - t * 1.4  + Math.cos(t * 0.47) * 0.8) * 0.5 + 0.5
      const w3 = Math.sin(hFraction * Math.PI * 9.8 + t * 2.3) * 0.25 + 0.25   // fine shimmer
      const w4 = Math.cos(hFraction * Math.PI * 3.3 - t * 0.5) * 0.5 + 0.5    // slow broad band
      const blended = w1 * 0.4 + w2 * 0.3 + w3 * 0.1 + w4 * 0.2

      // Hue: green-teal core (130..220°), edges drift toward purple
      const edgeDist = Math.abs(hFraction - 0.5) * 2  // 0=center, 1=edge
      const hue = ((130 + blended * 90 + edgeDist * 55 + hueShift) % 360 + 360) % 360

      // Bright fringe glow along the very top edge (where curtain meets sky)
      const topRim = Math.max(0, 1 - vFraction * 8) * 0.4

      const brightness = curtain * intensity * (0.35 + blended * 0.55) * (0.65 + w4 * 0.35)
      return hslToRgb(hue, 0.95, Math.min(0.9, brightness * 0.75 + topRim * curtain))
    }

    case 'explode': {
      const speed = Number(layer.parameters.speed ?? 0.4)
      const color = hexToRgb(String(layer.parameters.color ?? '#ff6020'))

      const cx = (context.columns - 1) / 2
      const cy = (context.rows - 1) / 2
      const dx = (context.x - cx) / Math.max(1, context.columns / 2)
      const dy = (context.y - cy) / Math.max(1, context.rows / 2)
      const dist  = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx)  // -π..π

      // Three rings at staggered phases for a continuous burst feel
      let totalBurst = 0
      let hotCycle   = 0
      for (let i = 0; i < 3; i++) {
        const phase   = i / 3
        const cycle   = ((context.now * speed) + phase) % 1
        const expandR = cycle * 1.5          // ring expands from 0 to 1.5
        const ring    = Math.abs(dist - expandR)
        const burst   = Math.max(0, 0.12 - ring) / 0.12
        // Cosine angular mask: creates 8-ray spoke pattern that spins outward
        const spoke   = 0.35 + 0.65 * Math.max(0, Math.cos(angle * 8 + expandR * Math.PI * 4 + i * 2.1))
        const contrib = burst * spoke
        if (contrib > totalBurst) { totalBurst = contrib; hotCycle = cycle }
      }

      const edgeFade = Math.max(0, 1 - dist * 0.65)
      // Colour: deep user colour at ring front → orange → bright yellow at peak
      const hotness = hotCycle
      return {
        r: Math.min(255, Math.round((color.r + (255 - color.r) * hotness * 0.6) * totalBurst * edgeFade)),
        g: Math.min(255, Math.round((color.g + (200 - color.g) * hotness * 0.8) * totalBurst * edgeFade)),
        b: Math.max(0,   Math.round(color.b * Math.max(0, 1 - hotness * 2) * totalBurst * edgeFade))
      }
    }

    // ── Audio Reactive ────────────────────────────────────────────────────────

    case 'audio-beat': {
      const color = hexToRgb(String(layer.parameters.color ?? '#ff2266'))
      const sensitivity = Number(layer.parameters.sensitivity ?? 1.2)
      const bass = Number(context._audioBass ?? 0)
      const beat = Number(context._audioBeat ?? 0)

      const pulse = clampUnit((bass * 0.65 + beat * 0.35) * sensitivity)
      const cx = (context.columns - 1) / 2
      const cy = (context.rows - 1) / 2
      const dx = (context.x - cx) / Math.max(1, context.columns / 2)
      const dy = (context.y - cy) / Math.max(1, context.rows / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radial = Math.max(0, 1 - dist * (1 - pulse * 0.6))
      const brightness = pulse * radial

      return {
        r: Math.round(color.r * brightness),
        g: Math.round(color.g * brightness),
        b: Math.round(color.b * brightness)
      }
    }

    case 'audio-equalizer': {
      const sensitivity = Number(layer.parameters.sensitivity ?? 1.0)
      const colorLow  = hexToRgb(String(layer.parameters.colorLow  ?? '#00ff44'))
      const colorHigh = hexToRgb(String(layer.parameters.colorHigh ?? '#ff2200'))

      let bandLevel: number
      const freqBands = context._audioFreqBands
      if (freqBands && freqBands.length > 0) {
        // Map column to the log-spaced frequency band (with linear interpolation)
        const t = context.x / Math.max(1, context.columns - 1)
        const bandIdxF = t * (freqBands.length - 1)
        const lo = Math.floor(bandIdxF)
        const hi = Math.min(freqBands.length - 1, lo + 1)
        bandLevel = freqBands[lo] * (1 - (bandIdxF - lo)) + freqBands[hi] * (bandIdxF - lo)
      } else {
        // Fallback to 3-band averages when no FFT data available
        const bass = Number(context._audioBass ?? 0)
        const mid = Number(context._audioMid ?? 0)
        const high = Number(context._audioHigh ?? 0)
        const colFraction = context.x / Math.max(1, context.columns - 1)
        if (colFraction < 0.33) {
          bandLevel = bass + (mid - bass) * (colFraction / 0.33)
        } else if (colFraction < 0.67) {
          bandLevel = mid
        } else {
          bandLevel = mid + (high - mid) * ((colFraction - 0.67) / 0.33)
        }
      }

      const heightFraction = 1 - context.y / Math.max(1, context.rows - 1)
      const lit = heightFraction < clampUnit(bandLevel * sensitivity) ? 1 : 0

      if (lit === 0) return { r: 0, g: 0, b: 0 }

      // blend from colorLow (bar bottom) to colorHigh (bar top) by height
      return {
        r: Math.round(colorLow.r * (1 - heightFraction) + colorHigh.r * heightFraction),
        g: Math.round(colorLow.g * (1 - heightFraction) + colorHigh.g * heightFraction),
        b: Math.round(colorLow.b * (1 - heightFraction) + colorHigh.b * heightFraction)
      }
    }

    // ── Random Color ─────────────────────────────────────────────────────────

    case 'random-color': {
      const speed = Number(layer.parameters.speed ?? 0.30)

      // Each pixel is anchored to one of 6 pure hue slots (0°,60°,120°,180°,240°,300°).
      // It then smoothly transitions to the next slot at its own unique rate,
      // making the grid look like a mosaic of independently drifting vivid blocks.
      const slotSeed  = hash2(context.x,       context.y)        // 0..1 → starting slot
      const rateVar   = hash2(context.x + 200, context.y + 300)  // 0..1 → speed multiplier
      const phaseFine = hash2(context.x + 55,  context.y + 89)   // 0..1 → fine sub-slot offset

      // 6 pure slots; pick a starting slot from the hash so neighbours are on different colours
      const startSlot = Math.floor(slotSeed * 6)                  // 0..5
      // Cycle speed: base * (0.2 … 2.0) – wide range so blocks visually drift at very different rates
      const pixelSpeed = speed * (0.2 + rateVar * 1.8)
      // Continuous hue within its slot window: slot×60 + 0..60, advancing over time
      const slotHue = (startSlot * 60 + phaseFine * 30 + context.now * pixelSpeed * 60) % 360

      return hslToRgb(slotHue, 1.0, 0.5)
    }

    // ── Screen Ambient ────────────────────────────────────────────────────────

    case 'screen-ambient':
    default: {
      // If a real screen capture pixel is available, use it directly with enhancement
      if (context._screenPixel) {
        const saturation = Number(layer.parameters.saturation ?? 1.1)
        const contrast = Number(layer.parameters.contrast ?? 1.05)
        return adjustSaturationAndContrast(context._screenPixel, saturation, contrast)
      }
      // Fallback animation (used when screen capture is unavailable, e.g. overlay active).
      // Use S=1.0, L=0.5 — maximum vibrancy — so the overlay stays vivid.
      const horizontal = context.x / Math.max(1, context.columns - 1)
      const vertical = context.y / Math.max(1, context.rows - 1)
      const warmEdge = hslToRgb(28 + Math.sin(context.now * 0.21) * 10, 1.0, 0.5)
      const coolEdge = hslToRgb(205 + Math.cos(context.now * 0.17) * 18, 1.0, 0.5)
      const sceneColor = hslToRgb(265 + Math.sin(horizontal * 3.8 + context.now * 0.18) * 52, 1.0, 0.5)
      const edgeWeight = Math.max(
        Math.abs(horizontal - 0.5) * 2,
        Math.abs(vertical - 0.5) * 2
      )
      const contentPulse = (Math.sin(horizontal * 8 + context.now * 0.72) + Math.cos(vertical * 6 - context.now * 0.43) + 2) / 4
      const edgeBlend = lerpColor(coolEdge, warmEdge, horizontal)
      const mappedColor = lerpColor(sceneColor, edgeBlend, 0.35 + edgeWeight * 0.42)

      return lerpColor(mappedColor, hslToRgb(176, 1.0, 0.5), contentPulse * 0.18)
    }
  }
}
