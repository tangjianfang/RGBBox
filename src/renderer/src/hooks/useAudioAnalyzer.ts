import { useEffect, useRef, useState } from 'react'

export interface AudioData {
  active: boolean
  bass: number
  mid: number
  high: number
  level: number
  beat: number
}

const INACTIVE: AudioData = { active: false, bass: 0, mid: 0, high: 0, level: 0, beat: 0 }

export function useAudioAnalyzer(enabled: boolean): AudioData {
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

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((micStream) => {
        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop())
          return
        }

        stream = micStream
        audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(micStream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)

        // 256 frequency bins, each bin = sampleRate/fftSize ≈ 172 Hz at 44100
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const BASS_END = 4   // 0–688 Hz
        const MID_END = 25   // 688–4300 Hz

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

          const bass = bassSum / BASS_END
          const mid = midSum / (MID_END - BASS_END)
          const high = highSum / (dataArray.length - MID_END)
          const level = (bassSum + midSum + highSum) / dataArray.length

          // Transient beat: sharp positive rise in bass
          const beat = Math.max(0, (bass - prevBassRef.current) * 5)
          prevBassRef.current = bass * 0.85 + prevBassRef.current * 0.15

          setAudioData({ active: true, bass, mid, high, level, beat })
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
  }, [enabled])

  return audioData
}
