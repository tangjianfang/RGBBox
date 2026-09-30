/**
 * useSuperres — R93 tier-1 orchestration hook (video player only).
 *
 * Same state-machine shape as the R91.3b denoise flow: enable → model download
 * (reusing the R90 modelDownload pipeline + progress push) → engine session
 * (webgpu → webgl → wasm-cpu) → rAF frame pump. The pump skips frames while an
 * inference is in flight (busy flag) — playback is never blocked and the output
 * canvas simply keeps the most recent upscaled frame (zero-cost "复制最近输出").
 *
 * The upscaled frame is drawn to an output canvas the component overlays on the
 * <video> (same CSS rect); the original video stays the source for playback,
 * audio and light-effect sampling (R93 non-goal: the sampling chain is untouched).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  RollingFps,
  SuperresEngine,
  fileUrlToMediaUrl,
  pickBackendOrder,
  planSuperresPass,
  probeBackendAvailability,
  type SuperresBackend,
  type SuperresScale,
} from './superres'

export type SuperresStatus = 'idle' | 'downloading' | 'starting' | 'on' | 'error'

export const SUPERRES_MODEL_NAME = 'realesr_animevideov3'

export function useSuperres(
  videoRef: RefObject<HTMLVideoElement | null>,
  opts: { active?: boolean } = {},
): {
  status: SuperresStatus
  scale: SuperresScale
  setScale: (s: SuperresScale) => void
  backend: SuperresBackend | null
  fps: number
  /** download percent 0-100 while status==='downloading', else null */
  progress: number | null
  message: string
  toggle: (on: boolean) => void
  outputCanvasRef: React.RefObject<HTMLCanvasElement | null>
} {
  const active = opts.active ?? true

  const engineRef = useRef<SuperresEngine | null>(null)
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  /** bumped by disable() — an in-flight enable() aborts instead of late-flipping to 'on' */
  const genRef = useRef(0)
  const scaleRef = useRef<SuperresScale>(2)
  const lastMediaTimeRef = useRef(-1)
  const fpsRef = useRef(new RollingFps())

  const [status, setStatus] = useState<SuperresStatus>('idle')
  const [scale, setScaleState] = useState<SuperresScale>(2)
  const [backend, setBackend] = useState<SuperresBackend | null>(null)
  const [fps, setFps] = useState(0)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  /** True if the current source is a remote no-CORS stream (canvas would taint). */
  const isRemoteNoCors = useCallback((): boolean => {
    const el = videoRef.current
    if (!el || !el.currentSrc) return false
    return /^https?:\/\//i.test(el.currentSrc) && !el.crossOrigin
  }, [videoRef])

  // ── download progress (R90 pipeline pushes on the shared channel) ─────────
  useEffect(() => {
    const off = window.rgbbox.onModelDownloadProgress((p) => {
      if (p.name !== SUPERRES_MODEL_NAME) return
      if (p.error) { setProgress(null); return }
      setProgress(Math.round(p.percent))
    })
    return () => { off() }
  }, [])

  const enable = useCallback(async (): Promise<void> => {
    if (status === 'downloading' || status === 'starting') return
    const gen = genRef.current
    setMessage('')
    if (isRemoteNoCors()) { setStatus('error'); setMessage('ERR_REMOTE'); return }
    setStatus('downloading')
    setProgress(0)
    try {
      // modelDownload returns a cached copy instantly when the model exists.
      const fileUrl = await window.rgbbox.modelDownload(SUPERRES_MODEL_NAME)
      if (gen !== genRef.current) return // user toggled off mid-download
      setProgress(null)
      setStatus('starting')
      const res = await fetch(fileUrlToMediaUrl(fileUrl))
      if (!res.ok) throw new Error(`model fetch HTTP ${res.status}`)
      const modelBuffer = await res.arrayBuffer()
      if (gen !== genRef.current) return

      if (!engineRef.current) engineRef.current = new SuperresEngine()
      const order = pickBackendOrder(await probeBackendAvailability())
      const used = await engineRef.current.ensureSession(modelBuffer, order)
      if (gen !== genRef.current) return
      setBackend(used)

      lastMediaTimeRef.current = -1
      fpsRef.current.reset()
      setStatus('on')
    } catch (err) {
      if (gen !== genRef.current) return
      setStatus('error')
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [status, isRemoteNoCors])

  const disable = useCallback((): void => {
    genRef.current++
    setStatus('idle')
    setFps(0)
    // Keep the session warm for a cheap re-enable; teardown happens on unmount.
  }, [])

  const toggle = useCallback((on: boolean): void => {
    if (on) void enable()
    else disable()
  }, [enable, disable])

  const setScale = useCallback((s: SuperresScale): void => {
    scaleRef.current = s
    setScaleState(s)
    lastMediaTimeRef.current = -1 // force a repaint at the new plan
  }, [])

  // ── frame pump ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'on' || !active) return
    const tick = (): void => {
      rafRef.current = requestAnimationFrame(tick)
      const engine = engineRef.current
      const video = videoRef.current
      const canvas = outputCanvasRef.current
      if (!engine || !video || !canvas || busyRef.current || engine.busy) return
      if (video.readyState < 2 || video.paused || video.ended) return
      // Same media clock tick as last pass → identical frame; skip.
      if (video.currentTime === lastMediaTimeRef.current) return
      lastMediaTimeRef.current = video.currentTime
      const plan = planSuperresPass(video.videoWidth, video.videoHeight, scaleRef.current)
      engine.busy = true
      busyRef.current = true
      engine.processFrame(video, canvas, plan)
        .then((ms) => {
          engine.busy = false
          busyRef.current = false
          if (ms != null) fpsRef.current.push(performance.now())
        })
        .catch((err: unknown) => {
          engine.busy = false
          busyRef.current = false
          // Tainted canvas (remote no-CORS switched in mid-session) or a dead
          // session: stop the pipeline and surface the error instead of looping.
          genRef.current++
          setStatus('error')
          setMessage(err instanceof Error ? err.message : String(err))
        })
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, active, videoRef])

  // fps readout: 2Hz state sync (the pump itself stays ref-only)
  useEffect(() => {
    if (status !== 'on') return
    const id = window.setInterval(() => setFps(fpsRef.current.value), 500)
    return () => { window.clearInterval(id) }
  }, [status])

  // Real teardown only on unmount (keep-alive view stays mounted across tabs).
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    engineRef.current?.dispose()
    engineRef.current = null
  }, [])

  return {
    status, scale, setScale, backend, fps, progress, message, toggle, outputCanvasRef,
  }
}
