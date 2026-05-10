import type { Profile, RgbColor, RgbFrame } from '../shared/types'
import { adjustSaturationAndContrast, applyBrightness, clampUnit, lerpColor, mixColors } from './color'
import type { EffectContext } from './effects'
import { renderEffectPixel } from './effects'

export interface AudioInput {
  bass: number
  mid: number
  high: number
  beat: number
  freqBands?: number[]  // 32 log-spaced bands 20 Hz – 20 kHz, each 0..1
}

// ── Zone mask ─────────────────────────────────────────────────────────────

/** Cubic smooth-step: returns 0 at edge0, 1 at edge1, smooth in between. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Returns a 0..1 opacity weight for the given zone preset.
 * Edges are softened with a ±0.1 feather so masks look smooth even on small grids.
 */
export function computeZoneMaskWeight(
  x: number,
  y: number,
  columns: number,
  rows: number,
  zone: string
): number {
  const fx = columns > 1 ? x / (columns - 1) : 0.5
  const fy = rows > 1 ? y / (rows - 1) : 0.5
  const f = 0.1 // feather half-width
  switch (zone) {
    case 'top':    return smoothstep(0.5 + f, 0.5 - f, fy)
    case 'bottom': return smoothstep(0.5 - f, 0.5 + f, fy)
    case 'left':   return smoothstep(0.5 + f, 0.5 - f, fx)
    case 'right':  return smoothstep(0.5 - f, 0.5 + f, fx)
    case 'center': {
      const wx = smoothstep(0.3 + f, 0.3 - f, Math.abs(fx - 0.5))
      const wy = smoothstep(0.3 + f, 0.3 - f, Math.abs(fy - 0.5))
      return wx * wy
    }
    case 'corners': {
      const wx = smoothstep(0.3 - f, 0.3 + f, Math.abs(fx - 0.5))
      const wy = smoothstep(0.3 - f, 0.3 + f, Math.abs(fy - 0.5))
      return Math.max(wx, wy)
    }
    default: return 1 // 'full'
  }
}

/**
 * Returns a 0..1 opacity weight restricting a layer to a horizontal display slot.
 * @param slotStr  '0', '1', '2'… or 'all'
 * @param linked   true when the scene spans multiple displays as a virtual canvas
 * @param count    number of display slots in the scene
 */
function computeDisplaySlotMask(
  x: number,
  columns: number,
  slotStr: string,
  linked: boolean,
  count: number
): number {
  if (!linked || count <= 1 || slotStr === 'all') return 1
  const slotIndex = parseInt(slotStr, 10)
  if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= count) return 1
  const fx = columns > 1 ? x / (columns - 1) : 0.5
  const f = 0.015 // tight feather at display boundary
  const slotStart = slotIndex / count
  const slotEnd = (slotIndex + 1) / count
  const leftEdge  = smoothstep(slotStart - f, slotStart + f, fx)
  const rightEdge = smoothstep(slotEnd   + f, slotEnd   - f, fx)
  return leftEdge * rightEdge
}

export function renderPreviewFrame(
  profile: Profile,
  now = performance.now() / 1000,
  previousFrame?: RgbFrame,
  audio?: AudioInput,
  screenSample?: RgbFrame,
  textMasks?: Record<string, boolean[]>
): RgbFrame {
  const columns = Math.max(1, Math.floor(profile.sampling.columns))
  const rows = Math.max(1, Math.floor(profile.sampling.rows))
  const scene = profile.scenes.find((candidate) => candidate.id === profile.activeSceneId) ?? profile.scenes[0]
  const pixels = new Uint8ClampedArray(columns * rows * 3)

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let color: RgbColor = { r: 0, g: 0, b: 0 }

      const pixelIndex = y * columns + x
      const p3 = pixelIndex * 3
      const screenPixel =
        screenSample?.columns === columns && screenSample.rows === rows
          ? { r: screenSample.pixels[p3], g: screenSample.pixels[p3 + 1], b: screenSample.pixels[p3 + 2] } as RgbColor
          : undefined

      const baseContext: EffectContext = {
        x,
        y,
        columns,
        rows,
        now,
        _audioBass: audio?.bass,
        _audioMid: audio?.mid,
        _audioHigh: audio?.high,
        _audioBeat: audio?.beat,
        _audioFreqBands: audio?.freqBands,
        _screenPixel: screenPixel
      }

      for (const layer of scene.layers) {
        if (!layer.enabled) {
          continue
        }

        const ctx: EffectContext = textMasks?.[layer.id]
          ? { ...baseContext, _textMask: textMasks[layer.id] }
          : baseContext

        const overlay = renderEffectPixel(layer, ctx)
        const maskZone = String(layer.parameters._maskZone ?? 'full')
        const maskWeight = maskZone === 'full' ? 1 : computeZoneMaskWeight(x, y, columns, rows, maskZone)
        const displaySlot = String(layer.parameters._displaySlot ?? 'all')
        const displayMask = computeDisplaySlotMask(x, columns, displaySlot, scene.linkedDisplays ?? false, scene.displayIds.length)
        color = mixColors(color, overlay, layer.opacity * maskWeight * displayMask, layer.blendMode)
      }

      const brightColor = applyBrightness(color, profile.sampling.brightnessLimit)
      const limitedColor = adjustSaturationAndContrast(brightColor, profile.sampling.saturationBoost, 1.0)
      const previousColor =
        previousFrame?.columns === columns && previousFrame.rows === rows
          ? { r: previousFrame.pixels[p3], g: previousFrame.pixels[p3 + 1], b: previousFrame.pixels[p3 + 2] } as RgbColor
          : undefined
      const smoothing = profile.sampling.usePerformanceGuard ? clampUnit(profile.sampling.smoothing) : 0

      const finalColor = previousColor ? lerpColor(limitedColor, previousColor, smoothing) : limitedColor
      pixels[p3]     = finalColor.r
      pixels[p3 + 1] = finalColor.g
      pixels[p3 + 2] = finalColor.b
    }
  }

  return {
    columns,
    rows,
    pixels,
    generatedAt: Date.now()
  }
}
