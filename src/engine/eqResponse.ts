// R51.5: 纯 TS 频率响应计算（无 DOM/WebAudio 依赖，符合 engine 层约定）。
// 按 Web Audio BiquadFilterNode 标准二阶节传递函数实现，用于 EQ 曲线图绘制。

export type EqFilterType =
  | 'peaking' | 'lowshelf' | 'highshelf'
  | 'notch' | 'lowpass' | 'highpass' | 'bandpass'

export interface EqBand {
  id: string
  type: EqFilterType
  freq: number   // Hz
  gain: number   // dB
  Q: number      // 0.1..20
}

// 复数 {re, im}
interface Complex { re: number; im: number }
const cmul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cdiv = (n: Complex, d: Complex): Complex => {
  const denom = d.re * d.re + d.im * d.im
  return { re: (n.re * d.re + n.im * d.im) / denom, im: (n.im * d.re - n.re * d.im) / denom }
}

// 返回单个 BiquadFilter 在 freqHz 处的复频率响应 H(f)。
// 系数 a0..b2 按 Web Audio spec 二阶节公式（normalized digital filter）。
function biquadResponse(band: EqBand, sampleRate: number, freqHz: number): Complex {
  const { type, freq, gain, Q } = band
  const A = Math.pow(10, gain / 40) // peaking/shelf 用
  const w0 = (2 * Math.PI * freq) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * Q)

  // 标准 biquad 系数（b0,b1,b2 / a0,a1,a2），a0 归一化后 a1,a2
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0

  switch (type) {
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A
      a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A
      break
    case 'lowshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * ((A + 1) - (A - 1) * cos + 2 * sqrtA * alpha)
      b1 = 2 * A * ((A - 1) - (A + 1) * cos)
      b2 = A * ((A + 1) - (A - 1) * cos - 2 * sqrtA * alpha)
      a0 = (A + 1) + (A - 1) * cos + 2 * sqrtA * alpha
      a1 = -2 * ((A - 1) + (A + 1) * cos)
      a2 = (A + 1) + (A - 1) * cos - 2 * sqrtA * alpha
      break
    }
    case 'highshelf': {
      const sqrtA = Math.sqrt(A)
      b0 = A * ((A + 1) + (A - 1) * cos + 2 * sqrtA * alpha)
      b1 = -2 * A * ((A - 1) + (A + 1) * cos)
      b2 = A * ((A + 1) + (A - 1) * cos - 2 * sqrtA * alpha)
      a0 = (A + 1) - (A - 1) * cos + 2 * sqrtA * alpha
      a1 = 2 * ((A - 1) - (A + 1) * cos)
      a2 = (A + 1) - (A - 1) * cos - 2 * sqrtA * alpha
      break
    }
    case 'notch':
      b0 = 1; b1 = -2 * cos; b2 = 1
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha
      break
    default: {
      const _exhaustive: never = type
      throw new Error(`unhandled EqFilterType: ${_exhaustive}`)
    }
  }

  // 归一化（a0 通常已在公式中处理，但显式归一更稳）
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0; a0 = 1

  // H(z) = (b0 + b1 z^-1 + b2 z^-2) / (1 + a1 z^-1 + a2 z^-2)，z = e^{j w}
  // w = 评价频率 freqHz 对应的数字角频率（注意：不是滤波器中心 w0）
  const w = (2 * Math.PI * freqHz) / sampleRate
  const z1re = Math.cos(w), z1im = -Math.sin(w)       // z^-1 = e^{-j w}
  const z2re = Math.cos(2 * w), z2im = -Math.sin(2 * w)

  const num: Complex = {
    re: b0 + b1 * z1re + b2 * z2re,
    im: b1 * z1im + b2 * z2im,
  }
  const den: Complex = {
    re: 1 + a1 * z1re + a2 * z2re,
    im: a1 * z1im + a2 * z2im,
  }
  return cdiv(num, den)
}

// 计算多段串联在给定频率点上的总响应（dB）。
export function computeBiquadResponse(
  bands: EqBand[],
  sampleRate: number,
  freqs: number[],
): number[] {
  return freqs.map((f) => {
    let h: Complex = { re: 1, im: 0 }
    for (const band of bands) {
      h = cmul(h, biquadResponse(band, sampleRate, f))
    }
    // |H|=0（如 deep notch / Nyquist 处 lowpass）→ log10(0)=-∞；用 1e-12 钳到 -240dB，
    // 避免 SVG path 出现 Infinity。这是绘图安全下限，不是物理 dB 值。
    return 20 * Math.log10(Math.hypot(h.re, h.im) || 1e-12)
  })
}

// 频率响应曲线采样点（对数 20Hz..20kHz，n 个点），供 UI 复用。
export function logFreqPoints(n: number): number[] {
  if (n <= 1) return [20]
  return Array.from({ length: n }, (_, i) => 20 * Math.pow(1000, i / (n - 1)))
}