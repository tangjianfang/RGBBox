// R90 P1: AST feature extraction — log-mel spectrogram matching the
// transformers.js ASTFeatureExtractor parameters (verified from the model
// repo's preprocessor_config.json): 16kHz, 128 mel bins, 1024 frames.
// Pure functions, no onnxruntime dependency — unit-testable in node.

/** AST official normalization constants (ASTFeatureExtractor defaults). */
export const AST_MEL_MEAN = -4.2677393
export const AST_MEL_STD = 4.5689974

export const MEL_FRAMES = 1024
export const MEL_BINS = 128

const N_FFT = 400 // 25ms @ 16kHz
const HOP = 160 // 10ms @ 16kHz
const FFT_SIZE = 512 // N_FFT zero-padded to a power of two
const SPECTRUM_BINS = FFT_SIZE / 2 + 1 // 257
const MEL_FMIN = 0
const MEL_FMAX = 8000
const LOG_FLOOR = 1e-10

// ── radix-2 iterative FFT (in-place, sign=-1 forward) ─────────────────────

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  // bit-reversal permutation
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

/** Hz → mel (Slaney-free, HTK-style formula used by transformers/librosa defaults). */
function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700)
}
function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1)
}

/** Triangular mel filter bank: [numMel][spectrumBins]. */
export function buildMelFilterBank(numMel: number, fftSize: number, sampleRate: number): Float64Array[] {
  const bins = fftSize / 2 + 1
  const melPoints: number[] = []
  for (let i = 0; i < numMel + 2; i++) {
    melPoints.push(melToHz((hzToMel(MEL_FMIN) + ((hzToMel(MEL_FMAX) - hzToMel(MEL_FMIN)) * i) / (numMel + 1))))
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

let filterBankCache: Float64Array[] | null = null
let windowCache: Float64Array | null = null
let reCache: Float64Array | null = null
let imCache: Float64Array | null = null

function ensureTables(): void {
  if (filterBankCache) return
  filterBankCache = buildMelFilterBank(MEL_BINS, FFT_SIZE, SR_DEFAULT)
  // Hann window over N_FFT samples
  const win = new Float64Array(N_FFT)
  for (let i = 0; i < N_FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT)
  windowCache = win
  reCache = new Float64Array(FFT_SIZE)
  imCache = new Float64Array(FFT_SIZE)
}

const SR_DEFAULT = 16000

/** Number of spectrogram frames produced for a given pcm length (before pad/trim). */
function frameCount(len: number): number {
  if (len <= N_FFT) return 1
  return 1 + Math.floor((len - N_FFT) / HOP)
}

/**
 * pcm (16kHz mono) → normalized log-mel spectrogram, layout frame-major:
 * out[frame * 128 + bin], 1024 frames (truncated / mean-padded).
 */
export function astMelSpectrogram(pcm: Float32Array, sampleRate: number = SR_DEFAULT): Float32Array {
  if (sampleRate !== SR_DEFAULT) throw new Error(`astMelSpectrogram expects ${SR_DEFAULT}Hz input, got ${sampleRate}`)
  ensureTables()
  const win = windowCache!
  const fb = filterBankCache!
  const re = reCache!
  const im = imCache!

  const rawFrames = frameCount(pcm.length)
  const out = new Float32Array(MEL_FRAMES * MEL_BINS)
  const scratch = new Float64Array(MEL_BINS)

  let written = 0
  for (let f = 0; f < Math.min(rawFrames, MEL_FRAMES); f++) {
    const start = f * HOP
    // window + zero-pad into the FFT buffer
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = i < N_FFT ? (start + i < pcm.length ? pcm[start + i] * win[i] : 0) : 0
      im[i] = 0
    }
    fft(re, im)
    // power spectrum → mel → log → normalize
    for (let m = 0; m < MEL_BINS; m++) {
      let energy = 0
      const w = fb[m]
      for (let k = 0; k < SPECTRUM_BINS; k++) {
        energy += w[k] * (re[k] * re[k] + im[k] * im[k])
      }
      scratch[m] = Math.log(Math.max(energy, 0) + LOG_FLOOR)
    }
    for (let m = 0; m < MEL_BINS; m++) {
      out[written * MEL_BINS + m] = (scratch[m] - AST_MEL_MEAN) / AST_MEL_STD
    }
    written++
  }
  // pad remaining frames with the same constant a silent frame would have
  const padValue = (Math.log(LOG_FLOOR) - AST_MEL_MEAN) / AST_MEL_STD
  for (let i = written * MEL_BINS; i < out.length; i++) out[i] = padValue
  return out
}
