import { useEffect, useRef, useState } from 'react'

export interface AudioData {
  active: boolean
  bass: number
  mid: number
  high: number
  level: number
  beat: number
  freqBands: number[]  // 32 log-spaced bands 20 Hz – 20 kHz, each 0..1
}

const NUM_BANDS = 32
const MIN_FREQ = 20
const MAX_FREQ = 20000

/** Pre-compute [loBin, hiBin] pairs for each log-spaced band */
function buildBandEdges(sampleRate: number, fftSize: number): Array<[number, number]> {
  const binHz = sampleRate / fftSize
  const maxBin = fftSize / 2 - 1
  const edges: Array<[number, number]> = []
  for (let i = 0; i < NUM_BANDS; i++) {
    const lo = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / NUM_BANDS)
    const hi = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, (i + 1) / NUM_BANDS)
    const loBin = Math.max(0, Math.round(lo / binHz))
    const hiBin = Math.min(maxBin, Math.max(loBin, Math.round(hi / binHz) - 1))
    edges.push([loBin, hiBin])
  }
  return edges
}

const INACTIVE: AudioData = {
  active: false, bass: 0, mid: 0, high: 0, level: 0, beat: 0,
  freqBands: new Array(NUM_BANDS).fill(0)
}

export function useAudioAnalyzer(enabled: boolean, deviceId = ''): AudioData {
  const [audioData, setAudioData] = useState<AudioData>(INACTIVE)
  const prevBassRef = useRef(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setAudioData(INACTIVE)
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null

    const audioConstraint: MediaStreamConstraints = deviceId
      ? { audio: { deviceId: { exact: deviceId } }, video: false }
      : { audio: true, video: false }

    navigator.mediaDevices
      .getUserMedia(audioConstraint)
      .then((micStream) => {
        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop())
          return
        }

        stream = micStream
        audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(micStream)
        const analyser = audioContext.createAnalyser()
        // 2048-point FFT → 1024 bins, binHz ≈ 43 Hz at 44100 — much better low-freq resolution
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.72
        source.connect(analyser)

        const binCount = analyser.frequencyBinCount  // 1024
        const dataArray = new Uint8Array(binCount)
        const binHz = audioContext.sampleRate / analyser.fftSize

        const bandEdges = buildBandEdges(audioContext.sampleRate, analyser.fftSize)

        // Legacy 3-band boundaries (kept for beat detection & audio-beat effect)
        const BASS_END = Math.round(250 / binHz)   // 0 – ~250 Hz
        const MID_END  = Math.round(4000 / binHz)  // ~250 – 4000 Hz

        const tick = () => {
          if (cancelled) return
          analyser.getByteFrequencyData(dataArray)

          let bassSum = 0
          let midSum = 0
          let highSum = 0

          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 255
            if (i < BASS_END) bassSum += v
            else if (i < MID_END) midSum += v
            else highSum += v
          }

          const bass = bassSum / Math.max(1, BASS_END)
          const mid = midSum / Math.max(1, MID_END - BASS_END)
          const high = highSum / Math.max(1, dataArray.length - MID_END)
          const level = (bassSum + midSum + highSum) / dataArray.length

          // Transient beat: sharp positive rise in bass
          const beat = Math.max(0, (bass - prevBassRef.current) * 5)
          prevBassRef.current = bass * 0.85 + prevBassRef.current * 0.15

          // Per-band FFT: take the max bin value within each log-spaced band
          const freqBands = bandEdges.map(([lo, hi]) => {
            let peak = 0
            for (let i = lo; i <= hi; i++) peak = Math.max(peak, dataArray[i] / 255)
            return peak
          })

          setAudioData({ active: true, bass, mid, high, level, beat, freqBands })
          frameRef.current = requestAnimationFrame(tick)
        }

        frameRef.current = requestAnimationFrame(tick)
      })
      .catch(() => {
        // User denied mic — stay inactive
        if (!cancelled) setAudioData(INACTIVE)
      })

    return () => {
      cancelled = true
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      stream?.getTracks().forEach((t) => t.stop())
      audioContext?.close().catch(() => undefined)
    }
  }, [enabled, deviceId])

  return audioData
}
