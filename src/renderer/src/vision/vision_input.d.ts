// Type bridge for the plain-JS vision module (R131). tsconfig.web runs
// without allowJs, so this adjacent declaration is what TS resolves for
// `import('../vision/vision_input.js')`. Minimal surface — only the members
// useVisionInput consumes; the runtime module is the source of truth.

export interface VisionEvent {
  kind: 'direction' | 'pinch' | 'face'
  /** KeyboardEvent.key-style name ('ArrowLeft' | 'Space' | 'KeyE' …), null for bookkeeping events */
  key: string | null
  down: boolean
  /** expression name / 'calibrated' / 'cal-step:N' / 'cal-retry' */
  name?: string
  /** direction name ('up-right' …) */
  dir?: string
  value?: number
}

export interface VisionLatencyStats {
  n: number
  p50: number
  p95: number
  mean: number
}

export interface VisionStats {
  infer: VisionLatencyStats
  hand: VisionLatencyStats
  face: VisionLatencyStats
  /** camera frame age at callback (rVFC presentationTime), upstream v2 */
  acquire: VisionLatencyStats
  /** camera delivery rate (ticks, includes capped/skipped frames) */
  fps: number
  /** rate of actually-processed frames (R133 diagnostic) */
  inferFps: number
  delegate: string
  lowFps: boolean
  /** ACTUAL negotiated camera track settings ("asked 60, got 30" detector) */
  cam: { w?: number; h?: number; fps?: number } | null
}

/** Per-frame snapshot dispatched via onFrame (wizard label/progress, geom, stats). */
export interface VisionFrame {
  state: string
  label: string
  status: string
  /** DirectionRing LIVE center (recenter-updated); null before calibration */
  ringCenter?: { x: number; y: number } | null
  stepId: 'center' | 'reach' | 'pinch' | null
  stepProgress: number
  score: number
  stats: VisionStats
  faceEveryN: number
  /** null when no hand passed the score floor this frame */
  geom?: { palm: { x: number; y: number }; pinch: number; scale: number } | null
  /** normalized pinch distance (geom.pinch alias, always present for the pad) */
  pinch?: number | null
  /** live calibrated profile (center/activeZone/deadZone/pinchOn/pinchOff…) */
  profile?: Record<string, unknown> | null
  provisionalCenter?: { x: number; y: number } | null
}

export interface VisionSession {
  state: string
  paused: boolean
  faceEveryN: number
  /** current (calibrated) profile, null before the first calibration */
  profile: Record<string, unknown> | null
  label(): string
  recalibrate(): void
  setPaused(p: boolean): unknown
  stop(): unknown
  applySettings(patch: Record<string, number | null>): void
  /** Test/recovery hook: enter active state applying the given profile. */
  forceReady(profile?: Record<string, unknown>): void
}

export interface VisionInputConfig {
  /** Base URL holding vision_bundle.js + wasm siblings. */
  wasmBase: string
  handModel: string
  /** R132: null → faceless pipeline (no FaceLandmarker created/inferred). */
  faceModel: string | null
  camera?: {
    width?: { ideal: number }
    height?: { ideal: number }
    frameRate?: { ideal: number; min?: number; max?: number }
  }
  /** upstream v2: use cameraLowRes (640×360) — halves hand-inference cost. */
  preferLowRes?: boolean
  cameraLowRes?: {
    width?: { ideal: number }
    height?: { ideal: number }
    frameRate?: { ideal: number; min?: number; max?: number }
  }
  /** max hands tracked (R132: games pass 1 — halves hand-inference cost). */
  numHands?: number
  /** inference-rate cap in fps, 0 = every camera frame. */
  maxFps?: number
  /** SessionController overrides (storage etc.). */
  session?: Record<string, unknown>
  pinch?: { key?: string; on?: number; off?: number }
  direction?: Record<string, number>
  faceBindings?: Array<Record<string, unknown>>
}

export interface VisionInputOptions {
  video: HTMLVideoElement
  config?: Partial<VisionInputConfig>
  onEvent?: (event: VisionEvent) => void
  onFrame?: (frame: Partial<VisionFrame>) => void
  onStatus?: (status: string) => void
}

export declare class VisionInput {
  constructor(opts?: VisionInputOptions)
  session: VisionSession
  delegate: string
  synthetic: unknown
  init(): Promise<void>
  startCamera(deviceId?: string): Promise<void>
  startSynthetic(): void
  stop(): void
  setPaused(p: boolean): void
  recalibrate(): void
  applySettings(patch: Record<string, number | null>): void
  stats(): VisionStats
}

export declare const DEFAULT_CONFIG: VisionInputConfig
