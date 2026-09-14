/**
 * denoiseWorkletSource — R91.3b DTLN 中继 worklet 源码（Blob URL 注入，
 * 避开 electron-vite 对 .ts AudioWorklet 的构建缺口，dev/prod 同径）。
 *
 * 算法与 shared/dtlnDsp 同源（那边有单测，这边实机验证）：
 *   入：ctx 采样率 → 线性插值降到 16k → 每 128 样一个 hop → 维护 512 滑窗
 *       → 每 2 窗一批 port.postMessage（渲染层 → IPC → utilityProcess DTLN）
 *   出：返回的降噪 hop 与原始 hop 成对（1:1，天然等延迟）→ strength 干湿混合
 *       → 升回 ctx 采样率（多余样本进 ctx 域 FIFO 不丢弃）
 *   旁路（未启用）：零延迟直通。启用瞬间重置全部状态；预缓冲 3 hop（24ms）
 *   后开闸；IPC 欠载时输出静音但 wet/dry 配对关系保持。
 */
export const DENOISE_WORKLET_SOURCE = /* js */ `
class Fifo {
  constructor(cap) {
    this.buf = new Float32Array(cap); this.start = 0; this.len = 0
  }
  push(arr) {
    if (this.len + arr.length > this.buf.length) {
      const nb = new Float32Array(Math.max(this.buf.length * 2, this.len + arr.length))
      for (let i = 0; i < this.len; i++) nb[i] = this.buf[(this.start + i) % this.buf.length]
      this.buf = nb; this.start = 0
    }
    const end = this.start + this.len
    for (let i = 0; i < arr.length; i++) this.buf[(end + i) % this.buf.length] = arr[i]
    this.len += arr.length
  }
  pull(n, out) {
    const m = Math.min(n, this.len)
    for (let i = 0; i < m; i++) out[i] = this.buf[(this.start + i) % this.buf.length]
    this.start = (this.start + m) % this.buf.length
    this.len -= m
    return m
  }
}

/** Streaming linear rate converter: absolute input positions advance by
 *  step per emitted output; interpolation across [prev, current] input. */
class RateConverter {
  constructor(inRate, outRate) { this.step = inRate / outRate; this.pos = 0; this.prev = 0 }
  push(input, cb) {
    const n = input.length
    while (this.pos < n) {
      const i = Math.floor(this.pos)
      const frac = this.pos - i
      const a = i === 0 ? this.prev : input[i - 1]
      cb(a + (input[i] - a) * frac)
      this.pos += this.step
    }
    this.pos -= n
    this.prev = input[n - 1]
  }
}

const HOP = 128, BLOCK = 512, PRIME_HOPS = 3, BATCH = 2

class DtlmRelayProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.enabled = false
    this.strength = 1
    this.down = null        // ctxRate → 16k
    this.up = null          // 16k → ctxRate (streaming, with carry)
    this.window = new Float32Array(BLOCK)
    this.hopBuf = new Float32Array(HOP)
    this.hopFill = 0
    this.batch = []
    this.seq = 1
    this.wet = []           // processed hops from the utility process
    this.dry = []           // original hops, 1:1 pairing with wet
    this.mixed16 = new Fifo(8192)  // 16k-domain mixed output
    this.outCtx = new Fifo(8192)   // ctx-rate output backlog
    this.mixedHops = 0
    this.port.onmessage = (e) => {
      const m = e.data
      if (m.type === 'enable') {
        this.enabled = m.value
        if (m.value) this.resetDsp()
      } else if (m.type === 'strength') {
        this.strength = m.value
      } else if (m.type === 'frames') {
        for (const hop of m.blocks) this.wet.push(hop)
      }
    }
  }

  resetDsp() {
    this.down = new RateConverter(sampleRate, 16000)
    this.up = new RateConverter(16000, sampleRate)
    this.window.fill(0)
    this.hopFill = 0
    this.batch = []
    this.wet = []
    this.dry = []
    this.mixed16 = new Fifo(8192)
    this.outCtx = new Fifo(8192)
    this.mixedHops = 0
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0] ? inputs[0][0] : null
    const output = outputs[0][0]
    const n = output.length
    if (!input) { output.fill(0); return true }
    if (!this.enabled) {
      // R94 fix: per-channel passthrough. The old single-channel copy left the
      // RIGHT output silent — "L loud, R mute" asymmetry whenever the worklet
      // sat in the chain with denoise off (enabled once, then disabled).
      for (let c = 0; c < outputs[0].length; c++) {
        const ich = inputs[0] && inputs[0][c]
        const och = outputs[0][c]
        if (ich && och) och.set(ich.length === och.length ? ich : ich.subarray(0, och.length))
        else if (och) och.fill(0)
      }
      return true
    }

    // ── down: 16k samples → hop assembly → window slide → batch dispatch ──
    this.down.push(input, (s16) => {
      this.hopBuf[this.hopFill++] = s16
      if (this.hopFill === HOP) {
        this.hopFill = 0
        this.window.copyWithin(0, HOP)
        this.window.set(this.hopBuf, BLOCK - HOP)
        this.dry.push(Float32Array.from(this.hopBuf))
        this.batch.push(Float32Array.from(this.window))
        if (this.batch.length >= BATCH) {
          this.port.postMessage({ type: 'send', id: this.seq++, blocks: this.batch })
          this.batch = []
        }
      }
    })

    // ── mix completed wet/dry pairs into the 16k fifo ──
    while (this.wet.length > 0 && this.dry.length > 0) {
      const w = this.wet.shift()
      const d = this.dry.shift()
      const mixed = new Float32Array(HOP)
      const k = this.strength
      for (let i = 0; i < HOP; i++) mixed[i] = d[i] * (1 - k) + w[i] * k
      this.mixed16.push(mixed)
      this.mixedHops++
    }

    // ── up: convert backlog 16k → ctx rate (excess kept in outCtx) ──
    // The converter's internal prev carries interpolation history across
    // pushes — no manual sample prepending.
    if (this.mixedHops >= PRIME_HOPS && this.mixed16.len > 0) {
      const avail = this.mixed16.len
      const arr = new Float32Array(avail)
      this.mixed16.pull(avail, arr)
      const maxOut = Math.ceil(avail * (sampleRate / 16000)) + 2
      const emitted = new Float32Array(maxOut)
      let ei = 0
      this.up.push(arr, (s) => { if (ei < maxOut) emitted[ei++] = s })
      if (ei > 0) this.outCtx.push(emitted.subarray(0, ei))
    }

    // ── emit: drain outCtx into this quantum; zero-fill any shortfall ──
    const got = this.outCtx.pull(n, output)
    for (let i = got; i < n; i++) output[i] = 0
    // DTLN is mono — duplicate channel 0 so a stereo graph stays balanced
    const ch1 = outputs[0][1]
    if (ch1) ch1.set(output)
    return true
  }
}

registerProcessor('dtln-relay', DtlmRelayProcessor)
`
