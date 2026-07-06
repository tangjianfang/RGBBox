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

export type EqMode = 'graphic' | 'parametric'

export interface EqPreset {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  mode: EqMode
  bands: EqBand[]
  builtin: boolean
}

// ISO 10 段频率（graphic 模式固定）
export const EQ_GRAPHIC_FREQS = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const

// graphic 模式增益数组 → EqBand[]
export function graphicGainsToBands(gains: number[]): EqBand[] {
  return EQ_GRAPHIC_FREQS.map((freq, i) => ({
    id: `g-${i}`, type: 'peaking' as const, freq, gain: gains[i] ?? 0, Q: 1.41,
  }))
}

// graphic 模式 EqBand[] → 增益数组（供 10 滑块 UI 用）
export function bandsToGraphicGains(bands: EqBand[]): number[] {
  return EQ_GRAPHIC_FREQS.map((f) => bands.find(b => b.freq === f && b.type === 'peaking')?.gain ?? 0)
}

export const genId = () => `u-${Math.floor(performance.now() * 1000)}-${Math.floor(Math.random() * 1e6)}`

// 内置预设库（经典 graphic + 参考 parametric，附说明）
export const EQ_PRESETS: EqPreset[] = [
  {
    id: 'flat', name: 'Flat', nameZh: '平坦',
    description: 'Neutral response, no coloration.',
    descriptionZh: '中性响应，不染色。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands(new Array(10).fill(0)),
  },
  {
    id: 'pop', name: 'Pop', nameZh: '流行',
    description: 'Boosted vocals and presence, slightly cut bass.',
    descriptionZh: '提升人声与存在感，略微削减低音。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([-1, 2, 4, 4, 1, -1, -1, 0, 1, 2]),
  },
  {
    id: 'rock', name: 'Rock', nameZh: '摇滚',
    description: 'Scooped mids, strong lows and highs for guitars/drums.',
    descriptionZh: '中频凹陷，强化高低频，适合吉他/鼓。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([4, 3, 0, -1, -2, -1, 2, 4, 5, 5]),
  },
  {
    id: 'jazz', name: 'Jazz', nameZh: '爵士',
    description: 'Warm mids, smooth highs, gentle bass.',
    descriptionZh: '温暖中频，顺滑高频，温和低音。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([3, 2, 1, 2, -1, -1, 0, 1, 2, 3]),
  },
  {
    id: 'vocal', name: 'Vocal', nameZh: '人声',
    description: 'Presence boost around 2-4kHz for vocal clarity.',
    descriptionZh: '2-4kHz 存在感提升，人声清晰。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([-2, -1, 0, 2, 4, 4, 3, 1, 0, -1]),
  },
  {
    id: 'bass-boost', name: 'Bass Boost', nameZh: '低音增强',
    description: 'Strong low-frequency lift for headphone impact.',
    descriptionZh: '强力低频提升，增强耳机冲击感。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([6, 5, 4, 2, 0, 0, 0, 0, 0, 0]),
  },
  {
    id: 'treble-boost', name: 'Treble Boost', nameZh: '高音增强',
    description: 'Air and detail above 4kHz.',
    descriptionZh: '4kHz 以上空气感与细节。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([0, 0, 0, 0, 0, 1, 3, 5, 6, 6]),
  },
  {
    id: 'loudness', name: 'Loudness', nameZh: '响度补偿',
    description: 'Classic loudness curve: boosted lows and highs at low volume.',
    descriptionZh: '经典响度曲线：小音量下强化高低频。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([5, 4, 2, 0, -1, -1, 0, 2, 4, 5]),
  },
  {
    id: 'smile', name: 'Smile Curve', nameZh: '微笑曲线',
    description: 'Scooped mids, the classic V shape for master bus.',
    descriptionZh: '中频凹陷，经典 V 形母带曲线。',
    mode: 'graphic', builtin: true,
    bands: graphicGainsToBands([4, 3, 1, -1, -2, -2, -1, 1, 3, 4]),
  },
  // Parametric 参考（工程手法）
  {
    id: 'p-hpf40', name: 'HPF 40Hz', nameZh: '高通 40Hz',
    description: 'High-pass at 40Hz to remove subsonic rumble.',
    descriptionZh: '40Hz 高通，去除次声隆隆声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'highpass', freq: 40, gain: 0, Q: 0.7 }],
  },
  {
    id: 'p-lpf18k', name: 'LPF 18kHz', nameZh: '低通 18kHz',
    description: 'Low-pass at 18kHz to tame high-frequency noise.',
    descriptionZh: '18kHz 低通，抑制高频噪声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'lowpass', freq: 18000, gain: 0, Q: 0.7 }],
  },
  {
    id: 'p-notch50', name: 'Notch 50Hz', nameZh: '陷波 50Hz',
    description: 'Notch at 50Hz Q=5 to remove mains hum.',
    descriptionZh: '50Hz Q=5 陷波，去除电源嗡声。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'notch', freq: 50, gain: 0, Q: 5 }],
  },
  {
    id: 'p-presence', name: 'Presence 3kHz', nameZh: '存在感 3kHz',
    description: 'Peaking +4dB at 3kHz Q=1 to lift vocal presence.',
    descriptionZh: '3kHz Q=1 提升 +4dB，提升人声存在感。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'peaking', freq: 3000, gain: 4, Q: 1 }],
  },
  {
    id: 'p-deess', name: 'De-ess 6kHz', nameZh: '齿音抑制 6kHz',
    description: 'Peaking -5dB at 6kHz Q=4 to tame sibilance.',
    descriptionZh: '6kHz Q=4 衰减 -5dB，抑制齿音。',
    mode: 'parametric', builtin: true,
    bands: [{ id: 'p1', type: 'peaking', freq: 6000, gain: -5, Q: 4 }],
  },
]
