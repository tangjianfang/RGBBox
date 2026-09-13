// R90 P1: audio AI inference service — Silero VAD + AST AudioSet classifier
// running on onnxruntime-node (CPU), same runtime as RapidOCR (R82).
// The session factory and cache-finder are injected so the whole service is
// unit-testable without downloading any model.
//
// R90 review fixes (verified against silero-vad utils_vad.py + ONNX I/O tables
// and transformers ASTFeatureExtractor):
//  - Silero v5 feeds are { input, state, sr } and outputs are { output, stateN };
//    each chunk is 64 samples of context + 1472 new samples = 1536.
//  - AST (optimum export) feed name is `input_values`.
//  - A failed InferenceSession.create must NOT stay cached (sticky rejection).
//  - disposeAudioAi() releases sessions on app quit (rapidOcrService parity).

import * as ort from 'onnxruntime-node'
import { astMelSpectrogram } from './audio/melSpectrogram'

/** Silero v5 protocol (16kHz): feed = 64-sample context + 1472 new = 1536. */
export const VAD_CHUNK = 1536
const VAD_CONTEXT = 64
const VAD_NEW_SAMPLES = VAD_CHUNK - VAD_CONTEXT // 1472
const VAD_STATE = [2, 1, 128]
const AST_TOP_K = 5
const MIN_PCM = 16000 // 1s
const MAX_PCM_VAD = 16000 * 30 // 30s
/** AST runs mel (pure-JS FFT) + inference synchronously on the main thread —
 *  cap at 10s to bound the freeze (worker_threads offload is a P2 improvement). */
export const MAX_PCM_AST = 16000 * 10

export type AudioSession = {
  run: (feeds: Record<string, ort.Tensor>) => Promise<Record<string, { data: Float32Array | BigInt64Array; dims: number[] }>>
  release?: () => Promise<void>
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
  // R90 review fix: an unsettled promise must not be cached — a rejected
  // create (corrupt file) would otherwise fail every call until app restart.
  return ort.InferenceSession.create(url, { executionProviders: ['cpu'] })
    .then((created) => {
      s[cacheKey] = Promise.resolve(created as unknown as AudioSession)
      return created as unknown as AudioSession
    }) as unknown as Promise<AudioSession>
}

/** Release cached sessions (app quit). */
export async function disposeAudioAi(): Promise<void> {
  if (!state) return
  for (const key of ['vadSession', 'astSession'] as const) {
    const p = state[key]
    if (p) {
      try {
        const sess = await p
        await sess.release?.()
      } catch { /* already gone */ }
      state[key] = null
    }
  }
}

function assertPcm(pcm: Float32Array, max: number): void {
  if (!(pcm instanceof Float32Array) || pcm.length < MIN_PCM || pcm.length > max) {
    throw Object.assign(new Error(`pcm length must be ${MIN_PCM}–${max} samples (16kHz mono)`), { hint: 'parse' })
  }
}

/** Voice-activity probability for a pcm snippet: max chunk prob across the clip. */
export async function runVad(pcm: Float32Array): Promise<{ prob: number; frames: number }> {
  assertPcm(pcm, MAX_PCM_VAD)
  requireState()
  const session = await getSession('silero_vad.onnx', 'vadSession')
  let stateData = new Float32Array(VAD_STATE[0] * VAD_STATE[1] * VAD_STATE[2])
  let context = new Float32Array(VAD_CONTEXT) // zeros for the first chunk
  let maxProb = 0
  let frames = 0
  for (let off = 0; off + VAD_NEW_SAMPLES <= pcm.length; off += VAD_NEW_SAMPLES) {
    // feed = [context (64) || new samples (1472)] = 1536
    const feed = new Float32Array(VAD_CHUNK)
    feed.set(context, 0)
    feed.set(pcm.subarray(off, off + VAD_NEW_SAMPLES), VAD_CONTEXT)
    const out = await session.run({
      input: new ort.Tensor('float32', feed, [1, VAD_CHUNK]),
      state: new ort.Tensor('float32', stateData, VAD_STATE),
      sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), [1]),
    } as never)
    const prob = (out.output.data as Float32Array)[0]
    if (prob > maxProb) maxProb = prob
    frames++
    // next context = the tail of what we just fed; state comes back as `stateN`
    context = feed.slice(VAD_CHUNK - VAD_CONTEXT)
    const stateOut = (out as Record<string, { data: Float32Array; dims: number[] }>).stateN
    if (stateOut) stateData = new Float32Array(stateOut.data)
  }
  return { prob: maxProb, frames }
}

/** AST AudioSet classification: kaldi-style fbank → logits[527] → softmax → top-K. */
export async function runAst(pcm: Float32Array): Promise<{ top: Array<{ index: number; score: number }> }> {
  assertPcm(pcm, MAX_PCM_AST)
  requireState()
  const session = await getSession('ast_audioset_int8.onnx', 'astSession')
  const mel = astMelSpectrogram(pcm)
  const tensor = new ort.Tensor('float32', mel, [1, 1024, 128])
  const out = await session.run({ input_values: tensor } as never)
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
