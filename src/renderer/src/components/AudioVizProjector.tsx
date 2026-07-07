import { useEffect, useRef, useState, type JSX } from 'react'
import {
  AUDIO_VIZ_CHANNEL,
  createSpectrogramBuffer,
  createVuPeakState,
  drawVisualizerFrame,
  regionPresetToRect,
  type AudioVizMessage,
  type RegionPreset,
  type RegionRect,
  type VizDrawOpts,
} from '../audio/visualizers'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
}

interface RegionState { preset: RegionPreset; rect: RegionRect }

function loadRegion(): RegionRect {
  try {
    const raw = localStorage.getItem('rgbbox:audioVizRegion')
    if (!raw) return { x: 0, y: 0, w: 1, h: 1 }
    const s = JSON.parse(raw) as RegionState
    return regionPresetToRect(s.preset, s.rect)
  } catch { return { x: 0, y: 0, w: 1, h: 1 } }
}

/**
 * R29.3 (revised) + R52.7: full-resolution audio visualizer projector window.
 * R52.7 A-scheme: overlay window covers the full display; the canvas is laid
 * out inside the region rect (read from localStorage, written by the studio
 * view). Pure renderer — no main/preload change.
 */
export function AudioVizProjector({ displayId }: Props): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spectrogramBufferRef = useRef<Uint8Array[]>(createSpectrogramBuffer())
  const vuPeakRef = useRef(createVuPeakState())
  const [region, setRegion] = useState<RegionRect>(() => loadRegion())

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === 'rgbbox:audioVizRegion') setRegion(loadRegion())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

    // 投屏艺术品模式：不显示数值，art 风格
    const opts: VizDrawOpts = { showMetrics: false, style: 'art' }

    const channel = new BroadcastChannel(AUDIO_VIZ_CHANNEL)
    channel.onmessage = (event: MessageEvent<AudioVizMessage>) => {
      const { mode, freq, time } = event.data
      if (mode === 'waveform') return
      drawVisualizerFrame(canvas, mode, freq, time, spectrogramBufferRef.current, vuPeakRef.current, opts)
    }

    return () => {
      ro.disconnect()
      channel.close()
    }
  }, [displayId])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.w * 100}%`,
          height: `${region.h * 100}%`,
          display: 'block',
        }}
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
