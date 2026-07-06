// R52.5: 纯 TS 音频指标计算（无 DOM/WebAudio 依赖，符合 engine 层约定）。
// 输入为 AnalyserNode 取出的频域 Uint8Array(0..255) 与时域 Float32Array(-1..1)。

export interface PeakInfo {
  freqHz: number
  db: number
}

/** 峰值频率与对应 dB。freqHz = binIdx * sampleRate / fftSize。 */
export function peakFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): PeakInfo {
  let maxIdx = 0
  let maxVal = 0
  for (let i = 0; i < freqData.length; i++) {
    if (freqData[i] > maxVal) { maxVal = freqData[i]; maxIdx = i }
  }
  if (maxVal <= 0) return { freqHz: 0, db: -120 } // 静音哨兵：-120 为越界标记，非刻度内值
  const freqHz = (maxIdx * sampleRate) / fftSize
  // 0..255 → dBFS（255 ≈ 0dB，1 ≈ -48dB）。maxVal >= 1 由上面的 early return 保证。
  const db = 20 * Math.log10(maxVal / 255)
  return { freqHz, db }
}

/** 时域 RMS（0..1）。 */
export function rmsLevel(timeData: Float32Array): number {
  let sum = 0
  for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i]
  return Math.sqrt(sum / Math.max(1, timeData.length))
}

/** 主导频率：幅度加权质心（spectral centroid）。 */
export function dominantFrequency(freqData: Uint8Array, sampleRate: number, fftSize: number): number {
  let num = 0
  let den = 0
  for (let i = 0; i < freqData.length; i++) {
    const mag = freqData[i]
    const f = (i * sampleRate) / fftSize
    num += f * mag
    den += mag
  }
  if (den <= 0) return 0
  return num / den
}

/** 短时响度估算（K-weighted 简化 → dBFS 近似）。静音/低幅钳到 -60（floor 钳制保证单调）。 */
export function lufsShortEstimate(timeData: Float32Array): number {
  const rms = rmsLevel(timeData)
  if (rms <= 1e-6) return -60
  // K-weighting 在 1kHz 近似平坦：全刻度正弦 ≈ -3.01 LUFS ≈ -3.01 dBFS。
  // floor 钳制到 -60，避免 rms 略大于 1e-6 时产生比 -60 更小的（更安静的）读数，保持单调。
  return Math.max(-60, 20 * Math.log10(rms))
}

/** BPM 估算：先降采样到 ~1kHz 再做时域自相关，搜索 60..200 BPM 区间的最大相关峰。 */
export function estimateBPM(timeData: Float32Array, sampleRate: number): number {
  const n = timeData.length
  if (n < sampleRate * 0.5) return 0 // 至少 0.5s 数据

  // 降采样到 ~1kHz，把 O(n·lag) 自相关压到可承受的量级。
  const targetRate = 1000
  const dsFactor = Math.max(1, Math.round(sampleRate / targetRate))
  const dsRate = sampleRate / dsFactor
  const dsN = Math.floor(n / dsFactor)
  const x = new Float32Array(dsN)
  let mean = 0
  for (let i = 0; i < dsN; i++) {
    let s = 0
    for (let k = 0; k < dsFactor; k++) s += timeData[i * dsFactor + k]
    s /= dsFactor
    x[i] = s
    mean += s
  }
  mean /= dsN
  for (let i = 0; i < dsN; i++) x[i] -= mean

  const minLag = Math.max(1, Math.floor(dsRate / 3.5))   // dsRate=1000 → lag 285 → ≈210 BPM（上界）
  const maxLag = Math.min(dsN - 1, Math.floor(dsRate))    // dsRate=1000 → lag 1000 → 60 BPM（下界）
  let bestLag = 0
  let bestCorr = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i + lag < dsN; i++) corr += x[i] * x[i + lag]
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
  }
  if (bestLag <= 0 || bestCorr <= 0) return 0 // 无正相关性：静音或无周期内容
  return (60 * dsRate) / bestLag
}