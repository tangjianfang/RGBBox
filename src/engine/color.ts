import type { BlendMode, RgbColor } from '../shared/types'

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '')
  const fallback = { r: 255, g: 255, b: 255 }

  if (normalized.length !== 6) {
    return fallback
  }

  const value = Number.parseInt(normalized, 16)

  if (Number.isNaN(value)) {
    return fallback
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

export function hslToRgb(hue: number, saturation: number, lightness: number): RgbColor {
  const normalizedHue = ((hue % 360) + 360) % 360
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const segment = normalizedHue / 60
  const x = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = lightness - chroma / 2
  const [r1, g1, b1] =
    segment < 1
      ? [chroma, x, 0]
      : segment < 2
        ? [x, chroma, 0]
        : segment < 3
          ? [0, chroma, x]
          : segment < 4
            ? [0, x, chroma]
            : segment < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return {
    r: clampByte((r1 + match) * 255),
    g: clampByte((g1 + match) * 255),
    b: clampByte((b1 + match) * 255)
  }
}

export function mixColors(base: RgbColor, overlay: RgbColor, opacity: number, mode: BlendMode): RgbColor {
  const blendChannel = (a: number, b: number): number => {
    switch (mode) {
      case 'add':
        return Math.min(255, a + b)
      case 'multiply':
        return (a * b) / 255
      case 'screen':
        return 255 - ((255 - a) * (255 - b)) / 255
      case 'normal':
      default:
        return b
    }
  }

  return {
    r: clampByte(base.r * (1 - opacity) + blendChannel(base.r, overlay.r) * opacity),
    g: clampByte(base.g * (1 - opacity) + blendChannel(base.g, overlay.g) * opacity),
    b: clampByte(base.b * (1 - opacity) + blendChannel(base.b, overlay.b) * opacity)
  }
}

/**
 * Scale all channels by `gain`.
 * gain=1.0 → pass-through (no dimming).
 * gain>1.0 → amplify (channels clamped to 255).
 * gain<1.0 → dim.
 */
export function applyBrightness(color: RgbColor, gain: number): RgbColor {
  return {
    r: clampByte(color.r * gain),
    g: clampByte(color.g * gain),
    b: clampByte(color.b * gain)
  }
}

export function adjustSaturationAndContrast(color: RgbColor, saturation: number, contrast: number): RgbColor {
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
  const contrastChannel = (value: number): number => (value - 128) * contrast + 128

  return {
    r: clampByte(contrastChannel(luminance + (color.r - luminance) * saturation)),
    g: clampByte(contrastChannel(luminance + (color.g - luminance) * saturation)),
    b: clampByte(contrastChannel(luminance + (color.b - luminance) * saturation))
  }
}

export function lerpColor(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const ratio = clampUnit(amount)

  return {
    r: clampByte(from.r * (1 - ratio) + to.r * ratio),
    g: clampByte(from.g * (1 - ratio) + to.g * ratio),
    b: clampByte(from.b * (1 - ratio) + to.b * ratio)
  }
}
