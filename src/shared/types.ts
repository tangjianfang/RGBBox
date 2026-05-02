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
  /** Flat RGB triplets: pixel i → [i*3]=R, [i*3+1]=G, [i*3+2]=B. Length = columns*rows*3. */
  pixels: Uint8ClampedArray
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
  /** When true, effects span across all monitors using the physical display layout as a virtual canvas. */
  linkedDisplays?: boolean
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

export interface ProfileMeta {
  id: string
  name: string
  savedAt: string
}

export interface PresetDefinition {
  kind: EffectKind
  label: string
  description: string
  defaults: EffectLayer['parameters']
}
