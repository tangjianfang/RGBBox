// R147 P1: extracted verbatim from App.tsx module scope (effect randomizer).
import { effectPresets } from '../../../shared/defaultProfile'
import type { EffectKind, EffectLayer } from '../../../shared/types'
import { PARAM_META } from './paramMeta'

export type RandomizerMode = 'subtle' | 'bold' | 'calm' | 'energy'

export const DEFAULT_FAVORITE_EFFECTS: EffectKind[] = ['rainbow', 'fire', 'audio-equalizer', 'hologram', 'dna-helix', 'black-hole', 'tokamak-plasma']
export const RANDOMIZER_MODES: RandomizerMode[] = ['subtle', 'bold', 'calm', 'energy']

const THEME_COLOR_PALETTES = {
  cyberpunk: ['#00f5ff', '#ff2bd6', '#ffe600', '#39ff14', '#7c3cff'],
  synthwave: ['#ff2a6d', '#05d9e8', '#d1f7ff', '#f9f871', '#7a04eb'],
  vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'],
  neonGoth: ['#00ff99', '#ff005d', '#00eaff', '#7b2cff', '#f8f8ff'],
  auroraBorealis: ['#23f0a8', '#4cc9f0', '#9b5de5', '#f15bb5', '#e0fbfc'],
  sunsetHeat: ['#ff3d00', '#ff8a00', '#ffd166', '#ff006e', '#8338ec'],
  minimalWhite: ['#ffffff', '#dbeafe', '#94a3b8', '#38bdf8', '#111827'],
  natureGlow: ['#2dd4bf', '#84cc16', '#facc15', '#fb7185', '#38bdf8']
} as const

export const COLOR_PALETTES: Record<RandomizerMode, string[]> = {
  subtle: [...THEME_COLOR_PALETTES.minimalWhite, ...THEME_COLOR_PALETTES.natureGlow],
  bold: [...THEME_COLOR_PALETTES.cyberpunk, ...THEME_COLOR_PALETTES.vaporwave, ...THEME_COLOR_PALETTES.neonGoth],
  calm: [...THEME_COLOR_PALETTES.auroraBorealis, ...THEME_COLOR_PALETTES.minimalWhite],
  energy: [...THEME_COLOR_PALETTES.sunsetHeat, ...THEME_COLOR_PALETTES.synthwave, ...THEME_COLOR_PALETTES.cyberpunk]
}

export function parseStoredEffectKinds(raw: string | null): EffectKind[] {
  if (!raw) return DEFAULT_FAVORITE_EFFECTS
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_FAVORITE_EFFECTS
    const validKinds = new Set(effectPresets.map((preset) => preset.kind))
    const unique = parsed.filter((kind): kind is EffectKind => typeof kind === 'string' && validKinds.has(kind as EffectKind))
    return [...new Set(unique)].slice(0, 12)
  } catch {
    return DEFAULT_FAVORITE_EFFECTS
  }
}

export function parseStoredParameterLocks(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((name): name is string => typeof name === 'string'))]
  } catch {
    return []
  }
}

export function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function snapToStep(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

export function randomInRange(min: number, max: number, step: number): number {
  const value = min + Math.random() * (max - min)
  return Math.max(min, Math.min(max, snapToStep(value, step)))
}

export function randomizeNumberParameter(name: string, current: number, mode: RandomizerMode): number {
  const meta = PARAM_META[name]
  const min = meta?.min ?? 0
  const max = meta?.max ?? 2
  const step = meta?.step ?? 0.05

  if (mode === 'subtle') {
    const span = (max - min) * 0.28
    return randomInRange(Math.max(min, current - span), Math.min(max, current + span), step)
  }

  if (mode === 'calm') {
    if (name === 'speed') return randomInRange(min, Math.min(max, 0.45), step)
    if (name === 'intensity' || name === 'density' || name === 'sensitivity') return randomInRange(min, Math.min(max, min + (max - min) * 0.5), step)
    return randomInRange(min, min + (max - min) * 0.72, step)
  }

  if (mode === 'energy') {
    if (name === 'speed') return randomInRange(Math.max(min, 0.55), max, step)
    if (name === 'intensity' || name === 'density' || name === 'sensitivity') return randomInRange(min + (max - min) * 0.45, max, step)
    return randomInRange(min + (max - min) * 0.2, max, step)
  }

  return randomInRange(min, max, step)
}

export function randomizeLayerParameters(layer: EffectLayer, mode: RandomizerMode, lockedParameters: ReadonlySet<string>): EffectLayer['parameters'] {
  return Object.fromEntries(
    Object.entries(layer.parameters).map(([name, value]) => {
      if (name.startsWith('_')) return [name, value]
      if (lockedParameters.has(name)) return [name, value]
      if (typeof value === 'number') return [name, randomizeNumberParameter(name, value, mode)]
      if (typeof value === 'string' && value.startsWith('#')) return [name, randomItem(COLOR_PALETTES[mode])]
      if (typeof value === 'boolean') return [name, mode === 'bold' ? Math.random() > 0.5 : value]
      return [name, value]
    })
  )
}
