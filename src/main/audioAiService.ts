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

// ── R90.8: streaming session (continuous detection for the AI Lab + players) ──

const AST_WINDOW = 16000 * 3 // 3s rolling buffer
const AST_CADENCE_MS = 1200

interface StreamSession {
  vadState: Float32Array
  context: Float32Array
  carry: Float32Array // partial VAD chunk awaiting more samples
  ring: Float32Array // last 3s of audio for AST
  ringFill: number
  lastAstAt: number
}

let stream: StreamSession | null = null

/** Start (or restart) the continuous-detection session. */
export function startStream(): void {
  requireState()
  stream = {
    vadState: new Float32Array(VAD_STATE[0] * VAD_STATE[1] * VAD_STATE[2]),
    context: new Float32Array(VAD_CONTEXT),
    carry: new Float32Array(0),
    ring: new Float32Array(AST_WINDOW),
    ringFill: 0,
    lastAstAt: 0,
  }
}

export function stopStream(): void {
  stream = null
}

/**
 * Feed accumulated pcm (16kHz mono) into the session. Runs VAD over every
 * complete chunk (context+state carried across feeds) and — at most every
 * AST_CADENCE_MS — classifies the last 3s window. Returns the latest values.
 */
export interface StreamFeedResult {
  prob: number
  rms: number
  astState: 'running' | 'waiting-audio' | 'cadence'
  top?: Array<{ index: number; score: number }>
}

// R90.8 review: AST inference blocks the main thread for hundreds of ms while
// the renderer keeps feeding every 300ms — serialize feeds so overlapping
// invokes cannot interleave VAD state/ring mutations.
let feedChain: Promise<unknown> = Promise.resolve()

export function feedStream(pcm: Float32Array): Promise<StreamFeedResult> {
  const run = feedChain.then(
    () => feedStreamInner(pcm),
    () => feedStreamInner(pcm),
  ) as Promise<StreamFeedResult>
  feedChain = run.then(() => undefined, () => undefined)
  return run
}

async function feedStreamInner(pcm: Float32Array): Promise<StreamFeedResult> {
  if (!stream) throw new Error('no active audio stream — call startStream() first')
  requireState()

  // ── VAD: prepend any carry, then consume complete 1536 chunks ──
  const combined = new Float32Array(stream.carry.length + pcm.length)
  combined.set(stream.carry, 0)
  combined.set(pcm, stream.carry.length)
  let pos = 0
  let prob = -1
  while (pos + VAD_CHUNK <= combined.length) {
    const feed = new Float32Array(VAD_CHUNK)
    feed.set(stream.context, 0)
    feed.set(combined.subarray(pos, pos + VAD_NEW_SAMPLES), VAD_CONTEXT)
    const vadSession = await getSession('silero_vad.onnx', 'vadSession')
    const out = await vadSession.run({
      input: new ort.Tensor('float32', feed, [1, VAD_CHUNK]),
      state: new ort.Tensor('float32', stream.vadState, VAD_STATE),
      sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), [1]),
    } as never)
    const p = (out.output.data as Float32Array)[0]
    if (p > prob) prob = p
    stream.context = feed.slice(VAD_CHUNK - VAD_CONTEXT)
    const stateOut = (out as Record<string, { data: Float32Array; dims: number[] }>).stateN
    if (stateOut) stream.vadState = new Float32Array(stateOut.data)
    pos += VAD_NEW_SAMPLES
  }
  stream.carry = combined.slice(pos)

  // ── AST: rolling 3s window, refreshed at most every AST_CADENCE_MS ──
  const incoming = pcm.length
  if (incoming >= AST_WINDOW) {
    stream.ring.set(pcm.subarray(incoming - AST_WINDOW))
    stream.ringFill = AST_WINDOW
  } else {
    const keep = Math.min(stream.ringFill, AST_WINDOW - incoming)
    stream.ring.copyWithin(0, stream.ringFill - keep)
    stream.ring.set(pcm, keep)
    stream.ringFill = keep + incoming
  }
  let top: Array<{ index: number; score: number }> | undefined
  let astState: 'running' | 'waiting-audio' | 'cadence' = 'cadence'
  const now = Date.now()
  if (stream.ringFill >= 16000 && now - stream.lastAstAt >= AST_CADENCE_MS) {
    astState = 'running'
    stream.lastAstAt = now
    const astSession = await getSession('ast_audioset_int8.onnx', 'astSession')
    const mel = astMelSpectrogram(stream.ring)
    const out = await astSession.run({ input_values: new ort.Tensor('float32', mel, [1, 1024, 128]) } as never)
    const logits = out.logits.data as Float32Array
    let maxL = -Infinity
    for (const v of logits) if (v > maxL) maxL = v
    const exps = new Float64Array(logits.length)
    let sum = 0
    for (let i = 0; i < logits.length; i++) {
      exps[i] = Math.exp(logits[i] - maxL)
      sum += exps[i]
    }
    top = Array.from(exps.keys()).sort((a, b) => exps[b] - exps[a]).slice(0, AST_TOP_K)
      .map((i) => ({ index: i, score: exps[i] / sum }))
  }
  // loudness of this batch — the UI's "is capture actually receiving audio" gauge
  let sq = 0
  for (let i = 0; i < pcm.length; i++) sq += pcm[i] * pcm[i]
  const rms = Math.min(1, Math.sqrt(sq / Math.max(1, pcm.length)) * 4)

  return { prob: Math.max(prob, 0), rms, top, astState }
}
