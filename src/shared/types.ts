export type PlatformName = 'windows' | 'macos' | 'linux' | 'unknown'

export interface ModelDownloadProgress {
  name: string
  receivedBytes: number
  totalBytes: number
  /** 0–100 */
  percent: number
  done: boolean
  error?: string
}

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen'

/** GPU-rendered 3D effects (WebGL raymarching shaders, bypass the CPU worker). */
export type Effect3DKind =
  | 'sphere-pulse'
  | 'warp-portal'
  | 'neon-galaxy'
  | 'lava-sphere'
  | 'laser-show'
  | 'hologram'

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
  | 'custom-paint'
  | 'image-paint'
  | 'plasma'
  | 'vortex'
  | 'tunnel'
  | 'crystal'
  | 'glitch'
  | 'matrix-rain'
  | 'neon-pulse'
  | 'nebula'
  | 'fluid-flow'
  | 'mirror-symmetry'
  | 'dna-helix'
  | 'black-hole'
  | 'solar-system'
  | 'spiral-galaxy'
  | 'orion-nebula'
  | 'pulsar-beacon'
  | 'hurricane-eye'
  | 'lightning-leader'
  | 'icosahedral-virus'
  | 'protein-folding'
  | 'mitosis-spindle'
  | 'synapse-pulse'
  | 'quantum-collapse'
  | 'microvilli-field'
  | 'eclipse-alignment'
  | 'comet-tail'
  | 'magnetosphere-aurora'
  | 'wave-diffraction'
  | 'vortex-flame'
  | 'tokamak-plasma'
  | Effect3DKind

/** Runtime set of all 3D effect kinds — keep in sync with Effect3DKind. */
export const EFFECT_3D_KINDS = new Set<EffectKind>([
  'sphere-pulse',
  'warp-portal',
  'neon-galaxy',
  'lava-sphere',
  'laser-show',
  'hologram',
])

/** True when the effect is rendered via GPU shaders (Preview3D) rather than the CPU worker. */
export function is3DEffect(kind: EffectKind): kind is Effect3DKind {
  return EFFECT_3D_KINDS.has(kind)
}

export type PerformanceMode = 'battery' | 'balanced' | 'extreme'

export type CaptureProviderKind = 'desktop-capturer' | 'dxgi' | 'screen-capture-kit'

export interface CaptureProviderStatus {
  active: CaptureProviderKind
  available: CaptureProviderKind[]
  fallbackReason?: string
  lastCaptureMs?: number
  lastError?: string
}

export interface FrameMetrics {
  timestamp: number
  workerProcessMs: number
  textMaskMs: number
  renderMs: number
  captureMs: number
  roundTripMs: number
  outputMs: number
  droppedTicks: number
}

export interface EngineMetrics {
  frameCount: number
  avgFrameMs: number
  p95FrameMs: number
  lastFrameMs: number
  workerProcessMs: number
  captureMs: number
  outputMs: number
  droppedTicks: number
}

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
  showGap: boolean
  /**
   * R32: how the LED grid is rendered.
   * - 'smooth' (default): bilinear-blended between cells — looks like a
   *   continuous, diffused light bar rather than discrete blocks. Same
   *   `columns × rows` compute cost as 'pixel'; only the GPU sampling/filter
   *   mode changes (near-zero extra cost).
   * - 'pixel': the original discrete flat-color LED block look.
   * Certain effects (see `PIXEL_STYLE_EFFECTS`) force 'pixel' regardless of
   * this setting because their visual identity depends on crisp cell edges.
   */
  renderStyle?: 'pixel' | 'smooth'
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
  /** When true the WebGL renderer shows inter-cell gap lines (propagated from sampling.showGap). */
  showGap?: boolean
  /** R32: propagated from `sampling.renderStyle` (resolved against the active effect's pixel-style override). */
  renderStyle?: 'pixel' | 'smooth'
}

/**
 * R32: effects whose visual identity depends on crisp, discrete grid cells —
 * these always render in 'pixel' style regardless of the global
 * `sampling.renderStyle` setting, because bilinear-blending them would blur
 * away the effect (e.g. `random-color` would average neighbouring random
 * colours into grey mush; `matrix-rain`/`glitch`/`crystal`/`starlight` rely
 * on distinct sparkle/block edges for their look).
 *
 * This is an initial, easily-adjustable set — add/remove kinds here as
 * needed after visually comparing smooth vs pixel per effect.
 */
export const PIXEL_STYLE_EFFECTS: ReadonlySet<EffectKind> = new Set<EffectKind>([
  'starlight',
  'matrix-rain',
  'glitch',
  'crystal',
  'random-color',
])

/** Resolve the effective per-frame render style: the active effect's forced
 *  pixel-style override (if any) wins over the user's global preference. */
export function resolveFrameRenderStyle(
  preference: 'pixel' | 'smooth' | undefined,
  activeEffectKind: EffectKind | null | undefined
): 'pixel' | 'smooth' {
  if (activeEffectKind && PIXEL_STYLE_EFFECTS.has(activeEffectKind)) return 'pixel'
  return preference ?? 'smooth'
}

export interface ScreenCaptureRequest {
  columns: number
  rows: number
  hasOverlays: boolean
  linkedDisplays?: boolean
  displayId?: number
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
  /**
   * Optional video-wall layout. When present, live output is stitched across the
   * physical panels described by this layout (matrix / bezel / rotation / fit)
   * instead of the plain {@link linkedDisplays} equal-width slicing. Absent means
   * video-wall mode is disabled (backward compatible with older profiles).
   */
  videoWall?: VideoWallLayout
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
  output: 'virtual-preview' | 'disabled'
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

/** Preset region for the overlay window relative to the display bounds. */
export type OverlayRegionPreset =
  | 'fullscreen'
  | 'top-third'
  | 'middle-third'
  | 'bottom-third'
  | 'left-third'
  | 'center-third'
  | 'right-third'
  | 'custom'

/** Normalized (0–1) bounds relative to the display bounds, used when region = 'custom'. */
export interface OverlayRegionCustom {
  x: number
  y: number
  width: number
  height: number
}

/** Configuration for how an overlay window is positioned on a display. */
export interface OverlayConfig {
  region: OverlayRegionPreset
  custom?: OverlayRegionCustom
}

/** A desktop audio capture source returned by desktopCapturer. */
export interface DesktopAudioSource {
  id: string
  name: string
}

/** A screen/window capture source returned by desktopCapturer (Video Studio). */
export interface CaptureSource {
  id: string
  name: string
  /** 'screen' for whole displays, 'window' for individual application windows. */
  type: 'screen' | 'window'
  /** Data-URL PNG thumbnail preview of the source. */
  thumbnail: string
  /** Data-URL PNG of the owning application's icon (windows only, may be empty). */
  appIcon: string
}

// ── Video wall / multi-display stitching ────────────────────────────────────
// Data model for stitching the virtual canvas across a 2D matrix of physical
// panels/displays (advertising walls, large stage/show displays). Pure-data so
// the engine math stays UI-agnostic. See src/engine/videoWall.ts.

/** How the source content is fitted onto the wall's aspect ratio. */
export type VideoWallFit = 'stretch' | 'contain' | 'cover'

/** A single physical panel/display within a video wall. */
export interface VideoWallPanel {
  id: string
  /** Zero-based column index in the matrix (0 = leftmost). */
  col: number
  /** Zero-based row index in the matrix (0 = topmost). */
  row: number
  /**
   * Content rotation applied to this panel, in degrees clockwise. Enables
   * angled / portrait-mounted panels in creative ("3D"/tilted) wall layouts.
   */
  rotation: number
  /** Optional mapping to a physical display id from {@link DisplayInfo}. */
  displayId?: number
  /** Optional human-readable label. */
  label?: string
}

/** A 2D matrix video-wall layout describing how panels tile the virtual canvas. */
export interface VideoWallLayout {
  /** 'matrix' = uniform rows×cols grid; 'freeform' reserved for future use. */
  mode: 'matrix' | 'freeform'
  /** Number of columns (>= 1). */
  cols: number
  /** Number of rows (>= 1). */
  rows: number
  /**
   * Bezel/gap thickness as a fraction (0..0.49) of a single panel's pitch.
   * Represents the inactive border around each panel's active area.
   */
  bezel: number
  /**
   * When true, content "continues behind" the bezels so the image looks
   * seamless across physical gaps (standard video-wall bezel correction).
   * When false, content is squeezed into active areas and seams are visible.
   */
  bezelCompensation: boolean
  /** How source content is fitted onto the wall aspect ratio. */
  fit: VideoWallFit
  /** Per-panel descriptors (length === rows * cols for 'matrix' mode). */
  panels: VideoWallPanel[]
}
