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
      const hue = ((context.x / Math.max(1, context.columns - 1)) * 300 * spread + context.now * speed * 120 + hueShift) % 360

      return hslToRgb(hue, 0.88, 0.54)
    }

    case 'wave': {
      const speed = Number(layer.parameters.speed ?? 0.5)
      const width = Number(layer.parameters.width ?? 0.35)
      const color = hexToRgb(String(layer.parameters.color ?? '#00ccff'))
      const wave = Math.sin((context.x / context.columns + context.y / context.rows + context.now * speed) * Math.PI * 2)
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
      const ratio = (context.x + context.y) / Math.max(1, context.columns + context.rows - 2)

      return {
        r: from.r * (1 - ratio) + to.r * ratio,
        g: from.g * (1 - ratio) + to.g * ratio,
        b: from.b * (1 - ratio) + to.b * ratio
      }
    }

    // ── Advanced ─────────────────────────────────────────────────────────────

    case 'fire': {
      const speed = Number(layer.parameters.speed ?? 0.7)
      const intensity = Number(layer.parameters.intensity ?? 0.85)
      const spread = Number(layer.parameters.spread ?? 1.2)
      const color = hexToRgb(String(layer.parameters.color ?? '#ff4400'))
      const t = context.now * speed

      const verticalFall = Math.max(0, 1 - context.y / Math.max(1, context.rows - 1))
      const nx = (context.x / context.columns) * spread

      // Multi-octave turbulence for organic flame shape
      const n1 = Math.sin(nx * 2.1 + t * 3.3) * Math.cos(context.y * 1.8 - t * 2.5)
      const n2 = Math.sin(nx * 4.3 - t * 2.1) * Math.cos(context.y * 3.7 + t * 4.4)
      const n3 = Math.sin(nx * 8.7 + t * 5.1) * Math.cos(context.y * 7.1 - t * 3.2)
      const turbulence = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2 + 1) / 2

      const temperature = clampUnit((verticalFall * 1.3 + turbulence * 0.4 - 0.15) * intensity)

      // temperature: 0 → black, 0.5 → user color, 1.0 → white
      if (temperature < 0.5) {
        const p = temperature / 0.5
        return { r: Math.round(color.r * p), g: Math.round(color.g * p), b: Math.round(color.b * p) }
      } else {
        const p = (temperature - 0.5) / 0.5
        return {
          r: Math.min(255, Math.round(color.r + (255 - color.r) * p)),
          g: Math.min(255, Math.round(color.g + (255 - color.g) * p)),
          b: Math.min(255, Math.round(color.b + (255 - color.b) * p))
        }
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

      const cx = (context.columns - 1) / 2
      const cy = (context.rows - 1) / 2
      const dx = (context.x - cx) / Math.max(1, context.columns / 2)
      const dy = (context.y - cy) / Math.max(1, context.rows / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)

      const wave = Math.sin((dist * frequency - context.now * speed) * Math.PI * 2)
      const brightness = clampUnit((wave + 1) / 2) * Math.max(0, 1 - dist * 0.65)

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
      const hue = (context.now * speed * 360 + hueShift) % 360

      return hslToRgb(hue, saturation, 0.56)
    }

    case 'comet': {
      const speed = Number(layer.parameters.speed ?? 0.45)
      const tail = Number(layer.parameters.tail ?? 0.35)
      const color = hexToRgb(String(layer.parameters.color ?? '#ffffff'))

      const headPos = (context.now * speed) % 1
      const axisPos = context.x / Math.max(1, context.columns - 1)
      const crossPos = context.y / Math.max(1, context.rows - 1)

      const behind = (axisPos - headPos + 1) % 1
      const tailFall = behind < tail ? Math.exp(-behind * 6 / tail) : 0
      const crossDist = Math.abs(crossPos - 0.5) * 2
      const crossFade = Math.max(0, 1 - crossDist * 5)
      const brightness = tailFall * crossFade
      const whiteBlend = 1 - clampUnit(behind / Math.max(0.01, tail))

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
      const speed = Number(layer.parameters.speed ?? 0.12)
      const intensity = Number(layer.parameters.intensity ?? 0.88)
      const hueShift = Number(layer.parameters.hueShift ?? 0)

      const vFraction = context.y / Math.max(1, context.rows - 1)
      const curtain = Math.pow(clampUnit(1 - vFraction * 1.3), 0.6)
      const hFraction = context.x / Math.max(1, context.columns - 1)

      const w1 = Math.sin(hFraction * Math.PI * 3.9 + context.now * speed * 1.1) * 0.5 + 0.5
      const w2 = Math.sin(hFraction * Math.PI * 1.8 - context.now * speed * 0.65) * 0.5 + 0.5
      const w3 = Math.cos(hFraction * Math.PI * 6.1 + context.now * speed * 1.8) * 0.5 + 0.5

      const blended = w1 * 0.5 + w2 * 0.3 + w3 * 0.2
      const hue = ((120 + blended * 100 + hueShift) % 360 + 360) % 360
      const brightness = curtain * intensity * (0.4 + blended * 0.5)

      return hslToRgb(hue, 0.95, brightness * 0.7)
    }

    case 'explode': {
      const speed = Number(layer.parameters.speed ?? 0.4)
      const color = hexToRgb(String(layer.parameters.color ?? '#ff6020'))

      const cx = (context.columns - 1) / 2
      const cy = (context.rows - 1) / 2
      const dx = (context.x - cx) / Math.max(1, context.columns / 2)
      const dy = (context.y - cy) / Math.max(1, context.rows / 2)
      const dist = Math.sqrt(dx * dx + dy * dy)

      const cycle = (context.now * speed) % 1
      const ring = Math.abs(dist - cycle)
      const burst = Math.max(0, 0.14 - ring) / 0.14
      const edgeFade = Math.max(0, 1 - dist * 0.7)

      return {
        r: Math.min(255, Math.round(color.r * burst * edgeFade + 255 * burst * 0.5)),
        g: Math.round(color.g * burst * edgeFade),
        b: Math.round(color.b * burst * edgeFade)
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
      const bass = Number(context._audioBass ?? 0)
      const mid = Number(context._audioMid ?? 0)
      const high = Number(context._audioHigh ?? 0)
      const sensitivity = Number(layer.parameters.sensitivity ?? 1.0)
      const colorLow  = hexToRgb(String(layer.parameters.colorLow  ?? '#00ff44'))
      const colorHigh = hexToRgb(String(layer.parameters.colorHigh ?? '#ff2200'))

      const colFraction = context.x / Math.max(1, context.columns - 1)
      let bandLevel: number

      if (colFraction < 0.33) {
        bandLevel = bass + (mid - bass) * (colFraction / 0.33)
      } else if (colFraction < 0.67) {
        bandLevel = mid
      } else {
        bandLevel = mid + (high - mid) * ((colFraction - 0.67) / 0.33)
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
