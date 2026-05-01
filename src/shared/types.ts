export type PlatformName = 'windows' | 'macos' | 'linux' | 'unknown'

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen'

export type EffectKind =
  | 'screen-ambient'
  | 'static'
  | 'breathing'
  | 'rainbow'
  | 'wave'
  | 'zone-gradient'
  | 'fire'
  | 'starlight'
  | 'ripple'
  | 'spectrum'
  | 'comet'
  | 'lightning'
  | 'aurora'
  | 'explode'
  | 'audio-beat'
  | 'audio-equalizer'
  | 'random-color'

export type PerformanceMode = 'battery' | 'balanced' | 'extreme'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
  rotation: number
  primary: boolean
}

export interface DisplayTopology {
  platform: PlatformName
  displays: DisplayInfo[]
  virtualBounds: Rect
  detectedAt: string
}

export interface SamplingSettings {
  columns: number
  rows: number
  fps: number
  smoothing: number
  brightnessLimit: number
  saturationBoost: number
  usePerformanceGuard: boolean
}

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface RgbFrame {
  columns: number
  rows: number
  pixels: RgbColor[]
  generatedAt: number
}

export interface EffectLayer {
  id: string
  name: string
  kind: EffectKind
  enabled: boolean
  opacity: number
  blendMode: BlendMode
  parameters: Record<string, number | string | boolean>
}

export interface Scene {
  id: string
  name: string
  displayIds: number[]
  layers: EffectLayer[]
}

export interface Profile {
  id: string
  name: string
  activeSceneId: string
  performanceMode: PerformanceMode
  sampling: SamplingSettings
  scenes: Scene[]
}

export interface EngineStatus {
  running: boolean
  fps: number
  lastFrameAt?: number
  output: 'virtual-preview' | 'openrgb' | 'disabled'
}

export interface PresetDefinition {
  kind: EffectKind
  label: string
  description: string
  defaults: EffectLayer['parameters']
}
