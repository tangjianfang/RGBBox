import { useEffect, useRef, useState } from 'react'

export type AudioCaptureError = 'permission-denied' | 'source-unavailable' | 'capture-failed'

export interface AudioData {
  active: boolean
  bass: number
  mid: number
  high: number
  level: number
  beat: number
  freqBands: number[]  // 32 log-spaced bands 20 Hz – 20 kHz, each 0..1
  error?: AudioCaptureError
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

function classifyAudioError(error: unknown): AudioCaptureError {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'permission-denied'
  }
  if (error instanceof Error && error.message === 'source-unavailable') {
    return 'source-unavailable'
  }
  return 'capture-failed'
}

export function useAudioAnalyzer(enabled: boolean, deviceId = '', shouldAnalyze = true): AudioData {
  const [audioData, setAudioData] = useState<AudioData>(INACTIVE)
  const prevBassRef = useRef(0)
  const intervalRef = useRef<number | null>(null)
  // R45: mirrors `shouldAnalyze` into a ref so the tick loop (a setInterval
  // closure that must NOT be torn down/recreated just because visibility
  // toggled — that would drop and reconnect the getUserMedia stream/
  // AudioContext on every minimize/restore) can skip its actual FFT work
  // when nothing needs the data (no overlay projecting it, main window not
  // showing the workspace tab), without touching the enabled/deviceId effect.
  const shouldAnalyzeRef = useRef(shouldAnalyze)
  shouldAnalyzeRef.current = shouldAnalyze
  // Per-band EMA: fast attack (0.75), slow decay (0.20) → VU-meter "peak hold" feel.
  // Prevents the harsh instant-drop that makes equalizer bars jittery.
  const smoothedBandsRef = useRef<number[]>(new Array(NUM_BANDS).fill(0))

  useEffect(() => {
    if (!enabled) {
      setAudioData(INACTIVE)
      return
    }

    const SYSTEM_AUDIO_ID = '__system_audio__'
    const SPEAKER_PREFIX  = '__speaker__:'
    const DESKTOP_PREFIX  = '__desktop__:'
    const LOOPBACK_LABEL_RE = /stereo mix|what u hear|loopback|monitor/i

    let cancelled = false
    let stream: MediaStream | null = null
    let audioContext: AudioContext | null = null

    const makeDesktopStream = (sourceId: string): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        } as MediaTrackConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 1,
            maxHeight: 1,
            maxFrameRate: 1
          }
        } as MediaTrackConstraints
      })

    const tryCaptureSpeakerDevice = async (speakerDeviceId: string): Promise<MediaStream | null> => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const output = devices.find(
        (d) => d.kind === 'audiooutput' && d.deviceId === speakerDeviceId
      )
      // Preferred path: find a loopback-capable input in the same hardware group.
      // On many Windows drivers this appears as "Stereo Mix" / "Loopback".
      if (output?.groupId) {
        const loopbackInput = devices.find(
          (d) =>
            d.kind === 'audioinput' &&
            d.groupId === output.groupId &&
            LOOPBACK_LABEL_RE.test(d.label)
        )
        if (loopbackInput) {
          return navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: loopbackInput.deviceId } },
            video: false,
          })
        }
      }

      // Fallback path: some environments expose a capturable endpoint with this ID.
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: speakerDeviceId } },
          video: false,
        })
      } catch {
        return null
      }
    }

    const getStream = async (): Promise<MediaStream> => {
      // Legacy sentinel: use the first available desktop source
      if (deviceId === SYSTEM_AUDIO_ID) {
        const sourceId = await window.rgbbox.getDesktopAudioSourceId()
        if (!sourceId) throw new Error('source-unavailable')
        return makeDesktopStream(sourceId)
      }
      // Preferred speaker path: pick a real audio output endpoint and capture its loopback.
      if (deviceId.startsWith(SPEAKER_PREFIX)) {
        const speakerDeviceId = deviceId.slice(SPEAKER_PREFIX.length)
        const stream = await tryCaptureSpeakerDevice(speakerDeviceId)
        if (stream) return stream

        // Last fallback when the selected speaker has no exposed loopback input.
        const sourceId = await window.rgbbox.getDesktopAudioSourceId()
        if (!sourceId) throw new Error('source-unavailable')
        return makeDesktopStream(sourceId)
      }
      // New: direct desktop source ID embedded after the prefix
      if (deviceId.startsWith(DESKTOP_PREFIX)) {
        const sourceId = deviceId.slice(DESKTOP_PREFIX.length)
        return makeDesktopStream(sourceId)
      }
      const audioConstraint: MediaStreamConstraints = deviceId
        ? { audio: { deviceId: { exact: deviceId } }, video: false }
        : { audio: true, video: false }
      return navigator.mediaDevices.getUserMedia(audioConstraint)
    }

    getStream()
      .then((micStream) => {
        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop())
          return
        }
        // Discard video tracks (present when using desktop loopback capture)
        micStream.getVideoTracks().forEach((t) => { t.stop(); micStream.removeTrack(t) })

        stream = micStream
        audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(micStream)
        const analyser = audioContext.createAnalyser()
        // 2048-point FFT → 1024 bins, binHz ≈ 43 Hz at 44100 — much better low-freq resolution
        analyser.fftSize = 2048
        // Lower smoothing constant gives faster attack response (~1 frame vs ~3 frames at 0.72).
        // The hook-side EMA handles decay smoothing, so we don't need heavy API-level smoothing.
        analyser.smoothingTimeConstant = 0.45
        source.connect(analyser)

        const binCount = analyser.frequencyBinCount  // 1024
        const dataArray = new Uint8Array(binCount)
        const binHz = audioContext.sampleRate / analyser.fftSize

        const bandEdges = buildBandEdges(audioContext.sampleRate, analyser.fftSize)

        // Legacy 3-band boundaries (kept for beat detection & audio-beat effect)
        const BASS_END = Math.round(250 / binHz)   // 0 – ~250 Hz
        const MID_END  = Math.round(4000 / binHz)  // ~250 – 4000 Hz

        // Use setInterval instead of requestAnimationFrame so it continues when window is minimized
        // R43: analysis runs every tick (needed for correct EMA smoothing /
        // beat-decay behaviour), but the React state update (setAudioData) —
        // which re-renders the whole App tree just to move 3 small VU-meter
        // bars — is throttled to ~1-in-3 ticks (~20 Hz) instead of every tick
        // (~60 Hz). This was a measurable chunk of "CPU goes up ~4.5% when
        // audio capture is on". `beat` is transient (a sharp percussive
        // spike), so the max seen across the skipped ticks is kept and
        // emitted instead of whatever the last-sampled tick happened to see,
        // so short beats between emits aren't dropped.
        const EMIT_EVERY_N_TICKS = 3
        let ticksSinceEmit = 0
        let maxBeatSinceEmit = 0
        const tick = () => {
          if (cancelled) return
          // R45: nobody needs this data right now (no overlay projecting an
          // audio-reactive effect, main window not showing the workspace
          // tab) — skip the FFT read + band math entirely instead of
          // grinding through it 60x/sec for nothing. The getUserMedia
          // stream/AudioContext stay alive (so resuming is instant, no
          // reconnect/permission-prompt flicker), only the actual analysis
          // work pauses.
          if (!shouldAnalyzeRef.current) return
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
          maxBeatSinceEmit = Math.max(maxBeatSinceEmit, beat)

          // Per-band FFT: take the max bin value within each log-spaced band,
          // then apply asymmetric EMA (fast attack / slow decay) so bars rise
          // quickly on signal and hold / fall slowly — classic VU-meter feel.
          const freqBands = bandEdges.map(([lo, hi], i) => {
            let peak = 0
            for (let j = lo; j <= hi; j++) peak = Math.max(peak, dataArray[j] / 255)
            const prev = smoothedBandsRef.current[i]
            const next = peak > prev
              ? prev * 0.25 + peak * 0.75   // fast attack  (~1-2 frames to rise)
              : prev * 0.80 + peak * 0.20   // slow decay   (~300ms half-life at 30fps)
            smoothedBandsRef.current[i] = next
            return next
          })

          ticksSinceEmit += 1
          if (ticksSinceEmit >= EMIT_EVERY_N_TICKS) {
            ticksSinceEmit = 0
            setAudioData({ active: true, bass, mid, high, level, beat: maxBeatSinceEmit, freqBands })
            maxBeatSinceEmit = 0
          }
        }

        intervalRef.current = window.setInterval(tick, 16) // ~60fps analysis, survives minimize
      })
      .catch((err: unknown) => {
        if (!cancelled) setAudioData({ ...INACTIVE, error: classifyAudioError(err) })
      })

    return () => {
      cancelled = true
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      stream?.getTracks().forEach((t) => t.stop())
      audioContext?.close().catch(() => undefined)
    }
  }, [enabled, deviceId])

  return audioData
}
