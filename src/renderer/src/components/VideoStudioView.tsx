/**
 * VideoStudioView — a full-featured video workstation.
 *
 * Capabilities:
 *   • Camera: enumerate / select any webcam, choose resolution & frame-rate,
 *     mirror, live hardware parameter controls (brightness / contrast / zoom …
 *     where supported), still-photo capture and video recording.
 *   • Screen / Window / Browser capture: list every display and application
 *     window (via Electron desktopCapturer) and stream it live, with recording.
 *   • Player: load and play mainstream video formats (mp4 / webm / mkv / mov …)
 *     with speed, loop and frame-snapshot controls.
 *
 * All preview surfaces are large and the layout is column-based so the live
 * image always gets the dominant share of the viewport.
 */

import {
  Camera, CameraOff, Circle, Download, FlipHorizontal, Image as ImageIcon,
  Maximize2, Minimize2, Monitor, MonitorPlay, Pause, Play, RefreshCw,
  Square, Video, Film, AppWindow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import type { CaptureSource } from '../../../shared/types'

type Mode = 'camera' | 'screen' | 'player'

interface DeviceOption {
  deviceId: string
  label: string
}

interface FilterState {
  brightness: number
  contrast: number
  saturate: number
  hue: number
  blur: number
  grayscale: number
  sepia: number
  invert: number
}

const DEFAULT_FILTERS: FilterState = {
  brightness: 100, contrast: 100, saturate: 100, hue: 0,
  blur: 0, grayscale: 0, sepia: 0, invert: 0,
}

const RESOLUTIONS: Array<{ label: string; w: number; h: number }> = [
  { label: '640×480 (VGA)', w: 640, h: 480 },
  { label: '1280×720 (HD)', w: 1280, h: 720 },
  { label: '1920×1080 (FHD)', w: 1920, h: 1080 },
  { label: '2560×1440 (QHD)', w: 2560, h: 1440 },
  { label: '3840×2160 (4K)', w: 3840, h: 2160 },
]

const FRAME_RATES = [15, 24, 30, 60]

/** Hardware track capabilities we expose sliders for, when the camera supports them. */
const TRACK_CONTROLS = ['brightness', 'contrast', 'saturation', 'sharpness', 'zoom'] as const
type TrackControl = (typeof TRACK_CONTROLS)[number]

function filterCss(f: FilterState): string {
  return [
    `brightness(${f.brightness}%)`,
    `contrast(${f.contrast}%)`,
    `saturate(${f.saturate}%)`,
    `hue-rotate(${f.hue}deg)`,
    `blur(${f.blur}px)`,
    `grayscale(${f.grayscale}%)`,
    `sepia(${f.sepia}%)`,
    `invert(${f.invert}%)`,
  ].join(' ')
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${pad(m)}:${pad(s)}`
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export function VideoStudioView(): JSX.Element {
  const { t } = useI18n()

  const [mode, setMode] = useState<Mode>('camera')

  // ── Live preview ─────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamInfo, setStreamInfo] = useState<string>('')

  // ── Camera ───────────────────────────────────────────────────────────────
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [resIndex, setResIndex] = useState<number>(1)
  const [fps, setFps] = useState<number>(30)
  const [mirror, setMirror] = useState<boolean>(true)
  const [trackCaps, setTrackCaps] = useState<Partial<Record<TrackControl, MediaSettingsRange>>>({})
  const [trackVals, setTrackVals] = useState<Partial<Record<TrackControl, number>>>({})

  // ── Screen capture ─────────────────────────────────────────────────────────
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [sourceFilter, setSourceFilter] = useState<'all' | 'screen' | 'window'>('all')
  const [loadingSources, setLoadingSources] = useState(false)
  const [activeSourceId, setActiveSourceId] = useState<string>('')

  // ── Player ───────────────────────────────────────────────────────────────
  const playerRef = useRef<HTMLVideoElement | null>(null)
  const [playerUrl, setPlayerUrl] = useState<string>('')
  const [playerName, setPlayerName] = useState<string>('')
  const [playerRate, setPlayerRate] = useState<number>(1)
  const [playerLoop, setPlayerLoop] = useState<boolean>(false)
  const playerFileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Filters / view ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [fullscreen, setFullscreen] = useState(false)

  // ── Recording ──────────────────────────────────────────────────────────────
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [recElapsed, setRecElapsed] = useState(0)
  const recStartRef = useRef(0)
  const recTimerRef = useRef<number | null>(null)

  const [lastShot, setLastShot] = useState<string>('')

  const filterStyle = useMemo(() => filterCss(filters), [filters])

  // ── Helpers ─────────────────────────────────────────────────────────────
  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* noop */ }
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStreaming(false)
    setStreamInfo('')
    setTrackCaps({})
    setTrackVals({})
  }, [])

  const attachStream = useCallback((stream: MediaStream) => {
    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      void videoRef.current.play().catch(() => { /* autoplay may defer */ })
    }
    setStreaming(true)
    setStreamError(null)

    const track = stream.getVideoTracks()[0]
    if (track) {
      const settings = track.getSettings()
      setStreamInfo(`${settings.width ?? '?'}×${settings.height ?? '?'} · ${Math.round(settings.frameRate ?? 0)}fps`)
      // Discover adjustable hardware capabilities (Chromium-specific extensions).
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>
      const settingsAny = settings as unknown as Record<string, number>
      const foundCaps: Partial<Record<TrackControl, MediaSettingsRange>> = {}
      const foundVals: Partial<Record<TrackControl, number>> = {}
      for (const key of TRACK_CONTROLS) {
        const cap = caps[key] as MediaSettingsRange | undefined
        if (cap && typeof cap.min === 'number' && typeof cap.max === 'number' && cap.max > cap.min) {
          foundCaps[key] = cap
          foundVals[key] = settingsAny[key] ?? (cap.min + cap.max) / 2
        }
      }
      setTrackCaps(foundCaps)
      setTrackVals(foundVals)
    }
  }, [])

  // ── Enumerate cameras ──────────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cams = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      setDevices(cams)
      setDeviceId((prev) => prev || cams[0]?.deviceId || '')
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // ── Start camera ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    stopStream()
    const res = RESOLUTIONS[resIndex]
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: res.w },
          height: { ideal: res.h },
          frameRate: { ideal: fps },
        },
      })
      attachStream(stream)
      // Labels become available only after permission is granted.
      void refreshDevices()
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
      setStreaming(false)
    }
  }, [stopStream, resIndex, deviceId, fps, attachStream, refreshDevices])

  // ── Screen / window sources ─────────────────────────────────────────────────
  const refreshSources = useCallback(async () => {
    setLoadingSources(true)
    try {
      const list = await window.rgbbox.getCaptureSources()
      setSources(list)
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingSources(false)
    }
  }, [])

  const startScreenCapture = useCallback(async (sourceId: string) => {
    stopStream()
    setActiveSourceId(sourceId)
    try {
      // Electron exposes desktop sources through the legacy chromeMediaSource constraint.
      const constraints = {
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxFrameRate: 60,
          },
        },
      } as unknown as MediaStreamConstraints
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      attachStream(stream)
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
      setStreaming(false)
    }
  }, [stopStream, attachStream])

  // ── Apply a hardware track constraint ───────────────────────────────────────
  const applyTrackControl = useCallback((key: TrackControl, value: number) => {
    setTrackVals((v) => ({ ...v, [key]: value }))
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.applyConstraints({ advanced: [{ [key]: value }] } as unknown as MediaTrackConstraints)
      .catch(() => { /* unsupported value — ignore */ })
  }, [])

  // ── Photo capture ──────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const source = mode === 'player' ? playerRef.current : videoRef.current
    if (!source || !source.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = source.videoWidth
    canvas.height = source.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.filter = filterStyle
    if (mirror && mode === 'camera') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/png')
    setLastShot(url)
    const a = document.createElement('a')
    a.href = url
    a.download = `rgbbox-photo-${Date.now()}.png`
    a.click()
  }, [mode, filterStyle, mirror])

  // ── Recording ──────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mimeType = pickMimeType()
    chunksRef.current = []
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
      return
    }
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob)
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const a = document.createElement('a')
      a.href = url
      a.download = `rgbbox-recording-${Date.now()}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setRecording(false)
      if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null }
    }
    recorder.start(100)
    recorderRef.current = recorder
    recStartRef.current = Date.now()
    setRecElapsed(0)
    setRecording(true)
    recTimerRef.current = window.setInterval(() => setRecElapsed(Date.now() - recStartRef.current), 250)
  }, [])

  // ── Player file ─────────────────────────────────────────────────────────────
  const onPlayerFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPlayerUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
    setPlayerName(file.name)
  }, [])

  // ── Mode switch: (re)load source lists ──────────────────────────────────────
  useEffect(() => {
    if (mode === 'camera') void refreshDevices()
    if (mode === 'screen') void refreshSources()
  }, [mode, refreshDevices, refreshSources])

  // Stop live capture whenever we switch away from a live mode.
  const prevModeRef = useRef<Mode>('camera')
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      stopStream()
      prevModeRef.current = mode
    }
  }, [mode, stopStream])

  // Player playback rate / loop
  useEffect(() => { if (playerRef.current) playerRef.current.playbackRate = playerRate }, [playerRate, playerUrl])

  // Full cleanup on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    if (recTimerRef.current) window.clearInterval(recTimerRef.current)
  }, [])

  // ESC exits in-app fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const filteredSources = sources.filter((s) => sourceFilter === 'all' || s.type === sourceFilter)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`video-studio${fullscreen ? ' video-studio-fullscreen' : ''}`}>
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('video.eyebrow')}</p>
          <h2>{t('video.title')}</h2>
        </div>
        <div className="video-mode-bar">
          <button type="button" className={`video-mode-btn ${mode === 'camera' ? 'active' : ''}`} onClick={() => setMode('camera')}>
            <Camera size={15} /> {t('video.mode.camera')}
          </button>
          <button type="button" className={`video-mode-btn ${mode === 'screen' ? 'active' : ''}`} onClick={() => setMode('screen')}>
            <MonitorPlay size={15} /> {t('video.mode.screen')}
          </button>
          <button type="button" className={`video-mode-btn ${mode === 'player' ? 'active' : ''}`} onClick={() => setMode('player')}>
            <Film size={15} /> {t('video.mode.player')}
          </button>
        </div>
      </header>

      <div className="video-layout">
        {/* ── Stage ─────────────────────────────────────────────────────── */}
        <div className="video-stage">
          <div className="video-preview-wrap">
            {mode === 'player' ? (
              <video
                ref={playerRef}
                className="video-preview"
                style={{ filter: filterStyle }}
                src={playerUrl || undefined}
                controls
                loop={playerLoop}
              />
            ) : (
              <video
                ref={videoRef}
                className="video-preview"
                style={{ filter: filterStyle, transform: mirror && mode === 'camera' ? 'scaleX(-1)' : undefined }}
                autoPlay
                playsInline
                muted
              />
            )}

            {/* Empty-state overlay */}
            {mode !== 'player' && !streaming && (
              <div className="video-empty">
                {mode === 'camera' ? <CameraOff size={40} /> : <Monitor size={40} />}
                <span>{streamError ? `⚠ ${streamError}` : t('video.notLive')}</span>
              </div>
            )}
            {mode === 'player' && !playerUrl && (
              <div className="video-empty">
                <Film size={40} />
                <span>{t('video.player.empty')}</span>
              </div>
            )}

            {/* Live badges */}
            {mode !== 'player' && streaming && (
              <div className="video-badges">
                {streamInfo && <span className="video-badge">{streamInfo}</span>}
                {recording && <span className="video-badge video-badge-rec"><Circle size={9} fill="currentColor" /> REC {formatElapsed(recElapsed)}</span>}
              </div>
            )}

            <button
              type="button"
              className="video-fs-btn"
              title={t(fullscreen ? 'video.exitFullscreen' : 'video.fullscreen')}
              onClick={() => setFullscreen((v) => !v)}
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* Transport controls */}
          <div className="video-transport">
            {mode === 'camera' && (
              <>
                {streaming ? (
                  <button type="button" className="video-btn" onClick={stopStream}><CameraOff size={15} /> {t('video.stop')}</button>
                ) : (
                  <button type="button" className="video-btn video-btn-primary" onClick={() => void startCamera()}><Camera size={15} /> {t('video.start')}</button>
                )}
                <button type="button" className={`video-btn ${mirror ? 'active' : ''}`} onClick={() => setMirror((v) => !v)} title={t('video.mirror')}><FlipHorizontal size={15} /></button>
              </>
            )}
            {mode === 'screen' && streaming && (
              <button type="button" className="video-btn" onClick={stopStream}><Square size={15} /> {t('video.stop')}</button>
            )}
            {mode === 'player' && (
              <>
                <button type="button" className="video-btn video-btn-primary" onClick={() => playerFileInputRef.current?.click()}><Video size={15} /> {t('video.player.open')}</button>
                <button type="button" className="video-btn" onClick={() => { const p = playerRef.current; if (p) p.paused ? void p.play() : p.pause() }}><Play size={15} />/<Pause size={15} /></button>
                <button type="button" className={`video-btn ${playerLoop ? 'active' : ''}`} onClick={() => setPlayerLoop((v) => !v)} title={t('video.player.loop')}><RefreshCw size={15} /></button>
                <select className="profile-select" value={playerRate} onChange={(e) => setPlayerRate(Number(e.target.value))} title={t('video.player.speed')}>
                  {[0.25, 0.5, 1, 1.5, 2, 4].map((r) => <option key={r} value={r}>{r}×</option>)}
                </select>
                <input ref={playerFileInputRef} type="file" accept="video/*,.mkv,.mov,.avi,.flv,.ts" style={{ display: 'none' }} onChange={onPlayerFile} />
              </>
            )}

            {/* Universal capture buttons (live + player) */}
            {(streaming || (mode === 'player' && playerUrl)) && (
              <>
                <span className="video-transport-sep" />
                <button type="button" className="video-btn" onClick={capturePhoto}><ImageIcon size={15} /> {t('video.photo')}</button>
                {mode !== 'player' && (
                  recording
                    ? <button type="button" className="video-btn video-btn-rec" onClick={stopRecording}><Square size={15} /> {t('video.recStop')}</button>
                    : <button type="button" className="video-btn" onClick={startRecording}><Circle size={13} fill="currentColor" /> {t('video.rec')}</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Inspector ─────────────────────────────────────────────────── */}
        <aside className="video-inspector">
          {mode === 'camera' && (
            <section className="video-panel">
              <h3 className="video-panel-title">{t('video.cameraSettings')}</h3>
              <label className="video-field-label">{t('video.device')}</label>
              <div className="video-row">
                <select className="profile-select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  {devices.length === 0 && <option value="">{t('video.noCamera')}</option>}
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
                <button type="button" className="video-btn video-btn-icon" onClick={() => void refreshDevices()} title={t('video.refresh')}><RefreshCw size={14} /></button>
              </div>

              <label className="video-field-label">{t('video.resolution')}</label>
              <select className="profile-select" value={resIndex} onChange={(e) => setResIndex(Number(e.target.value))}>
                {RESOLUTIONS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
              </select>

              <label className="video-field-label">{t('video.frameRate')}</label>
              <select className="profile-select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                {FRAME_RATES.map((f) => <option key={f} value={f}>{f} fps</option>)}
              </select>

              {streaming && Object.keys(trackCaps).length > 0 && (
                <>
                  <h3 className="video-panel-title" style={{ marginTop: 14 }}>{t('video.hwControls')}</h3>
                  {(Object.keys(trackCaps) as TrackControl[]).map((key) => {
                    const cap = trackCaps[key]!
                    return (
                      <div key={key} className="video-slider-row">
                        <span className="video-label">{t(`video.hw.${key}` as never)}</span>
                        <input
                          type="range" min={cap.min} max={cap.max} step={cap.step || 1}
                          value={trackVals[key] ?? cap.min}
                          onChange={(e) => applyTrackControl(key, Number(e.target.value))}
                        />
                      </div>
                    )
                  })}
                </>
              )}
              {streaming && (
                <p className="video-hint">{t('video.start')} ✓ — {streamInfo}</p>
              )}
            </section>
          )}

          {mode === 'screen' && (
            <section className="video-panel">
              <div className="video-row">
                <h3 className="video-panel-title" style={{ flex: 1 }}>{t('video.sources')}</h3>
                <button type="button" className="video-btn video-btn-icon" onClick={() => void refreshSources()} title={t('video.refresh')}><RefreshCw size={14} /></button>
              </div>
              <div className="video-source-filter">
                {(['all', 'screen', 'window'] as const).map((f) => (
                  <button key={f} type="button" className={`video-chip ${sourceFilter === f ? 'active' : ''}`} onClick={() => setSourceFilter(f)}>
                    {f === 'screen' ? <Monitor size={12} /> : f === 'window' ? <AppWindow size={12} /> : null}
                    {t(`video.source.${f}` as never)}
                  </button>
                ))}
              </div>
              <div className="video-source-grid">
                {loadingSources && <p className="video-hint">{t('video.loadingSources')}</p>}
                {!loadingSources && filteredSources.length === 0 && <p className="video-hint">{t('video.noSources')}</p>}
                {filteredSources.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`video-source-card ${activeSourceId === s.id ? 'active' : ''}`}
                    onClick={() => void startScreenCapture(s.id)}
                    title={s.name}
                  >
                    {s.thumbnail
                      ? <img src={s.thumbnail} alt="" />
                      : <div className="video-source-thumb-empty"><Monitor size={24} /></div>}
                    <span className="video-source-name">
                      {s.appIcon && <img className="video-source-icon" src={s.appIcon} alt="" />}
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {mode === 'player' && (
            <section className="video-panel">
              <h3 className="video-panel-title">{t('video.player.title')}</h3>
              <p className="video-hint">{playerName || t('video.player.empty')}</p>
              <p className="video-hint" style={{ opacity: 0.6 }}>{t('video.player.formats')}</p>
            </section>
          )}

          {/* Filters apply to every mode */}
          <section className="video-panel">
            <div className="video-row">
              <h3 className="video-panel-title" style={{ flex: 1 }}>{t('video.filters')}</h3>
              <button type="button" className="video-btn video-btn-icon" onClick={() => setFilters(DEFAULT_FILTERS)} title={t('video.reset')}><RefreshCw size={14} /></button>
            </div>
            {([
              ['brightness', 0, 200], ['contrast', 0, 200], ['saturate', 0, 300], ['hue', 0, 360],
              ['blur', 0, 20], ['grayscale', 0, 100], ['sepia', 0, 100], ['invert', 0, 100],
            ] as Array<[keyof FilterState, number, number]>).map(([key, min, max]) => (
              <div key={key} className="video-slider-row">
                <span className="video-label">{t(`video.filter.${key}` as never)}</span>
                <input
                  type="range" min={min} max={max}
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </section>

          {lastShot && (
            <section className="video-panel">
              <h3 className="video-panel-title">{t('video.lastShot')}</h3>
              <img className="video-last-shot" src={lastShot} alt="last capture" />
              <a className="video-btn" href={lastShot} download={`rgbbox-photo-${Date.now()}.png`}><Download size={14} /> {t('video.save')}</a>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
