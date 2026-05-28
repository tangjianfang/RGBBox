import type { EffectLayer, RgbColor } from '../shared/types'
import { adjustSaturationAndContrast, clampByte, clampUnit, hexToRgb, hslToRgb, lerpColor } from './color'
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

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const ux = x - ix, uy = y - iy
  const sx = ux * ux * (3 - 2 * ux)
  const sy = uy * uy * (3 - 2 * uy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function fbm2(x: number, y: number, octaves = 4): number {
  let value = 0
  let amplitude = 0.5
  let scale = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value += valueNoise2(x * scale, y * scale) * amplitude
    total += amplitude
    scale *= 2.02
    amplitude *= 0.52
  }
  return total > 0 ? value / total : 0
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const range = edge1 - edge0
  const amount = clampUnit((value - edge0) / (Math.abs(range) < 0.0001 ? 0.0001 : range))
  return amount * amount * (3 - 2 * amount)
}

function colorScale(color: RgbColor, scale: number): RgbColor {
  return {
    r: clampByte(color.r * scale),
    g: clampByte(color.g * scale),
    b: clampByte(color.b * scale)
  }
}

function colorAdd(base: RgbColor, overlay: RgbColor, scale = 1): RgbColor {
  return {
    r: clampByte(base.r + overlay.r * scale),
    g: clampByte(base.g + overlay.g * scale),
    b: clampByte(base.b + overlay.b * scale)
  }
}

function thermalColor(temperature: number): RgbColor {
  const heat = clampUnit(temperature)
  if (heat < 0.34) return hslToRgb(8 + heat * 50, 1.0, heat * 0.65)
  if (heat < 0.72) return hslToRgb(28 + heat * 25, 1.0, 0.22 + heat * 0.46)
  return hslToRgb(205 - heat * 70, 0.75, 0.58 + heat * 0.34)
}

function normCoords(context: EffectContext): { nx: number; ny: number; aspect: number } {
  const aspect = context.columns / Math.max(1, context.rows)
  return {
    nx: (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect,
    ny: context.y / Math.max(1, context.rows - 1) - 0.5,
    aspect
  }
}

function pointSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const projection = clampUnit((wx * vx + wy * vy) / Math.max(0.0001, vx * vx + vy * vy))
  const dx = px - (ax + vx * projection)
  const dy = py - (ay + vy * projection)
  return Math.sqrt(dx * dx + dy * dy)
}

const ICOSAHEDRON_VERTICES = (() => {
  const phi = (1 + Math.sqrt(5)) / 2
  const scale = 1 / Math.sqrt(1 + phi * phi)
  return [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(([x, y, z]) => [x * scale, y * scale, z * scale] as const)
})()

const ICOSAHEDRON_EDGES = [
  [0, 1], [0, 5], [0, 7], [0, 10], [0, 11], [1, 5], [1, 7], [1, 8], [1, 9],
  [2, 3], [2, 4], [2, 6], [2, 10], [2, 11], [3, 4], [3, 6], [3, 8], [3, 9],
  [4, 5], [4, 9], [4, 11], [5, 9], [5, 11], [6, 7], [6, 8], [6, 10],
  [7, 8], [7, 10], [8, 9], [10, 11],
] as const

const DIGIT_3X5 = [
  0b111101101101111,
  0b010110010010111,
  0b111001111100111,
  0b111001111001111,
  0b101101111001001,
  0b111100111001111,
  0b111100111101111,
  0b111001010010010,
  0b111101111101111,
  0b111101111001111,
] as const

function digitGlyphOn(digit: number, x: number, y: number): boolean {
  if (x < 0 || x > 2 || y < 0 || y > 4) return false
  const mask = DIGIT_3X5[Math.abs(Math.floor(digit)) % 10]
  const bit = 14 - (y * 3 + x)
  return ((mask >> bit) & 1) === 1
}

// ── Audio effect frame-level caches ──────────────────────────────────────
// audio-beat: per-layer decay envelope (fast attack, decay-only release)
interface _BeatEnv { lastNow: number; pulse: number }
const _beatEnvMap = new Map<string, _BeatEnv>()
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
      const baseBrightness = Number(layer.parameters.baseBrightness ?? 0.18)
      const pulseAmplitude = Number(layer.parameters.pulseAmplitude ?? 0.62)
      const phaseOffset = Number(layer.parameters.phaseOffset ?? 0)
      const shimmerIntensity = Number(layer.parameters.shimmerIntensity ?? 0)
      // Apple-style breathing: ultra-smooth quintic ease (slow in/out, natural cadence)
      const wave = (Math.sin((context.now * speed + phaseOffset) * Math.PI * 2) + 1) * 0.5
      const t6 = wave * wave * wave * (wave * (wave * 6 - 15) + 10) // quintic smoothstep
      // Subtle warm-cool color temperature shift during breath cycle for organic feel
      const warmShift = t6 * 0.06 // peak brightness warms slightly
      const spatial = 1 + (hash2(context.x, context.y) - 0.5) * shimmerIntensity * 0.12
      const pulse = clampUnit((baseBrightness + t6 * pulseAmplitude) * spatial)
      // Perceptual gamma: apply power curve so dim values don't appear too harsh on LED
      const perceptualPulse = Math.pow(pulse, 1.12)

      return {
        r: clampByte((base.r + warmShift * 40) * perceptualPulse),
        g: clampByte(base.g * perceptualPulse),
        b: clampByte((base.b - warmShift * 20) * perceptualPulse)
      }
    }

    case 'rainbow': {
      const speed = Number(layer.parameters.speed ?? 0.35)
      const spread = Number(layer.parameters.spread ?? 1.2)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const angle = Number(layer.parameters.angle ?? 0)
      const hue = (dirT(context, angle) * 300 * spread + context.now * speed * 120 + hueShift) % 360
      // Premium rainbow: perceptually-uniform luminance variation along the hue wheel
      // Human eyes perceive yellow/green as brighter → lower lightness there for even visual weight
      const hueRad = (hue * Math.PI) / 180
      const perceptualL = 0.52 + Math.cos(hueRad * 2 - 1.2) * 0.06 // subtle luminance compensation
      // Higher saturation with gentle bloom feel at peaks
      return hslToRgb(hue, 0.94, perceptualL)
    }

    case 'wave': {
      const speed = Number(layer.parameters.speed ?? 0.5)
      const width = Number(layer.parameters.width ?? 0.35)
      const color = hexToRgb(String(layer.parameters.color ?? '#00ccff'))
      const angle = Number(layer.parameters.angle ?? 45)
      const phase = (dirT(context, angle) + context.now * speed) * Math.PI * 2
      const wave = Math.sin(phase)
      // Gaussian glow envelope instead of hard clamp for premium soft light falloff
      const primary = Math.exp(-Math.pow((1 - wave) / (width * 1.8), 2))
      // Secondary harmonic adds richness and depth to the wave pattern
      const secondary = Math.exp(-Math.pow((1 - Math.sin(phase * 2.1 + 0.7)) / (width * 2.8), 2)) * 0.18
      const brightness = clampUnit(0.02 + primary + secondary)
      // Subtle white-core bloom at peak brightness (Apple-style glow)
      const bloom = Math.pow(primary, 3.5) * 0.25

      return {
        r: clampByte((color.r + (255 - color.r) * bloom) * brightness),
        g: clampByte((color.g + (255 - color.g) * bloom) * brightness),
        b: clampByte((color.b + (255 - color.b) * bloom) * brightness)
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
      const heat      = Number(layer.parameters.heat      ?? 1.0)
      const sparks    = Number(layer.parameters.sparks    ?? 0.16)
      const wind      = Number(layer.parameters.wind      ?? 0)
      const baseHeight = Number(layer.parameters.baseHeight ?? 1.0)
      const t         = context.now * speed

      // fy: 0 = top row (cool tip), 1 = bottom row (hot base) → fire rises upward
      const fy = context.y / Math.max(1, context.rows - 1)
      const fx = (context.x / Math.max(1, context.columns - 1) - 0.5) * spread + wind * (1 - fy) * 0.28

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
      const n1 = vn(fx * 3.0 + t * 0.4 + wind * t * 0.45,  fy * 2.5 - drift)
      const n2 = vn(fx * 6.5 - t * 0.6 + wind * t * 0.72,  fy * 5.0 - drift * 2.1) * 0.5
      const n3 = vn(fx * 13.0 + t * 0.9 + wind * t * 1.12, fy * 10.0 - drift * 3.8) * 0.25
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
          const hs        = clampUnit(globalH * Math.sqrt(colH * burstH) * baseHeight)
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

      const emberSeed = hash2(context.x + Math.floor(t * 12), context.y + Math.floor(t * 19))
      const sparkZone = clampUnit((0.78 - fy) * 2.0) * clampUnit((fy - 0.04) * 7.0)
      const spark = emberSeed > 1 - sparks * 0.08
        ? Math.pow(hash2(context.x * 3 + Math.floor(t * 23), context.y * 5), 2.2) * sparkZone * sparks
        : 0

      const temperature = clampUnit(
        (flameFy * flameFy * 1.5 + turbulence * (flameFy * 0.55 + 0.04) + wisp - 0.03) * intensity * flicker * heat + spark
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
      const h3 = hash2(context.x + 300, context.y + 400)

      if (h1 > density) return { r: 0, g: 0, b: 0 }

      const phase = h2 * Math.PI * 4
      const freq = 0.5 + h1 * 2.5
      // Multi-frequency twinkle: primary pulse + fast scintillation (realistic atmospheric shimmer)
      const primary = Math.sin(context.now * freq * speed * Math.PI * 2 + phase)
      const scintillation = Math.sin(context.now * freq * speed * 7.3 + h3 * Math.PI * 6) * 0.15
      const twinkle = 0.5 + (primary + scintillation) * 0.5
      // Steeper gamma for more dramatic twinkle (stars snap bright then fade gracefully)
      const brightness = Math.pow(twinkle, 2.8)
      // Realistic star color temperature: warm (orange) to cool (blue-white) variation per star
      const temperature = h3 // 0=warm, 1=cool
      const warmR = 1.0, warmG = 0.82, warmB = 0.62
      const coolR = 0.85, coolG = 0.92, coolB = 1.0
      const tintR = warmR + (coolR - warmR) * temperature
      const tintG = warmG + (coolG - warmG) * temperature
      const tintB = warmB + (coolB - warmB) * temperature

      return {
        r: clampByte(color.r * tintR * brightness),
        g: clampByte(color.g * tintG * brightness),
        b: clampByte(color.b * tintB * brightness)
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

      // Multi-ring interference: primary + secondary wave create natural water-like pattern
      const wave1 = Math.sin((dist * frequency - context.now * speed) * Math.PI * 2)
      const wave2 = Math.sin((dist * frequency * 1.62 - context.now * speed * 1.3) * Math.PI * 2) * 0.35
      const combined = wave1 + wave2
      // Physically-inspired amplitude decay: 1/sqrt(r) falloff (2D circular wave energy conservation)
      const decay = 1 / Math.max(1, Math.sqrt(dist * 2.8 + 0.3))
      let brightness = clampUnit((combined + 1.35) / 2.7) * decay
      // Soft gaussian vignette (premium edge rolloff instead of linear fade)
      brightness *= Math.exp(-dist * dist * 0.85)

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
        const burstFreq = frequency * 1.4
        const burstWave = Math.sin((bdist * burstFreq - burstAge * burstSpeed) * Math.PI * 2)
        // Smooth exponential decay for premium fade-out
        const decay2 = Math.exp(-burstAge / (burstDuration * 0.35))
        const burstB = clampUnit((burstWave + 1) / 2) * Math.exp(-bdist * bdist * 0.6) * decay2
        brightness = Math.min(1, brightness + burstB)
      }

      // White-hot center bloom for premium glow aesthetic
      const bloom = Math.pow(brightness, 4.0) * 0.3

      return {
        r: clampByte((color.r + (255 - color.r) * bloom) * brightness),
        g: clampByte((color.g + (255 - color.g) * bloom) * brightness),
        b: clampByte((color.b + (255 - color.b) * bloom) * brightness)
      }
    }

    case 'spectrum': {
      const speed      = Number(layer.parameters.speed    ?? 0.25)
      const saturation = Number(layer.parameters.saturation ?? 0.95)
      const hueShift   = Number(layer.parameters.hueShift ?? 0)
      const spread     = Number(layer.parameters.spread   ?? 1.0)

      // Spatial hue gradient along diagonal for smooth spectrum wash
      const nx = context.x / Math.max(1, context.columns - 1) - 0.5
      const ny = context.y / Math.max(1, context.rows    - 1) - 0.5
      const spatialT = (nx + ny) * 0.5 + 0.5           // 0..1 diagonal position
      const hue = (context.now * speed * 360 + hueShift + spatialT * 120 * spread + 360) % 360

      // Premium: perceptually-uniform lightness compensation across hue wheel
      // (OKLAB-inspired) — yellows/greens appear brighter to human eye, compensate
      const hueRad = (hue * Math.PI) / 180
      const perceptualL = 0.50 - Math.cos(hueRad + 1.05) * 0.04 - Math.cos(hueRad * 2 + 0.3) * 0.025

      // Gentle global brightness pulse — identical for all pixels
      const pulse = 0.85 + Math.sin(context.now * 0.9) * 0.15   // 0.70..1.0

      return hslToRgb(hue, saturation, perceptualL * pulse)
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

        // Physically-inspired exponential tail falloff with gaussian cross-section
        const tailFall  = Math.exp(-behind * 7 / tail)
        const crossFade = Math.exp(-crossDist * crossDist * 12)  // gaussian beam profile
        const b = tailFall * crossFade
        if (b > brightness) {
          brightness = b
          whiteBlend = Math.pow(1 - clampUnit(behind / Math.max(0.01, tail)), 2.2) // steeper white-hot head
        }
      }

      // HDR bloom: soft outer glow extends beyond the main body (like real light scatter)
      const outerGlow = brightness * Math.exp(-crossDist * crossDist * 3) * 0.15
      brightness = clampUnit(brightness + outerGlow)

      return {
        r: clampByte((color.r + (255 - color.r) * whiteBlend) * brightness),
        g: clampByte((color.g + (255 - color.g) * whiteBlend) * brightness),
        b: clampByte((color.b + (255 - color.b) * whiteBlend * 0.7) * brightness)
      }
    }

    case 'lightning': {
      const color = hexToRgb(String(layer.parameters.color ?? '#a8c8ff'))
      const speed = Number(layer.parameters.speed ?? 0.2)
      const intensity = Number(layer.parameters.intensity ?? 0.9)

      const cycle = (context.now * speed * 1.3) % 1
      // Two flash windows: main strike + secondary return stroke
      const flashOn = cycle < 0.08 || (cycle > 0.52 && cycle < 0.57)
      // Atmospheric afterglow: exponential decay after each flash (realistic persistence)
      const afterglow1 = cycle >= 0.08 && cycle < 0.28 ? Math.exp(-(cycle - 0.08) * 18) * 0.25 : 0
      const afterglow2 = cycle >= 0.57 && cycle < 0.72 ? Math.exp(-(cycle - 0.57) * 22) * 0.15 : 0

      const nx = context.x / context.columns
      const ny = context.y / context.rows

      // Main bolt path with multi-frequency displacement (fractal branching)
      const boltX = 0.5
        + Math.sin(ny * 6.3 + context.now * 9.1) * 0.09
        + Math.sin(ny * 14.7 - context.now * 5.3) * 0.05
        + Math.sin(ny * 27.1 + context.now * 13.7) * 0.025
        + Math.sin(ny * 52.0 + context.now * 21.0) * 0.012

      const dist = Math.abs(nx - boltX)

      if (!flashOn && afterglow1 <= 0.001 && afterglow2 <= 0.001) return { r: 0, g: 0, b: 0 }

      // Gaussian beam profile for premium soft edges (no hard cutoff)
      const coreGlow = Math.exp(-dist * dist * context.columns * context.columns * 2.2) * intensity
      const wideGlow = Math.exp(-dist * dist * context.columns * context.columns * 0.3) * intensity * 0.35
      const glow = flashOn ? (coreGlow + wideGlow) : (coreGlow + wideGlow) * (afterglow1 + afterglow2)

      // Atmospheric scattering: surrounding area gets subtle blue-purple illumination during flash
      const scatter = flashOn ? Math.exp(-dist * context.columns * 0.8) * 0.12 : 0

      return {
        r: clampByte(color.r * glow + 255 * scatter * 0.3),
        g: clampByte(color.g * glow + 255 * scatter * 0.4),
        b: clampByte(color.b * glow + 255 * scatter * 0.7 + 255 * glow * 0.15)
      }
    }

    case 'aurora': {
      const speed     = Number(layer.parameters.speed     ?? 0.12)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const hueShift  = Number(layer.parameters.hueShift  ?? 0)
      const curtainHeight = Number(layer.parameters.curtainHeight ?? 1.0)
      const ribbonFrequency = Number(layer.parameters.ribbonFrequency ?? 1.0)
      const shimmerIntensity = Number(layer.parameters.shimmerIntensity ?? 0.35)
      const baseHue = Number(layer.parameters.baseHue ?? 130)
      const colorSpread = Number(layer.parameters.colorSpread ?? 90)
      const softEdge = Number(layer.parameters.softEdge ?? 0.75)

      const hFraction = context.x / Math.max(1, context.columns - 1)
      const vFraction = context.y / Math.max(1, context.rows - 1)

      // Premium curtain: quintic falloff for ultra-smooth vertical fade (Apple-style gradient)
      const curtainRaw = clampUnit(1 - vFraction * (1.4 / Math.max(0.1, curtainHeight)))
      const curtainPow = Math.max(0.25, softEdge)
      const curtain = curtainRaw * curtainRaw * curtainRaw * (curtainRaw * (curtainRaw * 6 - 15) + 10) * Math.pow(curtainRaw, curtainPow * 0.3)

      const t = context.now * speed
      // Multi-layer ribbons with phase modulation for organic undulation
      const phaseModA = Math.sin(t * 0.31 + hFraction * 2.1) * 1.4
      const phaseModB = Math.cos(t * 0.47 + hFraction * 1.6) * 0.9
      const w1 = Math.sin(hFraction * Math.PI * 2.7 * ribbonFrequency + t * 0.9 + phaseModA) * 0.5 + 0.5
      const w2 = Math.sin(hFraction * Math.PI * 5.1 * ribbonFrequency - t * 1.4 + phaseModB) * 0.5 + 0.5
      // Volumetric depth: vertical position modulates ribbon intensity (closer ribbons brighter)
      const depthLayer = Math.sin(hFraction * Math.PI * 7.4 * ribbonFrequency + t * 1.8 + vFraction * 3.5) * 0.3 + 0.3
      const w4 = Math.cos(hFraction * Math.PI * 3.3 - t * 0.5) * 0.5 + 0.5
      // Fine-grain shimmer with temporal coherence (avoids noise flicker)
      const grain = hash2(context.x + Math.floor(t * 14), context.y + Math.floor(t * 22))
      const shimmer = (depthLayer * 0.6 + grain * 0.4) * shimmerIntensity
      const blended = w1 * 0.34 + w2 * 0.26 + shimmer * 0.16 + w4 * 0.18 + depthLayer * 0.06

      // Hue: green-teal core, edges drift toward purple; added subtle chromatic depth layering
      const edgeDist = Math.abs(hFraction - 0.5) * 2
      const depthHueShift = vFraction * 15 // deeper ribbons shift warmer
      const hue = ((baseHue + blended * colorSpread + edgeDist * colorSpread * 0.62 + depthHueShift + hueShift) % 360 + 360) % 360

      // Premium top-rim glow: exponential rather than linear for natural light bloom
      const topRim = Math.exp(-vFraction * 12) * 0.35

      const brightness = curtain * intensity * (0.35 + blended * 0.55) * (0.65 + w4 * 0.35)
      // Final lightness with perceptual gamma for LED rendering fidelity
      const finalL = Math.min(0.88, Math.pow(brightness * 0.75 + topRim * curtain, 1.05))
      return hslToRgb(hue, 0.96, finalL)
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

      // Decay envelope: computed once per frame (keyed by context.now), so all pixels
      // in the same frame share the same smooth pulse value.
      // Fast attack (~2 frames) + slow decay (~0.80/frame ≈ 200ms at 30fps).
      let env = _beatEnvMap.get(layer.id)
      if (!env || env.lastNow !== context.now) {
        const rawPulse = clampUnit((bass * 0.70 + beat * 0.30) * sensitivity)
        const prev = env?.pulse ?? 0
        const newPulse = rawPulse > prev
          ? rawPulse                         // instant attack — no lag on the beat
          : prev * 0.72                      // decay ~150ms at 30fps
        env = { lastNow: context.now, pulse: newPulse }
        _beatEnvMap.set(layer.id, env)
      }
      const pulse = env.pulse

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

      // freqBands are already smoothed by the EMA in useAudioAnalyzer (fast attack,
      // slow decay) — no second pass here to avoid adding latency.
      const freqBands = context._audioFreqBands
      let bandLevel: number
      if (freqBands && freqBands.length > 0) {
        // Map column to log-spaced frequency band with linear interpolation
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

      const threshold = clampUnit(bandLevel * sensitivity)
      const heightFraction = 1 - context.y / Math.max(1, context.rows - 1)

      // Soft anti-aliased bar edge: 1-pixel smooth transition at the bar top so
      // the bar moves fluidly rather than snapping row by row.
      // edgeFrac = 1 (fully lit) well below threshold, 0 (dark) well above,
      // and linearly interpolates over exactly 1 pixel height.
      const edgeFrac = clampUnit((threshold - heightFraction) * (context.rows - 1) + 0.5)
      if (edgeFrac < 0.004) return { r: 0, g: 0, b: 0 }

      // Blend from colorLow (bar bottom) to colorHigh (bar top) by height
      return {
        r: Math.round((colorLow.r * (1 - heightFraction) + colorHigh.r * heightFraction) * edgeFrac),
        g: Math.round((colorLow.g * (1 - heightFraction) + colorHigh.g * heightFraction) * edgeFrac),
        b: Math.round((colorLow.b * (1 - heightFraction) + colorHigh.b * heightFraction) * edgeFrac)
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

    // ── 3D Visual ─────────────────────────────────────────────────────────────

    case 'plasma': {
      // Classic demoscene multi-wave interference plasma.
      // Four overlapping sine waves — different spatial & temporal frequencies —
      // combine into a fluid, endlessly morphing colour field.
      const speed      = Number(layer.parameters.speed      ?? 0.40)
      const frequency  = Number(layer.parameters.frequency  ?? 3.0)
      const saturation = Number(layer.parameters.saturation ?? 1.0)

      const aspect = context.columns / Math.max(1, context.rows)
      const nx = (context.x / Math.max(1, context.columns - 1) - 0.5) * 2 * aspect
      const ny = (context.y / Math.max(1, context.rows    - 1) - 0.5) * 2
      const t  = context.now * speed

      const v1 = Math.sin(nx * frequency                       + t)
      const v2 = Math.sin(ny * frequency * 0.82                + t * 1.17)
      const v3 = Math.sin((nx + ny) * frequency * 0.63         + t * 0.73)
      const v4 = Math.sin(Math.sqrt(nx * nx + ny * ny) * frequency * 1.4 - t * 0.92)
      const v  = (v1 + v2 + v3 + v4) * 0.25  // -1..1

      const hue = ((v * 180 + t * 60) % 360 + 360) % 360
      return hslToRgb(hue, saturation, 0.42 + v * 0.10)
    }

    case 'vortex': {
      // Hypnotic spinning vortex portal. Polar spiral arms + depth-fade create
      // a convincing 3D rotating tunnel illusion.
      const speed    = Number(layer.parameters.speed    ?? 0.50)
      const density  = Number(layer.parameters.density  ?? 5.0)
      const hueShift = Number(layer.parameters.hueShift ?? 0)

      const aspect = context.columns / Math.max(1, context.rows)
      const nx    = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny    = (context.y / Math.max(1, context.rows    - 1) - 0.5)
      const r     = Math.sqrt(nx * nx + ny * ny) / (0.5 * Math.max(1, aspect))
      const angle = Math.atan2(ny, nx)  // -π..π
      const t     = context.now * speed

      // Counter-rotating double-spiral for rich interference
      const spiralPhase = angle + r * density - t * 3.0
      const s1 = Math.sin(spiralPhase * 2) * 0.5 + 0.5
      const s2 = Math.sin(spiralPhase * 3 + t * 1.5) * 0.5 + 0.5
      const combined = s1 * 0.6 + s2 * 0.4

      // Depth-fade: pixels near centre appear "closest" in the 3D tunnel
      const depthFade = Math.max(0, 1 - r * 0.90)

      const hue = (((angle / Math.PI) * 180) + r * 40 + t * 45 + hueShift + 360) % 360
      const brightness = (0.15 + combined * 0.65) * (0.35 + depthFade * 0.65)

      return hslToRgb(hue, 0.95, Math.min(0.75, brightness * 0.70))
    }

    case 'tunnel': {
      // Classic zoom tunnel. 1/r depth mapping + scrolling angular stripes
      // and radial rings that rush toward the viewer.
      const speed     = Number(layer.parameters.speed     ?? 0.60)
      const frequency = Number(layer.parameters.frequency ?? 6)
      const hueShift  = Number(layer.parameters.hueShift  ?? 0)

      const aspect = context.columns / Math.max(1, context.rows)
      const nx    = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny    = (context.y / Math.max(1, context.rows    - 1) - 0.5)
      const r     = Math.sqrt(nx * nx + ny * ny)
      const angle = Math.atan2(ny, nx)  // -π..π
      const t     = context.now * speed

      // Depth UV: 1/r → vanishing point at centre, open walls at edges
      const depth = clampUnit(0.10 / Math.max(0.006, r))  // 0..1 (1 = close)
      const u     = (angle / Math.PI) * 0.5 + 0.5         // 0..1 angular

      // Wall stripes that rush toward the viewer
      const stripePhase = (u * frequency + depth * 4.0 - t * 3.0) % 2
      const stripe      = clampUnit(Math.abs(stripePhase - 1) * 3.0 - 0.5)

      // Radial rings zooming outward
      const ringPhase = (depth * 8.0 - t * 4.0) % 1
      const ring      = 0.4 + Math.sin(ringPhase * Math.PI * 2) * 0.30

      const hue = ((u * 360 + depth * 60 - t * 30 + hueShift) % 360 + 360) % 360
      const brightness = stripe * 0.55 + ring * 0.30 + depth * 0.15

      return hslToRgb(hue, 0.92, clampUnit(brightness * 0.70))
    }

    case 'crystal': {
      // Voronoi crystal facets. Edge boundaries light up like light reflecting
      // off a gemstone; each cell has a unique hue that slowly drifts.
      const speed      = Number(layer.parameters.speed      ?? 0.18)
      const density    = Number(layer.parameters.density    ?? 0.5)
      const saturation = Number(layer.parameters.saturation ?? 0.95)

      const t  = context.now * speed
      const nx = context.x / Math.max(1, context.columns - 1)
      const ny = context.y / Math.max(1, context.rows    - 1)

      // 3..9 Voronoi cells across the canvas
      const scale = 3 + density * 6
      const gx = nx * scale
      const gy = ny * scale
      const gi = Math.floor(gx)
      const gj = Math.floor(gy)

      let minDist1 = 9999, minDist2 = 9999
      let closestId = 0

      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const ci = gi + di
          const cj = gj + dj
          const s1 = hash2(ci * 127.1, cj * 311.7)
          const s2 = hash2(ci * 269.5, cj * 183.3)
          const s3 = hash2(ci + 500.0, cj + 500.0)
          // Seeds drift slowly — "rotating crystal" feel
          const sx = ci + s1 + Math.sin(t * 0.28 + s3 * 6.2) * 0.22
          const sy = cj + s2 + Math.cos(t * 0.35 + s3 * 8.4) * 0.22
          const d  = Math.sqrt((gx - sx) * (gx - sx) + (gy - sy) * (gy - sy))
          if (d < minDist1) { minDist2 = minDist1; minDist1 = d; closestId = s1 }
          else if (d < minDist2) { minDist2 = d }
        }
      }

      // Crystal facet edge: the closer to the boundary, the brighter (specular highlight)
      const edgeDist = minDist2 - minDist1
      const edgeGlow = Math.max(0, 1 - edgeDist * 6.0)

      // Unique hue per cell, slowly cycling
      const cellHue = ((closestId * 360 + t * 18) % 360 + 360) % 360

      // Interior shading: mimics anisotropic facet reflection
      const facet = 0.25 + minDist1 * 0.35 + Math.sin(t * 0.6 + closestId * 9.2) * 0.12

      return hslToRgb(cellHue, saturation, clampUnit(facet * 0.55 + edgeGlow * 0.44))
    }

    // ── GLSL-style 2D shader effects ─────────────────────────────────────────

    case 'glitch': {
      // Digital TV/monitor glitch with horizontal band corruption, RGB channel
      // splits, and animated scan-line interference.
      const speed     = Number(layer.parameters.speed     ?? 0.50)
      const intensity = Number(layer.parameters.intensity ?? 0.70)
      const hueShift  = Number(layer.parameters.hueShift  ?? 0)

      const t  = context.now * speed
      const nx = context.x / Math.max(1, context.columns - 1)
      const ny = context.y / Math.max(1, context.rows    - 1)

      // Divide into ~8 horizontal bands; each band changes state ~3×/second
      const band     = Math.floor(ny * 8 + Math.floor(t * 2) * 37)
      const bandRand = hash(band)
      const isGlitch = bandRand < intensity * 0.45

      if (isGlitch) {
        const glitchType = hash(band * 1.73 + Math.floor(t * 4) * 13)
        // White/bright flash
        if (glitchType < 0.30) return { r: 210, g: 220, b: 255 }
        // Pure-channel block (R / G / B)
        const ch = Math.floor(glitchType * 10) % 3
        if (glitchType < 0.65) return ch === 0 ? { r: 255, g: 0, b: 0 } : ch === 1 ? { r: 0, g: 255, b: 0 } : { r: 0, g: 0, b: 255 }
        // Dark-out
        return { r: 0, g: 0, b: 0 }
      }

      // Normal: slow rainbow scan with subtle horizontal jitter
      const hue = ((hueShift + nx * 220 + t * 28) % 360 + 360) % 360
      const scanMod = 0.5 + Math.sin(ny * 55 - t * 6) * 0.07
      return hslToRgb(hue, 0.92, 0.44 * scanMod)
    }

    case 'matrix-rain': {
      // Columns of falling 3×5 numeric glyphs. On low LED grids this reads as
      // blocky digital symbols instead of plain vertical bars.
      const speed   = Number(layer.parameters.speed   ?? 0.50)
      const density = Number(layer.parameters.density ?? 0.55)
      const color   = hexToRgb(String(layer.parameters.color ?? '#00ff41'))

      const t   = context.now * speed
      const glyphW = 4
      const glyphH = 6
      const glyphCol = Math.floor(context.x / glyphW)
      const localX = context.x % glyphW
      const row = context.y

      // Per-column: always-on scroll speed from hash
      const colSeed   = hash(glyphCol * 137.5 + 1.0)
      const colSpeed  = 0.7 + colSeed * 1.8
      // Per-column: active flag toggled slowly over time
      const colActive = hash(glyphCol * 73.1 + Math.floor(t * 0.4) * 17.3) < density
      if (!colActive) return { r: 0, g: 0, b: 0 }

      if (localX === 3) return { r: 0, g: 0, b: 0 }

      const streamRows = context.rows + glyphH * 3
      const scroll = (t * colSpeed * context.rows * 0.72 + hash(glyphCol * 31.1) * glyphH * 4) % streamRows
      const streamY = ((row - scroll) % streamRows + streamRows) % streamRows
      const glyphIndex = Math.floor(streamY / glyphH)
      const localY = Math.floor(streamY % glyphH)
      if (localY > 4) return { r: 0, g: 0, b: 0 }

      const digit = Math.floor(hash(glyphCol * 911.7 + glyphIndex * 47.3 + Math.floor(t * 0.8) * 19.1) * 10)
      if (!digitGlyphOn(digit, localX, localY)) {
        const ghost = hash2(context.x + glyphIndex * 13, context.y + Math.floor(t * 3)) < 0.025 ? 0.12 : 0
        return { r: Math.round(color.r * ghost), g: Math.round(color.g * ghost), b: Math.round(color.b * ghost) }
      }

      const head = Math.max(0, 1 - streamY / Math.max(1, context.rows * 0.45))
      const tail = Math.max(0, 1 - streamY / Math.max(1, context.rows * (0.9 + density * 1.4)))
      const flicker = 0.78 + hash2(glyphCol * 17 + glyphIndex, Math.floor(t * 12)) * 0.22
      const bright = clampUnit((tail * 0.72 + head * 0.55) * flicker)

      const br = clampUnit(bright)
      return { r: Math.round(color.r * br), g: Math.round(color.g * br), b: Math.round(color.b * br) }
    }

    case 'neon-pulse': {
      // Concentric neon rings radiating from centre with colour-interference.
      // A second offset ring set creates a moiré / interference shimmer.
      const speed    = Number(layer.parameters.speed    ?? 0.50)
      const density  = Number(layer.parameters.frequency ?? layer.parameters.density ?? 3.0)
      const hueShift = Number(layer.parameters.hueShift ?? 0)

      const t      = context.now * speed
      const aspect = context.columns / Math.max(1, context.rows)
      const nx     = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny     = (context.y / Math.max(1, context.rows    - 1) - 0.5)
      const r      = Math.sqrt(nx * nx + ny * ny)

      const phase   = r * density * Math.PI * 2 - t * 3.0
      const ring1   = Math.pow(Math.max(0, Math.sin(phase)),        3)
      const ring2   = Math.pow(Math.max(0, Math.sin(phase * 1.5 + t * 1.4)), 2) * 0.6

      const hue    = ((hueShift + r * 130 + t * 42) % 360 + 360) % 360
      const bright = ring1 * 0.70 + ring2 * 0.45

      return hslToRgb(hue, 1.0, clampUnit(bright * 0.65))
    }

    case 'nebula': {
      const speed = Number(layer.parameters.speed ?? 0.28)
      const intensity = Number(layer.parameters.intensity ?? 0.85)
      const density = Number(layer.parameters.density ?? 0.62)
      const hueShift = Number(layer.parameters.hueShift ?? 250)
      const colorSpread = Number(layer.parameters.colorSpread ?? 130)

      const aspect = context.columns / Math.max(1, context.rows)
      const nx = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny = context.y / Math.max(1, context.rows - 1) - 0.5
      const t = context.now * speed
      const swirl = Math.atan2(ny, nx) / Math.PI
      const radius = Math.sqrt(nx * nx + ny * ny)
      // Enhanced domain warping for more volumetric cloud structure
      const warpX = nx + Math.sin(ny * 4.0 + t * 1.4) * 0.18 + swirl * 0.08 + Math.sin(radius * 6 + t * 0.7) * 0.06
      const warpY = ny + Math.cos(nx * 3.2 - t * 1.1) * 0.18 - radius * 0.12 + Math.cos(radius * 5 - t * 0.5) * 0.05
      // Multi-octave FBM for rich cloud layering
      const cloud = fbm2(warpX * 3.0 + t * 0.7, warpY * 3.0 - t * 0.45, 5)
      const fineDetail = fbm2(warpX * 8.0 - t * 0.3, warpY * 8.0 + t * 0.2, 4) * 0.3
      // Brighter, rarer stars with gaussian point-spread
      const starSeed = hash2(context.x * 11 + Math.floor(t * 8), context.y * 17)
      const stars = Math.pow(starSeed, 38) * 3.0
      // Volumetric core with emission-like bloom (energy radiating from center)
      const coreEmission = Math.exp(-radius * radius * (2.4 - density)) * (0.6 + Math.sin(t * 1.2) * 0.12)
      const veil = clampUnit((cloud + fineDetail - (0.52 - density * 0.22)) * 2.6)
      // Two-layer composite: volumetric cloud + emission core + stellar points
      const brightness = clampUnit((veil * 0.65 + coreEmission * 0.35) * intensity + stars)
      // Richer color separation: cloud hue vs core hue for depth perception
      const cloudHue = (hueShift + cloud * colorSpread + swirl * 45 + t * 35 + 720) % 360
      const coreHue = (hueShift + 40 + t * 20 + 720) % 360
      const coreWeight = coreEmission / Math.max(0.01, veil + coreEmission)
      const hue = cloudHue * (1 - coreWeight * 0.4) + coreHue * coreWeight * 0.4
      // Emission bloom: core pixels get higher lightness for HDR-like glow
      const emissionBoost = Math.pow(coreEmission, 2.5) * 0.15
      return hslToRgb(hue, 0.97, clampUnit(brightness * 0.64 + emissionBoost))
    }

    case 'fluid-flow': {
      const speed = Number(layer.parameters.speed ?? 0.38)
      const intensity = Number(layer.parameters.intensity ?? 0.82)
      const frequency = Number(layer.parameters.frequency ?? 4.2)
      const hueShift = Number(layer.parameters.hueShift ?? 185)
      const spread = Number(layer.parameters.spread ?? 1.35)

      const aspect = context.columns / Math.max(1, context.rows)
      const nx = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny = context.y / Math.max(1, context.rows - 1) - 0.5
      const t = context.now * speed
      const field = fbm2(nx * frequency + t * 0.9, ny * frequency - t * 0.55, 4)
      const angle = field * Math.PI * 2 + t * 0.8
      const flowX = nx + Math.cos(angle) * 0.22 * spread
      const flowY = ny + Math.sin(angle) * 0.22 * spread
      const strand = Math.sin((flowX * 5.5 + flowY * 3.2 + fbm2(flowX * 7.0, flowY * 7.0, 3) * 2.8 - t * 2.4) * Math.PI)
      const ribbon = Math.pow(Math.max(0, strand), 2.6)
      const foam = Math.pow(fbm2(flowX * 14.0 - t, flowY * 14.0 + t * 0.7, 3), 3.2)
      const brightness = clampUnit((ribbon * 0.78 + foam * 0.24) * intensity)
      const hue = (hueShift + field * 90 + flowX * 60 + t * 26 + 720) % 360
      return hslToRgb(hue, 0.92, brightness * 0.68)
    }

    case 'mirror-symmetry': {
      const speed = Number(layer.parameters.speed ?? 0.34)
      const frequency = Number(layer.parameters.frequency ?? 5.0)
      const hueShift = Number(layer.parameters.hueShift ?? 310)
      const intensity = Number(layer.parameters.intensity ?? 0.86)
      const angleDeg = Number(layer.parameters.angle ?? 45)

      const aspect = context.columns / Math.max(1, context.rows)
      const rad = (angleDeg * Math.PI) / 180
      const nx0 = (context.x / Math.max(1, context.columns - 1) - 0.5) * aspect
      const ny0 = context.y / Math.max(1, context.rows - 1) - 0.5
      const nx = nx0 * Math.cos(rad) - ny0 * Math.sin(rad)
      const ny = nx0 * Math.sin(rad) + ny0 * Math.cos(rad)
      const ax = Math.abs(nx)
      const ay = Math.abs(ny)
      const t = context.now * speed
      const radial = Math.sqrt(ax * ax + ay * ay)
      const petals = Math.sin((Math.atan2(ay, ax) * frequency + radial * 9.0 - t * 3.0)) * 0.5 + 0.5
      const lattice = Math.sin((ax + ay) * frequency * Math.PI * 2 - t * 4.0) * 0.5 + 0.5
      const glow = Math.pow(petals * 0.65 + lattice * 0.35, 3.0) * Math.exp(-radial * 0.7)
      const hue = (hueShift + radial * 180 + petals * 70 + t * 48 + 720) % 360
      return hslToRgb(hue, 1.0, clampUnit(glow * intensity * 0.72))
    }

    // ── Scientific 2D projections with 3D depth cues ───────────────────────

    case 'dna-helix': {
      const speed = Number(layer.parameters.speed ?? 0.36)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny, aspect } = normCoords(context)
      const normalizedX = nx / Math.max(0.0001, aspect) + 0.5
      const normalizedY = ny + 0.5
      const time = context.now * speed
      const turns = 3.2 + density * 2.2
      const phase = normalizedY * turns * Math.PI * 2 - time * Math.PI * 2
      const radius = 0.18 + density * 0.07
      const strandA = 0.5 + Math.cos(phase) * radius
      const strandB = 0.5 - Math.cos(phase) * radius
      const depthA = 0.55 + Math.sin(phase) * 0.35
      const depthB = 0.55 - Math.sin(phase) * 0.35
      const width = 0.018 + density * 0.01
      const chainA = Math.exp(-Math.pow((normalizedX - strandA) / width, 2)) * depthA
      const chainB = Math.exp(-Math.pow((normalizedX - strandB) / width, 2)) * depthB
      const rungPhase = Math.abs(Math.sin(normalizedY * turns * Math.PI))
      const betweenChains = smoothstep(Math.min(strandA, strandB), Math.max(strandA, strandB), normalizedX) * smoothstep(Math.max(strandA, strandB), Math.min(strandA, strandB), normalizedX)
      const basePair = Math.exp(-Math.pow(rungPhase / 0.18, 2)) * betweenChains * (0.45 + 0.35 * Math.sin(time * 7 + normalizedY * 37))
      let color: RgbColor = { r: 0, g: 0, b: 0 }
      color = colorAdd(color, hslToRgb(178 + hueShift, 0.95, 0.50), chainA * intensity)
      color = colorAdd(color, hslToRgb(214 + hueShift, 0.90, 0.46), chainB * intensity)
      color = colorAdd(color, hslToRgb(36 + hueShift, 1.0, 0.62), basePair * intensity)
      return color
    }

    case 'black-hole': {
      const speed = Number(layer.parameters.speed ?? 0.34)
      const intensity = Number(layer.parameters.intensity ?? 0.92)
      const density = Number(layer.parameters.density ?? 0.62)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const diskY = ny * 2.45
      const radius = Math.sqrt(nx * nx + diskY * diskY)
      const angle = Math.atan2(diskY, nx)
      const eventHorizon = smoothstep(0.11, 0.06, radius)
      const diskMask = smoothstep(0.72, 0.12, radius) * smoothstep(0.07, 0.18, radius)
      const keplerTwist = angle * 2.0 + 1.7 / Math.max(0.08, radius) - time * (1.2 + 2.2 / Math.max(0.2, radius))
      const spiralBands = Math.pow(0.5 + 0.5 * Math.sin(keplerTwist * 3.0), 2.4)
      const turbulence = fbm2(nx * 5.2 + time * 0.7, diskY * 4.0 - time * 0.35, 4)
      const temperature = diskMask * clampUnit((0.82 - radius) * (1.4 + density) + spiralBands * 0.42 + turbulence * 0.30)
      const lensRing = Math.exp(-Math.pow((radius - 0.145) / 0.025, 2)) * 0.85
      const jet = Math.exp(-Math.pow(nx / 0.045, 2)) * smoothstep(0.03, 0.46, Math.abs(ny)) * smoothstep(0.62, 0.16, Math.abs(ny)) * 0.55
      let color = colorScale(thermalColor(temperature), intensity)
      color = colorAdd(color, hslToRgb(210 + hueShift, 0.85, 0.72), lensRing * intensity)
      color = colorAdd(color, hslToRgb(192 + hueShift, 1.0, 0.62), jet * intensity)
      return eventHorizon > 0.5 ? { r: 0, g: 0, b: 2 } : color
    }

    case 'solar-system': {
      const speed = Number(layer.parameters.speed ?? 0.26)
      const intensity = Number(layer.parameters.intensity ?? 0.86)
      const density = Number(layer.parameters.density ?? 0.55)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const sunGlow = Math.exp(-(nx * nx + ny * ny) / 0.012)
      let color = colorScale(hslToRgb(42, 1.0, 0.58), sunGlow * intensity)
      const orbitRadii = [0.10, 0.15, 0.21, 0.28, 0.38, 0.48, 0.58, 0.68]
      const periods = [0.24, 0.62, 1.0, 1.88, 5.0, 7.2, 10.5, 13.0]
      const hues = [35, 48, 208, 10, 32, 44, 188, 226]
      for (let orbitIndex = 0; orbitIndex < orbitRadii.length; orbitIndex++) {
        const orbitRadius = orbitRadii[orbitIndex] * (0.9 + density * 0.18)
        const eccentricity = 0.04 + orbitIndex * 0.012
        const ellipseRadius = Math.sqrt(Math.pow(nx / (orbitRadius * (1 + eccentricity)), 2) + Math.pow(ny / (orbitRadius * 0.72), 2))
        const orbitLine = Math.exp(-Math.pow((ellipseRadius - 1) / 0.035, 2)) * 0.08
        color = colorAdd(color, hslToRgb(214, 0.65, 0.42), orbitLine)
        const planetAngle = time / periods[orbitIndex] * Math.PI * 2 + orbitIndex * 0.72
        const planetX = Math.cos(planetAngle) * orbitRadius * (1 + eccentricity)
        const planetY = Math.sin(planetAngle) * orbitRadius * 0.72
        const planetDistance = Math.sqrt((nx - planetX) ** 2 + (ny - planetY) ** 2)
        const planetSize = orbitIndex < 4 ? 0.018 : 0.026 + orbitIndex * 0.0015
        const planetGlow = Math.exp(-Math.pow(planetDistance / planetSize, 2))
        color = colorAdd(color, hslToRgb(hues[orbitIndex], 0.82, orbitIndex === 2 ? 0.56 : 0.46), planetGlow * intensity)
      }
      return color
    }

    case 'spiral-galaxy': {
      const speed = Number(layer.parameters.speed ?? 0.20)
      const intensity = Number(layer.parameters.intensity ?? 0.90)
      const density = Number(layer.parameters.density ?? 0.64)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const radius = Math.sqrt(nx * nx + ny * ny)
      const angle = Math.atan2(ny, nx)
      const armPhase = angle * 4.0 - Math.log(radius + 0.04) * (3.4 + density * 2.2) + time * 1.5
      const arm = Math.pow(0.5 + 0.5 * Math.cos(armPhase), 7.0)
      const disk = Math.exp(-radius * (2.1 - density * 0.6))
      const bulge = Math.exp(-radius * radius * 38.0)
      const dustLane = smoothstep(0.48, 0.20, fbm2(nx * 7.0 - time, ny * 7.0 + time * 0.5, 4))
      const stars = Math.pow(hash2(context.x * 13 + Math.floor(time * 9), context.y * 19), 30) * smoothstep(0.78, 0.12, radius)
      const brightness = clampUnit((arm * disk * 0.72 + bulge * 0.58 + stars * 1.4) * intensity * (0.72 + dustLane * 0.45))
      const hue = 218 + hueShift + arm * 58 - radius * 70
      return hslToRgb(hue, 0.82, brightness * 0.72)
    }

    case 'orion-nebula': {
      const speed = Number(layer.parameters.speed ?? 0.16)
      const intensity = Number(layer.parameters.intensity ?? 0.82)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 285)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const cloud = fbm2(nx * 3.4 + time * 0.35, ny * 3.4 - time * 0.25, 5)
      const fineDust = fbm2(nx * 11.0 - time * 0.22, ny * 11.0 + time * 0.18, 4)
      const radius = Math.sqrt((nx + 0.05) ** 2 + (ny - 0.02) ** 2)
      const molecularCloud = clampUnit((cloud - (0.42 - density * 0.14)) * 2.2)
      const darkDust = smoothstep(0.58, 0.86, fineDust) * smoothstep(0.62, 0.16, radius)
      const starSeed = hash2(context.x * 31, context.y * 47)
      const stars = starSeed > 0.985 ? Math.pow(starSeed, 18) : 0
      const emission = clampUnit((molecularCloud * 0.72 + Math.exp(-radius * radius * 5.5) * 0.34 - darkDust * 0.45) * intensity + stars)
      const hue = hueShift + cloud * 72 + fineDust * 32
      return hslToRgb(hue, 0.86, emission * 0.66)
    }

    case 'pulsar-beacon': {
      const speed = Number(layer.parameters.speed ?? 0.82)
      const intensity = Number(layer.parameters.intensity ?? 0.90)
      const density = Number(layer.parameters.density ?? 0.55)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const radius = Math.sqrt(nx * nx + ny * ny)
      const angle = Math.atan2(ny, nx)
      const beamAngle = time * Math.PI * 2
      const angleDistance = Math.abs(Math.atan2(Math.sin(angle - beamAngle), Math.cos(angle - beamAngle)))
      const oppositeDistance = Math.abs(Math.atan2(Math.sin(angle - beamAngle - Math.PI), Math.cos(angle - beamAngle - Math.PI)))
      const beamWidth = 0.18 + density * 0.18
      const beam = Math.exp(-Math.pow(Math.min(angleDistance, oppositeDistance) / beamWidth, 2)) * smoothstep(0.03, 0.62, radius) * smoothstep(0.90, 0.12, radius)
      const pulse = Math.pow(0.5 + 0.5 * Math.cos(time * Math.PI * 2), 12)
      const core = Math.exp(-radius * radius * 95) * (0.6 + pulse * 0.9)
      const halo = Math.exp(-radius * 5.2) * 0.22
      let color = colorScale(hslToRgb(214 + hueShift, 0.92, 0.62), (beam + halo) * intensity)
      color = colorAdd(color, hslToRgb(0, 0, 1.0), core * intensity)
      return color
    }

    case 'hurricane-eye': {
      const speed = Number(layer.parameters.speed ?? 0.32)
      const intensity = Number(layer.parameters.intensity ?? 0.84)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const radius = Math.sqrt(nx * nx + ny * ny)
      const angle = Math.atan2(ny, nx)
      const spiral = angle + radius * (9.0 + density * 6.0) - time * 3.2
      const bands = Math.pow(0.5 + 0.5 * Math.sin(spiral * 2.7 + fbm2(nx * 5, ny * 5, 3) * 2.0), 3.4)
      const eye = smoothstep(0.13, 0.06, radius)
      const eyeWall = Math.exp(-Math.pow((radius - 0.16) / 0.045, 2))
      const cloudFalloff = smoothstep(0.72, 0.12, radius)
      const cloud = clampUnit((bands * cloudFalloff * 0.72 + eyeWall * 0.92 - eye * 0.64) * intensity)
      let color = colorScale(hslToRgb(205 + hueShift, 0.35, 0.58), cloud)
      color = colorAdd(color, hslToRgb(48, 0.95, 0.72), eye * 0.32)
      color = colorAdd(color, hslToRgb(0, 0, 1.0), eyeWall * intensity * 0.65)
      return color
    }

    case 'lightning-leader': {
      const speed = Number(layer.parameters.speed ?? 0.38)
      const intensity = Number(layer.parameters.intensity ?? 0.94)
      const density = Number(layer.parameters.density ?? 0.52)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const normalizedX = context.x / Math.max(1, context.columns - 1)
      const normalizedY = context.y / Math.max(1, context.rows - 1)
      const strikeTime = context.now * speed
      const cycle = strikeTime - Math.floor(strikeTime)
      const strikeId = Math.floor(strikeTime)
      const reveal = smoothstep(0.08, 0.38, cycle)
      const fade = 1 - smoothstep(0.42, 0.95, cycle)
      const cloud = fbm2(normalizedX * 4.0 + strikeId, normalizedY * 7.0, 4) * smoothstep(0.28, 0.0, normalizedY) * 0.35
      const channelCenter = 0.5 + (fbm2(normalizedY * 2.8 + strikeId * 1.7, strikeId * 0.3, 4) - 0.5) * (0.32 + density * 0.18)
      const mainDistance = Math.abs(normalizedX - channelCenter)
      const mainBolt = Math.exp(-Math.pow(mainDistance / 0.025, 2)) * smoothstep(normalizedY - 0.06, normalizedY + 0.06, reveal) * fade
      let branchGlow = 0
      for (let branchIndex = 0; branchIndex < 4; branchIndex++) {
        const branchStart = 0.18 + branchIndex * 0.16 + hash(branchIndex + strikeId) * 0.08
        const branchSide = hash(branchIndex * 17 + strikeId) > 0.5 ? 1 : -1
        const branchProgress = clampUnit((normalizedY - branchStart) / 0.22)
        const branchX = channelCenter + branchSide * branchProgress * (0.14 + density * 0.12)
        const branchYMask = smoothstep(branchStart, branchStart + 0.05, normalizedY) * smoothstep(branchStart + 0.24, branchStart + 0.16, normalizedY)
        branchGlow += Math.exp(-Math.pow((normalizedX - branchX) / 0.018, 2)) * branchYMask * fade * 0.55
      }
      const flash = Math.exp(-Math.pow((cycle - 0.40) / 0.055, 2)) * 0.24
      let color = colorScale(hslToRgb(218 + hueShift, 0.38, 0.25), cloud)
      color = colorAdd(color, hslToRgb(222 + hueShift, 1.0, 0.78), (mainBolt + branchGlow) * intensity)
      color = colorAdd(color, hslToRgb(0, 0, 1.0), flash * intensity)
      return color
    }

    case 'icosahedral-virus': {
      const speed = Number(layer.parameters.speed ?? 0.28)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.62)
      const hueShift = Number(layer.parameters.hueShift ?? 135)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const yaw = time * 1.4
      const pitch = Math.sin(time * 0.7) * 0.42
      const projected = ICOSAHEDRON_VERTICES.map(([vx, vy, vz]) => {
        const x1 = vx * Math.cos(yaw) - vz * Math.sin(yaw)
        const z1 = vx * Math.sin(yaw) + vz * Math.cos(yaw)
        const y1 = vy * Math.cos(pitch) - z1 * Math.sin(pitch)
        const z2 = vy * Math.sin(pitch) + z1 * Math.cos(pitch)
        const perspective = 0.42 / Math.max(0.45, 1.35 - z2 * 0.55)
        return { x: x1 * perspective, y: y1 * perspective, z: z2 }
      })
      let shell = 0
      for (const [aIndex, bIndex] of ICOSAHEDRON_EDGES) {
        const a = projected[aIndex]
        const b = projected[bIndex]
        const depth = clampUnit(0.55 + (a.z + b.z) * 0.20)
        shell += Math.exp(-Math.pow(pointSegmentDistance(nx, ny, a.x, a.y, b.x, b.y) / 0.025, 2)) * depth
      }
      let capsid = 0
      for (let vertexIndex = 0; vertexIndex < projected.length; vertexIndex++) {
        const vertex = projected[vertexIndex]
        const distance = Math.sqrt((nx - vertex.x) ** 2 + (ny - vertex.y) ** 2)
        const spikePulse = 0.78 + Math.sin(time * 6 + vertexIndex * 1.7) * 0.22
        capsid += Math.exp(-Math.pow(distance / (0.038 + density * 0.012), 2)) * clampUnit(0.55 + vertex.z * 0.28) * spikePulse
      }
      const envelope = Math.exp(-(nx * nx + ny * ny) / 0.18) * 0.18
      let color = colorScale(hslToRgb(168 + hueShift, 0.84, 0.45), shell * intensity * 0.36)
      color = colorAdd(color, hslToRgb(312 + hueShift, 0.92, 0.58), capsid * intensity * 0.58)
      color = colorAdd(color, hslToRgb(202 + hueShift, 0.62, 0.42), envelope * intensity)
      return color
    }

    case 'protein-folding': {
      const speed = Number(layer.parameters.speed ?? 0.24)
      const intensity = Number(layer.parameters.intensity ?? 0.86)
      const density = Number(layer.parameters.density ?? 0.56)
      const hueShift = Number(layer.parameters.hueShift ?? 42)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const proteinPoint = (u: number): { x: number; y: number; z: number } => {
        const angle = u * Math.PI * (5.4 + density * 2.2) + time * 1.1
        const fold = Math.sin(u * Math.PI * 3.0 + time * 0.8) * 0.20
        const x = (u - 0.5) * 1.04 + Math.sin(angle * 0.7) * 0.12
        const y = Math.sin(angle) * (0.18 + density * 0.05) + fold * 0.48
        const z = Math.cos(angle) * 0.5 + Math.sin(u * Math.PI * 7.0 - time) * 0.18
        return { x, y, z }
      }
      let backbone = 0
      let residueGlow = 0
      let helixBand = 0
      let previous = proteinPoint(0)
      for (let sampleIndex = 1; sampleIndex <= 46; sampleIndex++) {
        const u = sampleIndex / 46
        const current = proteinPoint(u)
        const depth = clampUnit(0.55 + current.z * 0.26)
        backbone += Math.exp(-Math.pow(pointSegmentDistance(nx, ny, previous.x, previous.y, current.x, current.y) / 0.025, 2)) * depth
        if (sampleIndex % 5 === 0) {
          const distance = Math.sqrt((nx - current.x) ** 2 + (ny - current.y) ** 2)
          residueGlow += Math.exp(-Math.pow(distance / 0.045, 2)) * depth
        }
        const alphaMask = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 18 + time * 7), 4)
        helixBand += alphaMask * Math.exp(-Math.pow(pointSegmentDistance(nx, ny, previous.x, previous.y, current.x, current.y) / 0.055, 2)) * depth * 0.28
        previous = current
      }
      let color = colorScale(hslToRgb(204 + hueShift, 0.82, 0.48), backbone * intensity * 0.42)
      color = colorAdd(color, hslToRgb(38 + hueShift, 0.90, 0.60), residueGlow * intensity * 0.56)
      color = colorAdd(color, hslToRgb(294 + hueShift, 0.70, 0.56), helixBand * intensity)
      return color
    }

    case 'mitosis-spindle': {
      const speed = Number(layer.parameters.speed ?? 0.30)
      const intensity = Number(layer.parameters.intensity ?? 0.84)
      const density = Number(layer.parameters.density ?? 0.56)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const stage = (Math.sin(time * Math.PI * 2) + 1) * 0.5
      const separation = 0.34 + stage * 0.16
      const poleA = { x: -separation, y: 0 }
      const poleB = { x: separation, y: 0 }
      let spindle = 0
      let chromosomes = 0
      for (let chromosomeIndex = 0; chromosomeIndex < 10; chromosomeIndex++) {
        const row = (chromosomeIndex - 4.5) / 12
        const wiggle = Math.sin(time * 5 + chromosomeIndex * 1.3) * 0.018
        const chromosomeX = (stage - 0.5) * 0.16 * Math.sign(row || 1) + wiggle
        const chromosomeY = row * (0.62 + density * 0.18)
        const chromosomeDistance = Math.sqrt((nx - chromosomeX) ** 2 + (ny - chromosomeY) ** 2)
        chromosomes += Math.exp(-Math.pow(chromosomeDistance / 0.045, 2))
        spindle += Math.exp(-Math.pow(pointSegmentDistance(nx, ny, poleA.x, poleA.y, chromosomeX, chromosomeY) / 0.018, 2)) * 0.38
        spindle += Math.exp(-Math.pow(pointSegmentDistance(nx, ny, poleB.x, poleB.y, chromosomeX, chromosomeY) / 0.018, 2)) * 0.38
      }
      const membraneRadius = Math.sqrt(nx * nx + (ny * 1.1) ** 2)
      const membrane = Math.exp(-Math.pow((membraneRadius - 0.62) / 0.035, 2)) * 0.18
      let color = colorScale(hslToRgb(186 + hueShift, 0.82, 0.42), spindle * intensity)
      color = colorAdd(color, hslToRgb(316 + hueShift, 0.92, 0.58), chromosomes * intensity * 0.78)
      color = colorAdd(color, hslToRgb(210 + hueShift, 0.52, 0.48), membrane * intensity)
      return color
    }

    case 'synapse-pulse': {
      const speed = Number(layer.parameters.speed ?? 0.44)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const axon = Math.exp(-Math.pow((nx + 0.38) / 0.11, 2)) * smoothstep(0.38, 0.04, Math.abs(ny))
      const dendrite = Math.exp(-Math.pow((nx - 0.38) / 0.12, 2)) * smoothstep(0.40, 0.05, Math.abs(ny))
      const cleft = smoothstep(-0.18, 0.22, nx) * smoothstep(0.22, -0.18, nx) * smoothstep(0.42, 0.02, Math.abs(ny))
      const actionWave = Math.exp(-Math.pow((nx + 0.55 - ((time * 0.9) % 1.2)) / 0.06, 2)) * smoothstep(0.22, 0.0, Math.abs(ny))
      let neurotransmitters = 0
      for (let particleIndex = 0; particleIndex < 20; particleIndex++) {
        const seed = hash(particleIndex * 31.7)
        const progress = (time * (0.48 + seed * 0.34) + seed) % 1
        const px = -0.16 + progress * 0.36
        const py = (hash(particleIndex * 17.2) - 0.5) * (0.10 + density * 0.20) + Math.sin(progress * Math.PI * 2 + particleIndex) * 0.025
        const release = smoothstep(0.18, 0.34, actionWave + 0.2)
        neurotransmitters += Math.exp(-Math.pow(Math.sqrt((nx - px) ** 2 + (ny - py) ** 2) / 0.026, 2)) * release
      }
      let color = colorScale(hslToRgb(214 + hueShift, 0.80, 0.40), (axon + dendrite) * intensity * 0.30)
      color = colorAdd(color, hslToRgb(42 + hueShift, 1.0, 0.62), actionWave * intensity)
      color = colorAdd(color, hslToRgb(172 + hueShift, 0.95, 0.58), neurotransmitters * intensity * 0.74)
      color = colorAdd(color, hslToRgb(288 + hueShift, 0.80, 0.48), cleft * intensity * 0.10)
      return color
    }

    case 'quantum-collapse': {
      const speed = Number(layer.parameters.speed ?? 0.34)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.60)
      const hueShift = Number(layer.parameters.hueShift ?? 260)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const cycle = time - Math.floor(time)
      const radiusA = Math.sqrt((nx + 0.24) ** 2 + ny * ny)
      const radiusB = Math.sqrt((nx - 0.24) ** 2 + ny * ny)
      const phase = (radiusA - radiusB) * (24 + density * 18) - time * 9
      const interference = Math.pow(0.5 + 0.5 * Math.cos(phase), 5) * smoothstep(0.78, 0.06, Math.sqrt(nx * nx + ny * ny))
      const collapse = smoothstep(0.58, 0.86, cycle)
      const focusX = Math.sin(Math.floor(time) * 2.17) * 0.18
      const focusY = Math.cos(Math.floor(time) * 1.61) * 0.12
      const focus = Math.exp(-((nx - focusX) ** 2 + (ny - focusY) ** 2) / (0.008 + (1 - collapse) * 0.05))
      const probabilityCloud = fbm2(nx * 5 + time * 0.4, ny * 5 - time * 0.35, 4) * (1 - collapse)
      const brightness = clampUnit((interference * (1 - collapse * 0.7) + focus * collapse * 1.35 + probabilityCloud * 0.22) * intensity)
      const hue = hueShift + interference * 90 + collapse * 48
      return hslToRgb(hue, 0.92, brightness * 0.68)
    }

    case 'microvilli-field': {
      const speed = Number(layer.parameters.speed ?? 0.18)
      const intensity = Number(layer.parameters.intensity ?? 0.82)
      const density = Number(layer.parameters.density ?? 0.64)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const normalizedX = context.x / Math.max(1, context.columns - 1)
      const normalizedY = context.y / Math.max(1, context.rows - 1)
      const time = context.now * speed
      const columns = 10 + Math.floor(density * 12)
      const cell = Math.floor(normalizedX * columns)
      const localX = normalizedX * columns - cell
      const seed = hash(cell * 41.3)
      const sway = Math.sin(time * 4 + cell * 0.83) * 0.06
      const center = 0.5 + sway
      const height = 0.42 + seed * 0.32 + density * 0.12
      const top = 1 - height
      const shaftMask = smoothstep(top, 0.98, normalizedY)
      const shaft = Math.exp(-Math.pow((localX - center) / 0.12, 2)) * shaftMask
      const tip = Math.exp(-Math.pow((normalizedY - top) / 0.035, 2)) * Math.exp(-Math.pow((localX - center) / 0.18, 2))
      const depth = 0.62 + seed * 0.38
      const mucusFlow = Math.pow(fbm2(normalizedX * 9 + time * 2.2, normalizedY * 7 - time, 3), 3) * smoothstep(0.52, 0.08, normalizedY)
      let color = colorScale(hslToRgb(152 + hueShift, 0.76, 0.46), shaft * intensity * depth * 0.48)
      color = colorAdd(color, hslToRgb(52 + hueShift, 0.92, 0.62), tip * intensity * depth)
      color = colorAdd(color, hslToRgb(188 + hueShift, 0.80, 0.50), mucusFlow * intensity * 0.34)
      return color
    }

    case 'eclipse-alignment': {
      const speed = Number(layer.parameters.speed ?? 0.20)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.56)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const moonX = Math.sin(time * Math.PI * 2) * 0.34
      const moonY = Math.sin(time * Math.PI * 4 + 0.7) * 0.045
      const sunR = Math.sqrt(nx * nx + ny * ny)
      const moonR = Math.sqrt((nx - moonX) ** 2 + (ny - moonY) ** 2)
      const sunDisk = smoothstep(0.34, 0.31, sunR)
      const moonDisk = smoothstep(0.32, 0.29, moonR)
      const corona = Math.exp(-Math.pow((sunR - 0.34) / (0.085 + density * 0.04), 2)) * (0.55 + fbm2(nx * 9 - time, ny * 9 + time, 4) * 0.55)
      const diamond = Math.exp(-Math.pow(moonR - 0.31, 2) / 0.0007) * Math.exp(-Math.pow(sunR - 0.34, 2) / 0.0009)
      let color = colorScale(hslToRgb(42 + hueShift, 1.0, 0.58), sunDisk * (1 - moonDisk) * intensity)
      color = colorAdd(color, hslToRgb(210 + hueShift, 0.68, 0.72), corona * intensity * smoothstep(0.32, 0.05, Math.abs(moonX)))
      color = colorAdd(color, hslToRgb(0, 0, 1.0), diamond * intensity * 0.68)
      return color
    }

    case 'comet-tail': {
      const speed = Number(layer.parameters.speed ?? 0.30)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const orbitAngle = time * Math.PI * 2
      const headX = Math.cos(orbitAngle) * 0.46
      const headY = Math.sin(orbitAngle) * 0.26
      const awayX = headX / Math.max(0.001, Math.sqrt(headX * headX + headY * headY))
      const awayY = headY / Math.max(0.001, Math.sqrt(headX * headX + headY * headY))
      const relX = nx - headX
      const relY = ny - headY
      const tailAxis = relX * awayX + relY * awayY
      const cross = Math.abs(relX * awayY - relY * awayX)
      const tail = Math.exp(-tailAxis * (3.0 - density)) * Math.exp(-Math.pow(cross / (0.055 + tailAxis * 0.12), 2)) * smoothstep(0.0, 0.08, tailAxis)
      const ionTail = Math.exp(-tailAxis * 2.2) * Math.exp(-Math.pow(cross / 0.032, 2)) * smoothstep(0.02, 0.12, tailAxis)
      const nucleus = Math.exp(-((relX * relX + relY * relY) / 0.003))
      let color = colorScale(hslToRgb(38 + hueShift, 0.86, 0.62), tail * intensity * 0.56)
      color = colorAdd(color, hslToRgb(196 + hueShift, 0.95, 0.58), ionTail * intensity * 0.78)
      color = colorAdd(color, hslToRgb(0, 0, 1.0), nucleus * intensity)
      return color
    }

    case 'magnetosphere-aurora': {
      const speed = Number(layer.parameters.speed ?? 0.24)
      const intensity = Number(layer.parameters.intensity ?? 0.86)
      const density = Number(layer.parameters.density ?? 0.58)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const radius = Math.sqrt(nx * nx + ny * ny)
      const earth = smoothstep(0.16, 0.13, radius)
      const theta = Math.atan2(ny, nx)
      const dipoleR = 0.20 / Math.max(0.08, Math.sin(theta) * Math.sin(theta) + 0.18)
      const fieldLine = Math.exp(-Math.pow((radius - dipoleR) / (0.018 + density * 0.01), 2)) * smoothstep(0.72, 0.18, radius)
      const bowShock = Math.exp(-Math.pow((Math.sqrt((nx + 0.34) ** 2 + (ny * 0.72) ** 2) - 0.52) / 0.035, 2)) * smoothstep(-0.18, -0.65, nx)
      const auroraOval = Math.exp(-Math.pow((radius - 0.20) / 0.018, 2)) * Math.pow(Math.abs(Math.sin(theta)), 2.6)
      const solarWind = Math.pow(0.5 + 0.5 * Math.sin((nx * 12 + time * 8 + fbm2(nx * 5, ny * 5, 3) * 2) * Math.PI), 3) * smoothstep(0.62, -0.48, nx) * 0.18
      let color = colorScale(hslToRgb(210 + hueShift, 0.72, 0.42), fieldLine * intensity * 0.36)
      color = colorAdd(color, hslToRgb(128 + hueShift, 0.96, 0.58), auroraOval * intensity)
      color = colorAdd(color, hslToRgb(194 + hueShift, 0.86, 0.56), bowShock * intensity * 0.52)
      color = colorAdd(color, hslToRgb(36 + hueShift, 0.80, 0.52), earth * intensity * 0.58 + solarWind * intensity)
      return color
    }

    case 'wave-diffraction': {
      const speed = Number(layer.parameters.speed ?? 0.36)
      const intensity = Number(layer.parameters.intensity ?? 0.84)
      const density = Number(layer.parameters.density ?? 0.62)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const wavelength = 18 + density * 14
      const barrier = Math.exp(-Math.pow((nx + 0.12) / 0.012, 2)) * (1 - Math.exp(-Math.pow((Math.abs(ny) - 0.16) / 0.045, 2)))
      const slitA = { x: -0.12, y: -0.16 }
      const slitB = { x: -0.12, y: 0.16 }
      const incident = Math.pow(0.5 + 0.5 * Math.sin((nx + time) * wavelength), 5) * smoothstep(-0.12, -0.68, nx)
      const distanceA = Math.sqrt((nx - slitA.x) ** 2 + (ny - slitA.y) ** 2)
      const distanceB = Math.sqrt((nx - slitB.x) ** 2 + (ny - slitB.y) ** 2)
      const waveA = Math.sin(distanceA * wavelength - time * 9)
      const waveB = Math.sin(distanceB * wavelength - time * 9)
      const interference = Math.pow(Math.abs((waveA + waveB) * 0.5), 4) * smoothstep(-0.08, 0.55, nx)
      const slitGlow = Math.exp(-Math.pow(distanceA / 0.05, 2)) + Math.exp(-Math.pow(distanceB / 0.05, 2))
      let color = colorScale(hslToRgb(204 + hueShift, 0.86, 0.50), (incident + interference) * intensity * 0.62)
      color = colorAdd(color, hslToRgb(46 + hueShift, 1.0, 0.58), slitGlow * intensity * 0.34)
      color = colorAdd(color, hslToRgb(0, 0, 0.22), barrier * intensity)
      return color
    }

    case 'vortex-flame': {
      const speed = Number(layer.parameters.speed ?? 0.46)
      const intensity = Number(layer.parameters.intensity ?? 0.90)
      const density = Number(layer.parameters.density ?? 0.60)
      const hueShift = Number(layer.parameters.hueShift ?? 0)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const yNorm = ny + 0.5
      const taper = 0.08 + yNorm * (0.35 + density * 0.16)
      const swirlCenter = Math.sin(yNorm * 8 - time * 5) * (0.10 + yNorm * 0.10)
      const radius = Math.abs(nx - swirlCenter) / Math.max(0.03, taper)
      const angle = Math.atan2(yNorm * 1.6, nx - swirlCenter)
      const helix = Math.pow(0.5 + 0.5 * Math.sin(angle * 5 + yNorm * 26 - time * 9 + fbm2(nx * 6, ny * 6, 3) * 2), 3)
      const plume = smoothstep(1.25, 0.12, radius) * smoothstep(0.02, 0.95, yNorm)
      const ember = Math.pow(hash2(context.x * 5 + Math.floor(time * 28), context.y * 7), 18) * smoothstep(0.8, 0.12, radius)
      const temperature = clampUnit((plume * (0.45 + helix * 0.8) + ember * 0.8) * intensity)
      return colorAdd(thermalColor(temperature), hslToRgb(210 + hueShift, 0.8, 0.45), plume * (1 - yNorm) * 0.16)
    }

    case 'tokamak-plasma': {
      const speed = Number(layer.parameters.speed ?? 0.34)
      const intensity = Number(layer.parameters.intensity ?? 0.90)
      const density = Number(layer.parameters.density ?? 0.62)
      const hueShift = Number(layer.parameters.hueShift ?? 280)
      const { nx, ny } = normCoords(context)
      const time = context.now * speed
      const radius = Math.sqrt((nx / 0.78) ** 2 + (ny / 0.42) ** 2)
      const torus = Math.exp(-Math.pow((radius - 0.55) / (0.09 + density * 0.025), 2))
      const angle = Math.atan2(ny / 0.42, nx / 0.78)
      const magneticLine = Math.pow(0.5 + 0.5 * Math.sin(angle * 9 + radius * 18 - time * 9), 5)
      const plasmaNoise = fbm2(nx * 10 + time * 2, ny * 10 - time, 4)
      const hotCore = Math.exp(-Math.pow(radius / 0.34, 2)) * 0.36
      const limiter = Math.exp(-Math.pow((radius - 0.72) / 0.018, 2)) * 0.18
      const brightness = clampUnit((torus * (0.46 + magneticLine * 0.72 + plasmaNoise * 0.28) + hotCore + limiter) * intensity)
      const hue = hueShift + magneticLine * 86 - radius * 45 + plasmaNoise * 32
      return hslToRgb(hue, 0.96, brightness * 0.68)
    }

    // ── Custom Paint ──────────────────────────────────────────────────────────

    case 'custom-paint': {
      const pixelDataStr = String(layer.parameters.pixelData ?? '')
      if (!pixelDataStr) return { r: 0, g: 0, b: 0 }
      // pixelData is a JSON-encoded flat array of hex colors: ["#ff0000","#00ff00",...]
      // indexed by y * columns + x
      try {
        const parsed = JSON.parse(pixelDataStr) as string[]
        const idx = context.y * context.columns + context.x
        const hex = parsed[idx]
        if (!hex) return { r: 0, g: 0, b: 0 }
        return hexToRgb(hex)
      } catch {
        return { r: 0, g: 0, b: 0 }
      }
    }

    // ── Image Paint ───────────────────────────────────────────────────────────

    case 'image-paint': {
      const imageDataListStr = String(layer.parameters.imageDataList ?? '')
      if (!imageDataListStr) return { r: 0, g: 0, b: 0 }
      const transitionSpeed = Number(layer.parameters.transitionSpeed ?? 3)
      const animateTransition = layer.parameters.animateTransition !== false
      try {
        // imageDataList: array of image pixel arrays, each is flat hex array for cols*rows
        const images = JSON.parse(imageDataListStr) as string[][]
        if (images.length === 0) return { r: 0, g: 0, b: 0 }
        const idx = context.y * context.columns + context.x

        if (images.length === 1 || !animateTransition) {
          const activeIdx = Number(layer.parameters.activeImageIndex ?? 0) % images.length
          const hex = images[activeIdx]?.[idx]
          return hex ? hexToRgb(hex) : { r: 0, g: 0, b: 0 }
        }

        // Slideshow with crossfade between images
        const cycleDuration = transitionSpeed * images.length
        const phase = (context.now % cycleDuration) / transitionSpeed
        const currentIdx = Math.floor(phase) % images.length
        const nextIdx = (currentIdx + 1) % images.length
        const blend = phase - Math.floor(phase)

        const hexCurrent = images[currentIdx]?.[idx]
        const hexNext = images[nextIdx]?.[idx]
        const colorCurrent = hexCurrent ? hexToRgb(hexCurrent) : { r: 0, g: 0, b: 0 }
        const colorNext = hexNext ? hexToRgb(hexNext) : { r: 0, g: 0, b: 0 }

        return lerpColor(colorCurrent, colorNext, blend)
      } catch {
        return { r: 0, g: 0, b: 0 }
      }
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
