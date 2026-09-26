/**
 * ttsService — R173-S2/R179 离线 TTS(Kokoro-82M ONNX 经 kokoro-js)。
 *
 * R179 重构:不再依赖 transformers.js 的自动下载(其 HF 端点解析在
 * hf-mirror 下会 404/失败,用户实测 `ai.voice.err.fetch failed`)——改为
 * **自建下载器**:模型文件经显式 URL(hf-mirror 主源 + HF 官方备源)流式
 * 下载到 userData/models/kokoro-local/...,带逐文件进度事件;完成后以
 * `env.localModelPath + allowRemoteModels=false` 纯本地加载,零网络。
 */
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
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
  { path: 'tokenizer.json', bytes: 2.6 * M, required: true },
  { path: 'onnx/model_q4.onnx', bytes: 291 * M, required: true },
  ...KOKORO_BUNDLED_VOICES.map((v) => ({ path: `voices/${v}.bin`, bytes: 8 * M, required: false })),
]

export function kokoroFileUrl(path: string, mirror = true): string {
  const host = mirror ? 'https://hf-mirror.com' : 'https://huggingface.co'
  return `${host}/${KOKORO_REPO}/resolve/main/${path}`
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
    const sizeOk = statSync(full).size > 1024 // >1KB heuristic vs partial file
    return { path: f.path, bytes: f.bytes, present: sizeOk, actualBytes: statSync(full).size }
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

/** 逐文件流式下载(mirror 主源失败自动回落 HF 官方);tmp 写入后 rename 防半成品。 */
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
    let lastErr = ''
    for (const mirror of [true, false]) {
      try {
        const res = await fetch(kokoroFileUrl(spec.path, mirror), { signal })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const total = Number(res.headers.get('content-length') ?? spec.bytes)
        let received = 0
        const stream = Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0])
        stream.on('data', (chunk: Buffer) => {
          received += chunk.length
          onEvent({ path: spec.path, receivedBytes: received, totalBytes: total, done: false })
        })
        await pipeline(stream, createWriteStream(`${target}.part`))
        if (received < 1024) throw new Error('empty download')
        renameSync(`${target}.part`, target)
        onEvent({ path: spec.path, receivedBytes: received, totalBytes: received, done: true })
        lastErr = ''
        break
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (signal?.aborted) return { ok: false, error: 'cancelled' }
      }
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
