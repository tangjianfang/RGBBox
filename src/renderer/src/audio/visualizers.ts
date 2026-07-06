/**
 * Shared canvas-drawing functions for the audio studio's visualizers.
 *
 * R29.3 (revised): these used to live only inside `AudioStudioView.tsx` and
 * took a live `AnalyserNode` directly. They are extracted here — accepting
 * plain `Uint8Array`/`Float32Array` snapshots instead — so the exact same
 * drawing code can run both in the main studio view (which owns the
 * `AnalyserNode`) and in a projected `AudioVizProjector` window in a
 * different renderer process (which only receives forwarded data, not a
 * live Web Audio graph). This is what makes "project to display" show the
 * real smooth animation instead of a blocky LED-grid downsample.
 */

import { peakFrequency, rmsLevel, dominantFrequency, lufsShortEstimate } from '../../../engine/audioMetrics'

export type VisualizerMode = 'spectrum' | 'oscilloscope' | 'spectrogram' | 'vuMeter' | 'circular' | 'waveRing' | 'waveform'

export const SPECTRUM_BARS = 64 // Optimal bar count for visual clarity

/** Same-origin BroadcastChannel name used to stream live analyser data from
 *  AudioStudioView to any open AudioVizProjector windows (R29.3 revised). */
export const AUDIO_VIZ_CHANNEL = 'rgbbox-audio-viz'

export interface AudioVizMessage {
  mode: VisualizerMode
  freq: Uint8Array
  time: Float32Array
}

export interface VizDrawOpts {
  showMetrics?: boolean
  style?: 'classic' | 'art'
  sampleRate?: number   // 默认 48000
  fftSize?: number      // 默认 2048
}

export type RegionPreset =
  | 'fullscreen' | 'top-third' | 'middle-third' | 'bottom-third'
  | 'left-third' | 'center-third' | 'right-third' | 'custom'

export interface RegionRect { x: number; y: number; w: number; h: number }

export function regionPresetToRect(preset: RegionPreset, custom?: RegionRect): RegionRect {
  switch (preset) {
    case 'fullscreen': return { x: 0, y: 0, w: 1, h: 1 }
    case 'top-third': return { x: 0, y: 0, w: 1, h: 1 / 3 }
    case 'middle-third': return { x: 0, y: 1 / 3, w: 1, h: 1 / 3 }
    case 'bottom-third': return { x: 0, y: 2 / 3, w: 1, h: 1 / 3 }
    case 'left-third': return { x: 0, y: 0, w: 1 / 3, h: 1 }
    case 'center-third': return { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 }
    case 'right-third': return { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }
    case 'custom': return custom ?? { x: 0, y: 0, w: 1, h: 1 }
    default: return { x: 0, y: 0, w: 1, h: 1 }
  }
}

/** 通用角落小字 overlay（不喧宾夺主）。 */
function drawMetricsOverlay(ctx: CanvasRenderingContext2D, _width: number, lines: string[]): void {
  if (lines.length === 0) return
  ctx.save()
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(230,192,123,0.7)'
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 8, 8 + i * 13)
  }
  ctx.restore()
}

function fmtHz(hz: number): string {
  if (hz <= 0) return '0Hz'
  if (hz < 1000) return `${Math.round(hz)}Hz`
  return `${(hz / 1000).toFixed(1)}k`
}

export interface VuPeakState {
  left: number
  right: number
  leftDecay: number
  rightDecay: number
}

export function createVuPeakState(): VuPeakState {
  return { left: 0, right: 0, leftDecay: 0, rightDecay: 0 }
}

export function createSpectrogramBuffer(): Uint8Array[] {
  return []
}

/** Premium gradient spectrum with glow, rounded caps, and mirror reflection */
export function drawSpectrum(canvas: HTMLCanvasElement, freqData: Uint8Array, opts?: VizDrawOpts): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = freqData.length

  ctx.clearRect(0, 0, width, height)

  // Use log-spaced bands for perceptually balanced spectrum
  const barCount = SPECTRUM_BARS
  const gap = 2
  const barWidth = (width - (barCount - 1) * gap) / barCount
  const mirrorHeight = height * 0.18 // Reflection zone
  const mainHeight = height - mirrorHeight

  for (let i = 0; i < barCount; i++) {
    // Map bar index to FFT bin using logarithmic scale (20Hz–20kHz)
    const loRatio = i / barCount
    const hiRatio = (i + 1) / barCount
    const loBin = Math.floor(Math.pow(loRatio, 2) * bufferLength * 0.75)
    const hiBin = Math.max(loBin + 1, Math.floor(Math.pow(hiRatio, 2) * bufferLength * 0.75))
    let peak = 0
    for (let j = loBin; j < hiBin && j < bufferLength; j++) {
      peak = Math.max(peak, freqData[j] / 255)
    }

    const barH = peak * mainHeight * 0.92
    const x = i * (barWidth + gap)
    const y = mainHeight - barH

    // Create vertical gradient: vibrant cyan → electric blue → magenta
    const grad = ctx.createLinearGradient(x, mainHeight, x, y)
    const hue1 = 190 + (i / barCount) * 80 // cyan → blue
    const hue2 = 220 + (i / barCount) * 100 // blue → violet
    const lightness = 50 + peak * 20
    grad.addColorStop(0, `hsla(${hue1}, 90%, ${lightness}%, 0.85)`)
    grad.addColorStop(0.5, `hsla(${(hue1 + hue2) / 2}, 85%, ${lightness + 5}%, 0.95)`)
    grad.addColorStop(1, `hsla(${hue2}, 80%, ${lightness + 10}%, 1)`)

    // Glow effect
    if (peak > 0.3) {
      ctx.shadowBlur = 6 + peak * 10
      ctx.shadowColor = `hsla(${hue1}, 90%, 60%, ${peak * 0.6})`
    } else {
      ctx.shadowBlur = 0
    }

    // Draw bar with rounded top cap
    ctx.fillStyle = grad
    ctx.beginPath()
    const radius = Math.min(barWidth / 2, 3)
    ctx.moveTo(x, mainHeight)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.lineTo(x + barWidth - radius, y)
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
    ctx.lineTo(x + barWidth, mainHeight)
    ctx.closePath()
    ctx.fill()

    // Art variant: bright top highlight cap
    if (opts?.style === 'art') {
      ctx.shadowBlur = 0
      ctx.fillStyle = `hsla(${hue2}, 100%, 85%, 0.9)`
      ctx.fillRect(x, y, barWidth, 2)
    }

    // Mirror reflection (subtle, fading)
    ctx.shadowBlur = 0
    const reflH = barH * 0.35
    const reflGrad = ctx.createLinearGradient(x, mainHeight, x, mainHeight + reflH)
    reflGrad.addColorStop(0, `hsla(${hue1}, 70%, ${lightness}%, 0.25)`)
    reflGrad.addColorStop(1, `hsla(${hue1}, 70%, ${lightness}%, 0)`)
    ctx.fillStyle = reflGrad
    ctx.fillRect(x, mainHeight + 1, barWidth, reflH)
  }

  // Subtle horizontal separator line
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, mainHeight)
  ctx.lineTo(width, mainHeight)
  ctx.stroke()

  if (opts?.showMetrics) {
    const { freqHz, db } = peakFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, width, [`${fmtHz(freqHz)}  ${db.toFixed(1)}dB`])
  }

  ctx.restore()
}

/** Premium waveform with gradient stroke and subtle fill */
export function drawWaveform(canvas: HTMLCanvasElement, timeData: Float32Array, opts?: VizDrawOpts): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = timeData.length

  ctx.clearRect(0, 0, width, height)

  // Gradient stroke
  const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)
  strokeGrad.addColorStop(0, 'rgba(79, 195, 247, 0.9)')
  strokeGrad.addColorStop(0.3, 'rgba(129, 212, 250, 1)')
  strokeGrad.addColorStop(0.6, 'rgba(79, 195, 247, 1)')
  strokeGrad.addColorStop(1, 'rgba(171, 71, 188, 0.8)')

  ctx.strokeStyle = strokeGrad
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (opts?.style === 'art') { ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(129,212,250,0.8)' }

  // Draw waveform path
  ctx.beginPath()
  const step = Math.max(1, Math.floor(bufferLength / width))
  for (let i = 0; i < width; i++) {
    const idx = Math.min(i * step, bufferLength - 1)
    const y = ((timeData[idx] + 1) / 2) * height
    if (i === 0) ctx.moveTo(i, y)
    else ctx.lineTo(i, y)
  }
  ctx.stroke()

  // Subtle fill beneath the waveform
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  const fillGrad = ctx.createLinearGradient(0, 0, 0, height)
  fillGrad.addColorStop(0, 'rgba(79, 195, 247, 0.08)')
  fillGrad.addColorStop(1, 'rgba(79, 195, 247, 0)')
  ctx.fillStyle = fillGrad
  ctx.fill()
  ctx.shadowBlur = 0

  // Center line
  ctx.strokeStyle = 'rgba(79, 195, 247, 0.12)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()

  if (opts?.showMetrics) {
    const r = rmsLevel(timeData)
    drawMetricsOverlay(ctx, width, [`RMS ${(r * 100).toFixed(0)}`])
  }

  ctx.restore()
}

/** Spectrogram: scrolling time-frequency heat map */
export function drawSpectrogram(
  canvas: HTMLCanvasElement,
  freqData: Uint8Array,
  spectrogramBuffer: Uint8Array[],
  opts?: VizDrawOpts,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = freqData.length

  // Add current frame to spectrogram buffer (sliding window)
  spectrogramBuffer.push(new Uint8Array(freqData))
  const maxCols = Math.ceil(width)
  while (spectrogramBuffer.length > maxCols) spectrogramBuffer.shift()

  ctx.clearRect(0, 0, width, height)

  // Draw the spectrogram columns (time → x, frequency → y)
  const colWidth = Math.max(1, width / maxCols)
  for (let col = 0; col < spectrogramBuffer.length; col++) {
    const frame = spectrogramBuffer[col]
    const x = col * colWidth
    const binsPerPixel = bufferLength / height
    for (let row = 0; row < height; row++) {
      // Map bottom of canvas to low frequencies (invert y)
      const binIdx = Math.floor((height - 1 - row) * binsPerPixel * 0.75)
      const value = frame[binIdx] / 255
      if (value < 0.02) continue
      // Art variant: perceptually linear (log-feel) color map.
      const v = opts?.style === 'art' ? Math.pow(value, 0.6) : value
      // Heat map: dark blue → cyan → yellow → red → white
      const h = 240 - v * 240
      const l = 10 + v * 55
      ctx.fillStyle = `hsl(${h}, 90%, ${l}%)`
      ctx.fillRect(x, row, colWidth + 0.5, 1)
    }
  }

  if (opts?.showMetrics) {
    const f = dominantFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, width, [`dom ${fmtHz(f)}`])
  }

  ctx.restore()
}

/** VU Meter: professional audio level meter with peak hold */
export function drawVUMeter(
  canvas: HTMLCanvasElement,
  timeData: Float32Array,
  peakHoldRef: VuPeakState,
  opts?: VizDrawOpts,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)

  const bufferLength = timeData.length

  // Calculate RMS for left and right (simulated stereo from mono)
  let sumLeft = 0
  let sumRight = 0
  const half = Math.floor(bufferLength / 2)
  for (let i = 0; i < half; i++) {
    sumLeft += timeData[i] * timeData[i]
    sumRight += timeData[i + half] * timeData[i + half]
  }
  const rmsLeft = Math.sqrt(sumLeft / half)
  const rmsRight = Math.sqrt(sumRight / half)

  // Convert to dB scale (-60 to 0 dB range)
  const toDb = (rms: number) => Math.max(-60, 20 * Math.log10(Math.max(rms, 1e-10)))
  const dbLeft = toDb(rmsLeft)
  const dbRight = toDb(rmsRight)
  const normLeft = (dbLeft + 60) / 60
  const normRight = (dbRight + 60) / 60

  // Peak hold with decay
  if (normLeft > peakHoldRef.left) { peakHoldRef.left = normLeft; peakHoldRef.leftDecay = 0 }
  else { peakHoldRef.leftDecay++; if (peakHoldRef.leftDecay > 30) peakHoldRef.left = Math.max(0, peakHoldRef.left - 0.01) }
  if (normRight > peakHoldRef.right) { peakHoldRef.right = normRight; peakHoldRef.rightDecay = 0 }
  else { peakHoldRef.rightDecay++; if (peakHoldRef.rightDecay > 30) peakHoldRef.right = Math.max(0, peakHoldRef.right - 0.01) }

  ctx.clearRect(0, 0, width, height)

  const meterHeight = (height - 24) / 2
  const meterY1 = 4
  const meterY2 = meterY1 + meterHeight + 8

  // Draw meter background
  const drawMeter = (y: number, level: number, peak: number, label: string) => {
    // Background track
    ctx.fillStyle = 'rgba(30, 40, 50, 0.8)'
    ctx.fillRect(24, y, width - 32, meterHeight)

    // Green → Yellow → Red gradient fill
    const meterWidth = width - 32
    const fillWidth = level * meterWidth
    const grad = ctx.createLinearGradient(24, 0, 24 + meterWidth, 0)
    grad.addColorStop(0, '#22c55e')
    grad.addColorStop(0.6, '#22c55e')
    grad.addColorStop(0.75, '#eab308')
    grad.addColorStop(0.9, '#ef4444')
    grad.addColorStop(1, '#dc2626')
    ctx.fillStyle = grad
    ctx.fillRect(24, y, fillWidth, meterHeight)

    // Art variant: glowing end-dot at the bar tip
    if (opts?.style === 'art') {
      ctx.shadowBlur = 10; ctx.shadowColor = '#eab308'
      ctx.beginPath(); ctx.arc(24 + fillWidth, y + meterHeight / 2, 3, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    }

    // Peak hold indicator
    const peakX = 24 + peak * meterWidth
    ctx.fillStyle = peak > 0.9 ? '#ef4444' : '#ffffff'
    ctx.fillRect(peakX - 1, y, 2, meterHeight)

    // Scale marks at -40, -20, -10, -6, -3, 0 dB
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = `${Math.max(8, meterHeight * 0.5)}px monospace`
    ctx.textAlign = 'center'
    const marks = [-40, -20, -10, -6, -3, 0]
    for (const db of marks) {
      const mx = 24 + ((db + 60) / 60) * meterWidth
      ctx.fillRect(mx, y + meterHeight - 2, 1, 2)
    }

    // Channel label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.textAlign = 'left'
    ctx.font = `bold ${Math.max(9, meterHeight * 0.6)}px sans-serif`
    ctx.fillText(label, 4, y + meterHeight * 0.7)
  }

  drawMeter(meterY1, normLeft, peakHoldRef.left, 'L')
  drawMeter(meterY2, normRight, peakHoldRef.right, 'R')

  // dB scale labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  const meterWidth = width - 32
  const marks = [-40, -20, -10, -6, -3, 0]
  for (const db of marks) {
    const mx = 24 + ((db + 60) / 60) * meterWidth
    ctx.fillText(`${db}`, mx, height - 2)
  }

  if (opts?.showMetrics) {
    const l = lufsShortEstimate(timeData)
    drawMetricsOverlay(ctx, width, [`LUFS ${l.toFixed(1)}`])
  }

  ctx.restore()
}

/** Circular spectrum: bars radiate outward from center in a 360° ring */
export function drawCircularSpectrum(canvas: HTMLCanvasElement, freqData: Uint8Array, opts?: VizDrawOpts): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const bufferLength = freqData.length

  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) * 0.28
  const barCount = 128
  const maxBarH = Math.min(w, h) * 0.22

  for (let i = 0; i < barCount; i++) {
    const binIdx = Math.floor((i / barCount) * bufferLength * 0.75)
    const value = freqData[binIdx] / 255
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2
    const barH = value * maxBarH

    const x1 = cx + Math.cos(angle) * radius
    const y1 = cy + Math.sin(angle) * radius
    const x2 = cx + Math.cos(angle) * (radius + barH)
    const y2 = cy + Math.sin(angle) * (radius + barH)

    const hue = 180 + (i / barCount) * 180
    ctx.strokeStyle = `hsla(${hue}, 90%, ${50 + value * 25}%, ${0.7 + value * 0.3})`
    ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * radius) / barCount) * 0.65)
    ctx.shadowBlur = value > 0.4 ? 8 + value * 12 : 0
    ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.6)`
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // Center circle
  ctx.shadowBlur = 0
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  grad.addColorStop(0, 'rgba(79, 195, 247, 0.15)')
  grad.addColorStop(1, 'rgba(79, 195, 247, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Art variant: soft glow ring around the center circle
  if (opts?.style === 'art') {
    ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(129,212,250,0.6)'
    ctx.strokeStyle = 'rgba(129,212,250,0.4)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke()
    ctx.shadowBlur = 0
  }

  if (opts?.showMetrics) {
    const { freqHz } = peakFrequency(freqData, opts.sampleRate ?? 48000, opts.fftSize ?? 2048)
    drawMetricsOverlay(ctx, w, [`${fmtHz(freqHz)}`])
  }

  ctx.restore()
}

/** Wave ring: oscilloscope waveform drawn as a circle */
export function drawWaveRing(canvas: HTMLCanvasElement, timeData: Float32Array, opts?: VizDrawOpts): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)

  const bufferLength = timeData.length

  const cx = w / 2
  const cy = h / 2
  const baseRadius = Math.min(w, h) * 0.3
  const amplitude = Math.min(w, h) * 0.15
  const step = Math.max(1, Math.floor(bufferLength / 360))

  // Mirror: draw ring using 360 points
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, 'rgba(79, 195, 247, 0.9)')
  grad.addColorStop(0.5, 'rgba(171, 71, 188, 1)')
  grad.addColorStop(1, 'rgba(79, 195, 247, 0.9)')
  ctx.strokeStyle = grad
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'

  ctx.beginPath()
  for (let i = 0; i < 360; i++) {
    const idx = Math.min(Math.floor(i * (bufferLength / 360)), bufferLength - 1)
    const sample = timeData[Math.floor(idx / step) * step] ?? 0
    const r = baseRadius + sample * amplitude
    const angle = (i / 360) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  // Art variant: outer double-ring at 1.15× radius, thin violet stroke
  if (opts?.style === 'art') {
    ctx.strokeStyle = 'rgba(171,71,188,0.35)'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < 360; i++) {
      const idx = Math.min(Math.floor(i * (bufferLength / 360)), bufferLength - 1)
      const r = baseRadius * 1.15 + (timeData[idx] ?? 0) * amplitude
      const a = (i / 360) * Math.PI * 2 - Math.PI / 2
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.stroke()
  }

  // Glow fill
  const fillGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.5, cx, cy, baseRadius + amplitude)
  fillGrad.addColorStop(0, 'rgba(79, 195, 247, 0.05)')
  fillGrad.addColorStop(1, 'rgba(79, 195, 247, 0)')
  ctx.fillStyle = fillGrad
  ctx.fill()

  if (opts?.showMetrics) {
    const r = rmsLevel(timeData)
    drawMetricsOverlay(ctx, w, [`${(r * 100).toFixed(0)}`])
  }

  ctx.restore()
}

/**
 * Draw one visualizer frame given already-extracted analyser data. Shared by
 * both the local studio view and the projected `AudioVizProjector` window.
 */
export function drawVisualizerFrame(
  canvas: HTMLCanvasElement,
  mode: Exclude<VisualizerMode, 'waveform'>,
  freqData: Uint8Array,
  timeData: Float32Array,
  spectrogramBuffer: Uint8Array[],
  vuPeak: VuPeakState,
  opts?: VizDrawOpts,
): void {
  switch (mode) {
    case 'spectrum':
      drawSpectrum(canvas, freqData, opts)
      break
    case 'oscilloscope':
      drawWaveform(canvas, timeData, opts)
      break
    case 'spectrogram':
      drawSpectrogram(canvas, freqData, spectrogramBuffer, opts)
      break
    case 'vuMeter':
      drawVUMeter(canvas, timeData, vuPeak, opts)
      break
    case 'circular':
      drawCircularSpectrum(canvas, freqData, opts)
      break
    case 'waveRing':
      drawWaveRing(canvas, timeData, opts)
      break
  }
}
