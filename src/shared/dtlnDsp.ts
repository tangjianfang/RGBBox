/**
 * dtlnDsp — R91.3b DTLN 降噪协议的纯 DSP 件（无 Electron/DOM 依赖）。
 *
 * 协议（镜像 breizhn/DTLN real_time_processing_onnx.py，已在 spike
 * scripts/spike-dtln-bench.mjs 中全链路验证）：16kHz、block 512、hop 128（8ms）。
 * 段1输入 = 512 块 rFFT 幅度谱 (1,1,257)；输出掩码 + LSTM 状态；掩码作用于
 * 原幅度谱后 iFFT 还原时域块；段2输入 = 该时域块 (1,1,512)，输出降噪块 +
 * 状态；输出经 hop 步进 overlap-add。本模块被 utility 处理进程引用，
 * 单测直接覆盖；渲染层 worklet（blob 字符串）实现同算法的镜像副本。
 */

export const DTLN_SAMPLE_RATE = 16000
export const DTLN_BLOCK = 512
export const DTLN_HOP = 128
export const DTLN_BINS = DTLN_BLOCK / 2 + 1 // 257

/** In-place iterative radix-2 FFT (n power of two). */
export function fftInPlace(re: Float32Array, im: Float32Array, inverse: boolean): void {
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
    const ang = (inverse ? 2 : -2) * Math.PI / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const ar = re[i + k]
        const ai = im[i + k]
        const br = re[i + k + half]
        const bi = im[i + k + half]
        const vr = br * cr - bi * ci
        const vi = br * ci + bi * cr
        re[i + k] = ar + vr
        im[i + k] = ai + vi
        re[i + k + half] = ar - vr
        im[i + k + half] = ai - vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
  if (inverse) {
    const inv = 1 / n
    for (let i = 0; i < n; i++) { re[i] *= inv; im[i] *= inv }
  }
}

/**
 * Hop-stream assembler: push() a hop (128 samples) of NEW input; get() the
 * 512-sample analysis window (oldest hop drops off). The renderer worklet and
 * the utility processor both frame audio this way — one shared, tested truth.
 */
export class DtlnFrameAssembler {
  private readonly buf = new Float32Array(DTLN_BLOCK)
  /** monotonic hop counter since construction/reset */
  hops = 0

  push(hop: Float32Array): void {
    if (hop.length !== DTLN_HOP) throw new Error(`hop must be ${DTLN_HOP} samples, got ${hop.length}`)
    this.buf.copyWithin(0, DTLN_HOP)
    this.buf.set(hop, DTLN_BLOCK - DTLN_HOP)
    this.hops++
  }

  /** Copy of the current 512-sample analysis window. */
  window(): Float32Array {
    return Float32Array.from(this.buf)
  }
}

/**
 * Overlap-add output accumulator: add() a processed 512 block (aligned with
 * the analysis window that produced it), drain() the oldest hop of output.
 * Mirrors the reference implementation's out_buffer dance.
 */
export class DtlnOlaAccumulator {
  private readonly buf = new Float32Array(DTLN_BLOCK)

  add(block: Float32Array): void {
    if (block.length !== DTLN_BLOCK) throw new Error(`block must be ${DTLN_BLOCK} samples, got ${block.length}`)
    for (let i = 0; i < DTLN_BLOCK; i++) this.buf[i] += block[i]
  }

  /** Pop the oldest hop, shift the rest, zero the tail. */
  drainHop(out: Float32Array): void {
    out.set(this.buf.subarray(0, DTLN_HOP))
    this.buf.copyWithin(0, DTLN_HOP)
    this.buf.fill(0, DTLN_BLOCK - DTLN_HOP)
  }
}

/**
 * Linear-interpolation resampler ratio math: how many output (16k) samples
 * does an input buffer of `n` samples at `inRate` produce, given the carried
 * fractional position? The returned phase is the leftover position in INPUT
 * ticks, so it lives in [0, inRate/16000).
 */
export function resampleOutputCount(n: number, inRate: number, phase: number): { count: number; phase: number } {
  const step = inRate / DTLN_SAMPLE_RATE
  let pos = phase
  let count = 0
  while (pos < n) { count++; pos += step }
  return { count, phase: pos - n }
}
