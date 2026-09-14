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
  AppWindow, Camera, CameraOff, ChevronDown, ChevronRight, Circle, Download, FileText,
  Film, FlipHorizontal, FolderOpen, Frame, Image as ImageIcon, Link as LinkIcon, Maximize2,
  Minimize2, Monitor, MonitorPlay, Pause, Play, Plus, RefreshCw, Scissors, SkipBack,
  SkipForward, Square, Trash2, Video, Volume2, VolumeX,
} from 'lucide-react'
import Hls from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import type { CaptureSource } from '../../../shared/types'
import { formatMediaTime } from '../../../shared/timeFormat'
import { usePreviewZoom } from './video/usePreviewZoom'
import { PreviewZoomBar } from './video/PreviewZoomBar'
import { freezeVideoFrame } from './video/frameCapture'
import { RegionSnipOverlay } from './video/RegionSnipOverlay'
import { buildPathEntries, ingestRestoredProgress, shouldOfferResume, type ProgressEntry } from './video/playlistProgress'
import { MiniPlayerCard } from './video/MiniPlayerCard'
import { AnnotateOverlay } from './video/AnnotateOverlay'
import { CaptureFilmstrip } from './CaptureFilmstrip'
import type { CaptureEntry } from '../../../shared/types'
import type { Rect } from './video/previewTransform'

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

interface VideoItem {
  id: string
  name: string
  url?: string
  group: string
}

interface VideoGroup {
  name: string
  collapsed: boolean
}

const VIDEO_CACHE_KEY = 'rgbbox-video-playlist-config'

interface VideoPlaylistCache {
  playlist: Array<{ id: string; name: string; group: string }>
  groups: VideoGroup[]
  playlistVisible: boolean
}

function loadVideoCache(): Partial<VideoPlaylistCache> {
  try {
    const raw = localStorage.getItem(VIDEO_CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveVideoCache(cache: VideoPlaylistCache): void {
  try {
    localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
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

// ── Subtitle Types & Parsers ───────────────────────────────────────────────

interface SubCue {
  start: number  // seconds
  end: number    // seconds
  text: string
}

/** Strip any HTML/XML tags from subtitle lines using DOMParser for safety. */
function stripTags(input: string): string {
  try {
    const doc = new DOMParser().parseFromString(input, 'text/html')
    return doc.body.textContent ?? ''
  } catch {
    let s = input
    let prev: string
    do { prev = s; s = s.replace(/<[^>]*>/g, '') } while (s !== prev)
    return s
  }
}

/** Parse WebVTT (.vtt) subtitle text into cues. */
function parseVtt(text: string): SubCue[] {
  const cues: SubCue[] = []
  // Split on double-newline blocks
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const timeRe = /(\d+):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[.,](\d{3})/
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const timeLine = lines.find(l => timeRe.test(l))
    if (!timeLine) continue
    const m = timeRe.exec(timeLine)
    if (!m) continue
    const toSec = (h: string, mn: string, s: string, ms: string) =>
      parseInt(h) * 3600 + parseInt(mn) * 60 + parseInt(s) + parseInt(ms) / 1000
    const start = toSec(m[1], m[2], m[3], m[4])
    const end = toSec(m[5], m[6], m[7], m[8])
    const textLines = lines.slice(lines.indexOf(timeLine) + 1)
      .filter(l => l.trim() && !/^NOTE/.test(l.trim()))
      .map(l => stripTags(l))
    const text = textLines.join('\n').trim()
    if (text) cues.push({ start, end, text })
  }
  return cues
}

/** Parse SRT subtitle text into cues. */
function parseSrt(text: string): SubCue[] {
  const cues: SubCue[] = []
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const timeRe = /(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})/
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const timeLine = lines.find(l => timeRe.test(l))
    if (!timeLine) continue
    const m = timeRe.exec(timeLine)
    if (!m) continue
    const toSec = (h: string, mn: string, s: string, ms: string) =>
      parseInt(h) * 3600 + parseInt(mn) * 60 + parseInt(s) + parseInt(ms) / 1000
    const start = toSec(m[1], m[2], m[3], m[4])
    const end = toSec(m[5], m[6], m[7], m[8])
    const textLines = lines.slice(lines.indexOf(timeLine) + 1)
      .filter(l => l.trim() && !/^\d+$/.test(l.trim()))
      .map(l => stripTags(l))
    const text = textLines.join('\n').trim()
    if (text) cues.push({ start, end, text })
  }
  return cues
}

function parseSubtitle(text: string, filename: string): SubCue[] {
  if (/\.vtt$/i.test(filename)) return parseVtt(text)
  return parseSrt(text)  // default: SRT
}

// R71.8: player timestamps use the shared formatMediaTime (this local copy
// was the video-side twin of the audio view's hour-less formatter).

export function VideoStudioView({ visible = true, onReturnToVideo }: {
  /** R91.2: false while the keep-alive wrapper hides this view — capture and
   * hotkeys pause, playback continues, MiniPlayerCard takes over. */
  visible?: boolean
  onReturnToVideo?: () => void
}): JSX.Element {
  const { t } = useI18n()

  // R91.1: remember the last mode tab (camera/screen/player) across launches —
  // same pattern as rgbbox:view etc. Invalid values fall back to camera.
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('rgbbox:videoMode') : null
    return saved === 'camera' || saved === 'screen' || saved === 'player' ? saved : 'camera'
  })
  const setMode = useCallback((m: Mode) => {
    setModeState(m)
    try { localStorage.setItem('rgbbox:videoMode', m) } catch { /* storage unavailable — session-only */ }
  }, [])

  // ── Live preview ─────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // R75.1: live preview zoom (camera / screen modes)
  const liveWrapRef = useRef<HTMLDivElement | null>(null)
  const liveZoom = usePreviewZoom(liveWrapRef)
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
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [usingHls, setUsingHls] = useState<boolean>(false)
  const hlsRef = useRef<Hls | null>(null)
  const playerFileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaLoaded = playerUrl !== '' || usingHls
  // R92: media:// plays cross-origin — without crossOrigin its frames taint the
  // canvas and photo/snip export dies with a SecurityError. 'anonymous' is safe:
  // the media:// handler sends Access-Control-Allow-Origin:* on every 200/206,
  // and same-origin blob: ignores it. Remote http(s) URLs keep No-CORS — forcing
  // anonymous would break playback on CORS-less stream servers (and remote
  // content stays uncapturable either way). The JSX key remount below guarantees
  // crossOrigin is set on a fresh element before its src.
  const playerCrossOrigin = playerUrl.startsWith('media://') || playerUrl.startsWith('blob:')
    ? ('anonymous' as const)
    : undefined

  // ── Player custom controls ─────────────────────────────────────────────────
  const [playerPlaying, setPlayerPlaying] = useState(false)
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0)
  const [playerDuration, setPlayerDuration] = useState(0)
  const [playerVolume, setPlayerVolume] = useState(1)
  const [playerMuted, setPlayerMuted] = useState(false)
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true)
  // R71.5: true while the source reports a live (non-finite) duration — the
  // seek slider is disabled and the duration label shows LIVE instead of a
  // bogus "0:00" (an Infinity max would fall back to the slider default).
  const [playerLive, setPlayerLive] = useState(false)
  const controlsHideTimerRef = useRef<number | null>(null)
  // R71.6: suspends timeupdate write-back while the user drags the seek slider.
  const seekDraggingRef = useRef(false)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)
  // R75.1: player preview zoom
  const playerZoom = usePreviewZoom(playerWrapRef)
  const subFileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Subtitles ─────────────────────────────────────────────────────────────
  const [subCues, setSubCues] = useState<SubCue[]>([])
  const [subFilename, setSubFilename] = useState('')
  const [currentSubText, setCurrentSubText] = useState('')

  // ── Filters / view ─────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [fullscreen, setFullscreen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const studioRef = useRef<HTMLDivElement | null>(null)

  // ── Recording ──────────────────────────────────────────────────────────────
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [recElapsed, setRecElapsed] = useState(0)
  const recStartRef = useRef(0)
  const recTimerRef = useRef<number | null>(null)

  // ── Video Playlist ──────────────────────────────────────────────────────────
  const videoCache = useMemo(() => loadVideoCache(), [])
  const [videoPlaylist, setVideoPlaylist] = useState<VideoItem[]>([])
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>(videoCache.groups || [])
  const [playlistVisible, setPlaylistVisible] = useState(videoCache.playlistVisible ?? true)
  const [currentVideoIndex, setCurrentVideoIndex] = useState(-1)
  const [videoIsRestored, setVideoIsRestored] = useState(false)
  const videoFileInputRef = useRef<HTMLInputElement | null>(null)
  const videoFolderInputRef = useRef<HTMLInputElement | null>(null)

  // ── R91.1: per-item playback progress (断点续播) ──────────────────────────
  // 1Hz writes go to a ref (no re-render); disk persistence rides the same
  // videoSavePaths snapshot as structural saves, throttled to 10s + flushed on
  // pause / item switch / unmount. Finished items (<5s from the end) drop out.
  const progressRef = useRef<Record<string, ProgressEntry>>({})
  const activeItemIdRef = useRef<string | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const lastNoteRef = useRef(0)
  const lastPersistRef = useRef(0)
  const playlistRef = useRef<VideoItem[]>([])
  useEffect(() => { playlistRef.current = videoPlaylist }, [videoPlaylist])
  const [resumePrompt, setResumePrompt] = useState<{ id: string; at: number } | null>(null)

  const persistProgress = useCallback(() => {
    window.rgbbox.videoSavePaths(buildPathEntries(playlistRef.current, progressRef.current)).catch(() => { /* best-effort */ })
  }, [])

  const noteProgress = useCallback(() => {
    const el = playerRef.current
    const id = activeItemIdRef.current
    if (!el || !id) return
    const now = Date.now()
    if (now - lastNoteRef.current < 1000) return
    lastNoteRef.current = now
    if (!isFinite(el.duration) || el.duration <= 0) return
    // watched to (almost) the end — remember nothing so the next open starts fresh
    if (el.duration - el.currentTime <= 5) {
      if (progressRef.current[id]) { delete progressRef.current[id]; persistProgress() }
      return
    }
    progressRef.current[id] = { t: el.currentTime, d: el.duration, u: now }
    if (now - lastPersistRef.current > 10000) {
      lastPersistRef.current = now
      persistProgress()
    }
  }, [persistProgress])

  // Flush on teardown / app close — natural "walked away" moments.
  useEffect(() => {
    const onBeforeUnload = () => persistProgress()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      persistProgress()
    }
  }, [persistProgress])

  // ── Video Trim / Clip ──────────────────────────────────────────────────────
  const [trimMode, setTrimMode] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimExporting, setTrimExporting] = useState(false)
  const [trimQuality, setTrimQuality] = useState<'lossless' | 'high' | 'balanced'>('high')

  const filterStyle = useMemo(() => filterCss(filters), [filters])

  // ── Snapshot annotate (R76: in-place annotator replaces R75 modal) ──────
  const [annotateSource, setAnnotateSource] = useState<HTMLCanvasElement | string | null>(null)
  const [editorToastMsg, setEditorToastMsg] = useState('')

  // ── Capture cache filmstrip (R77.1) ─────────────────────────────────────
  const [captures, setCaptures] = useState<CaptureEntry[]>([])
  const refreshCaptures = useCallback(() => {
    window.rgbbox.capturesList().then(setCaptures).catch(() => { /* best-effort */ })
  }, [])
  useEffect(() => { refreshCaptures() }, [refreshCaptures])
  const editorToastTimerRef = useRef<number | null>(null)
  const editorToast = useCallback((msg: string) => {
    setEditorToastMsg(msg)
    if (editorToastTimerRef.current) window.clearTimeout(editorToastTimerRef.current)
    editorToastTimerRef.current = window.setTimeout(() => setEditorToastMsg(''), 2600)
  }, [])

  const downloadPng = useCallback((dataUrl: string, prefix: string) => {
    // R75.2: 纯像素导出，无任何水印
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${prefix}-${Date.now()}.png`
    a.click()
  }, [])

  // ── Region snip (R75.3): freeze current frame, let the user drag a selection ──
  const [snipActive, setSnipActive] = useState(false)
  const [snipFrame, setSnipFrame] = useState<HTMLCanvasElement | null>(null)
  const startSnip = useCallback(() => {
    if (snipActive) return
    const source = mode === 'player' ? playerRef.current : videoRef.current
    if (!source?.videoWidth) return
    const frame = freezeVideoFrame(source, filterStyle, mirror && mode === 'camera')
    if (!frame) return
    if (mode === 'player') playerRef.current?.pause()
    setSnipFrame(frame)
    setSnipActive(true)
  }, [snipActive, mode, filterStyle, mirror])

  const cancelSnip = useCallback(() => {
    setSnipActive(false)
    setSnipFrame(null)
  }, [])

  const finishSnip = useCallback((sel: Rect) => {
    const frame = snipFrame
    cancelSnip()
    if (!frame) return
    const out = document.createElement('canvas')
    out.width = sel.w
    out.height = sel.h
    const ctx = out.getContext('2d')
    if (!ctx) return
    // R75.2: 裁剪只搬运像素，绝不叠加任何文字/logo（无水印铁律）
    ctx.drawImage(frame, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h)
    let dataUrl: string
    try {
      dataUrl = out.toDataURL('image/png')
    } catch {
      // R92: cross-origin frames (e.g. remote URL without CORS) taint the
      // canvas — the annotator would hit the same wall on save, so bail here.
      editorToast(t('video.capture.fail'))
      return
    }
    // R76.3: 框选确认后就地标注（微信流程）；R77.1: 裁剪结果自动入缓存
    void window.rgbbox.capturesAdd(dataUrl, 'snip').then(refreshCaptures).catch(() => { /* best-effort */ })
    setAnnotateSource(out)
  }, [snipFrame, cancelSnip, refreshCaptures, editorToast, t])

  // R75.3: S 快捷键（camera/screen live 模式；player 模式在播放器快捷键 effect 里）
  useEffect(() => {
    if (mode === 'player' || !streaming || snipActive) return
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); startSnip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, streaming, snipActive, startSnip])

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

  // Re-apply camera constraints live: when the user changes device / resolution /
  // frame-rate while the camera is already streaming, restart with the new values
  // so the selection takes effect immediately (constraints are otherwise only read
  // on the initial Start).
  const startCameraRef = useRef(startCamera)
  useEffect(() => { startCameraRef.current = startCamera }, [startCamera])
  const streamingRef = useRef(streaming)
  useEffect(() => { streamingRef.current = streaming }, [streaming])
  useEffect(() => {
    if (mode !== 'camera' || !streamingRef.current) return
    void startCameraRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resIndex, fps, deviceId])

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
    setStreamError(null)
    // Preferred (modern) path: pre-select the source in the main process, then use
    // getDisplayMedia. Chromium's capturer correctly streams GPU-accelerated windows
    // (browsers, etc.) that the legacy chromeMediaSource constraint often dropped.
    try {
      await window.rgbbox.selectCaptureSource(sourceId)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 } },
        audio: false,
      })
      attachStream(stream)
      return
    } catch (modernErr) {
      // Fall back to the legacy desktop constraint if getDisplayMedia is unavailable.
      try {
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
      } catch (legacyErr) {
        const err = legacyErr ?? modernErr
        setStreamError(err instanceof Error ? err.message : String(err))
        setStreaming(false)
      }
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
    let url: string
    try {
      url = canvas.toDataURL('image/png')
    } catch {
      // R92: cross-origin frames (e.g. remote URL without CORS) taint the
      // canvas — tell the user instead of dying silently.
      editorToast(t('video.capture.fail'))
      return
    }
    // R76.3: 拍照恢复"咔嚓即下载"；R77.1: 自动入拍摄缓存
    downloadPng(url, 'rgbbox-photo')
    void window.rgbbox.capturesAdd(url, 'photo').then(refreshCaptures).catch(() => { /* best-effort */ })
  }, [mode, filterStyle, mirror, downloadPng, refreshCaptures, editorToast, t])

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

  // ── Player sources (local file + network stream) ────────────────────────────
  /** Tear down any active player source (blob URL or hls.js instance). */
  const clearPlayerSource = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setUsingHls(false)
    // R91.1: the outgoing item's progress was already noted 1Hz; detach tracking
    // and drop any unanswered resume prompt before the next source settles.
    activeItemIdRef.current = null
    pendingSeekRef.current = null
    setResumePrompt(null)
    setPlayerUrl((prev) => { if (prev.startsWith('blob:')) URL.revokeObjectURL(prev); return '' })
    // R71.4: everything keyed to the PREVIOUS source resets here, so opening
    // a new video never shows its time/duration, never overlays the previous
    // video's subtitles, and never keeps trim points from a longer video
    // (which corrupted exports once R70.6's watchdog capped the run).
    setPlayerPlaying(false)
    setPlayerCurrentTime(0)
    setPlayerDuration(0)
    setPlayerLive(false)
    setSubCues([])
    setSubFilename('')
    setCurrentSubText('')
    setTrimMode(false)
    setTrimStart(0)
    setTrimEnd(0)
  }, [])

  const onPlayerFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    clearPlayerSource()
    setStreamError(null)
    setCurrentVideoIndex(-1)
    setPlayerUrl(URL.createObjectURL(file))
    setPlayerName(file.name)
  }, [clearPlayerSource])

  /**
   * Load a network video stream. Direct progressive formats (mp4 / webm / ogg)
   * are bound straight to the <video> element; HLS playlists (.m3u8) are played
   * through hls.js via Media Source Extensions, which Chromium does not handle
   * natively. This covers the mainstream live / VOD streaming formats.
   */
  const loadStreamUrl = useCallback((rawUrl: string) => {
    const url = rawUrl.trim()
    if (!url) return
    clearPlayerSource()
    setStreamError(null)
    setCurrentVideoIndex(-1)
    setPlayerName(url)
    const el = playerRef.current
    const isHls = /\.m3u8(\?|#|$)/i.test(url)
    if (isHls && Hls.isSupported() && el) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setStreamError(`HLS: ${data.details}`)
      })
      hls.loadSource(url)
      hls.attachMedia(el)
      void el.play().catch(() => { /* autoplay may defer */ })
      setUsingHls(true)
    } else {
      // Direct URL (mp4/webm/ogg…) or platforms with native HLS support.
      setPlayerUrl(url)
    }
  }, [clearPlayerSource])

  // ── Mode switch: (re)load source lists ──────────────────────────────────────
  useEffect(() => {
    if (mode === 'camera') void refreshDevices()
    if (mode === 'screen') void refreshSources()
  }, [mode, refreshDevices, refreshSources])

  // R75.1: feed live video native size into the zoom hook (loadedmetadata for
  // first frame, resize for resolution changes while streaming).
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onMeta = () => { if (el.videoWidth) liveZoom.setNativeSize({ w: el.videoWidth, h: el.videoHeight }) }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('resize', onMeta)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('resize', onMeta)
    }
  }, [mode, streaming, liveZoom.setNativeSize])

  // Stop live capture whenever we switch away from a live mode.
  const prevModeRef = useRef<Mode>('camera')
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      stopStream()
      prevModeRef.current = mode
    }
  }, [mode, stopStream])

  // R91.2: keep-alive hidden — stop live capture (privacy + CPU) and cancel any
  // pending region snip; the player keeps playing and MiniPlayerCard surfaces.
  const [miniDismissed, setMiniDismissed] = useState(false)
  useEffect(() => {
    if (visible) return
    stopStream()
    cancelSnip()
  }, [visible, stopStream, cancelSnip])
  // Dismissal is per playback session: returning to the view or a fresh play
  // re-arms the card for the next switch-away.
  useEffect(() => {
    if (visible || playerPlaying) setMiniDismissed(false)
  }, [visible, playerPlaying])

  // Player playback rate / loop
  useEffect(() => { if (playerRef.current) playerRef.current.playbackRate = playerRate }, [playerRate, playerUrl])

  // R75.1: feed player video native size into the zoom hook (per source).
  useEffect(() => {
    const el = playerRef.current
    if (!el) return
    const onMeta = () => {
      if (el.videoWidth) playerZoom.setNativeSize({ w: el.videoWidth, h: el.videoHeight })
      // R91.1: apply a pending resume position once the media is seekable
      const ps = pendingSeekRef.current
      if (ps != null) { el.currentTime = ps; pendingSeekRef.current = null }
    }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('resize', onMeta)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('resize', onMeta)
    }
  }, [playerUrl, usingHls, playerZoom.setNativeSize])

  // Player volume/mute sync
  useEffect(() => {
    const el = playerRef.current
    if (!el) return
    el.volume = playerVolume
    el.muted = playerMuted
  }, [playerVolume, playerMuted])

  // Player event listeners for custom controls
  useEffect(() => {
    const el = playerRef.current
    if (!el) return
    const onPlay = () => setPlayerPlaying(true)
    const onPause = () => { setPlayerPlaying(false); persistProgress() }
    const onEnded = () => {
      setPlayerPlaying(false)
      // R91.1: finished — drop this item's resume point so the next open starts fresh
      const id = activeItemIdRef.current
      if (id && progressRef.current[id]) { delete progressRef.current[id]; persistProgress() }
    }
    const onTimeUpdate = () => {
      // R71.6: while the user is dragging the seek slider, its own onChange
      // drives the position — writing el.currentTime back here made the
      // thumb snap backwards between input events.
      if (!seekDraggingRef.current) setPlayerCurrentTime(el.currentTime)
      noteProgress()
      // R71.5: a live stream reports Infinity — never let it reach the range
      // input's max (an invalid max="Infinity" falls back to 100 and pins
      // the thumb once the stream runs past that).
      setPlayerDuration(isFinite(el.duration) ? el.duration : 0)
      setPlayerLive(!isFinite(el.duration))
    }
    const onDurationChange = () => {
      setPlayerDuration(isFinite(el.duration) ? el.duration : 0)
      setPlayerLive(!isFinite(el.duration))
    }
    const onVolumeChange = () => {
      setPlayerVolume(el.volume)
      setPlayerMuted(el.muted)
    }
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('volumechange', onVolumeChange)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('volumechange', onVolumeChange)
    }
    // Re-attach when the video source changes so the element ref is fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerUrl, usingHls, persistProgress, noteProgress])

  // Auto-hide player controls overlay after inactivity
  const resetControlsTimer = useCallback(() => {
    setPlayerControlsVisible(true)
    if (controlsHideTimerRef.current) window.clearTimeout(controlsHideTimerRef.current)
    if (playerPlaying) {
      controlsHideTimerRef.current = window.setTimeout(() => setPlayerControlsVisible(false), 3000)
    }
  }, [playerPlaying])

  // Show controls when paused
  useEffect(() => {
    if (!playerPlaying) {
      setPlayerControlsVisible(true)
      if (controlsHideTimerRef.current) window.clearTimeout(controlsHideTimerRef.current)
    }
  }, [playerPlaying])

  // Subtitle cue activation
  useEffect(() => {
    if (subCues.length === 0) {
      setCurrentSubText('')
      return
    }
    const active = subCues.find(c => playerCurrentTime >= c.start && playerCurrentTime < c.end)
    setCurrentSubText(active?.text ?? '')
  }, [playerCurrentTime, subCues])

  // Subtitle file loading
  const handleSubFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubFilename(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) setSubCues(parseSubtitle(text, file.name))
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }, [])

  // Player seek
  const playerSeek = useCallback((time: number) => {
    const el = playerRef.current
    if (!el) return
    // R71.7: covers the three seek paths R70.6 left open (arrow keys, the
    // slider, ±10s buttons) — seeking mid-export pollutes the recording.
    if (trimExporting) return
    el.currentTime = time
    setPlayerCurrentTime(time)
  }, [trimExporting])

  // Player toggle play/pause
  const togglePlayerPlay = useCallback(() => {
    const el = playerRef.current
    if (!el) return
    // R70.6: pausing mid-trim-export would strand the export loop forever
    // (currentTime never reaches trimEnd — see exportTrimmedClip).
    if (trimExporting) return
    if (el.paused) void el.play()
    else el.pause()
  }, [trimExporting])

  // R91.1: resume-prompt actions — Continue jumps to the stored spot (already
  // pre-seeked at loadedmetadata; this covers the not-yet-loaded race), From
  // start wipes the stored progress for this item.
  const resumeContinue = useCallback(() => {
    const el = playerRef.current
    if (el && resumePrompt) el.currentTime = resumePrompt.at
    setResumePrompt(null)
    void el?.play().catch(() => { /* autoplay may defer */ })
  }, [resumePrompt])
  const resumeRestart = useCallback(() => {
    const el = playerRef.current
    if (resumePrompt && progressRef.current[resumePrompt.id]) {
      delete progressRef.current[resumePrompt.id]
      persistProgress()
    }
    if (el) el.currentTime = 0
    setResumePrompt(null)
  }, [resumePrompt, persistProgress])

  // Player fullscreen (just the video wrapper)
  const togglePlayerFullscreen = useCallback(() => {
    const wrap = playerWrapRef.current
    if (!wrap) return
    if (document.fullscreenElement === wrap) {
      void document.exitFullscreen().catch(() => { /* noop */ })
    } else {
      void wrap.requestFullscreen().catch(() => { /* noop */ })
    }
  }, [])

  // ── Player keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    // R91.2: keep-alive — a hidden studio must not hijack space/arrows from
    // whatever view is on screen.
    if (mode !== 'player' || !visible) return
    const onKey = (e: KeyboardEvent) => {
      const el = playerRef.current
      if (!el) return
      // Don't steal from input elements
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlayerPlay(); break
        case 'ArrowLeft': e.preventDefault(); playerSeek(Math.max(0, el.currentTime - 10)); break
        case 'ArrowRight': e.preventDefault(); playerSeek(Math.min(el.duration || 0, el.currentTime + 10)); break
        case 'ArrowUp': e.preventDefault(); setPlayerVolume(v => Math.min(1, v + 0.1)); break
        case 'ArrowDown': e.preventDefault(); setPlayerVolume(v => Math.max(0, v - 0.1)); break
        case 'm': case 'M': setPlayerMuted(v => !v); break
        case 'f': case 'F': togglePlayerFullscreen(); break
        // R75.3: S 进入局部截图（框选覆盖层自身的 keydown 在 capture 阶段优先处理 ESC/Enter）
        case 's': case 'S': startSnip(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, visible, togglePlayerPlay, playerSeek, togglePlayerFullscreen, startSnip])

  // R70.5: mirror the player URL so the unmount cleanup below can revoke the
  // blob: URL — the functional-setState revoke inside clearPlayerSource never
  // runs once the component is gone.
  const playerUrlRef = useRef('')
  useEffect(() => { playerUrlRef.current = playerUrl }, [playerUrl])

  // Full cleanup on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    if (hlsRef.current) hlsRef.current.destroy()
    // R70.5: App.tsx unmounts this view on every tab switch — a detached,
    // still-playing <video> keeps sounding until non-deterministic GC, and
    // the un-revoked blob: URL pins the whole video File in the URL store.
    playerRef.current?.pause()
    if (playerUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(playerUrlRef.current)
    if (recTimerRef.current) window.clearInterval(recTimerRef.current)
    if (controlsHideTimerRef.current) window.clearTimeout(controlsHideTimerRef.current)
    if (editorToastTimerRef.current) window.clearTimeout(editorToastTimerRef.current)
  }, [])

  // Built-in fullscreen via the native Fullscreen API on the studio container.
  // (A CSS-overlay fallback is used if requestFullscreen is unavailable/rejected.)
  const toggleFullscreen = useCallback(() => {
    const el = studioRef.current
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* noop */ })
      return
    }
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => setFullscreen((v) => !v))
    } else {
      // No native fullscreen support — fall back to the CSS overlay.
      setFullscreen((v) => !v)
    }
  }, [])

  // ── Playlist management ────────────────────────────────────────────────────
  const addVideoFromPaths = useCallback((entries: Array<{ path: string; name: string; folder?: string }>, defaultGroup?: string) => {
    const groupName = defaultGroup || 'Default'
    const newItems: VideoItem[] = entries.map((e, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      name: e.name,
      url: `media://local?p=${encodeURIComponent(e.path)}`,
      group: e.folder || groupName,
    }))
    if (newItems.length === 0) return
    const newGroupNames = [...new Set(newItems.map(v => v.group))]
    setVideoGroups(prev => {
      const existing = new Set(prev.map(g => g.name))
      return [...prev, ...newGroupNames.filter(n => !existing.has(n)).map(n => ({ name: n, collapsed: false }))]
    })
    setVideoPlaylist(prev => [...prev, ...newItems])
  }, [])

  const handleAddVideoFiles = useCallback(() => {
    window.rgbbox.videoOpenFiles().then(result => {
      if (result.length > 0) addVideoFromPaths(result)
    }).catch(() => {})
  }, [addVideoFromPaths])

  const handleAddVideoFolder = useCallback(() => {
    window.rgbbox.videoOpenFolder().then(result => {
      if (result.length > 0) addVideoFromPaths(result, result[0]?.folder)
    }).catch(() => {})
  }, [addVideoFromPaths])

  const playVideoItem = useCallback((index: number) => {
    const item = videoPlaylist[index]
    if (!item?.url) return
    clearPlayerSource()
    // R91.1: offer to resume when the stored position clears the thresholds
    activeItemIdRef.current = item.id
    const prog = progressRef.current[item.id]
    if (shouldOfferResume(prog) && prog) {
      setResumePrompt({ id: item.id, at: prog.t })
      pendingSeekRef.current = prog.t
    }
    setPlayerUrl(item.url)
    setPlayerName(item.name)
    setCurrentVideoIndex(index)
  }, [videoPlaylist, clearPlayerSource])

  const removeVideoItem = useCallback((index: number) => {
    setVideoPlaylist(prev => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
    if (index === currentVideoIndex) {
      clearPlayerSource()
      setCurrentVideoIndex(-1)
    } else if (index < currentVideoIndex) {
      setCurrentVideoIndex(prev => prev - 1)
    }
  }, [currentVideoIndex, clearPlayerSource])

  const removeVideoGroup = useCallback((groupName: string) => {
    const playingItem = currentVideoIndex >= 0 ? videoPlaylist[currentVideoIndex] : null
    const playingInGroup = playingItem?.group === groupName
    // R70.3: shift the playing index down by however many removed items sat
    // before it; playback only stops when the playing item itself is removed.
    // (The old version left a stale index that could point past the end of
    // the shrunken list, silently breaking the highlight and removeVideoItem.)
    const removedBefore = playingItem && !playingInGroup
      ? videoPlaylist.slice(0, currentVideoIndex).filter(v => v.group === groupName).length
      : 0
    setVideoPlaylist(prev => prev.filter(v => v.group !== groupName))
    setVideoGroups(prev => prev.filter(g => g.name !== groupName))
    if (playingInGroup) {
      clearPlayerSource()
      setCurrentVideoIndex(-1)
    } else if (removedBefore > 0) {
      setCurrentVideoIndex(prev => prev - removedBefore)
    }
  }, [currentVideoIndex, videoPlaylist, clearPlayerSource])

  const toggleVideoGroupCollapse = useCallback((groupName: string) => {
    setVideoGroups(prev => prev.map(g => g.name === groupName ? { ...g, collapsed: !g.collapsed } : g))
  }, [])

  // ── Trim / Clip ────────────────────────────────────────────────────────────
  const setTrimPoint = useCallback((which: 'start' | 'end') => {
    const el = playerRef.current
    if (!el) return
    if (which === 'start') setTrimStart(el.currentTime)
    else setTrimEnd(el.currentTime)
    if (!trimMode) setTrimMode(true)
  }, [trimMode])

  const exportTrimmedClip = useCallback(async () => {
    const el = playerRef.current
    if (!el || !mediaLoaded) return
    const start = Math.min(trimStart, trimEnd)
    const end = Math.max(trimStart, trimEnd)
    if (end - start < 0.5) { alert('Please select at least 0.5 seconds'); return }

    setTrimExporting(true)
    // R70.6: stop the canvas-capture tracks even if the export path throws —
    // a leaked live stream keeps the canvas "captured" forever.
    let canvasStream: MediaStream | null = null
    let watchdog = 0
    try {
      const mimeType = trimQuality === 'lossless'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm')
        : trimQuality === 'high'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
        : 'video/webm'

      el.currentTime = start
      await new Promise<void>(resolve => {
        const onSeeked = () => { el.removeEventListener('seeked', onSeeked); resolve() }
        el.addEventListener('seeked', onSeeked)
      })
      // Capture the video element's stream for recording
      const canvas = document.createElement('canvas')
      canvas.width = el.videoWidth || 1280
      canvas.height = el.videoHeight || 720
      const canvasCtx = canvas.getContext('2d')!
      canvasStream = canvas.captureStream(30)
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(canvasStream, { mimeType })
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.start(100)
      await el.play()
      // Draw frames until we reach trimEnd
      let stopped = false
      // R70.6: single finish path — natural end, watchdog timeout, or any
      // future abort route all funnel through here so recorder.stop() always runs.
      const finish = (): void => {
        if (stopped) return
        stopped = true
        el.pause()
        if (recorder.state !== 'inactive') {
          try { recorder.stop() } catch { /* already inactive */ }
        }
      }
      const drawFrame = () => {
        if (stopped) return
        if (el.currentTime >= end) {
          finish()
          return
        }
        canvasCtx.drawImage(el, 0, 0, canvas.width, canvas.height)
        requestAnimationFrame(drawFrame)
      }
      // R70.6: watchdog — if playback stalls (or currentTime never reaches
      // `end` for any other reason), flush the recorder instead of wedging
      // the export button forever.
      const expectedMs = ((end - start) / Math.max(el.playbackRate, 0.25) + 5) * 1000
      watchdog = window.setTimeout(finish, expectedMs)
      drawFrame()
      await new Promise<void>(resolve => { recorder.onstop = () => resolve() })
      window.clearTimeout(watchdog)
      watchdog = 0
      const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rgbbox-clip-${Date.now()}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      if (watchdog) window.clearTimeout(watchdog)
      canvasStream?.getTracks().forEach(tr => tr.stop())
      setTrimExporting(false)
    }
  }, [trimStart, trimEnd, trimQuality, mediaLoaded])

  // Keep local state in sync with the actual fullscreen element.
  useEffect(() => {
    const onFsChange = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ESC exits the CSS-overlay fullscreen fallback (native fullscreen handles ESC itself).
  useEffect(() => {
    if (!fullscreen || document.fullscreenElement) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  // Persist video playlist when it changes (after restore)
  useEffect(() => {
    if (!videoIsRestored) return
    saveVideoCache({
      playlist: videoPlaylist.map(v => ({ id: v.id, name: v.name, group: v.group })),
      groups: videoGroups,
      playlistVisible,
    })
    // R91.1: media:// entries only (blob:/remote have no path), progress merged
    const pathEntries = buildPathEntries(videoPlaylist, progressRef.current)
    // R70.4: save unconditionally — skipping the empty list meant deleting
    // every video never reached disk, and the stale file resurrected them on
    // the next launch. The main-process handler overwrites unconditionally.
    window.rgbbox.videoSavePaths(pathEntries).catch(() => { /* persistence is best-effort */ })
  }, [videoIsRestored, videoPlaylist, videoGroups, playlistVisible])

  // Restore video playlist from main process on mount
  useEffect(() => {
    let cancelled = false
    window.rgbbox.videoGetSavedPaths().then(saved => {
      if (cancelled) return
      // R91.1: fold persisted progress back in before anything can play
      progressRef.current = ingestRestoredProgress(saved)
      if (saved.length > 0) {
        const tracks: VideoItem[] = saved.map(e => ({
          id: e.id, name: e.name, group: e.group,
          url: `media://local?p=${encodeURIComponent(e.path)}`,
        }))
        const groupNames = [...new Set(tracks.map(t => t.group))]
        setVideoPlaylist(prev => prev.length > 0 ? prev : tracks)
        setVideoGroups(prev => prev.length > 0 ? prev : groupNames.map(n => ({ name: n, collapsed: false })))
      }
      setVideoIsRestored(true)
    }).catch(() => setVideoIsRestored(true))
    return () => { cancelled = true }
  }, [])

  const groupedVideoPlaylist = useMemo(() => {
    const grouped = new Map<string, VideoItem[]>()
    videoPlaylist.forEach(v => {
      const list = grouped.get(v.group) || []
      list.push(v)
      grouped.set(v.group, list)
    })
    return grouped
  }, [videoPlaylist])

  const filteredSources = sources.filter((s) => sourceFilter === 'all' || s.type === sourceFilter)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={studioRef} className={`video-studio${fullscreen ? ' video-studio-fullscreen' : ''}`}>
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
          {mode === 'player' ? (
            /* ── Custom Player Wrapper ─────────────────────────────────── */
            <div
              ref={playerWrapRef}
              className="video-player-wrap"
              onMouseMove={resetControlsTimer}
              onMouseEnter={resetControlsTimer}
              onClick={togglePlayerPlay}
            >
              <div className="video-zoom-layer" style={playerZoom.layerStyle} onDoubleClick={playerZoom.reset}>
                <video
                  key={playerCrossOrigin ? 'cors' : 'nocors'}
                  ref={playerRef}
                  crossOrigin={playerCrossOrigin}
                  className="video-preview video-preview-rect"
                  style={{
                    filter: filterStyle,
                    left: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.x : undefined,
                    top: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.y : undefined,
                    width: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.w : '100%',
                    height: playerZoom.contentRect.h > 0 ? playerZoom.contentRect.h : '100%',
                  }}
                  src={playerUrl || undefined}
                  loop={playerLoop}
                  playsInline
                />
                {/* R75.3: 冻结帧（框选期间画面静止） */}
                {snipActive && snipFrame && (
                  <canvas
                    ref={(el) => {
                      if (el && el.width !== snipFrame.width) {
                        el.width = snipFrame.width
                        el.height = snipFrame.height
                        el.getContext('2d')?.drawImage(snipFrame, 0, 0)
                      }
                    }}
                    className="video-preview-rect video-snip-freeze"
                    style={{
                      left: playerZoom.contentRect.x, top: playerZoom.contentRect.y,
                      width: playerZoom.contentRect.w, height: playerZoom.contentRect.h,
                    }}
                  />
                )}
              </div>

              {/* R91.1: 断点续播提示条 */}
              {resumePrompt && (
                <div className="video-resume-bar">
                  <span className="video-resume-text">
                    {t('video.resume.lastseen')} {formatMediaTime(resumePrompt.at)}
                  </span>
                  <button type="button" className="video-btn video-btn-primary" onClick={resumeContinue}>{t('video.resume.continue')}</button>
                  <button type="button" className="video-btn" onClick={resumeRestart}>{t('video.resume.restart')}</button>
                </div>
              )}

              {/* Empty-state overlay */}
              {!mediaLoaded && (
                <div className="video-empty">
                  <Film size={40} />
                  <span>{streamError ? `⚠ ${streamError}` : t('video.player.empty')}</span>
                </div>
              )}

              {/* R75.1: zoom control bar */}
              {mediaLoaded && (
                <PreviewZoomBar
                  percent={playerZoom.percent}
                  onZoomIn={() => playerZoom.zoomBy(1.1)}
                  onZoomOut={() => playerZoom.zoomBy(1 / 1.1)}
                  onReset={playerZoom.reset}
                  onOneToOne={playerZoom.oneToOne}
                  disabled={!mediaLoaded}
                />
              )}

              {/* R75.3: 屏幕空间框选覆盖层 */}
              {snipActive && snipFrame && (
                <RegionSnipOverlay
                  view={playerZoom.view}
                  contentRect={playerZoom.contentRect}
                  nativeSize={{ w: snipFrame.width, h: snipFrame.height }}
                  wrapSize={playerZoom.containerSize}
                  onConfirm={finishSnip}
                  onCancel={cancelSnip}
                />
              )}

              {/* Subtitle overlay (R71.4: gated on mediaLoaded so a stale last
                  line doesn't hover over the empty-state placeholder) */}
              {mediaLoaded && currentSubText && (
                <div className="video-subtitle-overlay">
                  {currentSubText.split('\n').map((line, i) => <span key={i}>{line}</span>)}
                </div>
              )}

              {/* Custom controls overlay */}
              {mediaLoaded && (
                <div className={`video-player-controls-overlay${playerControlsVisible ? ' visible' : ''}`}>
                  {/* Progress bar */}
                  <div className="video-player-progress-row" onClick={(e) => e.stopPropagation()}>
                    <span className="video-player-time">{formatMediaTime(playerCurrentTime)}</span>
                    <div className="video-player-seek-wrap">
                      <input
                        type="range"
                        className="video-player-seek"
                        min={0}
                        max={playerDuration > 0 ? playerDuration : 1}
                        step={0.1}
                        value={playerCurrentTime}
                        disabled={playerLive}
                        onPointerDown={() => { seekDraggingRef.current = true }}
                        onPointerUp={() => { seekDraggingRef.current = false }}
                        onPointerCancel={() => { seekDraggingRef.current = false }}
                        onLostPointerCapture={() => { seekDraggingRef.current = false }}
                        onChange={(e) => { e.stopPropagation(); playerSeek(Number(e.target.value)) }}
                      />
                      {/* R71.7: visual trim span — also makes it obvious when
                          the points don't fit the current video. */}
                      {trimMode && trimEnd > trimStart && playerDuration > 0 && (
                        <div
                          className="video-player-trim-mark"
                          style={{
                            left: `${(trimStart / playerDuration) * 100}%`,
                            width: `${((trimEnd - trimStart) / playerDuration) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    {/* R71.5: live streams have no finite end — show LIVE instead
                        of "0:00" and keep the slider disabled. */}
                    <span className="video-player-time">{playerLive ? 'LIVE' : formatMediaTime(playerDuration)}</span>
                  </div>

                  {/* Buttons row */}
                  <div className="video-player-btn-row" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="video-player-btn" onClick={() => playerSeek(Math.max(0, playerCurrentTime - 10))} title="-10s">
                      <SkipBack size={14} />
                    </button>
                    <button type="button" className="video-player-btn" onClick={togglePlayerPlay} title={playerPlaying ? t('video.player.pause') : t('video.player.play')}>
                      {playerPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button type="button" className="video-player-btn" onClick={() => playerSeek(Math.min(playerDuration, playerCurrentTime + 10))} title="+10s">
                      <SkipForward size={14} />
                    </button>
                    <button
                      type="button"
                      className={`video-player-btn${playerLoop ? ' active' : ''}`}
                      onClick={() => setPlayerLoop((v) => !v)}
                      title={t('video.player.loop')}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button type="button" className="video-player-btn" onClick={() => setPlayerMuted(v => !v)} title={playerMuted ? t('video.player.unmute') : t('video.player.mute')}>
                      {playerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      className="video-player-volume"
                      min={0}
                      max={1}
                      step={0.01}
                      value={playerMuted ? 0 : playerVolume}
                      title={t('video.player.volume')}
                      onChange={(e) => { setPlayerVolume(Number(e.target.value)); setPlayerMuted(false) }}
                    />
                    <select
                      className="video-player-speed"
                      value={playerRate}
                      title={t('video.player.speed')}
                      onChange={(e) => setPlayerRate(Number(e.target.value))}
                    >
                      {[0.25, 0.5, 1, 1.5, 2, 4].map((r) => <option key={r} value={r}>{r}×</option>)}
                    </select>
                    <div className="video-player-spacer" />
                    <button type="button" className="video-player-btn" onClick={() => subFileInputRef.current?.click()} title={t('video.player.loadSub')}>
                      <FileText size={14} />
                    </button>
                    <input ref={subFileInputRef} type="file" accept=".srt,.vtt,.ass,.ssa" style={{ display: 'none' }} onChange={handleSubFile} />
                    <button type="button" className="video-player-btn" onClick={togglePlayerFullscreen} title={t('video.player.fullscreen')}>
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Live preview (camera / screen) ────────────────────────── */
            <div className="video-preview-wrap" ref={liveWrapRef}>
              <div className="video-zoom-layer" style={liveZoom.layerStyle} onDoubleClick={liveZoom.reset}>
                <video
                  ref={videoRef}
                  className="video-preview video-preview-rect"
                  style={{
                    filter: filterStyle,
                    transform: mirror && mode === 'camera' ? 'scaleX(-1)' : undefined,
                    left: liveZoom.contentRect.w > 0 ? liveZoom.contentRect.x : undefined,
                    top: liveZoom.contentRect.w > 0 ? liveZoom.contentRect.y : undefined,
                    width: liveZoom.contentRect.w > 0 ? liveZoom.contentRect.w : '100%',
                    height: liveZoom.contentRect.h > 0 ? liveZoom.contentRect.h : '100%',
                  }}
                  autoPlay
                  playsInline
                  muted
                />
                {/* R75.3: 冻结帧（进入框选时抓取，覆盖在层内继承同一缩放 transform） */}
                {snipActive && snipFrame && (
                  <canvas
                    ref={(el) => {
                      if (el && el.width !== snipFrame.width) {
                        el.width = snipFrame.width
                        el.height = snipFrame.height
                        el.getContext('2d')?.drawImage(snipFrame, 0, 0)
                      }
                    }}
                    className="video-preview-rect video-snip-freeze"
                    style={{
                      left: liveZoom.contentRect.x, top: liveZoom.contentRect.y,
                      width: liveZoom.contentRect.w, height: liveZoom.contentRect.h,
                    }}
                  />
                )}
              </div>

              {/* Empty-state overlay */}
              {!streaming && (
                <div className="video-empty">
                  {mode === 'camera' ? <CameraOff size={40} /> : <Monitor size={40} />}
                  <span>{streamError ? `⚠ ${streamError}` : t('video.notLive')}</span>
                </div>
              )}

              {/* Live badges */}
              {streaming && (
                <div className="video-badges">
                  {streamInfo && <span className="video-badge">{streamInfo}</span>}
                  {recording && <span className="video-badge video-badge-rec"><Circle size={9} fill="currentColor" /> REC {formatElapsed(recElapsed)}</span>}
                </div>
              )}

              <button
                type="button"
                className="video-fs-btn"
                title={t(fullscreen ? 'video.exitFullscreen' : 'video.fullscreen')}
                onClick={toggleFullscreen}
              >
                {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>

              {/* R75.1: zoom control bar */}
              {streaming && (
                <PreviewZoomBar
                  percent={liveZoom.percent}
                  onZoomIn={() => liveZoom.zoomBy(1.1)}
                  onZoomOut={() => liveZoom.zoomBy(1 / 1.1)}
                  onReset={liveZoom.reset}
                  onOneToOne={liveZoom.oneToOne}
                  disabled={!streaming}
                />
              )}

              {/* R75.3: 屏幕空间框选覆盖层 */}
              {snipActive && snipFrame && (
                <RegionSnipOverlay
                  view={liveZoom.view}
                  contentRect={liveZoom.contentRect}
                  nativeSize={{ w: snipFrame.width, h: snipFrame.height }}
                  wrapSize={liveZoom.containerSize}
                  onConfirm={finishSnip}
                  onCancel={cancelSnip}
                />
              )}
            </div>
          )}

          {/* Transport controls */}
          {/* R77.1: 拍摄缓存胶片栏（预览区下方、传输条上方；空列表自动隐藏） */}
          <CaptureFilmstrip
            items={captures}
            onEdit={(it) => {
              window.rgbbox.capturesRead(it.id)
                .then((url) => {
                  // review-fix: 文件缺失/不可读时给反馈，不再是无声死按钮
                  if (url) setAnnotateSource(url)
                  else editorToast(t('video.filmstrip.missing' as never))
                })
                .catch(() => editorToast(t('video.filmstrip.missing' as never)))
            }}
            onDelete={(id) => {
              void window.rgbbox.capturesDelete(id).then(refreshCaptures).catch(() => { /* best-effort */ })
            }}
            onImport={() => {
              void window.rgbbox.capturesImport().then(refreshCaptures).catch(() => { /* best-effort */ })
            }}
          />
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
                <input ref={playerFileInputRef} type="file" accept="video/*,.mkv,.mov,.avi,.flv,.ts" style={{ display: 'none' }} onChange={onPlayerFile} />
                <input ref={videoFileInputRef} type="file" style={{ display: 'none' }} />
                <input ref={videoFolderInputRef} type="file" style={{ display: 'none' }} />
                {subFilename && (
                  <span className="video-hint video-sub-name"><FileText size={12} /> {subFilename}</span>
                )}
              </>
            )}

            {/* Universal capture buttons (live + player) */}
            {(streaming || (mode === 'player' && mediaLoaded)) && (
              <>
                <span className="video-transport-sep" />
                <button type="button" className="video-btn" onClick={capturePhoto}><ImageIcon size={15} /> {t('video.photo')}</button>
                <button type="button" className="video-btn" onClick={startSnip} disabled={snipActive} title={t('video.snip.hint')}><Frame size={15} /> {t('video.snip.button')}</button>
                {mode !== 'player' && (
                  recording
                    ? <button type="button" className="video-btn video-btn-rec" onClick={stopRecording}><Square size={15} /> {t('video.recStop')}</button>
                    : <button type="button" className="video-btn" onClick={startRecording}><Circle size={13} fill="currentColor" /> {t('video.rec')}</button>
                )}
              </>
            )}
          </div>


          {/* R76: in-place annotator（局部截图确认 / 缩略图编辑入口；绝对定位覆盖全舞台） */}
          {annotateSource !== null && (
            <AnnotateOverlay
              source={annotateSource}
              onClose={() => setAnnotateSource(null)}
              onSave={(url) => {
                downloadPng(url, 'rgbbox-annotated')
                void window.rgbbox.capturesAdd(url, 'annotated').then(refreshCaptures).catch(() => { /* best-effort */ })
                setAnnotateSource(null)
                editorToast(t('video.annotate.saved' as never))
              }}
              onCopy={(url) => {
                window.rgbbox.clipboardWriteImage(url)
                  .then((ok) => editorToast(t((ok ? 'video.annotate.copied' : 'video.annotate.copyFail') as never)))
                  .catch(() => editorToast(t('video.annotate.copyFail' as never)))
              }}
            />
          )}
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
            <>
              {/* Video Playlist */}
              <section className="video-panel">
                <div className="video-row" style={{ alignItems: 'center' }}>
                  <button
                    type="button"
                    className="video-panel-toggle"
                    onClick={() => setPlaylistVisible(v => !v)}
                    aria-expanded={playlistVisible}
                    style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {playlistVisible ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="video-panel-title" style={{ flex: 1 }}>{t('video.playlist.title')}</span>
                    <span style={{ fontSize: 10, opacity: 0.5 }}>{videoPlaylist.length}</span>
                  </button>
                  <button type="button" className="video-btn video-btn-icon" onClick={handleAddVideoFiles} title={t('video.playlist.addFiles')}><Plus size={13} /></button>
                  <button type="button" className="video-btn video-btn-icon" onClick={handleAddVideoFolder} title={t('video.playlist.addFolder')}><FolderOpen size={13} /></button>
                </div>
                {playlistVisible && (
                  <div className="video-playlist-scroll" style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {videoPlaylist.length === 0 && <p className="video-hint">{t('video.playlist.empty')}</p>}
                    {videoGroups.map(group => {
                      const items = groupedVideoPlaylist.get(group.name) || []
                      if (items.length === 0) return null
                      return (
                        <div key={group.name} className="audio-group">
                          <div className="audio-group-header" onClick={() => toggleVideoGroupCollapse(group.name)}>
                            {group.collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                            <span className="audio-group-name">{group.name}</span>
                            <span className="audio-group-count">{items.length}</span>
                            <button type="button" className="audio-btn-icon" onClick={(e) => { e.stopPropagation(); removeVideoGroup(group.name) }} title={t('video.playlist.removeGroup')}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                          {!group.collapsed && items.map(item => {
                            const globalIdx = videoPlaylist.indexOf(item)
                            return (
                              <div
                                key={item.id}
                                className={`audio-track-item ${globalIdx === currentVideoIndex ? 'active' : ''}`}
                                onClick={() => { playVideoItem(globalIdx); setMode('player') }}
                              >
                                <span className="audio-track-name">{item.name}</span>
                                <button type="button" className="audio-btn-icon" onClick={(e) => { e.stopPropagation(); removeVideoItem(globalIdx) }}><Trash2 size={11} /></button>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Player URL + subtitle settings */}
              <section className="video-panel">
                <h3 className="video-panel-title">{t('video.player.title')}</h3>
                <label className="video-field-label">{t('video.player.streamUrl')}</label>
                <div className="video-row">
                  <input
                    className="profile-select video-url-input"
                    type="text"
                    inputMode="url"
                    spellCheck={false}
                    placeholder={t('video.player.streamPlaceholder')}
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') loadStreamUrl(streamUrl) }}
                  />
                  <button
                    type="button"
                    className="video-btn video-btn-icon"
                    onClick={() => loadStreamUrl(streamUrl)}
                    title={t('video.player.loadUrl')}
                    disabled={!streamUrl.trim()}
                  >
                    <LinkIcon size={14} />
                  </button>
                </div>
                <p className="video-hint">{playerName || t('video.player.empty')}</p>
                <p className="video-hint" style={{ opacity: 0.6 }}>{t('video.player.formats')}</p>
                <label className="video-field-label" style={{ marginTop: 10 }}>{t('video.player.subtitle')}</label>
                <div className="video-row">
                  <span className="video-hint" style={{ flex: 1 }}>{subFilename || t('video.player.noSub')}</span>
                  <button type="button" className="video-btn video-btn-icon" onClick={() => subFileInputRef.current?.click()} title={t('video.player.loadSub')}>
                    <FileText size={14} />
                  </button>
                  {subCues.length > 0 && (
                    <button type="button" className="video-btn video-btn-icon" onClick={() => { setSubCues([]); setSubFilename('') }} title={t('video.player.subOff')}>
                      ×
                    </button>
                  )}
                </div>
              </section>

              {/* Trim / Clip */}
              {mediaLoaded && (
                <section className="video-panel">
                  <div className="video-row">
                    <h3 className="video-panel-title" style={{ flex: 1 }}>{t('video.trim.title')}</h3>
                    <button
                      type="button"
                      className={`video-btn video-btn-icon ${trimMode ? 'active' : ''}`}
                      onClick={() => setTrimMode(v => !v)}
                      title={t('video.trim.toggle')}
                    >
                      <Scissors size={14} />
                    </button>
                  </div>
                  {trimMode && (
                    <>
                      <div className="video-row" style={{ gap: 6, marginBottom: 6 }}>
                        <button type="button" className="video-btn" onClick={() => setTrimPoint('start')}>
                          {t('video.trim.setIn')} [{formatMediaTime(trimStart)}]
                        </button>
                        <button type="button" className="video-btn" onClick={() => setTrimPoint('end')}>
                          {t('video.trim.setOut')} [{formatMediaTime(trimEnd)}]
                        </button>
                      </div>
                      <div className="video-row" style={{ gap: 4, marginBottom: 6, fontSize: 11, opacity: 0.75 }}>
                        <span>{t('video.trim.duration')}: {formatMediaTime(Math.max(0, trimEnd - trimStart))}</span>
                      </div>
                      <label className="video-field-label">{t('video.trim.quality')}</label>
                      <select
                        className="profile-select"
                        value={trimQuality}
                        onChange={(e) => setTrimQuality(e.target.value as typeof trimQuality)}
                      >
                        <option value="lossless">{t('video.trim.quality.lossless')}</option>
                        <option value="high">{t('video.trim.quality.high')}</option>
                        <option value="balanced">{t('video.trim.quality.balanced')}</option>
                      </select>
                      <button
                        type="button"
                        className="video-btn video-btn-primary"
                        style={{ marginTop: 8, width: '100%' }}
                        onClick={() => void exportTrimmedClip()}
                        disabled={trimExporting || trimEnd <= trimStart}
                      >
                        <Download size={14} /> {trimExporting ? t('video.trim.exporting') : t('video.trim.export')}
                      </button>
                    </>
                  )}
                </section>
              )}
            </>
          )}

          {/* Filters apply to every mode — collapsed by default so they don't crowd the preview */}
          <section className="video-panel">
            <div className="video-row">
              <button
                type="button"
                className="video-panel-toggle"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
              >
                {filtersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="video-panel-title" style={{ flex: 1, textAlign: 'left' }}>{t('video.filters')}</span>
              </button>
              {filtersOpen && (
                <button type="button" className="video-btn video-btn-icon" onClick={() => setFilters(DEFAULT_FILTERS)} title={t('video.reset')}><RefreshCw size={14} /></button>
              )}
            </div>
            {filtersOpen && ([
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
        </aside>
      </div>

      {editorToastMsg && <div className="video-editor-toast">{editorToastMsg}</div>}

      {/* R91.2: 悬浮迷你播放器（视图隐藏且播放器有源时接管；portal 到 body） */}
      {!visible && mode === 'player' && mediaLoaded && !miniDismissed && (
        <MiniPlayerCard
          videoRef={playerRef}
          title={playerName}
          playing={playerPlaying}
          currentTime={playerCurrentTime}
          duration={playerDuration}
          live={playerLive}
          volume={playerVolume}
          muted={playerMuted}
          onTogglePlay={togglePlayerPlay}
          onSeek={playerSeek}
          onVolume={(v) => setPlayerVolume(v)}
          onToggleMute={() => setPlayerMuted((m) => !m)}
          onReturn={onReturnToVideo ?? (() => {})}
          onClose={() => {
            playerRef.current?.pause()
            setMiniDismissed(true)
          }}
        />
      )}
    </div>
  )
}
