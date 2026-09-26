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

/**
 * R46: one entry per OS process Electron's `app.getAppMetrics()` reports
 * (main/"browser", one per renderer BrowserWindow, the shared GPU process,
 * utility processes, etc). Exposed to the Diagnostics view so CPU
 * investigations are based on objective per-process numbers instead of a
 * single aggregate Task Manager figure (which on Windows groups every
 * Electron-owned process under one collapsible tree that's easy to
 * misread).
 */
export interface ProcessCpuSample {
  pid: number
  type: string
  cpuPercent: number
  /** Present for renderer processes when Electron can resolve it. */
  name?: string
}

/**
 * R158.3: one local crash record (uncaughtException / unhandledRejection from
 * the main process), persisted as JSON under userData/logs and rotated. The
 * native minidumps from crashReporter (submit:false) live next to them —
 * nothing ever leaves the machine.
 */
export interface CrashRecord {
  file: string
  at: string
  kind: 'uncaughtException' | 'unhandledRejection'
  message: string
  stack: string | null
  version: string
  platform: string
  electron: string
}

/**
 * R48.1: frame-arrival timing snapshot reported by an overlay window back to
 * the --perf-selftest harness. Captures the overlay's *presentation-layer*
 * cadence — the only signal that can detect compositor/GPU frame throttling
 * that CPU% (R46/R47) is blind to. The overlay accumulates inter-frame
 * intervals from `onOverlayFrame` arrivals; the harness requests a snapshot per
 * scenario, the overlay reports then clears its buffer so each scenario is
 * measured independently.
 */
export interface OverlayFrameTiming {
  /** Matches the requestId of the collect request, for correlation. */
  requestId: number
  /** Frames received since the previous collect (or overlay open). */
  framesReceived: number
  /** Wall-clock ms between the first and last frame in this window. */
  elapsedMs: number
  /** Inter-frame interval (ms) percentiles over the window. 0 if <2 frames. */
  intervalP50Ms: number
  intervalP95Ms: number
  intervalMaxMs: number
  intervalMeanMs: number
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
  /**
   * R63: how an overlay window should map this (uncropped) frame onto its own
   * canvas. 'stretch' (default when omitted) fills the canvas edge-to-edge —
   * correct for fullscreen overlays, whose window aspect already matches the
   * frame's content (R30.1). 'contain' letterboxes the frame, preserving its
   * aspect ratio and showing the COMPLETE effect undistorted — used for
   * non-fullscreen overlay regions (a preset third / a custom drag-selected
   * rectangle), whose window aspect ratio is arbitrary and unrelated to the
   * frame's own aspect ratio; stretching the whole effect into such a window
   * would distort it, and cropping a sub-region (an earlier, incorrect fix
   * attempt) would show only part of the effect instead of the whole thing.
   */
  regionFit?: 'stretch' | 'contain'
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
  /**
   * R159.1: i18n keys for UI display, derived from `kind` (see
   * defaultProfile.ts). The English `label`/`description` above stay as the
   * persisted, language-neutral values — `layer.name` written from
   * `preset.label` must never localize with the UI language.
   */
  labelKey?: `effects.preset.${EffectKind}.label`
  descKey?: `effects.preset.${EffectKind}.desc`
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
/** R77: 拍摄缓存条目（main captureStore / preload / renderer 三方共用） */
export interface CaptureEntry {
  id: string
  file: string        // 缓存目录内的绝对文件路径
  name: string
  ts: number
  kind: 'photo' | 'snip' | 'annotated' | 'imported'
}

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

// ── R88: AI Lab chat IPC types ────────────────────────────────────────────
/** Single source for the AI failure taxonomy (R88 review fix: was spelled
 *  out in six declarations across four layers). */
export type AiErrorHint = 'nokey' | 'auth' | 'http' | 'parse' | 'network'

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}
export interface AiChatOutcome {
  ok: boolean
  /** Reply text when ok; empty string on failure. */
  text: string
  hint?: AiErrorHint
  latencyMs: number
  /** R174.8: raw provider/site message (e.g. AI8 积分不足 / 模型不可用) — the
   *  hint taxonomy alone flattened every non-auth failure into "network". */
  detail?: string
}

// ── R89: AI Lab named profiles ────────────────────────────────────────────
// ── R145: AWS Bedrock credentials (SigV4 — not a Bearer key) ──────────────
export interface AwsProfileCreds {
  region: string
  accessKeyId: string
  /** safeStorage-encrypted at rest exactly like apiKey (enc:v1:). */
  secretAccessKey: string
  /** Optional temporary STS credentials. Encrypted at rest too. */
  sessionToken?: string
}

export interface AiProfile {
  id: string
  /** Auto-generated "Provider · model" when left empty; user-editable. */
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** R145: present on AWS Bedrock profiles (baseUrl carries the
   *  `bedrock://openai` pseudo-protocol); undefined for everyone else. */
  aws?: AwsProfileCreds
}

// ── R90 P1: audio AI test lab ─────────────────────────────────────────────
export interface AudioAiStatus {
  sileroCached: boolean
  astCached: boolean
}
export interface AudioAiVadResult {
  ok: boolean
  /** 0..1 voice probability (max over chunks). */
  prob?: number
  frames?: number
  hint?: 'not-downloaded' | 'parse'
}
export interface AudioAiAstResult {
  ok: boolean
  top?: Array<{ index: number; score: number }>
  hint?: 'not-downloaded' | 'parse' | 'inference'
  /** R90.9: isolated AST failure message — VAD keeps flowing when set. */
  astError?: string
  /** R90.9: raw error message on failure — surfaced in the UI instead of a
   *  generic 'pipeline lost', so the root cause is visible. */
  message?: string
}
/** R90.8: one streaming-detection tick (VAD every feed, AST on its cadence). */
export interface AudioAiStreamTick {
  ok: boolean
  prob?: number
  /** 0..1 input loudness of this batch — the capture-health gauge. */
  rms?: number
  /** AST inference lifecycle: running = classifying now, waiting-audio = <1s accumulated. */
  astState?: 'running' | 'waiting-audio' | 'cadence'
  top?: Array<{ index: number; score: number }>
  hint?: 'not-downloaded' | 'parse' | 'inference'
  /** R90.9: isolated AST failure message — VAD keeps flowing when set. */
  astError?: string
  /** R90.9: raw error message on failure — surfaced in the UI instead of a
   *  generic 'pipeline lost', so the root cause is visible. */
  message?: string
}
/** R130.3: snip 冻结帧推送载荷 —— BGRA 原始位图直传（无 PNG 编码/解码/base64 膨胀）。 */
export interface SnipPushFrame {
  width: number
  height: number
  /** BGRA 字节序列（nativeImage.toBitmap()）；渲染端 swapBgraToRgba 后 putImageData。 */
  data: Uint8Array
}

// ── R172: coding-agent workbench (kernel engine) ───────────────────────────

export type AgentMode = 'plan' | 'standard' | 'trust'

export interface AgentApprovalRequest {
  id: string
  kind: 'write' | 'edit' | 'bash'
  /** One-line summary for the approval bar. */
  summary: string
  path?: string
  command?: string
  /** edit: before/after excerpts; write: new content excerpt. */
  before?: string
  after?: string
}

export interface AgentToolCallView {
  id: string
  name: string
  args: string
  result: string
  status: 'running' | 'done' | 'denied' | 'error'
}

export type AgentEvent =
  | { kind: 'session-meta'; sessionId: string; model: string; workspace?: string }
  | { kind: 'turn-start'; turn: number }
  | { kind: 'text-delta'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool-start'; call: AgentToolCallView }
  | { kind: 'tool-result'; call: AgentToolCallView }
  | { kind: 'approval'; approval: AgentApprovalRequest }
  | { kind: 'user'; text: string }
  | { kind: 'done'; reason: 'completed' | 'cancelled' | 'error' | 'max-turns'; error?: string }

export interface AgentSessionMeta {
  id: string
  title: string
  updatedAt: number
  events: number
}

export interface AgentSendArgs {
  text: string
  /** Profile id from aiProfileStore; empty = active profile. */
  profileId?: string
  workspace: string
  mode: AgentMode
  /** Continue an existing session id, or empty for a new session. */
  sessionId?: string
  /** R174.6: per-run model override (AI8 model picker sends e.g. openai_chat::gpt-5.4). */
  modelOverride?: string
}

// ── R173-S2: offline TTS engine ─────────────────────────────────────────────

export interface TtsModelFileStatus { path: string; bytes: number; present: boolean; actualBytes?: number }
export interface TtsEngineStatus {
  /** All REQUIRED model files are on disk (localModelPath loading, zero network). */
  complete: boolean
  files: TtsModelFileStatus[]
  /** kokoro-js + its runtime deps resolve in the main process. */
  kokoroInstalled: boolean
  bundledVoices: string[]
}
export interface TtsModelProgress {
  path: string
  receivedBytes: number
  totalBytes: number
  done: boolean
  error?: string
}
