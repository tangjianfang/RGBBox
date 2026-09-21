// R147 P1: extracted verbatim from App.tsx module scope (quick dimension presets).
import type { EffectKind, EffectLayer } from '../../../shared/types'

export type QuickDimensionId = 'motion' | 'energy' | 'detail' | 'palette'
export type QuickMotionId = 'slow' | 'flow' | 'active' | 'surge'
export type QuickEnergyId = 'soft' | 'balanced' | 'vivid' | 'max'
export type QuickDetailId = 'clean' | 'balanced' | 'rich' | 'dense'
export type QuickPaletteId = 'cool' | 'warm' | 'neon' | 'mono'

export interface QuickOption<T extends string> {
  id: T
  labelKey: string
}

export const QUICK_EFFECT_KINDS: EffectKind[] = ['screen-ambient', 'aurora', 'fire', 'hologram', 'dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'orion-nebula', 'hurricane-eye', 'icosahedral-virus', 'quantum-collapse', 'magnetosphere-aurora', 'tokamak-plasma']

export const QUICK_MOTION_OPTIONS: QuickOption<QuickMotionId>[] = [
  { id: 'slow', labelKey: 'quick.motion.slow' },
  { id: 'flow', labelKey: 'quick.motion.flow' },
  { id: 'active', labelKey: 'quick.motion.active' },
  { id: 'surge', labelKey: 'quick.motion.surge' },
]

export const QUICK_ENERGY_OPTIONS: QuickOption<QuickEnergyId>[] = [
  { id: 'soft', labelKey: 'quick.energy.soft' },
  { id: 'balanced', labelKey: 'quick.energy.balanced' },
  { id: 'vivid', labelKey: 'quick.energy.vivid' },
  { id: 'max', labelKey: 'quick.energy.max' },
]

export const QUICK_DETAIL_OPTIONS: QuickOption<QuickDetailId>[] = [
  { id: 'clean', labelKey: 'quick.detail.clean' },
  { id: 'balanced', labelKey: 'quick.detail.balanced' },
  { id: 'rich', labelKey: 'quick.detail.rich' },
  { id: 'dense', labelKey: 'quick.detail.dense' },
]

export const QUICK_PALETTE_OPTIONS: QuickOption<QuickPaletteId>[] = [
  { id: 'cool', labelKey: 'quick.palette.cool' },
  { id: 'warm', labelKey: 'quick.palette.warm' },
  { id: 'neon', labelKey: 'quick.palette.neon' },
  { id: 'mono', labelKey: 'quick.palette.mono' },
]

function setNumberIfPresent(parameters: EffectLayer['parameters'], name: string, value: number): void {
  if (typeof parameters[name] === 'number') parameters[name] = value
}

function setColorIfPresent(parameters: EffectLayer['parameters'], name: string, value: string): void {
  if (typeof parameters[name] === 'string' && String(parameters[name]).startsWith('#')) parameters[name] = value
}

export function applyQuickDimensionParameters(
  parameters: EffectLayer['parameters'],
  dimension: QuickDimensionId,
  option: string
): EffectLayer['parameters'] {
  const next: EffectLayer['parameters'] = { ...parameters, [`_quick${dimension[0].toUpperCase()}${dimension.slice(1)}`]: option }

  if (dimension === 'motion') {
    const values = {
      slow:   { speed: 0.18, scanSpeed: 0.55, wind: -0.05 },
      flow:   { speed: 0.38, scanSpeed: 1.00, wind: 0.00 },
      active: { speed: 0.72, scanSpeed: 1.45, wind: 0.12 },
      surge:  { speed: 1.15, scanSpeed: 2.15, wind: 0.28 },
    }[option as QuickMotionId] ?? { speed: 0.38, scanSpeed: 1.00, wind: 0.00 }
    setNumberIfPresent(next, 'speed', values.speed)
    setNumberIfPresent(next, 'scanSpeed', values.scanSpeed)
    setNumberIfPresent(next, 'wind', values.wind)
  }

  if (dimension === 'energy') {
    const values = {
      soft:     { intensity: 0.45, saturation: 0.72, contrast: 0.88, sensitivity: 0.72, heat: 0.70, sparks: 0.04, pulseAmplitude: 0.38, particleIntensity: 0.52 },
      balanced: { intensity: 0.70, saturation: 1.00, contrast: 1.00, sensitivity: 1.00, heat: 1.00, sparks: 0.14, pulseAmplitude: 0.58, particleIntensity: 0.86 },
      vivid:    { intensity: 0.88, saturation: 1.22, contrast: 1.18, sensitivity: 1.28, heat: 1.18, sparks: 0.26, pulseAmplitude: 0.74, particleIntensity: 1.18 },
      max:      { intensity: 1.00, saturation: 1.50, contrast: 1.35, sensitivity: 1.60, heat: 1.42, sparks: 0.42, pulseAmplitude: 0.92, particleIntensity: 1.55 },
    }[option as QuickEnergyId] ?? { intensity: 0.70, saturation: 1.00, contrast: 1.00, sensitivity: 1.00, heat: 1.00, sparks: 0.14, pulseAmplitude: 0.58, particleIntensity: 0.86 }
    Object.entries(values).forEach(([name, value]) => setNumberIfPresent(next, name, value))
    setNumberIfPresent(next, 'baseBrightness', Math.max(0.08, values.intensity * 0.22))
    setNumberIfPresent(next, 'shimmerIntensity', Math.min(1, values.intensity * 0.72))
  }

  if (dimension === 'detail') {
    const values = {
      clean:    { density: 0.22, frequency: 2.0, spread: 0.88, gridDensity: 0.18, scanWidth: 0.72, colorSpread: 55, glitchAmount: 0.02 },
      balanced: { density: 0.50, frequency: 3.8, spread: 1.20, gridDensity: 0.46, scanWidth: 0.58, colorSpread: 95, glitchAmount: 0.12 },
      rich:     { density: 0.72, frequency: 5.8, spread: 1.55, gridDensity: 0.68, scanWidth: 0.45, colorSpread: 132, glitchAmount: 0.20 },
      dense:    { density: 0.90, frequency: 8.0, spread: 2.00, gridDensity: 0.92, scanWidth: 0.32, colorSpread: 170, glitchAmount: 0.34 },
    }[option as QuickDetailId] ?? { density: 0.50, frequency: 3.8, spread: 1.20, gridDensity: 0.46, scanWidth: 0.58, colorSpread: 95, glitchAmount: 0.12 }
    Object.entries(values).forEach(([name, value]) => setNumberIfPresent(next, name, value))
    setNumberIfPresent(next, 'particleIntensity', Math.max(0.35, values.density * 1.35))
  }

  if (dimension === 'palette') {
    const values = {
      cool: { hueShift: 190, baseHue: 182, color: '#38bdf8', colorLow: '#14f1ff', colorHigh: '#7c3cff' },
      warm: { hueShift: 24,  baseHue: 28,  color: '#ff7a18', colorLow: '#ff3d00', colorHigh: '#ffd166' },
      neon: { hueShift: 295, baseHue: 305, color: '#ff2bd6', colorLow: '#00f5ff', colorHigh: '#ff2bd6' },
      mono: { hueShift: 0,   baseHue: 204, color: '#dbeafe', colorLow: '#ffffff', colorHigh: '#94a3b8' },
    }[option as QuickPaletteId] ?? { hueShift: 190, baseHue: 182, color: '#38bdf8', colorLow: '#14f1ff', colorHigh: '#7c3cff' }
    setNumberIfPresent(next, 'hueShift', values.hueShift)
    setNumberIfPresent(next, 'baseHue', values.baseHue)
    setColorIfPresent(next, 'color', values.color)
    setColorIfPresent(next, 'textColor', values.color)
    setColorIfPresent(next, 'colorLow', values.colorLow)
    setColorIfPresent(next, 'colorHigh', values.colorHigh)
  }

  return next
}

export function opacityForQuickEnergy(option: string): number {
  switch (option) {
    case 'soft': return 0.46
    case 'vivid': return 0.86
    case 'max': return 1.00
    default: return 0.68
  }
}
