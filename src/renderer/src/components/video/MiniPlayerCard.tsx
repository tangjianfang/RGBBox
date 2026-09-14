/**
 * MiniPlayerCard — R91.2 应用内悬浮迷你播放器。
 *
 * 视频工作站被 keep-alive 隐藏（display:none 祖先）时接管画面：canvas 以 rAF
 * 镜像隐藏 <video> 的解码帧（音频由原元素继续出声——display:none 不停止播放，
 * 仅不参与布局/绘制）。标题栏拖动、右下角缩放（240–480px，按视频纵横比定高）、
 * 播放/暂停/进度/音量/静音/返回播放器/关闭；位置与宽度记入 localStorage。
 * 自身经 portal 渲染到 document.body，不受任何 display:none 祖先影响。
 */
import { useCallback, useEffect, useRef, useState, type JSX, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { formatMediaTime } from '../../../../shared/timeFormat'

const MINI_STORAGE_KEY = 'rgbbox:miniPlayer'
const MIN_W = 240
const MAX_W = 480

interface MiniPos {
  x: number
  y: number
  w: number
}

function loadPos(): MiniPos | null {
  try {
    const raw = localStorage.getItem(MINI_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number' && typeof p?.w === 'number') return p
  } catch { /* ignore */ }
  return null
}

export interface MiniPlayerCardProps {
  videoRef: RefObject<HTMLVideoElement | null>
  title: string
  playing: boolean
  currentTime: number
  duration: number
  live: boolean
  volume: number
  muted: boolean
  onTogglePlay: () => void
  onSeek: (t: number) => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onReturn: () => void
  onClose: () => void
}

export function MiniPlayerCard(props: MiniPlayerCardProps): JSX.Element | null {
  const { t } = useI18n()
  const { videoRef, title, playing, currentTime, duration, live, volume, muted } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const resizeRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<MiniPos | null>(() => loadPos())
  const posRef = useRef<MiniPos | null>(pos)
  posRef.current = pos
  const cardRef = useRef<HTMLDivElement | null>(null)

  const clampPos = useCallback((p: MiniPos): MiniPos => {
    const w = p.w
    const el = videoRef.current
    const aspect = el && el.videoWidth ? el.videoHeight / el.videoWidth : 9 / 16
    const h = Math.round(w * aspect)
    return {
      w,
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w - 8)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - h - 52)),
    }
  }, [videoRef])

  const persistPos = useCallback(() => {
    const p = posRef.current
    if (p) { try { localStorage.setItem(MINI_STORAGE_KEY, JSON.stringify(p)) } catch { /* ignore */ } }
  }, [])

  // ── Frame mirror: rAF while playing; a single draw when paused/mounted ──
  const drawFrame = useCallback(() => {
    const c = canvasRef.current
    const el = videoRef.current
    if (!c || !el || !el.videoWidth) return
    const aspect = el.videoHeight / el.videoWidth
    const w = 480 // internal resolution; CSS scales down — cheap and crisp
    const h = Math.round(w * aspect)
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    c.getContext('2d')?.drawImage(el, 0, 0, w, h)
  }, [videoRef])

  useEffect(() => {
    drawFrame()
    if (!playing) return
    let raf = 0
    const loop = () => { drawFrame(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, drawFrame, currentTime])

  // ── Drag by header; live clamp; persist on release ──────────────────────
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Buttons in the header must keep their clicks — pointer capture on the
      // header would retarget the ensuing click away from them.
      if ((e.target as HTMLElement).closest('button')) return
      e.preventDefault()
      const card = cardRef.current
      const start = posRef.current ?? {
        x: card ? window.innerWidth - card.offsetWidth - 24 : window.innerWidth - 324 - 24,
        y: card ? window.innerHeight - card.offsetHeight - 24 : window.innerHeight - 220,
        w: 320,
      }
      const ox = e.clientX - start.x
      const oy = e.clientY - start.y
      header.setPointerCapture(e.pointerId)
      const onMove = (ev: PointerEvent) => {
        setPos(clampPos({ x: ev.clientX - ox, y: ev.clientY - oy, w: start.w }))
      }
      const onUp = () => {
        header.releasePointerCapture(e.pointerId)
        header.removeEventListener('pointermove', onMove)
        header.removeEventListener('pointerup', onUp)
        persistPos()
      }
      header.addEventListener('pointermove', onMove)
      header.addEventListener('pointerup', onUp)
    }
    header.addEventListener('pointerdown', onDown)
    return () => header.removeEventListener('pointerdown', onDown)
  }, [clampPos, persistPos])

  // ── Resize by bottom-right handle; width clamped 240–480 ───────────────
  useEffect(() => {
    const handle = resizeRef.current
    if (!handle) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const startW = posRef.current?.w ?? 320
      const startX = e.clientX
      const growLeft = handle.getBoundingClientRect().left < window.innerWidth / 2
      handle.setPointerCapture(e.pointerId)
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(MAX_W, Math.max(MIN_W, growLeft ? startW + (ev.clientX - startX) : startW + (startX - ev.clientX)))
        const p = posRef.current
        const anchorX = p ? p.x + p.w : window.innerWidth - 24
        setPos(clampPos({ x: anchorX - next, y: p?.y ?? 24, w: next }))
      }
      const onUp = () => {
        handle.releasePointerCapture(e.pointerId)
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
        persistPos()
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    }
    handle.addEventListener('pointerdown', onDown)
    return () => handle.removeEventListener('pointerdown', onDown)
  }, [clampPos, persistPos])

  const aspect = (() => {
    const el = videoRef.current
    return el && el.videoWidth ? el.videoHeight / el.videoWidth : 9 / 16
  })()
  const width = pos?.w ?? 320
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, width }
    : { right: 24, bottom: 24, width }

  return createPortal(
    <div className="mini-player" ref={cardRef} style={style}>
      <div className="mini-player-header" ref={headerRef} onDoubleClick={props.onReturn}>
        <span className="mini-player-title" title={title}>{title}</span>
        <button type="button" className="mini-player-icon-btn" onClick={props.onReturn} title={t('video.mini.return')}><Maximize2 size={13} /></button>
        <button type="button" className="mini-player-icon-btn" onClick={props.onClose} title={t('video.mini.close')}><X size={14} /></button>
      </div>
      <div className="mini-player-body" onClick={props.onTogglePlay}>
        <canvas ref={canvasRef} className="mini-player-canvas" style={{ aspectRatio: `${1} / ${aspect}` }} />
        {!playing && <div className="mini-player-paused-badge"><Play size={18} /></div>}
      </div>
      <div className="mini-player-controls" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mini-player-icon-btn" onClick={props.onTogglePlay}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="mini-player-time">{formatMediaTime(currentTime)}</span>
        <input
          className="mini-player-seek"
          type="range" min={0} max={live ? 100 : Math.max(1, Math.floor(duration))} step={1}
          value={live ? 100 : Math.min(currentTime, duration)}
          disabled={live}
          onChange={(e) => props.onSeek(Number(e.target.value))}
        />
        <span className="mini-player-time">{live ? 'LIVE' : formatMediaTime(duration)}</span>
        <button type="button" className="mini-player-icon-btn" onClick={props.onToggleMute}>
          {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          className="mini-player-vol"
          type="range" min={0} max={1} step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => props.onVolume(Number(e.target.value))}
        />
      </div>
      <div className="mini-player-resize" ref={resizeRef} />
    </div>,
    document.body,
  )
}
