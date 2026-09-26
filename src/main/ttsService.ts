/**
 * ttsService — R173-S2/R179 离线 TTS(Kokoro-82M ONNX 经 kokoro-js)。
 *
 * R179 重构:不再依赖 transformers.js 的自动下载(其 HF 端点解析在
 * hf-mirror 下会 404/失败,用户实测 `ai.voice.err.fetch failed`)——改为
 * **自建下载器**:模型文件经显式 URL(hf-mirror 主源 + HF 官方备源)流式
 * 下载到 userData/models/kokoro-local/...,带逐文件进度事件;完成后以
 * `env.localModelPath + allowRemoteModels=false` 纯本地加载,零网络。
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { segmentsToWav } from './ttsWav'

const KOKORO_REPO = 'onnx-community/kokoro-82M-v1.0-ONNX'
export const KOKORO_SAMPLE_RATE = 24000
export const DEFAULT_VOICE = 'af_heart'

/** v1 随包预置的音色(每个 ~8MB;其余音色 P-5 再开放按需下载)。 */
export const KOKORO_BUNDLED_VOICES = ['af_heart', 'af_bella', 'am_fenrir', 'bf_emma']

export interface KokoroFileSpec {
  /** 相对 MODEL_DIR 的路径(transformers localModelPath 布局) */
  path: string
  /** 预期字节数(校验用;GET 无 content-length 时也作进度分母) */
  bytes: number
  required: boolean
}

const M = 1048576
export const KOKORO_FILES: KokoroFileSpec[] = [
  { path: 'config.json', bytes: 5 * 1024, required: true },
  // R182: integer bytes — a float total (2.6*M = 2726297.6) can never equal the
  // received count, so the exact-accounting check failed tokenizer.json forever.
  { path: 'tokenizer.json', bytes: Math.round(2.6 * M), required: true },
  { path: 'onnx/model_q4.onnx', bytes: 291 * M, required: true },
  ...KOKORO_BUNDLED_VOICES.map((v) => ({ path: `voices/${v}.bin`, bytes: 8 * M, required: false })),
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
  return {
    complete: files.filter((f) => KOKORO_FILES.find((k) => k.path === f.path)?.required).every((f) => f.present),
    files,
    kokoroInstalled: (() => { try { require.resolve('kokoro-js'); return true } catch { return false } })(),
    bundledVoices: KOKORO_BUNDLED_VOICES,
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

/** 逐文件流式下载(mirror 主源失败回落 HF 官方,每个源 2 次;`.part` 断点续传:
 *  已有分片走 `Range: bytes=N-` 追加写)。落盘用 tmp+rename 防半成品混入。 */
export async function ttsDownloadModels(
  cacheRoot: string,
  onEvent: (ev: TtsDownloadEvent) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; error?: string }> {
  const dir = kokoroModelDir(cacheRoot)
  for (const spec of KOKORO_FILES) {
    if (signal?.aborted) return { ok: false, error: 'cancelled' }
    const target = join(dir, spec.path)
    if (existsSync(target) && statSync(target).size > 1024) continue
    mkdirSync(join(target, '..'), { recursive: true })
    const partPath = `${target}.part`
    let lastErr = ''
    for (const mirror of [true, false]) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (signal?.aborted) return { ok: false, error: 'cancelled' }
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
          let received = have
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
          if (signal?.aborted) return { ok: false, error: 'cancelled' }
          await new Promise((r) => setTimeout(r, 1500)) // backoff between attempts
        }
      }
      if (lastErr === '') break
    }
    if (lastErr !== '' && spec.required) {
      onEvent({ path: spec.path, receivedBytes: 0, totalBytes: spec.bytes, done: true, error: lastErr })
      return { ok: false, error: `${spec.path}: ${lastErr}` }
    }
  }
  return { ok: true }
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
