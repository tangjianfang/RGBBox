import { Activity, Box, ChevronDown, ChevronUp, Clock, Cpu, Download, FilePlus, Gamepad2, Gauge, Languages, Link2, Link2Off, Lock, Mic, MicOff, Monitor, MoreVertical, Music, Pause, Pencil, Play, Plus, Shuffle, Sparkles, Star, Trash2, Unlock, Upload, Video } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { defaultProfile, effectPresets } from '../../shared/defaultProfile'
import type { BlendMode, CaptureProviderStatus, DisplayTopology, EffectKind, EffectLayer, EngineMetrics, EngineStatus, OverlayConfig, Profile, ProcessCpuSample, ProfileMeta, RgbFrame, Scene, VideoWallLayout } from '../../shared/types'
import { is3DEffect, resolveFrameRenderStyle } from '../../shared/types'
import { isGpuDirectEffect } from './gl/effectGl'
import { extractWallPanelFrame } from '../../engine/videoWallFrame'
import { useI18n } from './i18n'
import { DisplayMap } from './components/DisplayMap'
import { VideoWallEditor } from './components/VideoWallEditor'
import { EffectsView } from './components/EffectsView'
import { MiniGamesView } from './components/MiniGamesView'
import { AudioStudioView } from './components/AudioStudioView'
import { VideoStudioView } from './components/VideoStudioView'
import { CustomPaintEditor } from './components/CustomPaintEditor'
import { ImagePaintEditor } from './components/ImagePaintEditor'
import { PreviewGrid } from './components/PreviewGrid'
import { Preview3D } from './components/Preview3D'
import { ArchitectureView } from './components/ArchitectureView'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import type { WorkerInput, WorkerOutput } from './workers/previewEngineWorker'
import { useModelStore } from './3d/useModelStore'
import { MetricsCollector } from './engine/metricsCollector'

// Lazily loaded — vendor-splat (1.6MB) is only fetched when the 3D view is first opened
const SplatViewer = lazy(() => import('./3d/SplatViewer').then((m) => ({ default: m.SplatViewer })))
const LEDMapper   = lazy(() => import('./3d/LEDMapper').then((m) => ({ default: m.LEDMapper })))

type View = 'workspace' | 'effects' | 'profiles' | 'diagnostics' | 'model3d' | 'games' | 'audio' | 'video' | 'architecture'

type RandomizerMode = 'subtle' | 'bold' | 'calm' | 'energy'
type ScheduleBlockId = 'day' | 'evening' | 'night'
type AutomationMode = 'sine' | 'triangle' | 'pulse'
type QuickDimensionId = 'motion' | 'energy' | 'detail' | 'palette'
type QuickMotionId = 'slow' | 'flow' | 'active' | 'surge'
type QuickEnergyId = 'soft' | 'balanced' | 'vivid' | 'max'
type QuickDetailId = 'clean' | 'balanced' | 'rich' | 'dense'
type QuickPaletteId = 'cool' | 'warm' | 'neon' | 'mono'

interface QuickOption<T extends string> {
  id: T
  labelKey: string
}

interface ScheduleBlockDefinition {
  id: ScheduleBlockId
  labelKey: 'schedule.day' | 'schedule.evening' | 'schedule.night'
  timeLabel: string
  startHour: number
  endHour: number
}

const EMPTY_ENGINE_METRICS: EngineMetrics = {
  frameCount: 0,
  avgFrameMs: 0,
  p95FrameMs: 0,
  lastFrameMs: 0,
  workerProcessMs: 0,
  captureMs: 0,
  outputMs: 0,
  droppedTicks: 0
}

// Human-readable parameter metadata — labels pulled from i18n in render
const PARAM_META: Record<string, { labelKey: string; min: number; max: number; step: number; unit?: string }> = {
  speed:       { labelKey: 'Speed',       min: 0,    max: 2,    step: 0.05, unit: '×' },
  spread:      { labelKey: 'Spread',      min: 0,    max: 3,    step: 0.1,  unit: '×' },
  width:       { labelKey: 'Width',       min: 0,    max: 1,    step: 0.05 },
  saturation:  { labelKey: 'Saturation',  min: 0,    max: 2,    step: 0.05, unit: '×' },
  contrast:    { labelKey: 'Contrast',    min: 0,    max: 2,    step: 0.05, unit: '×' },
  intensity:   { labelKey: 'Intensity',   min: 0,    max: 1,    step: 0.05 },
  density:     { labelKey: 'Density',     min: 0,    max: 1,    step: 0.05 },
  frequency:   { labelKey: 'Rings',       min: 1,    max: 10,   step: 0.5 },
  tail:        { labelKey: 'Tail',        min: 0.05, max: 0.95, step: 0.05 },
  hueShift:    { labelKey: 'Hue Shift',   min: -180, max: 180,  step: 5,    unit: '°' },
  sensitivity: { labelKey: 'Sensitivity', min: 0.2,  max: 3,    step: 0.1,  unit: '×' },
  angle:       { labelKey: 'param.angle', min: 0,    max: 360,  step: 5,    unit: '°' },
  baseBrightness: { labelKey: 'Base Light', min: 0,    max: 1,    step: 0.05 },
  pulseAmplitude: { labelKey: 'Pulse Depth', min: 0,   max: 1,    step: 0.05 },
  phaseOffset:    { labelKey: 'Phase',      min: 0,    max: 1,    step: 0.05 },
  curtainHeight:  { labelKey: 'Curtain',    min: 0.4,  max: 1.6,  step: 0.05, unit: '×' },
  ribbonFrequency:{ labelKey: 'Ribbons',    min: 0.5,  max: 2.5,  step: 0.05, unit: '×' },
  shimmerIntensity:{ labelKey: 'Shimmer',   min: 0,    max: 1,    step: 0.05 },
  baseHue:        { labelKey: 'Base Hue',   min: 0,    max: 360,  step: 5,    unit: '°' },
  colorSpread:    { labelKey: 'Color Spread', min: 20, max: 180,  step: 5,    unit: '°' },
  softEdge:       { labelKey: 'Soft Edge',  min: 0.25, max: 1.25, step: 0.05, unit: '×' },
  heat:           { labelKey: 'Heat',       min: 0.3,  max: 1.5,  step: 0.05, unit: '×' },
  sparks:         { labelKey: 'Sparks',     min: 0,    max: 1,    step: 0.05 },
  wind:           { labelKey: 'Wind',       min: -1,   max: 1,    step: 0.05 },
  baseHeight:     { labelKey: 'Base Height', min: 0.6, max: 1.5,  step: 0.05, unit: '×' },
  gridDensity:       { labelKey: 'param.gridDensity',       min: 0,   max: 1,   step: 0.05 },
  scanSpeed:         { labelKey: 'param.scanSpeed',         min: 0.1, max: 3,   step: 0.05, unit: '×' },
  particleIntensity: { labelKey: 'param.particleIntensity', min: 0,   max: 2,   step: 0.05, unit: '×' },
  glitchAmount:      { labelKey: 'param.glitchAmount',      min: 0,   max: 1,   step: 0.05 },
  flickerAmount:     { labelKey: 'param.flickerAmount',     min: 0,   max: 1,   step: 0.05 },
  hologramDepth:     { labelKey: 'param.hologramDepth',     min: 0,   max: 1,   step: 0.05 },
  scanWidth:         { labelKey: 'param.scanWidth',         min: 0,   max: 1,   step: 0.05 },
  // Static text params
  textX:       { labelKey: 'param.textX',    min: 0,   max: 1,   step: 0.05 },
  textY:       { labelKey: 'param.textY',    min: 0,   max: 1,   step: 0.05 },
  textScale:   { labelKey: 'param.textScale', min: 1,  max: 4,   step: 1 },
  textWeight:  { labelKey: 'param.textWeight', min: 100, max: 900, step: 100 },
}

const DEFAULT_FAVORITE_EFFECTS: EffectKind[] = ['rainbow', 'fire', 'audio-equalizer', 'hologram', 'dna-helix', 'black-hole', 'tokamak-plasma']
const RANDOMIZER_MODES: RandomizerMode[] = ['subtle', 'bold', 'calm', 'energy']
const AUTOMATION_MODES: AutomationMode[] = ['sine', 'triangle', 'pulse']
const AUTOMATION_TARGET_PARAMS = ['speed', 'intensity', 'hueShift', 'angle'] as const

// ── Ambient Intelligence Presets ────────────────────────────────────────────

interface AmbientPreset {
  id: string
  icon: string
  labelKey: string
  effectKind: EffectKind
  parameters: Record<string, number | string | boolean>
  opacity: number
  blendMode: BlendMode
}

const AMBIENT_PRESETS: AmbientPreset[] = [
  { id: 'focus',  icon: '🧠', labelKey: 'ambient.focus',  effectKind: 'breathing',      parameters: { speed: 0.18, color: '#6ab4ff' },              opacity: 0.70, blendMode: 'normal' },
  { id: 'gaming', icon: '🎮', labelKey: 'ambient.gaming', effectKind: 'rainbow',        parameters: { speed: 0.80, spread: 1.5, hueShift: 0, angle: 0 }, opacity: 0.90, blendMode: 'screen' },
  { id: 'party',  icon: '🎉', labelKey: 'ambient.party',  effectKind: 'spectrum',       parameters: { speed: 1.20, intensity: 1.0 },                opacity: 0.95, blendMode: 'add' },
  { id: 'cinema', icon: '🎬', labelKey: 'ambient.cinema', effectKind: 'screen-ambient', parameters: { saturation: 0.9, contrast: 1.1 },              opacity: 0.85, blendMode: 'normal' },
  { id: 'relax',  icon: '🌿', labelKey: 'ambient.relax',  effectKind: 'aurora',         parameters: { speed: 0.20, hueShift: 160, intensity: 0.6 }, opacity: 0.75, blendMode: 'screen' },
  { id: 'sleep',  icon: '🌙', labelKey: 'ambient.sleep',  effectKind: 'breathing',      parameters: { speed: 0.10, color: '#ff5a28' },              opacity: 0.38, blendMode: 'normal' },
]

const QUICK_EFFECT_KINDS: EffectKind[] = ['screen-ambient', 'aurora', 'fire', 'hologram', 'dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'orion-nebula', 'hurricane-eye', 'icosahedral-virus', 'quantum-collapse', 'magnetosphere-aurora', 'tokamak-plasma']

const QUICK_MOTION_OPTIONS: QuickOption<QuickMotionId>[] = [
  { id: 'slow', labelKey: 'quick.motion.slow' },
  { id: 'flow', labelKey: 'quick.motion.flow' },
  { id: 'active', labelKey: 'quick.motion.active' },
  { id: 'surge', labelKey: 'quick.motion.surge' },
]

const QUICK_ENERGY_OPTIONS: QuickOption<QuickEnergyId>[] = [
  { id: 'soft', labelKey: 'quick.energy.soft' },
  { id: 'balanced', labelKey: 'quick.energy.balanced' },
  { id: 'vivid', labelKey: 'quick.energy.vivid' },
  { id: 'max', labelKey: 'quick.energy.max' },
]

const QUICK_DETAIL_OPTIONS: QuickOption<QuickDetailId>[] = [
  { id: 'clean', labelKey: 'quick.detail.clean' },
  { id: 'balanced', labelKey: 'quick.detail.balanced' },
  { id: 'rich', labelKey: 'quick.detail.rich' },
  { id: 'dense', labelKey: 'quick.detail.dense' },
]

const QUICK_PALETTE_OPTIONS: QuickOption<QuickPaletteId>[] = [
  { id: 'cool', labelKey: 'quick.palette.cool' },
  { id: 'warm', labelKey: 'quick.palette.warm' },
  { id: 'neon', labelKey: 'quick.palette.neon' },
  { id: 'mono', labelKey: 'quick.palette.mono' },
]

const SCHEDULE_BLOCKS: ScheduleBlockDefinition[] = [
  { id: 'day', labelKey: 'schedule.day', timeLabel: '08:00-18:00', startHour: 8, endHour: 18 },
  { id: 'evening', labelKey: 'schedule.evening', timeLabel: '18:00-22:00', startHour: 18, endHour: 22 },
  { id: 'night', labelKey: 'schedule.night', timeLabel: '22:00-08:00', startHour: 22, endHour: 8 }
]

const DEFAULT_SCHEDULE_EFFECTS: Record<ScheduleBlockId, EffectKind> = {
  day: 'screen-ambient',
  evening: 'aurora',
  night: 'breathing'
}

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

const COLOR_PALETTES: Record<RandomizerMode, string[]> = {
  subtle: [...THEME_COLOR_PALETTES.minimalWhite, ...THEME_COLOR_PALETTES.natureGlow],
  bold: [...THEME_COLOR_PALETTES.cyberpunk, ...THEME_COLOR_PALETTES.vaporwave, ...THEME_COLOR_PALETTES.neonGoth],
  calm: [...THEME_COLOR_PALETTES.auroraBorealis, ...THEME_COLOR_PALETTES.minimalWhite],
  energy: [...THEME_COLOR_PALETTES.sunsetHeat, ...THEME_COLOR_PALETTES.synthwave, ...THEME_COLOR_PALETTES.cyberpunk]
}

function parseStoredEffectKinds(raw: string | null): EffectKind[] {
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

function parseStoredParameterLocks(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((name): name is string => typeof name === 'string'))]
  } catch {
    return []
  }
}

function parseStoredSchedule(raw: string | null): Record<ScheduleBlockId, EffectKind> {
  if (!raw) return DEFAULT_SCHEDULE_EFFECTS
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ScheduleBlockId, unknown>>
    const validKinds = new Set(effectPresets.map((preset) => preset.kind))
    return Object.fromEntries(
      SCHEDULE_BLOCKS.map((block) => {
        const kind = parsed[block.id]
        return [block.id, typeof kind === 'string' && validKinds.has(kind as EffectKind) ? kind : DEFAULT_SCHEDULE_EFFECTS[block.id]]
      })
    ) as Record<ScheduleBlockId, EffectKind>
  } catch {
    return DEFAULT_SCHEDULE_EFFECTS
  }
}

function scheduleBlockForHour(hour: number): ScheduleBlockDefinition {
  return SCHEDULE_BLOCKS.find((block) => {
    if (block.startHour < block.endHour) return hour >= block.startHour && hour < block.endHour
    return hour >= block.startHour || hour < block.endHour
  }) ?? SCHEDULE_BLOCKS[0]
}

function parseStoredAutomationParams(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const allowed = new Set<string>(AUTOMATION_TARGET_PARAMS)
    return [...new Set(parsed.filter((name): name is string => typeof name === 'string' && allowed.has(name)))]
  } catch {
    return []
  }
}

function automationWave(now: number, mode: AutomationMode): number {
  if (mode === 'triangle') {
    const phase = (now * 0.18) % 1
    return phase < 0.5 ? phase * 2 : 2 - phase * 2
  }
  if (mode === 'pulse') {
    const phase = (Math.sin(now * 2.4) + 1) / 2
    return phase > 0.68 ? 1 : 0.15
  }
  return (Math.sin(now * 1.1) + 1) / 2
}

function automateNumberParameter(name: string, baseValue: number, mode: AutomationMode, now: number): number {
  const meta = PARAM_META[name]
  const min = meta?.min ?? 0
  const max = meta?.max ?? 2
  const step = meta?.step ?? 0.05
  const wave = automationWave(now, mode)

  if (name === 'hueShift' || name === 'angle') {
    return randomInRange(min + (max - min) * wave, min + (max - min) * wave, step)
  }

  const span = (max - min) * (mode === 'pulse' ? 0.4 : 0.28)
  const low = Math.max(min, baseValue - span)
  const high = Math.min(max, baseValue + span)
  return randomInRange(low + (high - low) * wave, low + (high - low) * wave, step)
}

function applyParameterAutomation(
  profile: Profile,
  layerId: string,
  enabled: boolean,
  automatedParams: readonly string[],
  mode: AutomationMode,
  now: number
): Profile {
  if (!enabled || automatedParams.length === 0) return profile
  const automatedSet = new Set(automatedParams)
  return {
    ...profile,
    scenes: profile.scenes.map((scene) => {
      if (scene.id !== profile.activeSceneId) return scene
      return {
        ...scene,
        layers: scene.layers.map((layer) => {
          if (layer.id !== layerId) return layer
          const parameters = Object.fromEntries(
            Object.entries(layer.parameters).map(([name, value]) => {
              if (!automatedSet.has(name) || typeof value !== 'number') return [name, value]
              return [name, automateNumberParameter(name, value, mode, now)]
            })
          )
          return { ...layer, parameters }
        })
      }
    })
  }
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function snapToStep(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

function randomInRange(min: number, max: number, step: number): number {
  const value = min + Math.random() * (max - min)
  return Math.max(min, Math.min(max, snapToStep(value, step)))
}

function randomizeNumberParameter(name: string, current: number, mode: RandomizerMode): number {
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

function randomizeLayerParameters(layer: EffectLayer, mode: RandomizerMode, lockedParameters: ReadonlySet<string>): EffectLayer['parameters'] {
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

function setNumberIfPresent(parameters: EffectLayer['parameters'], name: string, value: number): void {
  if (typeof parameters[name] === 'number') parameters[name] = value
}

function setColorIfPresent(parameters: EffectLayer['parameters'], name: string, value: string): void {
  if (typeof parameters[name] === 'string' && String(parameters[name]).startsWith('#')) parameters[name] = value
}

function applyQuickDimensionParameters(
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

function opacityForQuickEnergy(option: string): number {
  switch (option) {
    case 'soft': return 0.46
    case 'vivid': return 0.86
    case 'max': return 1.00
    default: return 0.68
  }
}

// performanceLabels is now computed inside the App component using t()

function activeLayer(profile: Profile) {
  const scene = profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
  return scene.layers.find((l) => l.enabled) ?? scene.layers[0]
}

function activeScene(profile: Profile) {
  return profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
}

function formatMs(value: number | undefined): string {
  return `${(value ?? 0).toFixed(1)} ms`
}

function updateLayer(profile: Profile, layerId: string, patch: Partial<EffectLayer>): Profile {
  const sceneId = (profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]).id
  return {
    ...profile,
    scenes: profile.scenes.map((s) =>
      s.id !== sceneId ? s : { ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
    )
  }
}

/**
 * Extract the sub-region of a virtual-canvas frame that corresponds to a given display's
 * physical position in the virtual desktop. Used in linked-display mode so each overlay
 * only shows its own portion of the full virtual canvas.
 */
function extractSubFrame(
  virtualFrame: RgbFrame,
  displayId: number,
  topology: DisplayTopology
): RgbFrame | null {
  const display = topology.displays.find((d) => d.id === displayId)
  if (!display) return null
  const vb = topology.virtualBounds
  if (vb.width === 0 || vb.height === 0) return null

  const offsetX = Math.round((display.bounds.x - vb.x) / vb.width * virtualFrame.columns)
  const offsetY = Math.round((display.bounds.y - vb.y) / vb.height * virtualFrame.rows)
  const dispCols = Math.round(display.bounds.width / vb.width * virtualFrame.columns)
  const dispRows = Math.round(display.bounds.height / vb.height * virtualFrame.rows)

  if (dispCols <= 0 || dispRows <= 0) return null

  const pixels = new Uint8ClampedArray(dispCols * dispRows * 3)
  for (let y = 0; y < dispRows; y++) {
    for (let x = 0; x < dispCols; x++) {
      const srcI = ((offsetY + y) * virtualFrame.columns + Math.min(virtualFrame.columns - 1, offsetX + x)) * 3
      const dstI = (y * dispCols + x) * 3
      pixels[dstI]     = virtualFrame.pixels[srcI]
      pixels[dstI + 1] = virtualFrame.pixels[srcI + 1]
      pixels[dstI + 2] = virtualFrame.pixels[srcI + 2]
    }
  }
  return { columns: dispCols, rows: dispRows, pixels, generatedAt: virtualFrame.generatedAt, showGap: virtualFrame.showGap, renderStyle: virtualFrame.renderStyle }
}

/**
 * Physical aspect ratio (width/height) of a display, used by video-wall content
 * fitting. Falls back to 1 (square) when the display is unknown or degenerate.
 */
function displayAspect(displayId: number, topology: DisplayTopology | null): number {
  const display = topology?.displays.find((d) => d.id === displayId)
  if (!display || display.bounds.height <= 0) return 1
  return display.bounds.width / display.bounds.height
}

/**
 * Distribute a freshly rendered virtual-canvas frame to the open overlay
 * windows. Selection order:
 *  1. `scene.videoWall` present → stitch each panel via {@link extractWallPanelFrame}
 *     and push to the panel's mapped physical display (R21). Overlays without a
 *     matching panel fall back to {@link extractSubFrame} (or are skipped).
 *  2. `scene.linkedDisplays` with >1 display → per-display equal-width sub-frame.
 *  3. otherwise → broadcast the full frame to every overlay.
 */
function distributeFrameToOverlays(
  frame: RgbFrame,
  scene: Scene | null,
  topology: DisplayTopology | null,
  overlayIds: number[]
): void {
  if (overlayIds.length === 0) return

  const wall = scene?.videoWall
  if (wall && wall.panels.length > 0) {
    for (const displayId of overlayIds) {
      const panel = wall.panels.find((p) => p.displayId === displayId)
      if (panel) {
        const panelFrame = extractWallPanelFrame(frame, panel, wall, {
          panelAspect: displayAspect(displayId, topology)
        })
        window.rgbbox.pushFrameToDisplay(displayId, panelFrame)
        continue
      }
      // No panel mapped to this overlay: degrade gracefully rather than blanking.
      const fallback = topology ? extractSubFrame(frame, displayId, topology) : null
      if (fallback) window.rgbbox.pushFrameToDisplay(displayId, fallback)
    }
    return
  }

  if (scene?.linkedDisplays && topology && topology.displays.length > 1) {
    // Linked-display mode: each overlay gets only its sub-region of the virtual canvas
    for (const displayId of overlayIds) {
      const subFrame = extractSubFrame(frame, displayId, topology)
      if (subFrame) window.rgbbox.pushFrameToDisplay(displayId, subFrame)
    }
    return
  }

  window.rgbbox.pushFrameToOverlays(frame)
}

let _layerCounter = 100

export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topology, setTopology] = useState<DisplayTopology | null>(null)
  /**
   * Latest frame from the worker, stored in a ref so updates never trigger a
   * React re-render.  PreviewGrid polls this ref in its own rAF loop.
   */
  const frameRef = useRef<RgbFrame | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ running: true, fps: 30, output: 'virtual-preview' })
  const [captureProvider, setCaptureProvider] = useState<CaptureProviderStatus | null>(null)
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics>(EMPTY_ENGINE_METRICS)
  // R46: objective per-process CPU% breakdown for the Diagnostics view (see
  // ipc.ts#getProcessCpuSamples) — lets CPU investigations point at a
  // specific process (main/renderer/gpu-process/utility) instead of relying
  // on a single aggregate Task Manager number.
  const [processCpuSamples, setProcessCpuSamples] = useState<ProcessCpuSample[]>([])
  const [version, setVersion] = useState('0.1.0')
  const [savedProfiles, setSavedProfiles] = useState<ProfileMeta[]>([])
  // Ref lets the auto-save effect read savedProfiles without listing it as a dep
  const savedProfilesRef = useRef<ProfileMeta[]>([])
  savedProfilesRef.current = savedProfiles
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileEditMode, setProfileEditMode] = useState<'duplicate' | 'rename' | null>(null)
  const [profileEditName, setProfileEditName] = useState('')
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)

  const refreshProfiles = useCallback(() => {
    window.rgbbox.listProfiles().then(setSavedProfiles)
  }, [])

  // Note: initial load is done inside the main Promise.all below to allow
  // ensuring the working profile is always registered as a named slot.

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return undefined
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileMenuOpen])

  // ── UI state persisted to localStorage ──────────────────────────────────
  const [selectedLayerId, setSelectedLayerId] = useState(() =>
    localStorage.getItem('rgbbox:selectedLayerId') ?? 'layer-rainbow'
  )
  const [currentView, setCurrentView] = useState<View>(() => {
    const v = localStorage.getItem('rgbbox:view') as View | null
    return v ?? 'workspace'
  })
  const [favoriteEffectKinds, setFavoriteEffectKinds] = useState<EffectKind[]>(() =>
    parseStoredEffectKinds(localStorage.getItem('rgbbox:favoriteEffects'))
  )
  const [allEffectsOpen, setAllEffectsOpen] = useState(() =>
    localStorage.getItem('rgbbox:allEffectsOpen') === '1'
  )
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(() =>
    localStorage.getItem('rgbbox:advancedControlsOpen') === '1'
  )
  const [randomizerMode, setRandomizerMode] = useState<RandomizerMode>(() => {
    const saved = localStorage.getItem('rgbbox:randomizerMode') as RandomizerMode | null
    return saved && RANDOMIZER_MODES.includes(saved) ? saved : 'bold'
  })
  const [randomizerLockedParams, setRandomizerLockedParams] = useState<string[]>(() =>
    parseStoredParameterLocks(localStorage.getItem('rgbbox:randomizerLockedParams'))
  )
  const [scheduleEnabled, setScheduleEnabled] = useState(() =>
    localStorage.getItem('rgbbox:scheduleEnabled') === '1'
  )
  const [scheduleEffects, setScheduleEffects] = useState<Record<ScheduleBlockId, EffectKind>>(() =>
    parseStoredSchedule(localStorage.getItem('rgbbox:scheduleEffects'))
  )
  const [scheduleNow, setScheduleNow] = useState(() => new Date())
  const [automationEnabled, setAutomationEnabled] = useState(() =>
    localStorage.getItem('rgbbox:automationEnabled') === '1'
  )
  const [automationMode, setAutomationMode] = useState<AutomationMode>(() => {
    const saved = localStorage.getItem('rgbbox:automationMode') as AutomationMode | null
    return saved && AUTOMATION_MODES.includes(saved) ? saved : 'sine'
  })
  const [automatedParams, setAutomatedParams] = useState<string[]>(() =>
    parseStoredAutomationParams(localStorage.getItem('rgbbox:automatedParams'))
  )
  const [audioEnabled, setAudioEnabled] = useState(() =>
    localStorage.getItem('rgbbox:audio') === '1'
  )
  const [audioDeviceId, setAudioDeviceId] = useState(() =>
    localStorage.getItem('rgbbox:audioDevice') ?? ''
  )
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([])
  const [overlayDisplayIds, setOverlayDisplayIds] = useState<number[]>([])
  const [overlayConfigs, setOverlayConfigs] = useState<Record<number, OverlayConfig>>(() => {
    try { return JSON.parse(localStorage.getItem('rgbbox:overlayConfigs') ?? '{}') }
    catch { return {} }
  })
  const [powerSaveBlock, setPowerSaveBlock] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)
  // R45: reactive counterpart of windowVisibleRef (declared below) — a plain
  // ref wouldn't cause `audioShouldAnalyze` to recompute when visibility
  // changes, since nothing else re-renders App at that moment. Minimize/
  // restore/hide/show are rare, low-frequency events, so the extra re-render
  // here is negligible.
  const [windowVisible, setWindowVisible] = useState(true)
  // R45: pause the (getUserMedia + AnalyserNode) audio pipeline's actual FFT
  // analysis/state-update work when nothing needs the data — mirrors the
  // R42/R43 "is anyone consuming a frame" gate used for the effect tick loop.
  // Audio-reactive effects (audio-beat/audio-equalizer) still need live data
  // while an overlay is projecting them, regardless of main-window visibility.
  const audioShouldAnalyze = overlayDisplayIds.length > 0 || (windowVisible && currentView === 'workspace')
  const audio = useAudioAnalyzer(audioEnabled, audioDeviceId, audioShouldAnalyze)

  // ── Engine Worker ─────────────────────────────────────────────────────────
  // Created once; the render loop sends work to it and receives frames via
  // postMessage/onmessage instead of going through IPC.
  const workerRef = useRef<Worker | null>(null)
  const overlayIdsRef = useRef<number[]>(overlayDisplayIds)
  overlayIdsRef.current = overlayDisplayIds
  const topologyRef = useRef<DisplayTopology | null>(topology)
  topologyRef.current = topology
  // R42: lets the tick loop below know the latest view/visibility without
  // being a useEffect dependency (adding currentView there would tear down
  // and recreate the worker on every tab switch).
  const currentViewRef = useRef<View>(currentView)
  currentViewRef.current = currentView
  // R43: main-window visibility per the IPC signal from main/index.ts (NOT
  // document.hidden — see ipc.ts#mainWindowVisibilityChanged for why that
  // stopped being reliable after R38). Defaults to true (visible) until the
  // first IPC message arrives.
  const windowVisibleRef = useRef<boolean>(true)
  useEffect(() => {
    return window.rgbbox.onMainWindowVisibilityChanged((visible) => {
      windowVisibleRef.current = visible
      setWindowVisible(visible)
    })
  }, [])
  // audioRef: always points to the latest AudioData without being a useEffect dependency.
  // If audio were in the dependency array, the engine effect would restart every rAF tick
  // (~16ms), resetting tickPending and clearing the setInterval before it ever fires — making
  // effect switching completely unreliable when audio is active.
  const audioRef = useRef(audio)
  audioRef.current = audio
  const metricsCollectorRef = useRef(new MetricsCollector())

  /** Ripple burst: set on canvas click, cleared after 2.5 s (matches burstDuration in effects.ts). */
  const rippleBurstRef = useRef<{ cx: number; cy: number; clickedAt: number } | null>(null)
  const rippleBurstTimerRef = useRef<number | null>(null)

  /**
   * Flat RGB bytes from the latest engine frame — shared with SplatViewer so its
   * rAF loop can drive LED PointLights without going through React state.
   * Mutated in-place on every worker response; never triggers a re-render.
   */
  const ledColorsRef = useRef<Uint8Array>(new Uint8Array(0))

  const { models: splatModels, loading: splatLoading, importFile: importSplatFile, downloadModel: downloadSplatModel } = useModelStore()
  const [selectedModelIndex, setSelectedModelIndex] = useState(0)
  const [ledMapperOpen, setLedMapperOpen] = useState(false)
  const selectedModel = splatModels[selectedModelIndex] ?? null
  const splatFileInputRef = useRef<HTMLInputElement | null>(null)

  const handleSplatImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const model = importSplatFile(file)
    // Auto-select the newly imported model
    const newIndex = splatModels.length  // will be appended at the end
    setSelectedModelIndex(newIndex)
    setLedMapperOpen(false)
    // Reset the input so the same file can be re-imported if needed
    e.target.value = ''
    void model
  }, [importSplatFile, splatModels.length])

  const handleRippleClick = useCallback((nx: number, ny: number) => {
    if (rippleBurstTimerRef.current !== null) window.clearTimeout(rippleBurstTimerRef.current)
    rippleBurstRef.current = { cx: nx, cy: ny, clickedAt: performance.now() }
    rippleBurstTimerRef.current = window.setTimeout(() => {
      rippleBurstRef.current = null
      rippleBurstTimerRef.current = null
    }, 2600)
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/previewEngineWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    Promise.all([
      window.rgbbox.getDefaultProfile(),
      window.rgbbox.getDisplayTopology(),
      window.rgbbox.getEngineStatus(),
      window.rgbbox.getAppVersion(),
      window.rgbbox.getOverlayDisplayIds(),
      window.rgbbox.getPowerSaveBlock(),
      window.rgbbox.listProfiles(),
      window.rgbbox.getCaptureProviderStatus(),
      window.rgbbox.getAutoLaunch(),
    ]).then(async ([loadedProfile, loadedTopology, loadedStatus, loadedVersion, loadedOverlays, loadedPSB, loadedProfiles, loadedCaptureProvider, loadedAutoLaunch]) => {
      // Back-fill fields added after the profile was first persisted
      const migratedProfile = {
        ...loadedProfile,
        sampling: {
          ...loadedProfile.sampling,
          saturationBoost: loadedProfile.sampling.saturationBoost ?? 1.5
        }
      }
      setProfile(migratedProfile)
      setTopology(loadedTopology)
      setStatus(loadedStatus)
      setVersion(loadedVersion)
      setOverlayDisplayIds(loadedOverlays)
      setPowerSaveBlock(loadedPSB)
      setCaptureProvider(loadedCaptureProvider)
      setAutoLaunch(loadedAutoLaunch)
      // Ensure the current working profile is always present in the named slots.
      // On first launch (profiles/ directory empty) or after a reset, this seeds
      // the list so the dropdown is never empty.
      if (!loadedProfiles.find((p) => p.id === migratedProfile.id)) {
        const meta = await window.rgbbox.saveProfileAs(migratedProfile)
        setSavedProfiles([...loadedProfiles, meta])
      } else {
        setSavedProfiles(loadedProfiles)
      }
    })
  }, [])

  const handleToggleOverlay = useCallback(async (displayId: number) => {
    if (overlayDisplayIds.includes(displayId)) {
      await window.rgbbox.closeOverlay(displayId)
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    } else {
      const config = overlayConfigs[displayId]
      await window.rgbbox.openOverlay(displayId, config)
      setOverlayDisplayIds((prev) => [...prev, displayId])
    }
  }, [overlayDisplayIds, overlayConfigs])

  const handleOverlayConfigChange = useCallback((displayId: number, config: OverlayConfig) => {
    setOverlayConfigs((prev) => ({ ...prev, [displayId]: config }))
    if (overlayDisplayIds.includes(displayId)) {
      void window.rgbbox.setOverlayConfig(displayId, config)
    }
  }, [overlayDisplayIds])

  // ── Persist UI state to localStorage ────────────────────────────────────
  useEffect(() => { localStorage.setItem('rgbbox:view', currentView) }, [currentView])
  useEffect(() => { localStorage.setItem('rgbbox:favoriteEffects', JSON.stringify(favoriteEffectKinds)) }, [favoriteEffectKinds])
  useEffect(() => { localStorage.setItem('rgbbox:allEffectsOpen', allEffectsOpen ? '1' : '0') }, [allEffectsOpen])
  useEffect(() => { localStorage.setItem('rgbbox:advancedControlsOpen', advancedControlsOpen ? '1' : '0') }, [advancedControlsOpen])
  useEffect(() => { localStorage.setItem('rgbbox:randomizerMode', randomizerMode) }, [randomizerMode])
  useEffect(() => { localStorage.setItem('rgbbox:randomizerLockedParams', JSON.stringify(randomizerLockedParams)) }, [randomizerLockedParams])
  useEffect(() => { localStorage.setItem('rgbbox:scheduleEnabled', scheduleEnabled ? '1' : '0') }, [scheduleEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:scheduleEffects', JSON.stringify(scheduleEffects)) }, [scheduleEffects])
  useEffect(() => { localStorage.setItem('rgbbox:automationEnabled', automationEnabled ? '1' : '0') }, [automationEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:automationMode', automationMode) }, [automationMode])
  useEffect(() => { localStorage.setItem('rgbbox:automatedParams', JSON.stringify(automatedParams)) }, [automatedParams])
  useEffect(() => { localStorage.setItem('rgbbox:audio', audioEnabled ? '1' : '0') }, [audioEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:audioDevice', audioDeviceId) }, [audioDeviceId])
  useEffect(() => { localStorage.setItem('rgbbox:selectedLayerId', selectedLayerId) }, [selectedLayerId])
  useEffect(() => { localStorage.setItem('rgbbox:overlayConfigs', JSON.stringify(overlayConfigs)) }, [overlayConfigs])

  // R45: engineMetrics/captureProvider are only ever displayed in the
  // Diagnostics view (see the `diag.*` rows below), but this interval used to
  // run unconditionally forever — a 1 Hz IPC round-trip (getCaptureProviderStatus)
  // plus a React state update (re-rendering the whole App tree) even while
  // minimized/hidden with nothing being rendered. Gated on the Diagnostics tab
  // actually being the visible one.
  useEffect(() => {
    if (currentView !== 'diagnostics') return undefined
    const timer = window.setInterval(() => {
      setEngineMetrics(metricsCollectorRef.current.snapshot())
      void window.rgbbox.getCaptureProviderStatus().then(setCaptureProvider)
      void window.rgbbox.getProcessCpuSamples().then(setProcessCpuSamples)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [currentView])

  // Enumerate audio input and output devices (labels populated after first getUserMedia permission)
  useEffect(() => {
    if (!audioEnabled) return undefined
    const enumerate = async (): Promise<void> => {
      const all = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(all.filter((d) => d.kind === 'audioinput'))
      setSpeakerDevices(
        all.filter(
          (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'
        )
      )
    }
    // Enumerate immediately, then again after 800ms (labels appear after permission)
    enumerate()
    const timer = window.setTimeout(enumerate, 800)
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => {
      window.clearTimeout(timer)
      navigator.mediaDevices.removeEventListener('devicechange', enumerate)
    }
  }, [audioEnabled])

  useEffect(() => {
    if (!profile) return undefined
    const timer = window.setTimeout(() => {
      // Always persist working state to the quick-save slot
      window.rgbbox.saveProfile(profile)
      // Also update the named profile slot so that switching away and back
      // preserves the latest changes.
      if (savedProfilesRef.current.find((p) => p.id === profile.id)) {
        window.rgbbox.saveProfileAs(profile).then((meta) => {
          setSavedProfiles((prev) => prev.map((p) => p.id === meta.id ? meta : p))
        })
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [profile])

  // ── Display hotplug — refresh topology when monitors are added/removed ──
  useEffect(() => {
    return window.rgbbox.onDisplayTopologyChanged(async () => {
      const newTopology = await window.rgbbox.getDisplayTopology()
      setTopology(newTopology)
    })
  }, [])

  useEffect(() => {
    if (!profile || !status.running || !workerRef.current) return undefined

    // 3D effects are rendered directly by Preview3D on the GPU — bypass the worker.
    const activeKind = activeLayer(profile).kind
    if (is3DEffect(activeKind)) return undefined

    let cancelled    = false
    const intervalMs = Math.max(16, Math.floor(1000 / profile.sampling.fps))
    const worker     = workerRef.current
    const scene      = profile.scenes.find((s) => s.id === profile.activeSceneId) ?? profile.scenes[0]

    // ── Worker tick (async: may do screen capture) ────────────────────────
    // tickPending is cleared by onWorkerMessage (when the worker RESPONDS),
    // not by tick().finally() (which fires right after postMessage returns).
    // This ensures at most one message is in the worker's queue at any time.
    // Without this, slow workers (large grids) accumulate a deep backlog;
    // switching effects sends new profile to the back of that queue.
    let tickPending  = false
    let droppedTicksSinceLastPost = 0
    let lastPostAt = 0
    // R43: tracks whether the LAST tick had at least one enabled layer, so
    // that disabling every layer still gets exactly one more tick through
    // (to compute/display the resulting blank frame) before ticks pause —
    // otherwise the preview would be left showing a stale, still-lit frame
    // forever instead of going blank.
    let hadEnabledLayersLastTick = true

    const tick = async (): Promise<boolean> => {
      if (cancelled) return false

      const audioInput = audioRef.current.active
        ? { bass: audioRef.current.bass, mid: audioRef.current.mid, high: audioRef.current.high, beat: audioRef.current.beat, freqBands: audioRef.current.freqBands }
        : undefined

      // Screen capture is only needed for screen-ambient effect and when no overlays are active
      const needsCapture =
        overlayIdsRef.current.length === 0 &&
        scene.layers.some((l) => l.enabled && l.kind === 'screen-ambient')

      let screenSample: RgbFrame | undefined
      let captureMs = 0
      if (needsCapture) {
        const captureStartedAt = performance.now()
        const captured = await window.rgbbox.captureScreenSample({
          columns: profile.sampling.columns,
          rows: profile.sampling.rows,
          hasOverlays: false,
          linkedDisplays: Boolean(scene.linkedDisplays),
        })
        captureMs = performance.now() - captureStartedAt
        screenSample = captured ?? undefined
      }

      if (cancelled) return false

      // Send to worker; transfer screen sample buffer (zero-copy) if present
      const burst = rippleBurstRef.current
      const rippleBurst = burst
        ? { cx: burst.cx, cy: burst.cy, burstAge: (performance.now() - burst.clickedAt) / 1000 }
        : undefined
      const droppedTicks = droppedTicksSinceLastPost
      droppedTicksSinceLastPost = 0
      lastPostAt = performance.now()
      const profileForWorker = applyParameterAutomation(
        profile,
        selectedLayerId,
        automationEnabled,
        automatedParams,
        automationMode,
        performance.now() / 1000
      )
      const msg: WorkerInput = { profile: profileForWorker, audioInput, screenSample, rippleBurst, captureMs, droppedTicks, postedAt: lastPostAt }
      if (screenSample) {
        worker.postMessage(msg, [screenSample.pixels.buffer])
      } else {
        worker.postMessage(msg)
      }
      // Return true = message was posted; tickPending cleared by onWorkerMessage response
      return true
    }

    // ── Worker response handler ──────────────────────────────────────────
    // Store the frame in a ref — no React setState, no reconciliation.
    const onWorkerMessage = (e: MessageEvent<WorkerOutput>): void => {
      tickPending = false
      if (cancelled) return
      const { frame, metrics } = e.data
      frame.showGap = profile.sampling.showGap ?? false
      frame.renderStyle = resolveFrameRenderStyle(profile.sampling.renderStyle, activeLayer(profile)?.kind)
      frameRef.current = frame
      // Copy pixel data for the 3D splat viewer LED lights
      if (ledColorsRef.current.length !== frame.pixels.length) {
        ledColorsRef.current = new Uint8Array(frame.pixels.length)
      }
      ledColorsRef.current.set(frame.pixels)
      // Push to any open overlay windows (fire-and-forget, not awaited)
      distributeFrameToOverlays(frame, scene, topologyRef.current, overlayIdsRef.current)
      metrics.outputMs = 0
      metrics.roundTripMs = lastPostAt > 0 ? performance.now() - lastPostAt : metrics.workerProcessMs
      metricsCollectorRef.current.add(metrics)
    }

    // ── setInterval tick loop ─────────────────────────────────────────────
    // Drives worker ticks at the configured FPS using setInterval so that
    // ticks continue even when the main window is minimised.
    // (requestAnimationFrame stops when the window is minimised; setInterval
    // is not paused as long as backgroundThrottling is false in webPreferences.)
    let timerId = 0
    const onTick = (): void => {
      if (cancelled) return
      // R42/R43: nobody is consuming a frame right now — skip the
      // (potentially expensive, e.g. fire/aurora/lightning on a large grid)
      // worker tick entirely instead of computing frames nobody sees. Frames
      // are needed when either (a) an overlay window is projecting onto a
      // real display (regardless of main-window visibility — this is the one
      // case that must keep running even minimised, per R38), or (b) the
      // in-app workspace preview is actually the visible tab AND the window
      // itself is visible (not minimised/hidden to tray — windowVisibleRef is
      // fed by an explicit main-process IPC signal, see R43; document.hidden
      // stopped being a reliable signal for "minimised" once R38 disabled
      // Chromium's occluded-window backgrounding tracking). Re-evaluated on
      // every tick (cheap ref/property reads only), so it reacts immediately
      // to tab switches, minimise/restore and overlay open/close without
      // tearing down/recreating the worker.
      const overlayActive = overlayIdsRef.current.length > 0
      const previewVisible = windowVisibleRef.current && currentViewRef.current === 'workspace'
      if (!overlayActive && !previewVisible) return

      // R43: also pause once every layer is disabled — there's nothing to
      // render — but let exactly one more tick through first so the preview
      // actually goes blank instead of freezing on the last lit frame.
      const hasEnabledLayers = scene.layers.some((l) => l.enabled)
      if (!hasEnabledLayers && !hadEnabledLayersLastTick) return
      hadEnabledLayersLastTick = hasEnabledLayers

      if (!tickPending) {
        tickPending = true
        // tick() may cancel mid-way (cancelled flag); if it does WITHOUT posting
        // a message the worker will never reply, so we must unblock the gate here.
        void tick().catch(() => { tickPending = false }).then((posted) => {
          if (posted === false) tickPending = false
        })
      } else {
        droppedTicksSinceLastPost += 1
      }
    }

    worker.addEventListener('message', onWorkerMessage)
    worker.addEventListener('error', (err) => { console.warn('[RGBBox] Worker error', err.message, err.filename, err.lineno) })
    timerId = window.setInterval(onTick, intervalMs)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
      worker.removeEventListener('message', onWorkerMessage)
    }
  }, [profile, status.running, selectedLayerId, automationEnabled, automationMode, automatedParams])

  const scene = useMemo(() => (profile ? activeScene(profile) : null), [profile])

  /** Frame handler for GPU 3D effects — Preview3D calls this instead of the worker. */
  const handleFrame3D = useCallback((frame: RgbFrame) => {
    const startedAt = performance.now()
    frame.showGap = profile?.sampling.showGap ?? false
    frame.renderStyle = resolveFrameRenderStyle(profile?.sampling.renderStyle, profile ? activeLayer(profile)?.kind : null)
    frameRef.current = frame
    // Copy pixel data for the 3D splat viewer LED lights
    if (ledColorsRef.current.length !== frame.pixels.length) {
      ledColorsRef.current = new Uint8Array(frame.pixels.length)
    }
    ledColorsRef.current.set(frame.pixels)
    distributeFrameToOverlays(frame, scene, topologyRef.current, overlayIdsRef.current)
    const outputMs = 0
    metricsCollectorRef.current.add({
      timestamp: Date.now(),
      workerProcessMs: 0,
      textMaskMs: 0,
      renderMs: performance.now() - startedAt,
      captureMs: 0,
      roundTripMs: performance.now() - startedAt,
      outputMs,
      droppedTicks: 0
    })
  }, [profile, scene])

  const selectedLayer = useMemo(() => {
    if (!profile || !scene) return null
    return scene.layers.find((l) => l.id === selectedLayerId) ?? activeLayer(profile)
  }, [profile, scene, selectedLayerId])

  // R35 follow-up: the GPU-direct preview path only produces a *correct*
  // picture when exactly one layer is enabled — it renders that single
  // effect in isolation, so if other layers are also enabled and blended in
  // (the default scene ships 3: aurora+fire+neon-pulse) a solo GPU render
  // would silently omit them and mislead the user. Gate on `selectedLayer`
  // (what the Effects picker actually edits — the earlier `activeLayer()`
  // check looked at the scene's first *enabled* layer instead, which is a
  // different layer whenever the user edits anything but that one, and was
  // why switching to 'rainbow' appeared to do nothing).
  const gpuDirectLayer = useMemo(() => {
    if (!scene || !selectedLayer) return null
    const enabledLayers = scene.layers.filter((l) => l.enabled)
    const isSoloEnabled = enabledLayers.length === 1 && enabledLayers[0].id === selectedLayer.id
    return isSoloEnabled && isGpuDirectEffect(selectedLayer.kind) ? selectedLayer : null
  }, [scene, selectedLayer])

  const favoriteEffectPresets = useMemo(() => {
    return favoriteEffectKinds
      .map((kind) => effectPresets.find((preset) => preset.kind === kind))
      .filter((preset): preset is (typeof effectPresets)[number] => Boolean(preset))
  }, [favoriteEffectKinds])

  const activeScheduleBlock = useMemo(() => scheduleBlockForHour(scheduleNow.getHours()), [scheduleNow])
  const scheduledEffectKind = scheduleEffects[activeScheduleBlock.id]
  const automatableParams = useMemo(() => {
    if (!selectedLayer) return []
    return AUTOMATION_TARGET_PARAMS.filter((name) => typeof selectedLayer.parameters[name] === 'number')
  }, [selectedLayer])

  const updateSelectedLayer = useCallback((patch: Partial<EffectLayer>) => {
    setProfile((cur) => cur ? updateLayer(cur, selectedLayerId, patch) : cur)
  }, [selectedLayerId])

  const setSamplingValue = useCallback((key: keyof Profile['sampling'], value: number | boolean | string) => {
    setProfile((cur) => cur ? { ...cur, sampling: { ...cur.sampling, [key]: value } } : cur)
  }, [])

  // ── Grid density mode ─────────────────────────────────────────────────
  // Single "long-edge LED count" drives both columns and rows from display aspect ratio.
  // Advanced mode falls back to the old independent sliders.
  const [gridAdvanced, setGridAdvanced] = useState(() => localStorage.getItem('rgbbox:gridAdvanced') === '1')
  useEffect(() => { localStorage.setItem('rgbbox:gridAdvanced', gridAdvanced ? '1' : '0') }, [gridAdvanced])

  // R40: the sampling panel used to stack every control (resolution, aspect,
  // smoothing, saturation, brightness, fps, toggles, render style) in one
  // long full-width block below the preview/map row, pushing the display
  // topology map far down the page. Split into collapsible tabs so only one
  // small group of controls is visible at a time (persisted like the other
  // panel-shape preferences above).
  const [samplingCollapsed, setSamplingCollapsed] = useState(() => localStorage.getItem('rgbbox:samplingCollapsed') === '1')
  useEffect(() => { localStorage.setItem('rgbbox:samplingCollapsed', samplingCollapsed ? '1' : '0') }, [samplingCollapsed])
  const [samplingTab, setSamplingTab] = useState<'resolution' | 'appearance' | 'performance'>(
    () => (localStorage.getItem('rgbbox:samplingTab') as 'resolution' | 'appearance' | 'performance') || 'resolution'
  )
  useEffect(() => { localStorage.setItem('rgbbox:samplingTab', samplingTab) }, [samplingTab])

  // Display aspect ratio: virtual-desktop ratio in linked mode, primary display otherwise
  const displayAspectRatioRef = useRef<number>(16 / 9)
  useEffect(() => {
    if (!topology) return
    const s = profile ? activeScene(profile) : null
    if (s?.linkedDisplays) {
      const vb = topology.virtualBounds
      displayAspectRatioRef.current = vb.width / Math.max(1, vb.height)
    } else {
      const primary = topology.displays.find((d) => d.primary) ?? topology.displays[0]
      if (primary) displayAspectRatioRef.current = primary.bounds.width / Math.max(1, primary.bounds.height)
    }
  })

  /** Snap columns/rows to display aspect ratio while keeping the long-edge count. */
  const matchDisplayRatio = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur
      const ar = displayAspectRatioRef.current
      const longEdge = Math.max(cur.sampling.columns, cur.sampling.rows)
      const cols = ar >= 1 ? longEdge : Math.max(1, Math.round(longEdge * ar))
      const rows = ar >= 1 ? Math.max(1, Math.round(longEdge / ar)) : longEdge
      return { ...cur, sampling: { ...cur.sampling, columns: cols, rows: rows } }
    })
  }, [])

  /** Drive both dimensions from a single long-edge count using display aspect ratio. */
  const setGridDensity = useCallback((longEdge: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const ar = displayAspectRatioRef.current
      const clamped = Math.max(8, Math.min(320, longEdge))
      const cols = ar >= 1 ? clamped : Math.max(1, Math.round(clamped * ar))
      const rows = ar >= 1 ? Math.max(1, Math.round(clamped / ar)) : clamped
      return { ...cur, sampling: { ...cur.sampling, columns: cols, rows: rows } }
    })
  }, [])

  const [aspectLocked, setAspectLocked] = useState(() => localStorage.getItem('rgbbox:aspectLock') === '1')
  const aspectRatioRef = useRef<number>(16 / 9)

  const toggleAspectLock = useCallback(() => {
    setAspectLocked((locked) => {
      const next = !locked
      if (next) {
        // capture current ratio at the moment of locking
        setProfile((cur) => {
          if (cur) aspectRatioRef.current = cur.sampling.columns / cur.sampling.rows
          return cur
        })
      }
      localStorage.setItem('rgbbox:aspectLock', next ? '1' : '0')
      return next
    })
  }, [])

  const setColumns = useCallback((cols: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const newCols = Math.max(1, Math.min(960, cols))
      const newRows = aspectLocked ? Math.max(1, Math.min(540, Math.round(newCols / aspectRatioRef.current))) : cur.sampling.rows
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  const setRows = useCallback((rows: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const newRows = Math.max(1, Math.min(540, rows))
      const newCols = aspectLocked ? Math.max(1, Math.min(960, Math.round(newRows * aspectRatioRef.current))) : cur.sampling.columns
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  const selectEffect = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind)
    if (!preset) return
    updateSelectedLayer({ name: preset.label, kind: preset.kind, parameters: { ...preset.defaults } })
  }, [updateSelectedLayer, selectedLayerId])

  const applyAmbientPreset = useCallback((preset: AmbientPreset) => {
    const effectPreset = effectPresets.find((p) => p.kind === preset.effectKind)
    updateSelectedLayer({
      kind: preset.effectKind,
      name: effectPreset?.label ?? preset.effectKind,
      parameters: { ...preset.parameters, _quickProfile: preset.id },
      opacity: preset.opacity,
      blendMode: preset.blendMode,
    })
  }, [updateSelectedLayer])

  useEffect(() => {
    const intervalId = window.setInterval(() => setScheduleNow(new Date()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!scheduleEnabled || !selectedLayer) return
    if (selectedLayer.kind === scheduledEffectKind) return
    selectEffect(scheduledEffectKind)
  }, [scheduleEnabled, selectedLayer, scheduledEffectKind, selectEffect])

  const setScheduleEffect = useCallback((blockId: ScheduleBlockId, kind: EffectKind) => {
    setScheduleEffects((prev) => ({ ...prev, [blockId]: kind }))
  }, [])

  const toggleAutomatedParam = useCallback((name: string) => {
    setAutomatedParams((prev) => {
      if (prev.includes(name)) return prev.filter((entry) => entry !== name)
      return [...prev, name]
    })
  }, [])

  const toggleFavoriteEffect = useCallback((kind: EffectKind) => {
    setFavoriteEffectKinds((prev) => {
      if (prev.includes(kind)) return prev.filter((entry) => entry !== kind)
      return [...prev, kind].slice(-12)
    })
  }, [])

  const selectFavoriteByOffset = useCallback((offset: number) => {
    if (favoriteEffectKinds.length === 0) return
    const currentIndex = selectedLayer ? favoriteEffectKinds.indexOf(selectedLayer.kind) : -1
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (baseIndex + offset + favoriteEffectKinds.length) % favoriteEffectKinds.length
    selectEffect(favoriteEffectKinds[nextIndex])
  }, [favoriteEffectKinds, selectedLayer, selectEffect])

  const randomizeSelectedLayer = useCallback(() => {
    if (!selectedLayer) return
    updateSelectedLayer({ parameters: randomizeLayerParameters(selectedLayer, randomizerMode, new Set(randomizerLockedParams)) })
  }, [selectedLayer, randomizerMode, randomizerLockedParams, updateSelectedLayer])

  const toggleRandomizerParamLock = useCallback((name: string) => {
    setRandomizerLockedParams((prev) => {
      if (prev.includes(name)) return prev.filter((entry) => entry !== name)
      return [...prev, name]
    })
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!event.altKey) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        selectFavoriteByOffset(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        selectFavoriteByOffset(-1)
      } else if (/^[1-9]$/.test(event.key)) {
        const preset = favoriteEffectKinds[Number(event.key) - 1]
        if (preset) {
          event.preventDefault()
          selectEffect(preset)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [favoriteEffectKinds, selectEffect, selectFavoriteByOffset])

  const setSelectedLayerValue = useCallback(<K extends keyof EffectLayer>(key: K, value: EffectLayer[K]) => {
    updateSelectedLayer({ [key]: value } as Partial<EffectLayer>)
  }, [updateSelectedLayer])

  const setLayerParameter = useCallback((name: string, value: number | string | boolean) => {
    if (!selectedLayer) return
    updateSelectedLayer({ parameters: { ...selectedLayer.parameters, [name]: value } })
  }, [selectedLayer, updateSelectedLayer])

  const applyQuickDimension = useCallback((dimension: QuickDimensionId, option: string) => {
    if (!selectedLayer) return
    const patch: Partial<EffectLayer> = {
      parameters: applyQuickDimensionParameters(selectedLayer.parameters, dimension, option)
    }
    if (dimension === 'energy') patch.opacity = opacityForQuickEnergy(option)
    updateSelectedLayer(patch)
  }, [selectedLayer, updateSelectedLayer])

  const toggleLayerEnabled = useCallback((layerId: string) => {
    setProfile((cur) => cur ? updateLayer(cur, layerId, {
      enabled: !activeScene(cur).layers.find((l) => l.id === layerId)?.enabled
    }) : cur)
  }, [])

  const toggleLinkedDisplays = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) =>
          s.id !== sceneId ? s : { ...s, linkedDisplays: !s.linkedDisplays }
        )
      }
    })
  }, [])

  const updateVideoWall = useCallback((layout: VideoWallLayout | undefined) => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) =>
          s.id !== sceneId ? s : { ...s, videoWall: layout }
        )
      }
    })
  }, [])

  const addLayer = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind) ?? effectPresets[0]
    _layerCounter += 1
    const newLayer: EffectLayer = {
      id: `layer-${_layerCounter}`,
      name: preset.label,
      kind: preset.kind,
      enabled: true,
      opacity: 0.75,
      blendMode: 'screen',
      parameters: { ...preset.defaults }
    }
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: [...s.layers, newLayer] })
      }
    })
    setSelectedLayerId(newLayer.id)
  }, [])

  const exportLayerPack = useCallback(() => {
    if (!selectedLayer) return
    const pack = {
      rgbboxEffectPack: '1.0',
      layer: {
        name: selectedLayer.name,
        kind: selectedLayer.kind,
        enabled: selectedLayer.enabled,
        opacity: selectedLayer.opacity,
        blendMode: selectedLayer.blendMode,
        parameters: selectedLayer.parameters,
      },
    }
    const json = JSON.stringify(pack, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedLayer.name.replace(/\s+/g, '_')}.rgbbox.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedLayer])

  const importLayerPackRef = useRef<HTMLInputElement>(null)

  const handleImportLayerPack = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const pack = JSON.parse(ev.target?.result as string)
        if (!pack?.rgbboxEffectPack || !pack?.layer) throw new Error('Invalid pack')
        const src = pack.layer as Partial<EffectLayer>
        _layerCounter += 1
        const imported: EffectLayer = {
          id: `layer-${_layerCounter}`,
          name: typeof src.name === 'string' ? src.name : 'Imported',
          kind: (src.kind as EffectKind) ?? 'rainbow',
          enabled: true,
          opacity: typeof src.opacity === 'number' ? src.opacity : 0.75,
          blendMode: (src.blendMode as BlendMode) ?? 'screen',
          parameters: src.parameters && typeof src.parameters === 'object' ? src.parameters : {},
        }
        setProfile((cur) => {
          if (!cur) return cur
          const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
          return {
            ...cur,
            scenes: cur.scenes.map((s) =>
              s.id !== sceneId ? s : { ...s, layers: [...s.layers, imported] }
            ),
          }
        })
        setSelectedLayerId(imported.id)
      } catch {
        alert(t('pack.importError'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [t])

  const deleteLayer = useCallback((layerId: string) => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: s.layers.filter((l) => l.id !== layerId) })
      }
    })
  }, [])

  const toggleEngine = useCallback(() => {
    window.rgbbox.setEngineRunning(!status.running).then(setStatus)
  }, [status.running])

  // Listen for effect-switch requests coming from the overlay context menu
  useEffect(() => {
    return window.rgbbox.onOverlayEffectChanged((kind) => {
      if (kind !== null) selectEffect(kind as EffectKind)
    })
  }, [selectEffect])

  // Sync overlay state when user closes an overlay window directly
  useEffect(() => {
    return window.rgbbox.onOverlayClosed((displayId) => {
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    })
  }, [])

  // ── Profile menu actions ─────────────────────────────────────────────────
  const handleProfileDuplicate = useCallback(() => {
    if (!profile) return
    setProfileMenuOpen(false)
    setProfileEditName(`${profile.name} Copy`)
    setProfileEditMode('duplicate')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [profile])

  const handleProfileRename = useCallback(() => {
    if (!profile) return
    setProfileMenuOpen(false)
    setProfileEditName(profile.name)
    setProfileEditMode('rename')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [profile])

  const handleProfileEditConfirm = useCallback(async () => {
    const name = profileEditName.trim()
    if (!name || !profile) { setProfileEditMode(null); return }
    if (profileEditMode === 'duplicate') {
      const newId = `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      const newProfile: Profile = { ...profile, id: newId, name }
      await window.rgbbox.saveProfileAs(newProfile)
      setProfile(newProfile)
      refreshProfiles()
    } else if (profileEditMode === 'rename' && profile) {
      const renamed: Profile = { ...profile, name }
      if (savedProfiles.find((p) => p.id === profile.id)) {
        await window.rgbbox.saveProfileAs(renamed)
        refreshProfiles()
      }
      setProfile(renamed)
    }
    setProfileEditMode(null)
  }, [profileEditMode, profileEditName, profile, savedProfiles, refreshProfiles])

  const handleProfileDelete = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    if (!savedProfiles.find((p) => p.id === profile.id)) return
    await window.rgbbox.deleteProfile(profile.id)
    const remaining = savedProfiles.filter((p) => p.id !== profile.id)
    setSavedProfiles(remaining)
    if (remaining.length > 0) {
      const first = await window.rgbbox.loadProfileById(remaining[0].id)
      if (first) { setProfile(first); return }
    }
    setProfile({ ...defaultProfile })
  }, [profile, savedProfiles])

  const handleProfileImport = useCallback(async () => {
    setProfileMenuOpen(false)
    const loaded = await window.rgbbox.importProfileDialog()
    if (loaded) { setProfile(loaded); refreshProfiles() }
  }, [refreshProfiles])

  const handleProfileExport = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    await window.rgbbox.exportProfileDialog(profile)
  }, [profile])

  const performanceLabels: Record<Profile['performanceMode'], string> = {
    battery: t('perf.battery'),
    balanced: t('perf.balanced'),
    extreme: t('perf.extreme')
  }

  const audioErrorLabel = useMemo(() => {
    switch (audio.error) {
      case 'permission-denied':
        return t('audio.error.permissionDenied')
      case 'source-unavailable':
        return t('audio.error.sourceUnavailable')
      case 'capture-failed':
        return t('audio.error.captureFailed')
      default:
        return ''
    }
  }, [audio.error, t])

  if (!profile || !topology) {
    return (
      <>
        <div className="titlebar-drag" aria-hidden="true" />
        <main className="boot-screen">RGBBox</main>
      </>
    )
  }

  return (
    <>
      <div className="titlebar-drag" aria-hidden="true" />
      <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">RB</div>
          <div>
            <h1>RGBBox</h1>
            <p>v{version}</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main sections">
          <button className={`nav-item ${currentView === 'workspace' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('workspace')}>
            <Monitor size={18} />
            {t('nav.workspace')}
          </button>
          <button className={`nav-item ${currentView === 'effects' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('effects')}>
            <Sparkles size={18} />
            {t('nav.effects')}
          </button>
          <button className={`nav-item ${currentView === 'games' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('games')}>
            <Gamepad2 size={18} />
            {t('nav.games')}
          </button>
          <button className={`nav-item ${currentView === 'audio' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('audio')}>
            <Music size={18} />
            {t('nav.audio')}
          </button>
          <button className={`nav-item ${currentView === 'video' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('video')}>
            <Video size={18} />
            {t('nav.video')}
          </button>
          <button className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('diagnostics')}>
            <Gauge size={18} />
            {t('nav.diagnostics')}
          </button>
          <button className={`nav-item ${currentView === 'model3d' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('model3d')}>
            <Box size={18} />
            {t('model3d.eyebrow')}
          </button>
          <button className={`nav-item ${currentView === 'architecture' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('architecture')}>
            <Cpu size={18} />
            {t('nav.architecture')}
          </button>
        </nav>

        <div className="sidebar-audio">
          <button
            className={`audio-toggle ${audioEnabled ? 'active' : ''}`}
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            title={audioEnabled ? t('audio.on') : t('audio.off')}
          >
            {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            <span>{audioEnabled ? t('audio.on') : t('audio.off')}</span>
          </button>
          {audioEnabled && (
            <select
              className="audio-device-select"
              value={audioDeviceId}
              title={t('audio.deviceLabel')}
              onChange={(e) => setAudioDeviceId(e.target.value)}
            >
              <option value="">{t('audio.defaultDevice')}</option>
              {speakerDevices.map((d) => (
                <option key={d.deviceId} value={`__speaker__:${d.deviceId}`}>
                  {t('audio.speakerPrefix')}{d.label || d.deviceId.slice(0, 12)}
                </option>
              ))}
              <option value="__system_audio__">{t('audio.systemAudio')}</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId.slice(0, 12)}
                </option>
              ))}
            </select>
          )}
          {audioEnabled && audio.active && (
            <div className="audio-meter-row">
              <div className="audio-meter" style={{ '--level': audio.bass } as React.CSSProperties} title="Bass" />
              <div className="audio-meter" style={{ '--level': audio.mid } as React.CSSProperties} title="Mid" />
              <div className="audio-meter" style={{ '--level': audio.high } as React.CSSProperties} title="High" />
            </div>
          )}
          {audioEnabled && audio.error && (
            <div className="audio-error" title={audioErrorLabel}>{audioErrorLabel}</div>
          )}
        </div>

        <section className="status-panel" aria-label="Engine status">
          <div>
            <span>{t('engine.label')}</span>
            <strong>{status.running ? t('engine.running') : t('engine.paused')}</strong>
          </div>
          <button className="icon-button" type="button" onClick={toggleEngine} aria-label="Toggle engine">
            {status.running ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </section>
        <label className="status-panel" style={{ cursor: 'pointer' }}>
          <div>
            <span>{t('power.label')}</span>
            <strong>{powerSaveBlock ? t('power.on') : t('power.off')}</strong>
          </div>
          <input
            type="checkbox"
            checked={powerSaveBlock}
            onChange={(e) => {
              window.rgbbox.setPowerSaveBlock(e.target.checked).then(setPowerSaveBlock)
            }}
          />
        </label>
        <label className="status-panel" style={{ cursor: 'pointer' }}>
          <div>
            <span>{t('autoLaunch.label')}</span>
            <strong>{autoLaunch ? t('autoLaunch.on') : t('autoLaunch.off')}</strong>
          </div>
          <input
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => {
              window.rgbbox.setAutoLaunch(e.target.checked).then(setAutoLaunch)
            }}
          />
        </label>

        <div className="sidebar-footer">
          <button
            className="lang-toggle-btn"
            type="button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages size={15} />
            <span className="lang-toggle-label">{t('lang.toggle')}</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        {currentView === 'workspace' && (
          <div className="workspace-inner">

            {/* ── Left FX sidebar ──────────────────────────────────────── */}
            <aside className="fx-sidebar">

              {/* Profile bar */}
              <div className="fx-profile-bar">
                {profileEditMode ? (
                  <>
                    <input
                      ref={editInputRef}
                      className="profile-select profile-edit-input"
                      type="text"
                      value={profileEditName}
                      placeholder={t('profile.namePlaceholder')}
                      onChange={(e) => setProfileEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleProfileEditConfirm()
                        if (e.key === 'Escape') setProfileEditMode(null)
                      }}
                    />
                    <button className="icon-button small" type="button" onClick={handleProfileEditConfirm} title="OK">✓</button>
                    <button className="icon-button small" type="button" onClick={() => setProfileEditMode(null)} title="Cancel">✕</button>
                  </>
                ) : (
                  <>
                    <select
                      className="profile-select"
                      value={profile.id}
                      onChange={async (e) => {
                        const targetId = e.target.value
                        if (!targetId) return
                        const loaded = await window.rgbbox.loadProfileById(targetId)
                        if (loaded) {
                          // Reset selected layer so it points to an actual layer in the
                          // new profile — without this, updateLayer silently no-ops.
                          const newScene = loaded.scenes.find((s) => s.id === loaded.activeSceneId) ?? loaded.scenes[0]
                          const firstLayer = newScene?.layers[0]
                          if (firstLayer) setSelectedLayerId(firstLayer.id)
                          setProfile(loaded)
                        }
                      }}
                    >
                      {!savedProfiles.find((p) => p.id === profile.id) && (
                        <option value={profile.id}>{profile.name}</option>
                      )}
                      {savedProfiles.map((meta) => (
                        <option key={meta.id} value={meta.id}>{meta.name}</option>
                      ))}
                    </select>
                    <div className="profile-menu-anchor" ref={profileMenuRef}>
                      <button
                        className="icon-button small"
                        type="button"
                        onClick={() => setProfileMenuOpen((v) => !v)}
                        title={t('profile.label')}
                      >
                        <MoreVertical size={13} />
                      </button>
                      {profileMenuOpen && (
                        <div className="profile-menu">
                          <button className="profile-menu-item" type="button" onClick={handleProfileDuplicate}>
                            <FilePlus size={12} /> {t('profile.duplicate')}
                          </button>
                          <button className="profile-menu-item" type="button" onClick={handleProfileRename}>
                            <Pencil size={12} /> {t('profile.rename')}
                          </button>
                          {savedProfiles.find((p) => p.id === profile.id) && (
                            <button className="profile-menu-item danger" type="button" onClick={handleProfileDelete}>
                              <Trash2 size={12} /> {t('profile.delete')}
                            </button>
                          )}
                          <div className="profile-menu-divider" />
                          <button className="profile-menu-item" type="button" onClick={handleProfileImport}>
                            <Upload size={12} /> {t('profile.import')}
                          </button>
                          <button className="profile-menu-item" type="button" onClick={handleProfileExport}>
                            <Download size={12} /> {t('profile.export')}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="fx-sidebar-header">
                <span className="fx-section-title">{t('fx.layers')}</span>
                <div className="fx-header-actions">
                  <input
                    accept=".json"
                    aria-label={t('pack.import')}
                    className="sr-only"
                    ref={importLayerPackRef}
                    type="file"
                    onChange={handleImportLayerPack}
                  />
                  <button
                    className="icon-button small"
                    disabled={!selectedLayer}
                    title={t('pack.export')}
                    type="button"
                    onClick={exportLayerPack}
                  >
                    <Upload size={13} />
                  </button>
                  <button
                    className="icon-button small"
                    title={t('pack.import')}
                    type="button"
                    onClick={() => importLayerPackRef.current?.click()}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    className="icon-button small"
                    type="button"
                    onClick={() => addLayer('rainbow')}
                    title={t('fx.addLayer')}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              <div className="layer-stack" aria-label="Effect layer stack">
                {scene?.layers.map((layer) => (
                  <div
                    className={`layer-row ${selectedLayer?.id === layer.id ? 'selected' : ''}`}
                    key={layer.id}
                  >
                    <input
                      className="layer-checkbox"
                      type="checkbox"
                      checked={layer.enabled}
                      onChange={() => toggleLayerEnabled(layer.id)}
                      title={layer.enabled ? t('layer.enable') : t('layer.disable')}
                      aria-label="Toggle layer"
                    />
                    <button
                      className="layer-name-btn"
                      type="button"
                      onClick={() => setSelectedLayerId(layer.id)}
                    >
                      <span>{layer.name}</span>
                      <strong>{Math.round(layer.opacity * 100)}%</strong>
                    </button>
                    {scene.layers.length > 1 && (
                      <button
                        className="layer-delete-btn"
                        type="button"
                        title={t('layer.delete')}
                        onClick={() => deleteLayer(layer.id)}
                        aria-label="Delete layer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="fx-divider">
                <span>{t('fx.effects')} — {selectedLayer?.name ?? t('fx.noLayer')}</span>
              </div>

              {favoriteEffectPresets.length > 0 && (
                <div className="favorite-effect-strip" aria-label={t('effects.favorites')}>
                  {favoriteEffectPresets.map((preset, index) => (
                    <button
                      className={`favorite-effect-chip ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                      key={preset.kind}
                      type="button"
                      onClick={() => selectEffect(preset.kind)}
                      title={`Alt+${index + 1} · ${preset.label}`}
                    >
                      <Star size={11} fill="currentColor" />
                      <span>{t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedLayer && (
                <div className="quick-customize-panel">
                  <div className="quick-panel-header">
                    <span className="ambient-label">{t('quick.title')}</span>
                    <button className="icon-button small" type="button" onClick={randomizeSelectedLayer} title={t('effects.randomize')}>
                      <Shuffle size={13} />
                    </button>
                  </div>
                  <div className="quick-profile-row" aria-label={t('quick.profile')}>
                    {AMBIENT_PRESETS.map((ap) => (
                      <button
                        key={ap.id}
                        className={`quick-profile-btn ${String(selectedLayer.parameters._quickProfile ?? '') === ap.id ? 'active' : ''}`}
                        type="button"
                        title={t(ap.labelKey as Parameters<typeof t>[0])}
                        onClick={() => applyAmbientPreset(ap)}
                      >
                        <span>{t(ap.labelKey as Parameters<typeof t>[0])}</span>
                      </button>
                    ))}
                  </div>
                  <div className="quick-tune-stack">
                    <div className="quick-segment-row">
                      <span>{t('quick.motion')}</span>
                      <div className="quick-segment-control">
                        {QUICK_MOTION_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickMotion ?? 'flow') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('motion', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.energy')}</span>
                      <div className="quick-segment-control">
                        {QUICK_ENERGY_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickEnergy ?? 'balanced') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('energy', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.detail')}</span>
                      <div className="quick-segment-control">
                        {QUICK_DETAIL_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickDetail ?? 'balanced') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('detail', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.palette')}</span>
                      <div className="quick-segment-control">
                        {QUICK_PALETTE_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickPalette ?? 'cool') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('palette', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="quick-effects-panel">
                <span className="ambient-label">{t('quick.effects')}</span>
                <div className="effect-kind-grid compact-effect-grid" aria-label={t('quick.effects')}>
                  {QUICK_EFFECT_KINDS.map((kind) => {
                    const preset = effectPresets.find((candidate) => candidate.kind === kind)
                    if (!preset) return null
                    return (
                      <button
                        className={`effect-kind-btn ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                        key={preset.kind}
                        type="button"
                        onClick={() => selectEffect(preset.kind)}
                        title={preset.description}
                      >
                        {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                      </button>
                    )
                  })}
                </div>
                <button className="advanced-toggle-row" type="button" onClick={() => setAllEffectsOpen((open) => !open)}>
                  <Sparkles size={13} />
                  <span>{t('quick.allEffects')}</span>
                  <strong>{allEffectsOpen ? t('quick.hide') : t('quick.show')}</strong>
                </button>
                {allEffectsOpen && (
                  <div className="effect-kind-grid all-effects-grid" aria-label="Effect type picker">
                    {effectPresets
                      .filter((preset) => !QUICK_EFFECT_KINDS.includes(preset.kind))
                      .map((preset) => (
                        <button
                          className={`effect-kind-btn ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                          key={preset.kind}
                          type="button"
                          onClick={() => selectEffect(preset.kind)}
                          title={preset.description}
                        >
                          {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Per-layer parameters */}
              {selectedLayer && (
                <div className="layer-params-panel">
                  <button className="advanced-toggle-row" type="button" onClick={() => setAdvancedControlsOpen((open) => !open)}>
                    <Gauge size={13} />
                    <span>{t('quick.advanced')}</span>
                    <strong>{advancedControlsOpen ? t('quick.hide') : t('quick.show')}</strong>
                  </button>
                  {advancedControlsOpen && (
                    <>
                      <div className="layer-tools-row">
                        <select
                          className="randomizer-select"
                          value={randomizerMode}
                          title={t('effects.randomizeMode')}
                          onChange={(e) => setRandomizerMode(e.target.value as RandomizerMode)}
                        >
                          <option value="subtle">{t('effects.randomize.subtle')}</option>
                          <option value="bold">{t('effects.randomize.bold')}</option>
                          <option value="calm">{t('effects.randomize.calm')}</option>
                          <option value="energy">{t('effects.randomize.energy')}</option>
                        </select>
                        <button className="layer-action-btn" type="button" onClick={randomizeSelectedLayer} title={t('effects.randomize')}>
                          <Shuffle size={13} />
                          <span>{t('effects.randomize')}</span>
                        </button>
                      </div>
                      <div className="schedule-panel">
                    <button
                      className={`schedule-toggle ${scheduleEnabled ? 'active' : ''}`}
                      type="button"
                      onClick={() => setScheduleEnabled((enabled) => !enabled)}
                      title={t('schedule.toggle')}
                    >
                      <Clock size={13} />
                      <span>{t('schedule.title')}</span>
                      <strong>{scheduleEnabled ? t('schedule.on') : t('schedule.off')}</strong>
                    </button>
                    {scheduleEnabled && (
                      <div className="schedule-block-list">
                        <div className="schedule-active-line">
                          {t('schedule.active')}: {t(activeScheduleBlock.labelKey)} · {t((`effect.${scheduledEffectKind}`) as Parameters<typeof t>[0])}
                        </div>
                        {SCHEDULE_BLOCKS.map((block) => (
                          <label className="schedule-block-row" key={block.id}>
                            <span>{t(block.labelKey)}</span>
                            <small>{block.timeLabel}</small>
                            <select
                              value={scheduleEffects[block.id]}
                              onChange={(event) => setScheduleEffect(block.id, event.target.value as EffectKind)}
                            >
                              {effectPresets.map((preset) => (
                                <option key={preset.kind} value={preset.kind}>
                                  {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {automatableParams.length > 0 && (
                    <div className="automation-panel">
                      <div className="automation-toolbar">
                        <button
                          className={`schedule-toggle ${automationEnabled ? 'active' : ''}`}
                          type="button"
                          onClick={() => setAutomationEnabled((enabled) => !enabled)}
                          title={t('automation.toggle')}
                        >
                          <Activity size={13} />
                          <span>{t('automation.title')}</span>
                          <strong>{automationEnabled ? t('schedule.on') : t('schedule.off')}</strong>
                        </button>
                        <select
                          className="automation-mode-select"
                          value={automationMode}
                          title={t('automation.mode')}
                          onChange={(event) => setAutomationMode(event.target.value as AutomationMode)}
                        >
                          <option value="sine">{t('automation.sine')}</option>
                          <option value="triangle">{t('automation.triangle')}</option>
                          <option value="pulse">{t('automation.pulse')}</option>
                        </select>
                      </div>
                      <div className="automation-param-row">
                        {automatableParams.map((name) => {
                          const active = automatedParams.includes(name)
                          const meta = PARAM_META[name]
                          const label = meta?.labelKey?.includes('.') ? t(meta.labelKey as Parameters<typeof t>[0]) : meta?.labelKey ?? name
                          return (
                            <button
                              className={`automation-param-chip ${active ? 'active' : ''}`}
                              key={name}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleAutomatedParam(name)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* ── Zone Mask ────────────────────────────────────────── */}
                  <div className="zone-mask-panel">
                    <span className="zone-mask-label">{t('mask.title')}</span>
                    <div className="zone-mask-buttons">
                      {(['full', 'top', 'bottom', 'left', 'right', 'center', 'corners'] as const).map((zone) => {
                        const active = (String(selectedLayer.parameters._maskZone ?? 'full')) === zone
                        return (
                          <button
                            key={zone}
                            className={`zone-mask-btn ${active ? 'active' : ''}`}
                            type="button"
                            aria-pressed={active}
                            title={t(`mask.${zone}` as Parameters<typeof t>[0])}
                            onClick={() => setLayerParameter('_maskZone', zone)}
                          >
                            {t(`mask.${zone}` as Parameters<typeof t>[0])}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* ── Display Slot (multi-display linked mode) ──────────── */}
                  {scene?.linkedDisplays && topology.displays.length > 1 && (
                    <div className="zone-mask-panel">
                      <span className="zone-mask-label">{t('display.slotTitle')}</span>
                      <div className="zone-mask-buttons">
                        {(['all', ...topology.displays.map((_, i) => String(i))] as const).map((slot) => {
                          const active = (String(selectedLayer.parameters._displaySlot ?? 'all')) === slot
                          const label = slot === 'all' ? t('display.slotAll') : `${t('display.slotN')} ${Number(slot) + 1}`
                          return (
                            <button
                              key={slot}
                              className={`zone-mask-btn ${active ? 'active' : ''}`}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setLayerParameter('_displaySlot', slot)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <label className="control-line">
                    <span>{t('fx.opacity')}</span>
                    <input min={0} max={1} step={0.05} type="range" value={selectedLayer.opacity}
                      onChange={(e) => setSelectedLayerValue('opacity', Number(e.target.value))} />
                    <strong>{Math.round(selectedLayer.opacity * 100)}%</strong>
                  </label>
                  <label className="select-line">
                    <span>{t('fx.blend')}</span>
                    <select value={selectedLayer.blendMode}
                      onChange={(e) => setSelectedLayerValue('blendMode', e.target.value as BlendMode)}>
                      <option value="normal">{t('blend.normal')}</option>
                      <option value="screen">{t('blend.screen')}</option>
                      <option value="add">{t('blend.add')}</option>
                      <option value="multiply">{t('blend.multiply')}</option>
                    </select>
                  </label>
                  {/* Custom Paint editor */}
                  {selectedLayer.kind === 'custom-paint' && (
                    <CustomPaintEditor
                      columns={profile?.sampling.columns ?? 24}
                      rows={profile?.sampling.rows ?? 14}
                      pixelData={(() => {
                        try {
                          const raw = String(selectedLayer.parameters.pixelData ?? '')
                          return raw ? JSON.parse(raw) as string[] : []
                        } catch { return [] }
                      })()}
                      onChange={(pixels) => setLayerParameter('pixelData', JSON.stringify(pixels))}
                    />
                  )}
                  {/* Image Paint editor */}
                  {selectedLayer.kind === 'image-paint' && (
                    <ImagePaintEditor
                      columns={profile?.sampling.columns ?? 24}
                      rows={profile?.sampling.rows ?? 14}
                      imageDataList={(() => {
                        try {
                          const raw = String(selectedLayer.parameters.imageDataList ?? '')
                          return raw ? JSON.parse(raw) as string[][] : []
                        } catch { return [] }
                      })()}
                      activeImageIndex={Number(selectedLayer.parameters.activeImageIndex ?? 0)}
                      transitionSpeed={Number(selectedLayer.parameters.transitionSpeed ?? 3)}
                      animateTransition={selectedLayer.parameters.animateTransition !== false}
                      onChange={(data) => {
                        updateSelectedLayer({
                          parameters: {
                            ...selectedLayer.parameters,
                            imageDataList: JSON.stringify(data.imageDataList),
                            activeImageIndex: data.activeImageIndex,
                            transitionSpeed: data.transitionSpeed,
                            animateTransition: data.animateTransition,
                          }
                        })
                      }}
                    />
                  )}
                  {selectedLayer.kind !== 'custom-paint' && selectedLayer.kind !== 'image-paint' && Object.entries(selectedLayer.parameters)
                    .filter(([name]) => !name.startsWith('_'))
                    .map(([name, value]) => {
                      const meta = PARAM_META[name]
                      // label: use i18n key if available (e.g. 'param.textX'), otherwise meta.labelKey or param name
                      const labelKey = meta?.labelKey ?? name
                      const label = (labelKey.includes('.') ? t(labelKey as Parameters<typeof t>[0]) : labelKey)
                      const unit = meta?.unit ?? ''
                      const locked = randomizerLockedParams.includes(name)
                      const lockTitle = locked ? t('effects.unlockParam') : t('effects.lockParam')
                      const lockButton = (
                        <button
                          className={`parameter-lock-btn ${locked ? 'locked' : ''}`}
                          type="button"
                          aria-pressed={locked}
                          title={lockTitle}
                          onClick={() => toggleRandomizerParamLock(name)}
                        >
                          {locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                      )
                      // Special case: text string parameter (not a color hex)
                      if (typeof value === 'string' && !value.startsWith('#')) {
                        return (
                          <div className="parameter-line text-param" key={name}>
                            <span>{name === 'text' ? t('param.text') : label}</span>
                            <input
                              className="text-param-input"
                              type="text"
                              value={value}
                              placeholder={name === 'text' ? t('param.textPlaceholder') : ''}
                              onChange={(e) => setLayerParameter(name, e.target.value)}
                            />
                            {lockButton}
                          </div>
                        )
                      }
                      return (
                        <div className="parameter-line" key={name}>
                          <span>{name === 'color' ? t('param.bgColor') : name === 'textColor' ? t('param.textColor') : label}</span>
                          {typeof value === 'string' && value.startsWith('#') ? (
                            <input type="color" value={value}
                              onChange={(e) => setLayerParameter(name, e.target.value)} />
                          ) : typeof value === 'number' ? (
                            <input
                              min={meta?.min ?? 0}
                              max={meta?.max ?? 2}
                              step={meta?.step ?? 0.05}
                              type="range"
                              value={value}
                              onChange={(e) => setLayerParameter(name, Number(e.target.value))}
                            />
                          ) : (
                            <input checked={Boolean(value)} type="checkbox"
                              onChange={(e) => setLayerParameter(name, e.target.checked)} />
                          )}
                          {lockButton}
                          <strong>
                            {typeof value === 'number'
                              ? `${meta?.step && meta.step >= 1 ? Math.round(value) : value.toFixed(2)}${unit}`
                              : String(value)}
                          </strong>
                        </div>
                      )
                    })}
                    </>
                  )}
                </div>
              )}
            </aside>

            {/* ── Right main content ───────────────────────────────────── */}
            <div className="workspace-main">
              <header className="workspace-header">
                <div>
                  <p className="eyebrow">{t('ws.eyebrow')}</p>
                  <h2
                    className="profile-name-header"
                    title={t('profile.label')}
                    style={{ cursor: 'default' }}
                  >
                    {profile.name}
                  </h2>
                </div>
                <div className="metric-row">
                  <div className="metric">
                    <span>{t('ws.displays')}</span>
                    <strong>{topology.displays.length}</strong>
                  </div>
                  <div className="metric">
                    <span>{t('ws.grid')}</span>
                    <strong>{profile.sampling.columns}×{profile.sampling.rows}</strong>
                  </div>
                  <div className="metric">
                    <span>{t('ws.mode')}</span>
                    <strong>{performanceLabels[profile.performanceMode]}</strong>
                  </div>
                </div>
              </header>

              <div className="content-grid">
                <section className="panel preview-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('preview.eyebrow')}</p>
                      <h3>{t('preview.title')}</h3>
                    </div>
                    <span className="chip">{status.output}</span>
                  </div>
                  {is3DEffect(activeLayer(profile).kind) ? (
                    <Preview3D
                      layer={activeLayer(profile)}
                      columns={profile.sampling.columns}
                      rows={profile.sampling.rows}
                      onFrame={handleFrame3D}
                    />
                  ) : (
                    <PreviewGrid
                      frameRef={frameRef}
                      showGap={profile.sampling.showGap ?? false}
                      renderStyle={resolveFrameRenderStyle(profile.sampling.renderStyle, activeLayer(profile)?.kind)}
                      gpuLayer={gpuDirectLayer}
                      onRippleClick={scene?.layers.some((l) => l.enabled && l.kind === 'ripple') ? handleRippleClick : undefined}
                      displayCount={scene?.linkedDisplays ? topology.displays.length : 1}
                    />
                  )}
                </section>

                <section className="panel map-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('map.eyebrow')}</p>
                      <h3>{t('map.title')}</h3>
                    </div>
                    <span className="chip">{topology.platform}</span>
                  </div>
                  <DisplayMap topology={topology} overlayDisplayIds={overlayDisplayIds} onToggleOverlay={handleToggleOverlay} overlayConfigs={overlayConfigs} onOverlayConfigChange={handleOverlayConfigChange} />
                  {topology.displays.length > 1 && (
                    <div className="linked-display-row">
                      <button
                        className={`aspect-lock-btn${scene?.linkedDisplays ? ' locked' : ''}`}
                        title={t('scene.linkedDisplays.hint')}
                        onClick={toggleLinkedDisplays}
                        type="button"
                      >
                        <Link2 size={12} />
                        <span>{t('scene.linkedDisplays')}</span>
                      </button>
                      {scene?.linkedDisplays && (
                        <span className="linked-hint">{t('scene.linkedDisplays.hint')}</span>
                      )}
                    </div>
                  )}
                  {topology.displays.length > 1 && (
                    <VideoWallEditor
                      layout={scene?.videoWall}
                      topology={topology}
                      onChange={updateVideoWall}
                    />
                  )}
                </section>

                {/* Sampling settings — spans both columns; R40: collapsible + tabbed to
                    reduce the vertical footprint so the display topology map above has
                    more room without excessive scrolling. */}
                <section className="panel sampling-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('sampling.eyebrow')}</p>
                      <h3>{t('sampling.title')}</h3>
                    </div>
                    <button
                      className="aspect-lock-btn sampling-collapse-btn"
                      type="button"
                      onClick={() => setSamplingCollapsed((v) => !v)}
                      title={t(samplingCollapsed ? 'sampling.expand' : 'sampling.collapse')}
                    >
                      {samplingCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      <span>{t(samplingCollapsed ? 'sampling.expand' : 'sampling.collapse')}</span>
                    </button>
                  </div>
                  {!samplingCollapsed && (
                    <>
                      <div className="sampling-tabs" role="tablist">
                        {(['resolution', 'appearance', 'performance'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={samplingTab === tab}
                            className={`sampling-tab${samplingTab === tab ? ' active' : ''}`}
                            onClick={() => setSamplingTab(tab)}
                          >
                            {t(`sampling.tab.${tab}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                      <div className="sampling-controls">
                        {samplingTab === 'resolution' && (
                          <>
                            {/* ── Auto density mode (default) ── */}
                            {!gridAdvanced ? (
                              <>
                                <label className="control-line">
                                  <span>{t('sampling.resolution')}</span>
                                  <input min={8} max={320} type="range"
                                    value={Math.max(profile.sampling.columns, profile.sampling.rows)}
                                    onChange={(e) => setGridDensity(Number(e.target.value))} />
                                  <strong>{profile.sampling.columns} × {profile.sampling.rows}</strong>
                                </label>
                                {(() => {
                                  const px = profile.sampling.columns * profile.sampling.rows
                                  // Empirical throughput after per-column precompute optimisation:
                                  // ~250,000 pixels/sec for complex effects (fire/aurora/lightning)
                                  // on a modern CPU in a single Web Worker.
                                  const estFps = Math.min(60, Math.round(250_000 / px))
                                  const slow = estFps < 15
                                  return (
                                    <div className={`grid-fps-hint${slow ? ' grid-fps-hint--warn' : ''}`}>
                                      ~{estFps}&nbsp;{t(slow ? 'sampling.fpsSlow' : 'sampling.fpsOk')}
                                    </div>
                                  )
                                })()}
                                <div className="aspect-lock-row">
                                  <button className="aspect-lock-btn" onClick={matchDisplayRatio} type="button">
                                    <Monitor size={12} />
                                    <span>{t('sampling.matchRatio')}</span>
                                  </button>
                                  <button className="aspect-lock-btn" onClick={() => setGridAdvanced(true)} type="button">
                                    <span>{t('sampling.advanced')}</span>
                                  </button>
                                </div>
                              </>
                            ) : (
                              /* ── Manual mode (advanced) ── */
                              <>
                                <label className="control-line">
                                  <span>{t('sampling.columns')}</span>
                                  <input min={1} max={960} type="range" value={profile.sampling.columns}
                                    onChange={(e) => setColumns(Number(e.target.value))} />
                                  <strong>{profile.sampling.columns}</strong>
                                </label>
                                <div className="aspect-lock-row">
                                  <button
                                    className={`aspect-lock-btn${aspectLocked ? ' locked' : ''}`}
                                    title={t('sampling.aspectLock')}
                                    onClick={toggleAspectLock}
                                    type="button"
                                  >
                                    {aspectLocked ? <Link2 size={12} /> : <Link2Off size={12} />}
                                    <span>{t('sampling.aspectLock')}</span>
                                  </button>
                                  <button className="aspect-lock-btn locked" onClick={() => { setGridAdvanced(false); matchDisplayRatio() }} type="button">
                                    <span>{t('sampling.autoGrid')}</span>
                                  </button>
                                </div>
                                <label className="control-line">
                                  <span>{t('sampling.rows')}</span>
                                  <input min={1} max={540} type="range" value={profile.sampling.rows}
                                    onChange={(e) => setRows(Number(e.target.value))} />
                                  <strong>{profile.sampling.rows}</strong>
                                </label>
                              </>
                            )}
                          </>
                        )}
                        {samplingTab === 'appearance' && (
                          <>
                            <label className="control-line">
                              <span>{t('sampling.smooth')}</span>
                              <input min={0} max={0.9} step={0.05} type="range" value={profile.sampling.smoothing}
                                onChange={(e) => setSamplingValue('smoothing', Number(e.target.value))} />
                              <strong>{profile.sampling.smoothing.toFixed(2)}</strong>
                            </label>
                            <label className="control-line">
                              <span>{t('sampling.saturation')}</span>
                              <input min={0.5} max={3} step={0.1} type="range" value={profile.sampling.saturationBoost ?? 1.5}
                                onChange={(e) => setSamplingValue('saturationBoost', Number(e.target.value))} />
                              <strong>{(profile.sampling.saturationBoost ?? 1.5).toFixed(1)}×</strong>
                            </label>
                            <label className="control-line">
                              <span>{t('sampling.brightness')}</span>
                              <input min={0.1} max={2} step={0.05} type="range" value={profile.sampling.brightnessLimit}
                                onChange={(e) => setSamplingValue('brightnessLimit', Number(e.target.value))} />
                              <strong>{Math.round(profile.sampling.brightnessLimit * 100)}%</strong>
                            </label>
                            <label className="control-line">
                              <span>{t('sampling.renderStyle')}</span>
                              <select
                                value={profile.sampling.renderStyle ?? 'smooth'}
                                onChange={(e) => setSamplingValue('renderStyle', e.target.value)}
                              >
                                <option value="smooth">{t('sampling.renderStyle.smooth')}</option>
                                <option value="pixel">{t('sampling.renderStyle.pixel')}</option>
                              </select>
                            </label>
                            <label className="toggle-line sampling-toggle">
                              <input checked={profile.sampling.showGap ?? false} type="checkbox"
                                onChange={(e) => setSamplingValue('showGap', e.target.checked)} />
                              <span>{t('sampling.showGap')}</span>
                            </label>
                          </>
                        )}
                        {samplingTab === 'performance' && (
                          <>
                            <label className="control-line">
                              <span>{t('sampling.fps')}</span>
                              <input min={15} max={60} step={15} type="range" value={profile.sampling.fps}
                                onChange={(e) => setSamplingValue('fps', Number(e.target.value))} />
                              <strong>{profile.sampling.fps}</strong>
                            </label>
                            <label className="toggle-line sampling-toggle">
                              <input checked={profile.sampling.usePerformanceGuard} type="checkbox"
                                onChange={(e) => setSamplingValue('usePerformanceGuard', e.target.checked)} />
                              <span>{t('sampling.perfGuard')}</span>
                            </label>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>

          </div>
        )}

        {currentView === 'effects' && (
          <EffectsView
            activeKind={selectedLayer?.kind ?? 'static'}
            favoriteKinds={favoriteEffectKinds}
            onSelectEffect={(kind) => {
              selectEffect(kind)
              setCurrentView('workspace')
            }}
            onToggleFavorite={toggleFavoriteEffect}
          />
        )}

        {currentView === 'games' && (
          <MiniGamesView />
        )}

        <div style={{ display: currentView === 'audio' ? undefined : 'none' }}>
          <AudioStudioView visible={currentView === 'audio'} />
        </div>

        {currentView === 'video' && (
          <VideoStudioView />
        )}

        {currentView === 'model3d' && (
          <div className="model3d-view">
            <header className="workspace-header">
              <div>
                <p className="eyebrow">{t('model3d.eyebrow')}</p>
                <h2>{t('model3d.title')}</h2>
              </div>
              <div className="metric-row">
                <button
                  className="aspect-lock-btn model3d-back-btn"
                  type="button"
                  onClick={() => setCurrentView('workspace')}
                >
                  <Monitor size={13} />
                  {t('nav.workspace')}
                </button>
                {splatLoading ? (
                  <span className="chip">{t('model3d.loading')}</span>
                ) : (
                  <span className="chip">{splatModels.length === 1 ? t('model3d.models').replace('{count}', String(splatModels.length)) : t('model3d.modelsPlural').replace('{count}', String(splatModels.length))}</span>
                )}
              </div>
            </header>

            <div className="model3d-toolbar">
              <select
                className="profile-select"
                value={selectedModelIndex}
                disabled={splatModels.length === 0}
                onChange={(e) => { setSelectedModelIndex(Number(e.target.value)); setLedMapperOpen(false) }}
              >
                {splatModels.length === 0 && <option value={0}>{t('model3d.noModels')}</option>}
                {splatModels.map((m, i) => (
                  <option key={m.name} value={i}>{m.name}</option>
                ))}
              </select>
              <button
                className="aspect-lock-btn"
                type="button"
                title={t('model3d.importHint')}
                onClick={() => splatFileInputRef.current?.click()}
              >
                📂 {t('model3d.importModel')}
              </button>
              <input
                ref={splatFileInputRef}
                type="file"
                accept=".splat,.ply,.ksplat,.spz"
                style={{ display: 'none' }}
                onChange={handleSplatImport}
              />
              {selectedModel && (
                <button
                  className={`aspect-lock-btn${ledMapperOpen ? ' locked' : ''}`}
                  type="button"
                  onClick={() => setLedMapperOpen((v) => !v)}
                >
                  🎯 {ledMapperOpen ? t('model3d.closeLedMapper') : t('model3d.openLedMapper')}
                </button>
              )}
            </div>

            {selectedModel && ledMapperOpen ? (
              <Suspense fallback={<div className="model3d-splat-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>{t('model3d.loadingLedMapper')}</div>}>
                <LEDMapper
                  model={selectedModel}
                  initialLedMap={selectedModel.ledMap}
                />
              </Suspense>
            ) : selectedModel && selectedModel.downloadStatus !== 'cached' ? (
              <div className="model3d-splat-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                {selectedModel.downloadStatus === 'error' ? (
                  <>
                    <p style={{ color: 'var(--color-error, #f87171)', margin: 0 }}>⚠ {selectedModel.downloadError ?? t('model3d.downloadError')}</p>
                    <button className="aspect-lock-btn" type="button" onClick={() => void downloadSplatModel(selectedModel.name)}>
                      {t('model3d.retry')}
                    </button>
                  </>
                ) : selectedModel.downloadStatus === 'downloading' ? (
                  <>
                    <p style={{ margin: 0, opacity: 0.8 }}>{t('model3d.downloading').replace('{name}', selectedModel.name)}</p>
                    <div style={{ width: 260, height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${selectedModel.downloadProgress}%`, height: '100%', background: 'var(--color-accent, #38bdf8)', transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 12, opacity: 0.6 }}>{selectedModel.downloadProgress}%</span>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, opacity: 0.7 }}>{t('model3d.notDownloaded')}</p>
                    <button className="aspect-lock-btn" type="button" onClick={() => void downloadSplatModel(selectedModel.name)}>
                      {t('model3d.download').replace('{name}', selectedModel.name)}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="model3d-splat-wrapper">
                <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>{t('model3d.loadingViewer')}</div>}>
                  <SplatViewer
                    model={selectedModel}
                    ledColors={ledColorsRef.current}
                    paused={!status.running}
                  />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {currentView === 'architecture' && (
          <ArchitectureView />
        )}

        {currentView === 'diagnostics' && (
          <div className="diagnostics-view">
            <header className="workspace-header">
              <div>
                <p className="eyebrow">{t('diag.eyebrow')}</p>
                <h2>{t('diag.title')}</h2>
              </div>
              <Activity size={24} />
            </header>
            <div className="panel" style={{ maxWidth: 560 }}>
              <dl className="diagnostics-list">
                <div><dt>{t('diag.virtualBounds')}</dt><dd>{topology.virtualBounds.width}×{topology.virtualBounds.height}</dd></div>
                <div><dt>{t('diag.frameAge')}</dt><dd>{frameRef.current ? `${Math.max(0, Date.now() - frameRef.current.generatedAt)} ms` : t('diag.waiting')}</dd></div>
                <div><dt>{t('diag.avgFrameMs')}</dt><dd>{formatMs(engineMetrics.avgFrameMs)}</dd></div>
                <div><dt>{t('diag.p95FrameMs')}</dt><dd>{formatMs(engineMetrics.p95FrameMs)}</dd></div>
                <div><dt>{t('diag.workerMs')}</dt><dd>{formatMs(engineMetrics.workerProcessMs)}</dd></div>
                <div><dt>{t('diag.captureMs')}</dt><dd>{formatMs(engineMetrics.captureMs || captureProvider?.lastCaptureMs)}</dd></div>
                <div><dt>{t('diag.outputMs')}</dt><dd>{formatMs(engineMetrics.outputMs)}</dd></div>
                <div><dt>{t('diag.droppedTicks')}</dt><dd>{engineMetrics.droppedTicks}</dd></div>
                <div><dt>{t('diag.brightGain')}</dt><dd>{Math.round(profile.sampling.brightnessLimit * 100)}%</dd></div>
                <div><dt>{t('diag.gridSize')}</dt><dd>{profile.sampling.columns}×{profile.sampling.rows} ({profile.sampling.columns * profile.sampling.rows} pixels)</dd></div>
                <div><dt>{t('diag.activeLayers')}</dt><dd>{scene?.layers.filter((l) => l.enabled).length ?? 0}</dd></div>
                <div><dt>{t('diag.targetFps')}</dt><dd>{profile.sampling.fps}</dd></div>
                <div><dt>{t('diag.platform')}</dt><dd>{topology.platform}</dd></div>
                <div><dt>{t('diag.audio')}</dt><dd>{audio.active ? t('diag.audioBass').replace('{bass}', (audio.bass * 100).toFixed(0)) : audioErrorLabel || t('diag.off')}</dd></div>
                {topology.displays.map((d) => (
                  <div key={d.id}>
                    <dt>{d.label}{d.primary ? ` ${t('diag.displayPrimary')}` : ''}</dt>
                    <dd>{d.bounds.width}×{d.bounds.height} @{d.scaleFactor}×</dd>
                  </div>
                ))}
              </dl>
            </div>
            {/* R46: objective per-process CPU% breakdown — see PRD-0002 R46.
                Lets CPU investigations point at a specific OS process
                (main/renderer/gpu-process/utility) instead of one aggregate
                Task Manager number, which on Windows groups every
                Electron-owned process under one collapsible tree. */}
            <div className="panel" style={{ maxWidth: 560, marginTop: 16 }}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{t('diag.processCpu.eyebrow')}</p>
                  <h3>{t('diag.processCpu.title')}</h3>
                </div>
              </div>
              <table className="process-cpu-table">
                <thead>
                  <tr>
                    <th>{t('diag.processCpu.type')}</th>
                    <th>PID</th>
                    <th>{t('diag.processCpu.cpu')}</th>
                  </tr>
                </thead>
                <tbody>
                  {processCpuSamples.length === 0 ? (
                    <tr><td colSpan={3}>{t('diag.waiting')}</td></tr>
                  ) : (
                    [...processCpuSamples]
                      .sort((a, b) => b.cpuPercent - a.cpuPercent)
                      .map((p) => (
                        <tr key={p.pid}>
                          <td>{p.type}{p.name ? ` (${p.name})` : ''}</td>
                          <td>{p.pid}</td>
                          <td className={p.cpuPercent > 20 ? 'process-cpu-high' : ''}>{p.cpuPercent.toFixed(1)}%</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </section>
    </main>
    </>
  )
}
