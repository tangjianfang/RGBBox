/**
 * ttsService — R173-S2/R179 离线 TTS(Kokoro-82M ONNX 经 kokoro-js)。
 *
 * R179 重构:不再依赖 transformers.js 的自动下载(其 HF 端点解析在
 * hf-mirror 下会 404/失败,用户实测 `ai.voice.err.fetch failed`)——改为
 * **自建下载器**:模型文件经显式 URL(hf-mirror 主源 + HF 官方备源)流式
 * 下载到 userData/models/kokoro-local/...,带逐文件进度事件;完成后以
 * `env.localModelPath + allowRemoteModels=false` 纯本地加载,零网络。
 */
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { segmentsToWav } from './ttsWav'
import { KOKORO_VOICE_CATALOG } from '../shared/kokoroVoices'

const KOKORO_REPO = 'onnx-community/kokoro-82M-v1.0-ONNX'
export const KOKORO_SAMPLE_RATE = 24000
export const DEFAULT_VOICE = 'af_heart'

/** v1 随包预置的音色(每个 ~8MB;其余音色 P-5 再开放按需下载)。 */
export const KOKORO_BUNDLED_VOICES = ['af_heart', 'af_bella', 'am_fenrir', 'bf_emma']

// R187: catalog + labels live in shared (renderer picker needs them too)
export { KOKORO_VOICE_CATALOG, voiceLabel } from '../shared/kokoroVoices'

export interface KokoroFileSpec {
  /** 相对 MODEL_DIR 的路径(transformers localModelPath 布局) */
  path: string
  /** 预期字节数(校验用;GET 无 content-length 时也作进度分母) */
  bytes: number
  required: boolean
}

// R192: bytes are the API-reported upstream sizes (hf-mirror tree API,
// 2026-09-26). The old estimates were wrong at the SOURCE — upstream
// tokenizer.json is a 3,497-byte character-level tokenizer (NOT a 2.6MB LFS
// blob), so the exact-accounting check rejected the COMPLETE file on every
// attempt ("size mismatch 3497/2726298"). Real total ≈ 293 MB.
export const KOKORO_FILES: KokoroFileSpec[] = [
  { path: 'config.json', bytes: 44, required: true },
  { path: 'tokenizer.json', bytes: 3497, required: true },
  { path: 'onnx/model_q4.onnx', bytes: 305_215_966, required: true },
  ...KOKORO_BUNDLED_VOICES.map((v) => ({ path: `voices/${v}.bin`, bytes: 522_240, required: false })),
]

export function kokoroFileUrl(path: string, mirror = true): string {
  const host = mirror ? 'https://hf-mirror.com' : 'https://huggingface.co'
  // ?download=true forces Content-Disposition: attachment — without it some
  // CDN responses come back as an HTML page (a 3497-byte one poisoned
  // tokenizer.json in the field) that passes HTTP 200.
  return `${host}/${KOKORO_REPO}/resolve/main/${path}?download=true`
}

/** 布局:cacheRoot/onnx-community/kokoro-82M-v1.0-ONNX/<path>(transformers localModelPath 兼容) */
export function kokoroModelDir(cacheRoot: string): string {
  return join(cacheRoot, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
}

export interface TtsModelFileStatus { path: string; bytes: number; present: boolean; actualBytes?: number }
export interface TtsModelStatus {
  complete: boolean
  files: TtsModelFileStatus[]
  /** 引擎运行时(kokoro-js 包本体)是否可用。 */
  kokoroInstalled: boolean
  bundledVoices: string[]
  /** R187: 音色 .bin 已在盘上的 id(含按需下载的目录外音色)。 */
  voices: string[]
}

export function ttsModelStatus(cacheRoot: string): TtsModelStatus {
  const dir = kokoroModelDir(cacheRoot)
  const files: TtsModelFileStatus[] = KOKORO_FILES.map((f) => {
    const full = join(dir, f.path)
    if (!existsSync(full)) return { path: f.path, bytes: f.bytes, present: false }
    // R179: the downloader enforces exact content-length accounting, so any
    // on-disk size >0 means the file completed (the old >1KB heuristic
    // misclassified small legit files like config.json).
    const size = statSync(full).size
    return { path: f.path, bytes: f.bytes, present: size > 0, actualBytes: size }
  })
  // R187: scan the voices dir for every downloaded voice bin (catalog + any)
  let voices: string[] = []
  try {
    voices = readdirSync(join(dir, 'voices'))
      .filter((f) => f.endsWith('.bin') && KOKORO_VOICE_CATALOG.includes(f.replace(/\.bin$/, '')))
      .map((f) => f.replace(/\.bin$/, ''))
  } catch { /* no voices dir yet */ }
  return {
    complete: files.filter((f) => KOKORO_FILES.find((k) => k.path === f.path)?.required).every((f) => f.present),
    files,
    kokoroInstalled: (() => { try { require.resolve('kokoro-js'); return true } catch { return false } })(),
    bundledVoices: KOKORO_BUNDLED_VOICES,
    voices,
  }
}

export interface TtsDownloadEvent {
  path: string
  receivedBytes: number
  totalBytes: number
  done: boolean
  error?: string
}

/** R179.1: download through Electron's network stack (Chromium) — it follows
 *  the system proxy, which plain Node fetch (undici) ignores. Node fetch is
 *  the fallback so this module stays unit-testable outside Electron. */
interface FetchLike { ok: boolean; status: number; headers: { get(name: string): string | null }; body: unknown }
async function xfetch(url: string, opts?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<FetchLike> {
  try {
    const { net } = await import('electron')
    if (net?.fetch) return (await net.fetch(url, { signal: opts?.signal, headers: opts?.headers, bypassCustomProtocolHandlers: true })) as unknown as FetchLike
  } catch { /* not in Electron (tests) */ }
  return fetch(url, { signal: opts?.signal, headers: opts?.headers }) as unknown as FetchLike
}

/** R182: hf-mirror sometimes answers 200 with an HTML notice page (3497B) —
 *  detect and reject it so the retry/fallback chain can pick another source. */
export function looksLikeHtmlPage(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString('latin1').trimStart().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<body')
}

/** R185: 单文件下载——mirror 主源失败回落 HF 官方,每源 2 次;`.part` 断点续传
 *  (Range 追加写)、416 毒分片自愈、首块 HTML 页检测、精确字节对账、tmp+rename
 *  原子落盘。返回 ''=成功(或已存在),否则为错误描述。 */
async function downloadOneFile(
  spec: KokoroFileSpec,
  dir: string,
  onEvent: (ev: TtsDownloadEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const target = join(dir, spec.path)
  if (existsSync(target) && statSync(target).size > 1024) return ''
  mkdirSync(join(target, '..'), { recursive: true })
  const partPath = `${target}.part`
  let lastErr = ''
  for (const mirror of [true, false]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) return 'cancelled'
      try {
        // resume: continue from an existing .part when the server honors Range
        let have = existsSync(partPath) ? statSync(partPath).size : 0
        const useRange = have > 0
        const res = await xfetch(kokoroFileUrl(spec.path, mirror), {
          signal,
          headers: useRange ? { Range: `bytes=${have}-` } : undefined,
        })
        // R179.2: 416 = the local .part is poisoned (0-byte/oversized from an
        // earlier crash) — drop it and retry this attempt as a full download
        if (res.status === 416 && useRange) {
          rmSync(partPath, { force: true })
          have = 0
          attempt -= 1 // retry the same attempt slot without consuming it
          continue
        }
        if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`)
        const resuming = res.status === 206 && have > 0
        const lenHeader = Number(res.headers.get('content-length') ?? 0)
        const total = resuming ? have + lenHeader : (lenHeader || spec.bytes)
        // R192: a 200 full-body answer to a Range request OVERWRITES the part
        // (flags 'w') — counting the stale `have` on top double-counted bytes
        // and failed accounting on every attempt. Only 206 resumes add `have`.
        let received = resuming ? have : 0
        const stream = Readable.fromWeb((res as unknown as { body: Parameters<typeof Readable.fromWeb>[0] }).body)
        const out = createWriteStream(partPath, { flags: resuming ? 'a' : 'w' })
        let firstChunkChecked = false
        stream.on('data', (chunk: Buffer) => {
          if (!firstChunkChecked) {
            firstChunkChecked = true
            const head = Buffer.from(chunk.subarray(0, 64)).toString('latin1').trimStart().toLowerCase()
            if (head.startsWith('<!doctype') || head.startsWith('<html')) {
              stream.destroy()
              out.destroy()
              rmSync(partPath, { force: true })
              onEvent({ path: spec.path, receivedBytes: 0, totalBytes: total, done: true, error: 'mirror returned an HTML page' })
              lastErr = 'mirror returned an HTML page instead of the file'
              stream.emit('error', new Error(lastErr))
              return
            }
          }
          received += chunk.length
          onEvent({ path: spec.path, receivedBytes: received, totalBytes: total, done: false })
        })
        await pipeline(stream, out)
        // exact accounting — a short body means a truncated/corrupt file
        if (total > 0 && received !== total) {
          rmSync(partPath, { force: true })
          throw new Error(`size mismatch ${received}/${total}`)
        }
        renameSync(partPath, target)
        onEvent({ path: spec.path, receivedBytes: received, totalBytes: received, done: true })
        lastErr = ''
        break
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (signal?.aborted) return 'cancelled'
        await new Promise((r) => setTimeout(r, 1500)) // backoff between attempts
      }
    }
    if (lastErr === '') break
  }
  if (lastErr !== '' && spec.required) {
    onEvent({ path: spec.path, receivedBytes: 0, totalBytes: spec.bytes, done: true, error: lastErr })
    return `${spec.path}: ${lastErr}`
  }
  return ''
}

/** 下载全部(或 `only` 指定的)缺失文件。R185: 3 路并发——291MB 主模型不再被
 *  5KB 的 config.json 串行阻塞;单文件失败不再中断其余文件(可单独重试)。 */
export async function ttsDownloadModels(
  cacheRoot: string,
  onEvent: (ev: TtsDownloadEvent) => void,
  signal?: AbortSignal,
  opts?: { only?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const dir = kokoroModelDir(cacheRoot)
  const specs = KOKORO_FILES.filter((f) => opts?.only === undefined || opts.only.includes(f.path))
  const queue = [...specs]
  const failures: string[] = []
  const worker = async (): Promise<void> => {
    for (let spec = queue.shift(); spec !== undefined; spec = queue.shift()) {
      if (signal?.aborted) return
      const err = await downloadOneFile(spec, dir, onEvent, signal)
      if (err !== '') failures.push(err)
      if (signal?.aborted) return
    }
  }
  const lanes = Math.min(3, specs.length)
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  if (signal?.aborted) return { ok: false, error: 'cancelled' }
  return failures.length > 0 ? { ok: false, error: failures.join('; ') } : { ok: true }
}

/** R187: 按需下载单个音色(目录内 55 个之一;~8MB)。复用 downloadOneFile 的
 *  Range 续传/HTML 页检测/字节对账;音色不入 KOKORO_FILES,complete 语义不变。 */
export async function ttsDownloadVoice(
  cacheRoot: string,
  voice: string,
  onEvent: (ev: TtsDownloadEvent) => void,
): Promise<{ ok: boolean; error?: string }> {
  if (!KOKORO_VOICE_CATALOG.includes(voice)) return { ok: false, error: 'unknown-voice' }
  const err = await downloadOneFile(
    { path: `voices/${voice}.bin`, bytes: 522_240, required: false },
    kokoroModelDir(cacheRoot),
    (ev) => onEvent({ ...ev, path: `voices/${voice}.bin` }),
  )
  return err === '' ? { ok: true } : { ok: false, error: err }
}

// ── 引擎(纯本地加载)───────────────────────────────────────────────────────

interface KokoroTtsInstance {
  generate: (text: string, opts?: { voice?: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate?: number }>
}

let enginePromise: Promise<KokoroTtsInstance> | null = null

async function getEngine(cacheRoot: string): Promise<KokoroTtsInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const status = ttsModelStatus(cacheRoot)
      if (!status.complete) throw new Error('model-not-ready')
      const mod = (await import('kokoro-js')) as unknown as {
        KokoroTTS?: { from_pretrained: (repo: string, opts: Record<string, unknown>) => Promise<KokoroTtsInstance> }
        env?: { localModelPath?: string; allowRemoteModels?: boolean; cacheDir?: string }
      }
      if (!mod.KokoroTTS) throw new Error('KokoroTTS export missing')
      // R179: 纯本地——文件由我们的下载器落盘,transformers 不再触网。
      if (mod.env) {
        mod.env.allowRemoteModels = false
        mod.env.localModelPath = join(cacheRoot, 'kokoro-local')
      }
      return mod.KokoroTTS.from_pretrained(KOKORO_REPO, { dtype: 'q4', device: 'cpu' })
    })().catch((err) => {
      enginePromise = null
      throw err
    })
  }
  return enginePromise
}

export async function ttsSynthesize(
  segments: string[],
  opts: { voice?: string; speed?: number; cacheDir: string },
): Promise<{ ok: boolean; wav?: Buffer; sampleRate?: number; error?: string }> {
  if (segments.length === 0) return { ok: false, error: 'empty' }
  try {
    const engine = await getEngine(opts.cacheDir)
    const voice = opts.voice && opts.voice.trim() !== '' ? opts.voice.trim() : DEFAULT_VOICE
    const speed = typeof opts.speed === 'number' && opts.speed > 0 ? opts.speed : 1
    const audio: Float32Array[] = []
    for (const seg of segments) {
      const out = await engine.generate(seg, { voice, speed })
      audio.push(out.audio)
    }
    return { ok: true, wav: segmentsToWav(audio, KOKORO_SAMPLE_RATE), sampleRate: KOKORO_SAMPLE_RATE }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
