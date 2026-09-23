import type { EffectKind } from '../../../shared/types'

/**
 * R164.3 (S3): per-effect "primary parameters" — the ≤3 sliders that most
 * change how an effect FEELS, promoted above the fold; everything else stays
 * in the advanced drawer (not one parameter is removed).
 *
 * Selection follows the review's guidance: the shared surfaces (speed /
 * intensity / hueShift / density cover 48/28/35/26 of 55 presets) are the
 * sensible defaults; the overrides table hand-picks the few kinds whose most
 * expressive knob is something else (rainbow's spread/angle, wave's width…).
 */
const OVERRIDES: Partial<Record<EffectKind, string[]>> = {
  'screen-ambient': ['saturation', 'contrast'],
  static: ['color', 'text'],
  breathing: ['color', 'speed', 'baseBrightness'],
  rainbow: ['spread', 'angle', 'speed'],
  wave: ['width', 'angle', 'speed'],
  'zone-gradient': ['from', 'to', 'angle'],
  fire: ['intensity', 'color', 'speed'],
  starlight: ['density', 'speed', 'color'],
  aurora: ['intensity', 'colorSpread', 'speed'],
  nebula: ['intensity', 'density', 'colorSpread'],
  'neon-pulse': ['frequency', 'speed', 'hueShift'],
  'matrix-rain': ['density', 'speed', 'color'],
  glitch: ['intensity', 'speed', 'hueShift'],
  spectrum: ['spread', 'speed', 'saturation'],
  comet: ['tail', 'speed', 'color'],
  lightning: ['intensity', 'speed', 'color'],
}

const DEFAULT_PICKS = ['speed', 'intensity', 'hueShift']

/**
 * The ≤3 primary parameter NAMES for a kind, filtered against what the layer
 * actually carries. Falls back to the first numeric parameters when none of
 * the picks exist (a custom profile may have pruned them).
 */
export function primaryParamsFor(kind: EffectKind, parameters: Record<string, unknown>): string[] {
  const wanted = OVERRIDES[kind] ?? DEFAULT_PICKS
  const available = wanted.filter((name) => name in parameters && !name.startsWith('_'))
  if (available.length > 0) return available.slice(0, 3)
  return Object.entries(parameters)
    .filter(([name, value]) => !name.startsWith('_') && typeof value === 'number')
    .slice(0, 3)
    .map(([name]) => name)
}
