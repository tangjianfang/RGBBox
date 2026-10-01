import type { EffectLayer, Profile, RgbColor, RgbFrame } from '../shared/types'
import { clampByte, clampUnit, mixColors } from './color'
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

  // ── R221.3（B-1/U-2）: 帧级预计算——原实现把下列工作放进 56k 像素×层循环,
  //    是「317×178 下 static 33-66ms/帧(预算 198%)」的主因(03/02/主审三源实测):
  //    ①每层 _maskZone/_displaySlot 的 String() 与 displaySlot 链路常量;
  //    ②上下文对象:每像素新建 baseContext + textMask 层再展开一次
  //      (56k×(1+层) 个对象分配)→ 改为每层一个可变 context,逐像素只改
  //      x/y/_screenPixel 字段(引用稳定,效果函数只读);
  //    ③终色链 applyBrightness/adjustSaturationAndContrast/lerpColor 的
  //      中间对象分配 → 标量内联(同公式逐项展开);
  //    ④hexToRgb 已在 color.ts 加结果缓存。
  interface LayerPrep {
    layer: EffectLayer
    ctx: EffectContext
    maskZone: string
    opacity: number
    slotAll: boolean
    slotIndex: number
    slotLinked: boolean
    slotCount: number
  }
  const preps: LayerPrep[] = []
  for (const layer of scene.layers) {
    if (!layer.enabled) continue
    const ctx: EffectContext = {
      x: 0, y: 0, columns, rows, now,
      _textMask: textMasks?.[layer.id],
      _audioBass: audio?.bass,
      _audioMid: audio?.mid,
      _audioHigh: audio?.high,
      _audioBeat: audio?.beat,
      _audioFreqBands: audio?.freqBands,
      _screenPixel: undefined,
    }
    const displaySlot = String(layer.parameters._displaySlot ?? 'all')
    const slotIndex = parseInt(displaySlot, 10)
    preps.push({
      layer,
      ctx,
      maskZone: String(layer.parameters._maskZone ?? 'full'),
      opacity: layer.opacity,
      slotAll: !scene.linkedDisplays || scene.displayIds.length <= 1 || displaySlot === 'all' || Number.isNaN(slotIndex),
      slotIndex,
      slotLinked: scene.linkedDisplays ?? false,
      slotCount: scene.displayIds.length,
    })
  }
  const brightnessLimit = profile.sampling.brightnessLimit
  const saturationBoost = profile.sampling.saturationBoost
  const smoothing = profile.sampling.usePerformanceGuard ? clampUnit(profile.sampling.smoothing) : 0
  const hasPrev = previousFrame?.columns === columns && previousFrame?.rows === rows
  const prevPixels = hasPrev ? previousFrame!.pixels : undefined
  const useScreen = screenSample?.columns === columns && screenSample?.rows === rows
  const screenPixels = useScreen ? screenSample!.pixels : undefined

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const p3 = (y * columns + x) * 3
      let r = 0
      let g = 0
      let b = 0

      for (const prep of preps) {
        const ctx = prep.ctx
        ctx.x = x
        ctx.y = y
        if (screenPixels !== undefined) {
          SP0.r = screenPixels[p3]
          SP0.g = screenPixels[p3 + 1]
          SP0.b = screenPixels[p3 + 2]
          ctx._screenPixel = SP0
        } else {
          ctx._screenPixel = undefined
        }

        const overlay = renderEffectPixel(prep.layer, ctx)
        const maskWeight = prep.maskZone === 'full' ? 1 : computeZoneMaskWeight(x, y, columns, rows, prep.maskZone)
        const displayMask = prep.slotAll ? 1 : computeDisplaySlotMask(x, columns, String(prep.slotIndex), prep.slotLinked, prep.slotCount)
        const alpha = prep.opacity * maskWeight * displayMask
        if (prep.layer.blendMode === 'normal') {
          r += (overlay.r - r) * alpha
          g += (overlay.g - g) * alpha
          b += (overlay.b - b) * alpha
        } else {
          const mixed = mixColors({ r, g, b }, overlay, alpha, prep.layer.blendMode)
          r = mixed.r
          g = mixed.g
          b = mixed.b
        }
      }

      // applyBrightness 内联(r*gain 三通道独立 clamp)
      r = clampByte(r * brightnessLimit)
      g = clampByte(g * brightnessLimit)
      b = clampByte(b * brightnessLimit)
      // adjustSaturationAndContrast(sat, contrast=1) 内联(Rec.709 亮度)
      if (saturationBoost !== 1) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = clampByte(lum + (r - lum) * saturationBoost)
        g = clampByte(lum + (g - lum) * saturationBoost)
        b = clampByte(lum + (b - lum) * saturationBoost)
      }
      // lerpColor(previous) 内联(clampByte 保序)
      if (prevPixels !== undefined && smoothing > 0) {
        const inv = 1 - smoothing
        r = clampByte(r * inv + prevPixels[p3] * smoothing)
        g = clampByte(g * inv + prevPixels[p3 + 1] * smoothing)
        b = clampByte(b * inv + prevPixels[p3 + 2] * smoothing)
      }
      pixels[p3] = r
      pixels[p3 + 1] = g
      pixels[p3 + 2] = b
    }
  }

  return {
    columns,
    rows,
    pixels,
    generatedAt: Date.now()
  }
}

/** R221.3: 屏幕采样像素的复用载体(免 56k 次对象分配)。 */
const SP0: RgbColor = { r: 0, g: 0, b: 0 }
