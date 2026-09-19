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
  fps: number
  delegate: string
  lowFps: boolean
}

/** Per-frame snapshot dispatched via onFrame (wizard label/progress, geom, stats). */
export interface VisionFrame {
  state: string
  label: string
  status: string
  stepId: 'center' | 'reach' | 'pinch' | null
  stepProgress: number
  score: number
  stats: VisionStats
  faceEveryN: number
}

export interface VisionSession {
  state: string
  paused: boolean
  faceEveryN: number
  label(): string
  recalibrate(): void
  setPaused(p: boolean): unknown
  stop(): unknown
  applySettings(patch: Record<string, number | null>): void
}

export interface VisionInputConfig {
  /** Base URL holding vision_bundle.js + wasm siblings. */
  wasmBase: string
  handModel: string
  faceModel: string
  camera?: {
    width?: { ideal: number }
    height?: { ideal: number }
    frameRate?: { ideal: number; min?: number }
  }
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
