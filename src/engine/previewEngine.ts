import type { Profile, RgbColor, RgbFrame } from '../shared/types'
import { adjustSaturationAndContrast, applyBrightness, clampUnit, lerpColor, mixColors } from './color'
import type { EffectContext } from './effects'
import { renderEffectPixel } from './effects'

export interface AudioInput {
  bass: number
  mid: number
  high: number
  beat: number
}

export function renderPreviewFrame(
  profile: Profile,
  now = performance.now() / 1000,
  previousFrame?: RgbFrame,
  audio?: AudioInput,
  screenSample?: RgbFrame
): RgbFrame {
  const columns = Math.max(1, Math.floor(profile.sampling.columns))
  const rows = Math.max(1, Math.floor(profile.sampling.rows))
  const scene = profile.scenes.find((candidate) => candidate.id === profile.activeSceneId) ?? profile.scenes[0]
  const pixels: RgbColor[] = []

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      let color: RgbColor = { r: 0, g: 0, b: 0 }

      const pixelIndex = y * columns + x
      const screenPixel =
        screenSample?.columns === columns && screenSample.rows === rows
          ? screenSample.pixels[pixelIndex]
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
        _screenPixel: screenPixel
      }

      for (const layer of scene.layers) {
        if (!layer.enabled) {
          continue
        }

        const overlay = renderEffectPixel(layer, baseContext)
        color = mixColors(color, overlay, layer.opacity, layer.blendMode)
      }

      const brightColor = applyBrightness(color, profile.sampling.brightnessLimit)
      const limitedColor = adjustSaturationAndContrast(brightColor, profile.sampling.saturationBoost, 1.0)
      const previousColor = previousFrame?.columns === columns && previousFrame.rows === rows ? previousFrame.pixels[pixels.length] : undefined
      const smoothing = profile.sampling.usePerformanceGuard ? clampUnit(profile.sampling.smoothing) : 0

      pixels.push(previousColor ? lerpColor(limitedColor, previousColor, smoothing) : limitedColor)
    }
  }

  return {
    columns,
    rows,
    pixels,
    generatedAt: Date.now()
  }
}
