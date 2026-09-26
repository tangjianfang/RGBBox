/**
 * ttsService — R173-S2 离线 TTS(Kokoro-82M ONNX 经 kokoro-js)。
 *
 * - kokoro-js 按需动态加载(依赖未装/加载失败 → engine-unavailable,声文 Tab
 *   回落系统引擎,不阻塞 UI);
 * - 模型权重走 transformers.js 自身的下载(HF_ENDPOINT 默认指到 hf-mirror,
 *   缓存目录固定在 userData/models/hf);
 * - 实例与音色缓存常驻;synthesis 产出 Float32@24kHz → segmentsToWav。
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { segmentsToWav } from './ttsWav'

const KOKORO_REPO = 'onnx-community/kokoro-82M-v1.0-ONNX'
export const KOKORO_SAMPLE_RATE = 24000
export const DEFAULT_VOICE = 'af_heart'

interface KokoroTtsInstance {
  generate: (text: string, opts?: { voice?: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate?: number }>
}

let enginePromise: Promise<KokoroTtsInstance> | null = null

export async function ttsEngineStatus(): Promise<{ kokoroInstalled: boolean; modelHint: string }> {
  try {
    await import('kokoro-js')
    return { kokoroInstalled: true, modelHint: 'first-synthesis-downloads' }
  } catch {
    return { kokoroInstalled: false, modelHint: 'engine-unavailable' }
  }
}

async function getEngine(cacheDir: string): Promise<KokoroTtsInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = 'https://hf-mirror.com'
      if (!process.env.TRANSFORMERS_CACHE) process.env.TRANSFORMERS_CACHE = join(cacheDir, 'hf')
      mkdirSync(join(cacheDir, 'hf'), { recursive: true })
      const mod = (await import('kokoro-js')) as { KokoroTTS?: { from_pretrained: (repo: string, opts: Record<string, unknown>) => Promise<KokoroTtsInstance> } }
      if (!mod.KokoroTTS) throw new Error('KokoroTTS export missing')
      return mod.KokoroTTS.from_pretrained(KOKORO_REPO, { dtype: 'q8', device: 'cpu' })
    })().catch((err) => {
      enginePromise = null // allow retry on next call
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
    const wav = segmentsToWav(audio, KOKORO_SAMPLE_RATE)
    return { ok: true, wav, sampleRate: KOKORO_SAMPLE_RATE }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
