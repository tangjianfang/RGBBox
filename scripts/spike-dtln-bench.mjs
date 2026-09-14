/**
 * R91.3b spike: DTLN ONNX per-frame latency bench (onnxruntime-node, CPU).
 * Frame budget = block_shift 128 @16k = 8ms. Protocol mirrors
 * breizhn/DTLN real_time_processing_onnx.py (two stages, state threaded).
 */
import ort from 'onnxruntime-node'
import { homedir } from 'node:os'
import { join } from 'node:path'

const dir = process.env.DTLN_DIR
const mkInputs = (sess) => {
  const inputs = {}
  for (const inp of sess.inputMetadata) {
    const dims = inp.shape
    inputs[inp.name] = new ort.Tensor('float32',
      new Float32Array(dims.reduce((a, b) => a * (typeof b === 'number' ? b : 1), 1)),
      dims.map((d) => (typeof d === 'number' ? d : 1)))
  }
  return inputs
}

const s1 = await ort.InferenceSession.create(join(dir, 'model_1.onnx'))
const s2 = await ort.InferenceSession.create(join(dir, 'model_2.onnx'))
const in1 = mkInputs(s1)
const in2 = mkInputs(s2)
console.log('model_1 inputs:', s1.inputMetadata.map((m) => `${m.name}[${m.dimensions}]`).join(', '))
console.log('model_2 inputs:', s2.inputMetadata.map((m) => `${m.name}[${m.dimensions}]`).join(', '))

// pseudo-audio (speech-ish AR noise)
const N = 512
const SHIFT = 128
const audio = new Float32Array(SHIFT * 2000)
let v = 0
for (let i = 0; i < audio.length; i++) { v = 0.96 * v + 0.04 * (Math.random() * 2 - 1); audio[i] = v * 6 }

const inBuf = new Float32Array(N)
const outBuf = new Float32Array(N)
// reuse buffers for fft via manual DFT? Node has no FFT builtin — do a direct
// radix-2 FFT (small: 512) so the bench measures model time + real DSP cost.
function fft(re, im, inverse) { /* in-place iterative radix-2 */
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

const frames = 1500
const times = []
const mag1 = new ort.Tensor('float32', new Float32Array(257), [1, 1, 257])
const blk2 = new ort.Tensor('float32', new Float32Array(512), [1, 1, 512])
const spec = new Float32Array(257)

for (let f = 0; f < frames; f++) {
  const t0 = process.hrtime.bigint()
  inBuf.copyWithin(0, SHIFT)
  inBuf.set(audio.subarray(f * SHIFT, f * SHIFT + SHIFT), N - SHIFT)
  const re = Float32Array.from(inBuf)
  const im = new Float32Array(N)
  fft(re, im, false)
  for (let k = 0; k <= 256; k++) spec[k] = Math.hypot(re[k], im[k])
  mag1.data.set(spec)
  in1[s1.inputMetadata[0].name] = mag1
  const o1 = await s1.run(in1)
  const mask = o1[s1.outputNames[0]]
  in1[s1.inputMetadata[1].name].data.set(o1[s1.outputNames[1]].data)
  // iFFT(mag*mask*e^{jφ})
  const er = new Float32Array(N)
  const ei = new Float32Array(N)
  for (let k = 0; k <= 256; k++) {
    const m = spec[k] * mask.data[k]
    const ph = Math.atan2(im[k], re[k])
    er[k] = m * Math.cos(ph); ei[k] = m * Math.sin(ph)
    if (k > 0 && k < 256) { er[N - k] = er[k]; ei[N - k] = -ei[k] }
  }
  fft(er, ei, true)
  blk2.data.set(er)
  in2[s2.inputMetadata[0].name] = blk2
  const o2 = await s2.run(in2)
  const out = o2[s2.outputNames[0]]
  in2[s2.inputMetadata[1].name].data.set(o2[s2.outputNames[1]].data)
  outBuf.copyWithin(0, SHIFT)
  outBuf.fill(0, N - SHIFT)
  for (let i = 0; i < N; i++) outBuf[i] += out.data[i]
  times.push(Number(process.hrtime.bigint() - t0) / 1e6)
}
times.sort((a, b) => a - b)
const mean = times.reduce((a, b) => a + b, 0) / times.length
const p95 = times[Math.floor(times.length * 0.95)]
console.log(`\nframes: ${frames}  mean: ${mean.toFixed(3)} ms  p95: ${p95.toFixed(3)} ms  max: ${times[times.length - 1].toFixed(3)} ms`)
console.log(`frame budget: 8 ms  → headroom: ${(8 / mean).toFixed(1)}× (native CPU; wasm typically 1.5-2× slower)`)
