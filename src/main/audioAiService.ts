// R90 P1: audio AI inference service — Silero VAD + AST AudioSet classifier
// running on onnxruntime-node (CPU), same runtime as RapidOCR (R82).
// The session factory and cache-finder are injected so the whole service is
// unit-testable without downloading any model.

import * as ort from 'onnxruntime-node'
import { astMelSpectrogram } from './audio/melSpectrogram'

/** R90.2 hard budget: any single integrated model file must stay ≤100MB. */
export const AST_MODEL_BYTES_BUDGET = 100 * 1000 * 1000

/** Silero v5 protocol: 1536-sample (96ms @16kHz) chunks with a [2,1,128] RNN state. */
export const VAD_CHUNK = 1536
const VAD_STATE = [2, 1, 128]
const AST_TOP_K = 5
const MIN_PCM = 16000 // 1s
const MAX_PCM = 16000 * 30 // 30s

export type AudioSession = {
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, { data: Float32Array | BigInt64Array; dims: number[] }>>
}

export interface AudioAiOptions {
  modelsDir: string
  /** Resolves a file:// URL (or path) when the model file is already cached, else null. */
  findCached: (file: string) => Promise<string | null>
}

interface ServiceState {
  opts: AudioAiOptions
  vadSession: Promise<AudioSession> | null
  astSession: Promise<AudioSession> | null
}

let state: ServiceState | null = null

export function initAudioAi(opts: AudioAiOptions): void {
  state = { opts, vadSession: null, astSession: null }
}

export function resetAudioAi(): void {
  state = null
}

function requireState(): ServiceState {
  if (!state) throw new Error('audioAiService not initialized — call initAudioAi() first')
  return state
}

export async function isCached(file: string): Promise<boolean> {
  const s = requireState()
  return (await s.opts.findCached(file)) !== null
}

async function getSession(file: string, cacheKey: 'vadSession' | 'astSession'): Promise<AudioSession> {
  const s = requireState()
  const cached = s[cacheKey]
  if (cached) return cached
  const url = await s.opts.findCached(file)
  if (!url) throw Object.assign(new Error(`model not downloaded: ${file}`), { hint: 'not-downloaded' })
  const created = sessionFactory(url)
  s[cacheKey] = created
  return created
}

function sessionFactory(url: string): Promise<AudioSession> {
  return ort.InferenceSession.create(url, { executionProviders: ['cpu'] }) as unknown as Promise<AudioSession>
}

function assertPcm(pcm: Float32Array): void {
  if (!(pcm instanceof Float32Array) || pcm.length < MIN_PCM || pcm.length > MAX_PCM) {
    throw Object.assign(new Error(`pcm length must be ${MIN_PCM}–${MAX_PCM} samples (1–30s @16kHz)`), { hint: 'parse' })
  }
}

/** Voice-activity probability for a pcm snippet: max chunk prob across the clip. */
export async function runVad(pcm: Float32Array): Promise<{ prob: number; frames: number }> {
  assertPcm(pcm)
  const s = requireState()
  const session = await getSession('silero_vad.onnx', 'vadSession')
  let stateData = new Float32Array(VAD_STATE[0] * VAD_STATE[1] * VAD_STATE[2])
  let maxProb = 0
  let frames = 0
  for (let off = 0; off + VAD_CHUNK <= pcm.length; off += VAD_CHUNK) {
    const feeds = {
      x: new ort.Tensor('float32', pcm.subarray(off, off + VAD_CHUNK), [1, VAD_CHUNK]),
      state: new ort.Tensor('float32', stateData, VAD_STATE),
      sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), [1]),
    }
    const out = await session.run(feeds as never)
    const outData = out.output.data as Float32Array
    const prob = outData[0]
    if (prob > maxProb) maxProb = prob
    frames++
    // carry the RNN state across chunks; refresh the buffer each round
    const stateOut = (out as Record<string, { data: Float32Array; dims: number[] }>).stateNew
    stateData = stateOut ? new Float32Array(stateOut.data) : stateData
  }
  return { prob: maxProb, frames }
}

/** AST AudioSet classification: mel → logits[527] → softmax → top-K. */
export async function runAst(pcm: Float32Array): Promise<{ top: Array<{ index: number; score: number }> }> {
  assertPcm(pcm)
  const s = requireState()
  const session = await getSession('ast_audioset_int8.onnx', 'astSession')
  const mel = astMelSpectrogram(pcm)
  const tensor = new ort.Tensor('float32', mel, [1, 1024, 128])
  const out = await session.run({ x: tensor } as never)
  const logits = out.logits.data as Float32Array
  // softmax
  let maxL = -Infinity
  for (const v of logits) if (v > maxL) maxL = v
  const exps = new Float64Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - maxL)
    sum += exps[i]
  }
  const idx = Array.from(exps.keys()).sort((a, b) => exps[b] - exps[a]).slice(0, AST_TOP_K)
  return { top: idx.map((i) => ({ index: i, score: exps[i] / sum })) }
}
