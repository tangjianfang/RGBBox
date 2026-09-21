// R147 P1: extracted verbatim from App.tsx module scope (ambient presets).
import type { BlendMode, EffectKind } from '../../../shared/types'

export interface AmbientPreset {
  id: string
  icon: string
  labelKey: string
  effectKind: EffectKind
  parameters: Record<string, number | string | boolean>
  opacity: number
  blendMode: BlendMode
}

export const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: 'focus',  icon: '🧠', labelKey: 'ambient.focus',  effectKind: 'breathing',      parameters: { speed: 0.18, color: '#6ab4ff' },              opacity: 0.70, blendMode: 'normal' },
  { id: 'gaming', icon: '🎮', labelKey: 'ambient.gaming', effectKind: 'rainbow',        parameters: { speed: 0.80, spread: 1.5, hueShift: 0, angle: 0 }, opacity: 0.90, blendMode: 'screen' },
  { id: 'party',  icon: '🎉', labelKey: 'ambient.party',  effectKind: 'spectrum',       parameters: { speed: 1.20, intensity: 1.0 },                opacity: 0.95, blendMode: 'add' },
  { id: 'cinema', icon: '🎬', labelKey: 'ambient.cinema', effectKind: 'screen-ambient', parameters: { saturation: 0.9, contrast: 1.1 },              opacity: 0.85, blendMode: 'normal' },
  { id: 'relax',  icon: '🌿', labelKey: 'ambient.relax',  effectKind: 'aurora',         parameters: { speed: 0.20, hueShift: 160, intensity: 0.6 }, opacity: 0.75, blendMode: 'screen' },
  { id: 'sleep',  icon: '🌙', labelKey: 'ambient.sleep',  effectKind: 'breathing',      parameters: { speed: 0.10, color: '#ff5a28' },              opacity: 0.38, blendMode: 'normal' },
]
