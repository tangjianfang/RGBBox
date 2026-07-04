import { useEffect, useRef, type JSX } from 'react'
import {
  AUDIO_VIZ_CHANNEL,
  createSpectrogramBuffer,
  createVuPeakState,
  drawVisualizerFrame,
  type AudioVizMessage
} from '../audio/visualizers'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
}

/**
 * R29.3 (revised): full-resolution audio visualizer projector window.
 *
 * Renders the exact same canvas animation as the studio view's local
 * visualizer — not a downsampled LED grid — by receiving live
 * frequency/time-domain snapshots from the main studio window over a
 * same-origin `BroadcastChannel` (no main-process IPC hop needed for the
 * per-frame data; only window open/close goes through IPC).
 */
export function AudioVizProjector({ displayId }: Props): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spectrogramBufferRef = useRef<Uint8Array[]>(createSpectrogramBuffer())
  const vuPeakRef = useRef(createVuPeakState())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      const w = Math.max(1, Math.round((canvas.clientWidth || window.innerWidth) * dpr))
      const h = Math.max(1, Math.round((canvas.clientHeight || window.innerHeight) * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const channel = new BroadcastChannel(AUDIO_VIZ_CHANNEL)
    channel.onmessage = (event: MessageEvent<AudioVizMessage>) => {
      const { mode, freq, time } = event.data
      if (mode === 'waveform') return // not projectable — rendered by wavesurfer.js locally only
      drawVisualizerFrame(canvas, mode, freq, time, spectrogramBufferRef.current, vuPeakRef.current)
    }

    return () => {
      ro.disconnect()
      channel.close()
    }
  }, [displayId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#080d11' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 14px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.55)',
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        pointerEvents: 'none',
        animation: 'overlayHintFade 3s ease 1.5s forwards',
        whiteSpace: 'nowrap'
      }}>
        {t('overlay.hint')}
      </div>
    </div>
  )
}
