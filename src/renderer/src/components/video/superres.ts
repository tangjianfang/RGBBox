/**
 * superres.ts — R93 tier-1: anime video realtime super-resolution
 * (RealESRGAN-AnimeVideo-v3 xs, ×4 ONNX).
 *
 * Two halves live here on purpose:
 *
 *  1. PURE functions (unit-tested, no GPU / DOM / ORT): pass planning, backend
 *     priority, RGBA⇄NCHW conversion, file://→media:// URL mapping, fps meter.
 *     These encode every decision that matters for correctness.
 *
 *  2. The runtime engine (NOT unit-testable headless — real GPU/ORT paths):
 *     lazy onnxruntime-web session, webgpu → webgl → wasm-cpu backend probing
 *     and the per-frame pipeline video → offscreen canvas → ORT → output canvas.
 *
 * WASM packaging route (fixes the R91.3b electron-vite + file:// pitfall):
 * onnxruntime-web is NOT an npm import here. The prebuilt 1.30.0 runtime lives
 * in `src/renderer/public/vendor/ort/` (R131 mediapipe pattern) and is loaded
 * with a runtime dynamic import — the bundler never touches it. The wasm
 * binary resolves relative to `import.meta.url` (media://app/ in packaged
 * builds, the vite dev origin in dev), so no bundler-rewritten asset URLs.
 */
import { visionAssetBase } from '../../hooks/visionAssetBase'

// ─────────────────────────────────────────────────────────────────────────────
// Pure: constants & pass planning
// ─────────────────────────────────────────────────────────────────────────────

/** The exported ONNX is a fixed ×4 upscaler (dynamic H×W input). */
export const MODEL_SCALE = 4

/** Display scales offered in the UI. */
export type SuperresScale = 2 | 3 | 4
export const SUPERRES_SCALES: readonly SuperresScale[] = [2, 3, 4] as const

/**
 * Default realtime input budget for the xs model: 1024×576 ≈ 0.59MP in, ×16 →
 * ≈9.4MP out — comfortably inside the "GPU 30-60fps" envelope from the R93
 * research for animevideov3-xs; bigger sources get proportionally downscaled
 * (the R93 route's "降采样到模型输入尺寸" step).
 */
export const DEFAULT_MAX_INPUT_PX = 1024 * 576

/** Smallest input edge we ever feed the network (keeps PReLU stats sane). */
export const MIN_INPUT_EDGE = 32

export interface SuperresPassPlan {
  /** model input width in px (even, ≥ MIN_INPUT_EDGE) */
  inW: number
  /** model input height in px */
  inH: number
  /** model output = input × MODEL_SCALE */
  outW: number
  outH: number
  /** true when the native×scale target exceeded maxInputPx and was shrunk */
  capped: boolean
}

/**
 * Plan one upscale pass. The model is ×4, so to display at `scale`× the native
 * size we feed `native × scale/4` into the network: for scale 4 that is the
 * untouched frame, for scale 2/3 it pre-downscales (¼/¾-area compute) and the
 * ×4 output lands exactly on native×scale — the presentation canvas then covers
 * the <video> at the same CSS rect with no extra resampling. If the resulting
 * input exceeds `maxInputPx`, it is proportionally shrunk (output stays sharp,
 * just below native×scale — the CSS rect stretches it back).
 */
export function planSuperresPass(
  nativeW: number,
  nativeH: number,
  scale: SuperresScale,
  maxInputPx: number = DEFAULT_MAX_INPUT_PX,
): SuperresPassPlan {
  let w = (nativeW * scale) / MODEL_SCALE
  let h = (nativeH * scale) / MODEL_SCALE
  const px = w * h
  let capped = false
  if (px > maxInputPx && px > 0) {
    const k = Math.sqrt(maxInputPx / px)
    w *= k
    h *= k
    capped = true
  }
  // Even dimensions: rounding may still overflow the cap by <2px — acceptable.
  const inW = Math.max(MIN_INPUT_EDGE, 2 * Math.round(w / 2))
  const inH = Math.max(MIN_INPUT_EDGE, 2 * Math.round(h / 2))
  return { inW, inH, outW: inW * MODEL_SCALE, outH: inH * MODEL_SCALE, capped }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure: backend priority chain
// ─────────────────────────────────────────────────────────────────────────────

export type SuperresBackend = 'webgpu' | 'webgl' | 'wasm'

export interface BackendAvailability {
  webgpu: boolean
  webgl: boolean
}

/**
 * R93 backend chain: WebGPU (Electron 41 Chromium, D3D12) → WebGL (3-5× slower)
 * → CPU wasm (last resort, UI labels it 性能受限). The wasm EP is unconditional
 * — it is ort's guaranteed floor and the label the UI shows for it.
 */
export function pickBackendOrder(avail: BackendAvailability): SuperresBackend[] {
  const order: SuperresBackend[] = []
  if (avail.webgpu) order.push('webgpu')
  if (avail.webgl) order.push('webgl')
  order.push('wasm')
  return order
}

export function backendLabel(backend: SuperresBackend): string {
  if (backend === 'webgpu') return 'WebGPU'
  if (backend === 'webgl') return 'WebGL'
  return 'CPU (WASM)'
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure: RGBA ⇄ NCHW conversion (model contract: NCHW, RGB, 0-1, float32)
// ─────────────────────────────────────────────────────────────────────────────

/** Canvas RGBA bytes → planar NCHW float32 (÷255). `out` must be w*h*3. */
export function imageDataToNchw(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  out?: Float32Array,
): Float32Array {
  const nchw = out ?? new Float32Array(w * h * 3)
  const plane = w * h
  for (let i = 0; i < plane; i++) {
    const src = i * 4
    nchw[i] = rgba[src] / 255
    nchw[plane + i] = rgba[src + 1] / 255
    nchw[(2 * plane) + i] = rgba[src + 2] / 255
  }
  return nchw
}

/** Planar NCHW float32 → RGBA bytes (×255, clamped). `out` must be w*h*4. */
export function nchwToImageData(
  nchw: Float32Array,
  w: number,
  h: number,
  out?: Uint8ClampedArray<ArrayBuffer>,
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = out ?? new Uint8ClampedArray(w * h * 4)
  const plane = w * h
  for (let i = 0; i < plane; i++) {
    const dst = i * 4
    rgba[dst] = nchw[i] * 255
    rgba[dst + 1] = nchw[plane + i] * 255
    rgba[dst + 2] = nchw[(2 * plane) + i] * 255
    rgba[dst + 3] = 255
  }
  return rgba
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure: model URL plumbing (downloaded models live outside any web root)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `modelDownload` resolves to a file:// URL the packaged renderer cannot fetch
 * (Chromium blocks file:// fetch under file:// documents). Route it through the
 * existing privileged media:// protocol instead: `media://local?p=<path>`
 * streams any local file with CORS `*` (same route playlist videos use).
 * Non-file URLs pass through untouched.
 */
export function fileUrlToMediaUrl(fileUrl: string): string {
  if (!fileUrl.startsWith('file://')) return fileUrl
  const u = new URL(fileUrl)
  let p = decodeURIComponent(u.pathname)
  // file:///C:/x.onnx → pathname "/C:/x.onnx"; keep "C:/x.onnx"
  p = p.replace(/^\/([A-Za-z]:)/, '$1')
  return `media://local?p=${encodeURIComponent(p)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure: fps meter (rolling 1s window)
// ─────────────────────────────────────────────────────────────────────────────

/** Counts completions inside a rolling 1-second window. */
export class RollingFps {
  private times: number[] = []
  push(nowMs: number): void {
    this.times.push(nowMs)
    const cutoff = nowMs - 1000
    while (this.times.length > 0 && this.times[0] < cutoff) this.times.shift()
  }
  get value(): number {
    return this.times.length
  }
  reset(): void {
    this.times = []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime engine (GPU / ORT — real-device verification, not unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structural type of the vendored ort module we rely on. */
export interface OrtTensorLike {
  data: Float32Array
  dims: number[]
}
export interface OrtSessionLike {
  inputNames: string[]
  outputNames: string[]
  run(feeds: Record<string, OrtTensorLike>): Promise<Record<string, OrtTensorLike>>
  release(): void
}
export interface OrtModuleLike {
  env: {
    wasm: { numThreads: number; simd?: boolean }
    logLevel?: string
  }
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensorLike
  InferenceSession: {
    create(
      model: ArrayBuffer | Uint8Array,
      options: { executionProviders: string[] },
    ): Promise<OrtSessionLike>
  }
}

/** Vendor URL of the prebuilt ort bundle (dev: vite origin; prod: media://app). */
export function ortBundleUrl(): string {
  return `${visionAssetBase()}vendor/ort/ort.all.bundle.min.mjs`
}

/**
 * Load the vendored onnxruntime-web bundle. The `@vite-ignore` + computed URL
 * keeps vite's bundler away from it entirely — the module (and its wasm) is
 * fetched exactly where it sits in public/vendor/ort.
 */
export async function loadOrtModule(): Promise<OrtModuleLike> {
  const mod = (await import(/* @vite-ignore */ ortBundleUrl())) as unknown as OrtModuleLike
  // No crossOriginIsolation in this app → no SharedArrayBuffer threads. Pin
  // single-thread so emscripten never tries to spawn workers over media://.
  mod.env.wasm.numThreads = 1
  return mod
}

/** Probe which GPU backends exist (WebGPU adapter + WebGL2 context). */
export async function probeBackendAvailability(): Promise<BackendAvailability> {
  let webgpu = false
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu) webgpu = (await gpu.requestAdapter()) != null
  } catch { /* no adapter / no webgpu */ }
  let webgl = false
  try {
    const c = document.createElement('canvas')
    webgl = c.getContext('webgl2') != null
  } catch { /* blocked */ }
  return { webgpu, webgl }
}

export class SuperresEngine {
  private ort: OrtModuleLike | null = null
  private session: OrtSessionLike | null = null
  private inCanvas: HTMLCanvasElement | null = null
  private inCtx: CanvasRenderingContext2D | null = null
  private nchwIn: Float32Array | null = null
  private rgbaOut: Uint8ClampedArray<ArrayBuffer> | null = null
  backend: SuperresBackend | null = null
  /** true while an inference is in flight — the scheduler skips frames on it */
  busy = false

  async ensureSession(modelBuffer: ArrayBuffer, order: SuperresBackend[]): Promise<SuperresBackend> {
    if (this.session && this.backend) return this.backend
    if (!this.ort) this.ort = await loadOrtModule()
    const bytes = new Uint8Array(modelBuffer)
    let lastErr: unknown = null
    for (const ep of order) {
      try {
        this.session = await this.ort.InferenceSession.create(bytes, { executionProviders: [ep] })
        this.backend = ep
        return ep
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr ?? new Error('no available execution provider')
  }

  get ready(): boolean {
    return this.session != null
  }

  /**
   * Run one frame through the pipeline. Resolves to the inference time in ms,
   * or null when a guard failed (no data / zero dimensions). Throws on tainted
   * canvas (remote no-CORS source) — caller surfaces that as a UI error.
   */
  async processFrame(
    video: HTMLVideoElement,
    target: HTMLCanvasElement,
    plan: SuperresPassPlan,
  ): Promise<number | null> {
    const session = this.session
    if (!session || !this.ort || video.videoWidth === 0) return null
    if (!this.inCanvas) {
      this.inCanvas = document.createElement('canvas')
      this.inCtx = this.inCanvas.getContext('2d', { willReadFrequently: true })
      if (!this.inCtx) return null
    }
    if (this.inCanvas.width !== plan.inW || this.inCanvas.height !== plan.inH) {
      this.inCanvas.width = plan.inW
      this.inCanvas.height = plan.inH
    }
    const ictx = this.inCtx!
    ictx.drawImage(video, 0, 0, plan.inW, plan.inH)
    // SecurityError here ⇔ remote no-CORS frame tainted the canvas.
    const img = ictx.getImageData(0, 0, plan.inW, plan.inH)
    // Exact-length buffer reuse: a stale larger buffer would silently swallow
    // writes past its end (typed-array OOB writes are no-ops), feeding the
    // tensor a stale tail after a scale/plan change.
    const needIn = plan.inW * plan.inH * 3
    if (!this.nchwIn || this.nchwIn.length !== needIn) this.nchwIn = new Float32Array(needIn)
    imageDataToNchw(img.data, plan.inW, plan.inH, this.nchwIn)
    const inputName = session.inputNames[0] ?? 'input'
    const outputName = session.outputNames[0] ?? 'output'
    const t0 = performance.now()
    const result = await session.run({
      [inputName]: new this.ort.Tensor('float32', this.nchwIn, [1, 3, plan.inH, plan.inW]),
    })
    const inferMs = performance.now() - t0
    const out = result[outputName]
    if (!out) return null
    const outW = plan.outW
    const outH = plan.outH
    if (target.width !== outW || target.height !== outH) {
      target.width = outW
      target.height = outH
    }
    const needOut = outW * outH * 4
    if (!this.rgbaOut || this.rgbaOut.length !== needOut) this.rgbaOut = new Uint8ClampedArray(needOut)
    nchwToImageData(out.data, outW, outH, this.rgbaOut)
    const octx = target.getContext('2d')
    if (!octx) return null
    octx.putImageData(new ImageData(this.rgbaOut, outW, outH), 0, 0)
    return inferMs
  }

  dispose(): void {
    try { this.session?.release() } catch { /* already released */ }
    this.session = null
    this.backend = null
    this.ort = null
    this.inCanvas = null
    this.inCtx = null
    this.nchwIn = null
    this.rgbaOut = null
    this.busy = false
  }
}
