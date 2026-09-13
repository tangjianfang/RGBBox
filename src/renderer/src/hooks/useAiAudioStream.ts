// R90.8: continuous AI audio detection — captures mic or system loopback at
// 16kHz, feeds the main-process streaming session every 300ms, and exposes
// the latest VAD probability + AST top-5 as state.
import { useEffect, useRef, useState } from 'react'
import { openMonitorStream, stripVideoTracks } from '../tools/desktopAudio'

export type AiAudioSource = 'mic' | 'system'

export interface AiAudioStreamState {
  running: boolean
  error: string | null
  vadProb: number | null
  astTop: Array<{ index: number; score: number }> | null
}

const FEED_INTERVAL_MS = 300

/** null source = stopped. */
export function useAiAudioStream(source: AiAudioSource | null): AiAudioStreamState {
  const [state, setState] = useState<AiAudioStreamState>({ running: false, error: null, vadProb: null, astTop: null })
  const sourceRef = useRef(source)
  sourceRef.current = source

  useEffect(() => {
    if (source === null) {
      setState({ running: false, error: null, vadProb: null, astTop: null })
      return
    }
    let cancelled = false
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let processor: ScriptProcessorNode | null = null
    let pending: Float32Array = new Float32Array(0)
    let timer: number | null = null

    setState({ running: true, error: null, vadProb: null, astTop: null })

    const teardown = async (): Promise<void> => {
      if (timer !== null) window.clearInterval(timer)
      processor?.disconnect()
      for (const track of stream?.getTracks() ?? []) track.stop()
      await ctx?.close().catch(() => undefined)
      await window.rgbbox.audioAiStreamStop().catch(() => undefined)
    }

    const start = async (): Promise<void> => {
      await window.rgbbox.audioAiStreamStart()
      stream = source === 'system'
        ? await openMonitorStream('__system_audio__')
        : await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (cancelled) { await teardown(); return }
      stripVideoTracks(stream)
      ctx = new AudioContext({ sampleRate: 16000 })
      const srcNode = ctx.createMediaStreamSource(stream)
      processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const chunk = new Float32Array(e.inputBuffer.getChannelData(0))
        const merged = new Float32Array(pending.length + chunk.length)
        merged.set(pending)
        merged.set(chunk, pending.length)
        pending = merged
      }
      srcNode.connect(processor)
      const mute = ctx.createGain()
      mute.gain.value = 0
      processor.connect(mute)
      mute.connect(ctx.destination)

      timer = window.setInterval(() => {
        if (cancelled) return
        const batch = pending
        pending = new Float32Array(0)
        // R90.8 review fix: WASAPI loopback emits NO callbacks while nothing
        // plays — without a silence heartbeat the panel would freeze with no
        // results. Pad short/empty batches with zeros so VAD keeps ticking.
        let frame: Float32Array
        if (batch.length >= 4800) {
          frame = batch
        } else {
          frame = new Float32Array(4800) // 300ms of silence @16kHz
          frame.set(batch)
        }
        void window.rgbbox.audioAiStreamFeed(frame).then((tick) => {
          if (cancelled || !tick.ok) return
          setState((s) => ({
            running: true,
            error: null,
            vadProb: typeof tick.prob === 'number' ? tick.prob : s.vadProb,
            astTop: tick.top ?? s.astTop,
          }))
        }).catch(() => undefined)
      }, FEED_INTERVAL_MS)
    }

    start().catch((err) => {
      if (cancelled) return
      void teardown()
      setState({ running: false, error: err instanceof Error ? err.message : String(err), vadProb: null, astTop: null })
    })

    return () => {
      cancelled = true
      void teardown()
    }
  }, [source])

  return state
}
