// R90 P1: AST feature extraction — log-mel fbank matching the torchaudio
// kaldi.fbank pipeline that transformers' ASTFeatureExtractor wraps (the
// model was quantized/trained against exactly those features):
//   16kHz · 400-sample window (25ms) · 160 hop (10ms) · povey window ·
//   remove_dc_offset · preemphasis 0.97 · 512-point FFT · power spectrum ·
//   kaldi mel filterbank (low 20Hz, high 8000Hz, 128 bins) · log(x + 1e-6) ·
//   pad frames with 0.0 (post-log) to 1024 · normalize (x - mean) / (std * 2).
// Pure functions, no onnxruntime dependency — unit-testable in node.

/** AST official normalization constants (ASTFeatureExtractor defaults). */
export const AST_MEL_MEAN = -4.2677393
export const AST_MEL_STD = 4.5689974

export const MEL_FRAMES = 1024
export const MEL_BINS = 128

const N_FFT = 400 // 25ms @ 16kHz
const HOP = 160 // 10ms @ 16kHz
const FFT_SIZE = 512 // round-to-power-of-two(N_FFT), kaldi convention
const SPECTRUM_BINS = FFT_SIZE / 2 + 1 // 257
const PREEMPH = 0.97
const MEL_FMIN = 20 // kaldi default (NOT 0)
const MEL_FMAX = 8000 // = nyquist @16kHz
const LOG_FLOOR = 1e-6

// ── radix-2 iterative FFT (in-place, forward) ─────────────────────────────

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

/** Hz → mel (kaldi: 1127·ln(1+f/700), numerically == 2595·log10(1+f/700)). */
function hzToMel(hz: number): number {
  return 1127 * Math.log(1 + hz / 700)
}
function melToHz(mel: number): number {
  return 700 * (Math.exp(mel / 1127) - 1)
}

/** Kaldi-style triangular mel filter bank: [numMel][spectrumBins]. */
export function buildMelFilterBank(numMel: number, fftSize: number, sampleRate: number): Float64Array[] {
  const bins = fftSize / 2 + 1
  const melLow = hzToMel(MEL_FMIN)
  const melHigh = hzToMel(MEL_FMAX)
  const melPoints: number[] = []
  for (let i = 0; i < numMel + 2; i++) {
    melPoints.push(melToHz(melLow + ((melHigh - melLow) * i) / (numMel + 1)))
  }
  const binOf = (hz: number): number => (hz * fftSize) / sampleRate
  const fb: Float64Array[] = []
  for (let m = 0; m < numMel; m++) {
    const weights = new Float64Array(bins)
    const left = binOf(melPoints[m])
    const center = binOf(melPoints[m + 1])
    const right = binOf(melPoints[m + 2])
    for (let k = 0; k < bins; k++) {
      if (k >= left && k <= center && center > left) {
        weights[k] = (k - left) / (center - left)
      } else if (k > center && k <= right && right > center) {
        weights[k] = (right - k) / (right - center)
      }
    }
    fb.push(weights)
  }
  return fb
}

let tablesCache: { fb: Float64Array[]; win: Float64Array; re: Float64Array; im: Float64Array } | null = null

function ensureTables(): void {
  if (tablesCache) return
  const fb = buildMelFilterBank(MEL_BINS, FFT_SIZE, 16000)
  // povey window over N_FFT samples: (0.5 - 0.5·cos(2πi/(N-1)))²
  const win = new Float64Array(N_FFT)
  for (let i = 0; i < N_FFT; i++) {
    const base = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N_FFT - 1))
    win[i] = base * base
  }
  tablesCache = { fb, win, re: new Float64Array(FFT_SIZE), im: new Float64Array(FFT_SIZE) }
}

/** kaldi snip_edges: only full frames are emitted. */
function frameCount(len: number): number {
  if (len < N_FFT) return 0
  return 1 + Math.floor((len - N_FFT) / HOP)
}

/**
 * pcm (16kHz mono) → normalized log-mel fbank, layout frame-major:
 * out[frame * 128 + bin], 1024 frames (truncated / zero-filled post-log).
 */
export function astMelSpectrogram(pcm: Float32Array, sampleRate: number = 16000): Float32Array {
  if (sampleRate !== 16000) throw new Error(`AUDIOAI_RATE: expected 16000Hz, got ${sampleRate}`)
  ensureTables()
  const { fb, win, re, im } = tablesCache!

  const rawFrames = frameCount(pcm.length)
  const out = new Float32Array(MEL_FRAMES * MEL_BINS)
  const frameLog = new Float64Array(MEL_BINS)

  const norm = (v: number): number => (v - AST_MEL_MEAN) / (AST_MEL_STD * 2)

  let written = 0
  for (let f = 0; f < Math.min(rawFrames, MEL_FRAMES); f++) {
    const start = f * HOP
    // kaldi windowing: remove DC offset → preemphasis → povey window → pad
    let mean = 0
    for (let i = 0; i < N_FFT; i++) mean += start + i < pcm.length ? pcm[start + i] : 0
    mean /= N_FFT
    let prev = 0
    for (let i = 0; i < FFT_SIZE; i++) {
      if (i < N_FFT && start + i < pcm.length) {
        const v = pcm[start + i] - mean
        const emphasized = v - PREEMPH * prev
        prev = v
        re[i] = emphasized * win[i]
      } else {
        re[i] = 0
      }
      im[i] = 0
    }
    fft(re, im)
    for (let m = 0; m < MEL_BINS; m++) {
      let energy = 0
      const w = fb[m]
      for (let k = 0; k < SPECTRUM_BINS; k++) {
        energy += w[k] * (re[k] * re[k] + im[k] * im[k])
      }
      frameLog[m] = Math.log(Math.max(energy, 0) + LOG_FLOOR)
    }
    for (let m = 0; m < MEL_BINS; m++) {
      out[written * MEL_BINS + m] = norm(frameLog[m])
    }
    written++
  }
  // kaldi/transformers pad post-log frames with 0.0 (before normalization)
  const padValue = norm(0)
  for (let i = written * MEL_BINS; i < out.length; i++) out[i] = padValue
  return out
}
