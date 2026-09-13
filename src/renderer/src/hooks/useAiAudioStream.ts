// R90.9 L3: pipeline state machine over a PcmSource. The hook owns exactly
// one responsibility — wire a source's 16kHz batches to the main-process
// streaming session and expose per-stage state. Capture mechanics live in
// tools/pcmSource.ts (L2, injectable for tests), math in tools/pcm.ts (L1).
import { useEffect, useState } from 'react'
import { startPcmSource, type PcmSourceHandle, type SourceId } from '../tools/pcmSource'

export type PipelineStage = 'idle' | 'capturing' | 'inferring' | 'results' | 'error'

export interface AiAudioStreamState {
  stage: PipelineStage
  /** Raw driver rate before resampling (48k→16k display). */
  actualRate: number | null
  error: string | null
  level: number
  vadProb: number | null
  astTop: Array<{ index: number; score: number }> | null
  astState: 'running' | 'waiting-audio' | 'cadence' | null
  /** Count of batches fed — the self-test's "pipeline alive" assertion. */
  batches: number
}

const IDLE: AiAudioStreamState = {
  stage: 'idle', actualRate: null, error: null, level: 0,
  vadProb: null, astTop: null, astState: null, batches: 0,
}

export function useAiAudioStream(source: SourceId | null): AiAudioStreamState {
  const [state, setState] = useState<AiAudioStreamState>(IDLE)

  useEffect(() => {
    if (source === null) {
      setState(IDLE)
      return
    }
    let cancelled = false
    let handle: PcmSourceHandle | null = null
    let lastResults = { vadProb: null as number | null, astTop: null as Array<{ index: number; score: number }> | null, astState: null as AiAudioStreamState['astState'] }

    setState({ ...IDLE, stage: 'capturing' })

    const teardown = async (): Promise<void> => {
      await handle?.stop().catch(() => undefined)
      handle = null
      await window.rgbbox.audioAiStreamStop().catch(() => undefined)
    }

    const start = async (): Promise<void> => {
      await window.rgbbox.audioAiStreamStart()
      handle = await startPcmSource(source, (pcm) => {
        if (cancelled) return
        void window.rgbbox.audioAiStreamFeed(pcm).then((tick) => {
          if (cancelled || !tick.ok) return
          if (typeof tick.prob === 'number') lastResults.vadProb = tick.prob
          if (tick.top) lastResults.astTop = tick.top
          if (tick.astState) lastResults.astState = tick.astState
          setState((s) => ({
            stage: tick.astState === 'running' ? 'inferring' : 'results',
            actualRate: s.actualRate,
            error: null,
            level: typeof tick.rms === 'number' ? tick.rms : s.level,
            vadProb: lastResults.vadProb,
            astTop: lastResults.astTop,
            astState: lastResults.astState,
            batches: s.batches + 1,
          }))
        }).catch(() => undefined)
      })
      if (cancelled) { await teardown(); return }
      setState((s) => ({ ...s, actualRate: handle?.actualRate ?? null }))
    }

    start().catch((err) => {
      if (cancelled) return
      void teardown()
      setState({ ...IDLE, stage: 'error', error: err instanceof Error ? err.message : String(err) })
    })

    return () => {
      cancelled = true
      void teardown()
    }
  }, [source])

  return state
}
