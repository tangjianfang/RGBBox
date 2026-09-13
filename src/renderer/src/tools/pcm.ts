// R90.9 L1: pure PCM helpers for the audio-AI pipeline. No DOM, no Electron —
// every function here is unit-testable in node.
//
// Why this exists: AudioContext({sampleRate: 16000}) is a REQUEST, not a
// guarantee — Windows drivers commonly hand back 48kHz regardless. The old
// pipeline fed whatever arrived straight into models that assume 16kHz,
// silently producing garbage. All capture adapters must run their output
// through resampleTo16k() using the context's ACTUAL sampleRate.

export const TARGET_RATE = 16000

/**
 * Linear-interpolation resample to 16kHz mono. For integer down-ratios (the
 * common 48k/44.1k→16k cases) this is a plain decimation with interpolation
 * for non-integer positions — more than sufficient for VAD/AST features.
 */
export function resampleTo16k(pcm: Float32Array, fromRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0) {
    throw new Error(`resampleTo16k: invalid source rate ${fromRate}`)
  }
  if (pcm.length === 0) return new Float32Array(0)
  if (fromRate === TARGET_RATE) return pcm

  const ratio = fromRate / TARGET_RATE
  const outLen = Math.max(1, Math.floor(pcm.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, pcm.length - 1)
    const frac = srcPos - i0
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac
  }
  return out
}

/**
 * Built-in test source: alternating 440Hz tone / silence, one second each,
 * at 16kHz / ~0.5 amplitude. Zero permissions, zero hardware — the guaranteed
 * demo path for the pipeline self-test.
 */
export function synthTestTone(seconds: number): Float32Array {
  const out = new Float32Array(TARGET_RATE * seconds)
  for (let i = 0; i < out.length; i++) {
    const second = Math.floor(i / TARGET_RATE)
    const isTone = second % 2 === 0
    if (isTone) {
      out[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / TARGET_RATE)
    }
  }
  return out
}

/** RMS loudness 0..1 (matches the main-process gauge math). */
export function rmsLevel(pcm: Float32Array): number {
  if (pcm.length === 0) return 0
  let sq = 0
  for (let i = 0; i < pcm.length; i++) sq += pcm[i] * pcm[i]
  return Math.min(1, Math.sqrt(sq / pcm.length) * 4)
}
