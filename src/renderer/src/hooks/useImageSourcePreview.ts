/**
 * useImageSourcePreview — 图片工作站「取帧源」域 hook（R333）。
 *
 * 视频工作站迁出后的取帧编排：本地视频文件 / 直连 URL（m3u8 走 hls.js，
 * 缺 hls 场景降级直连 <video>）/ 相机 getUserMedia / 屏幕-窗口 getDisplayMedia。
 * 流代际令牌（R296(M-1)）与「换源先停旧轨」（R296(R-3)）自 VideoStudioView
 * 平移——在途的慢返回流按过期代际直接停轨丢弃；卸载时全量停轨。
 * 纯取帧域：不录制（无音频约束）、无字幕/超分/裁剪/进度。
 */
import Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureSource } from '../../../shared/types'

export type ImageSourceMode = 'video' | 'camera' | 'screen'

export interface DeviceOption {
  deviceId: string
  label: string
}

export const RESOLUTIONS: Array<{ label: string; w: number; h: number }> = [
  { label: '640×480 (VGA)', w: 640, h: 480 },
  { label: '1280×720 (HD)', w: 1280, h: 720 },
  { label: '1920×1080 (FHD)', w: 1920, h: 1080 },
  { label: '2560×1440 (QHD)', w: 2560, h: 1440 },
  { label: '3840×2160 (4K)', w: 3840, h: 2160 },
]

/** R333: 图片工作站自己的折叠/源记忆 key（视频站的 rgbbox-video-playlist-config 不动）。 */
const IMAGES_MODE_KEY = 'rgbbox:imagesMode'

export function useImageSourcePreview() {
  const [mode, setModeState] = useState<ImageSourceMode>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(IMAGES_MODE_KEY) : null
    return saved === 'video' || saved === 'camera' || saved === 'screen' ? saved : 'video'
  })
  const setMode = useCallback((m: ImageSourceMode) => {
    setModeState(m)
    try { localStorage.setItem(IMAGES_MODE_KEY, m) } catch { /* storage unavailable — session-only */ }
  }, [])

  // ── Live preview (camera / screen) ─────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** R296(M-1): 流代际令牌——stopStream 递增，异步落地流比对后决定 attach 或丢弃。 */
  const streamGenRef = useRef(0)
  const [streaming, setStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamInfo, setStreamInfo] = useState<string>('')

  // ── Camera ─────────────────────────────────────────────────────────────────
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [deviceId, setDeviceId] = useState<string>('')
  const [resIndex, setResIndex] = useState<number>(1)

  // ── Screen / window sources ────────────────────────────────────────────────
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [activeSourceId, setActiveSourceId] = useState<string>('')

  // ── Video source (local file + network stream) ─────────────────────────────
  const playerRef = useRef<HTMLVideoElement | null>(null)
  const [playerUrl, setPlayerUrl] = useState<string>('')
  const [playerName, setPlayerName] = useState<string>('')
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [usingHls, setUsingHls] = useState<boolean>(false)
  const hlsRef = useRef<Hls | null>(null)
  const playerFileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaLoaded = playerUrl !== '' || usingHls
  // R92（自 VideoStudioView 平移）: media:// 与 blob: 需 crossOrigin='anonymous'
  // 才能导出像素；远程 http(s) 保持 No-CORS（强设 anonymous 会播不了无 CORS
  // 的流服务器）。JSX key remount 保证 crossOrigin 先于 src 落在全新元素上。
  const playerCrossOrigin = playerUrl.startsWith('media://') || playerUrl.startsWith('blob:')
    ? ('anonymous' as const)
    : undefined

  const stopStream = useCallback(() => {
    streamGenRef.current += 1
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStreaming(false)
    setStreamInfo('')
  }, [])

  const attachStream = useCallback((stream: MediaStream, gen: number) => {
    if (gen !== streamGenRef.current) {
      stream.getTracks().forEach((tr) => tr.stop())
      return
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop()) // R296(R-3): 覆盖前先停旧轨
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

  // ── Start camera（纯取帧：audio:false，不申请录音权限） ─────────────────────
  const startCamera = useCallback(async () => {
    stopStream()
    const camGen = streamGenRef.current
    const res = RESOLUTIONS[resIndex]
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: res.w },
          height: { ideal: res.h },
        },
      })
      attachStream(stream, camGen)
      // Labels become available only after permission is granted.
      void refreshDevices()
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
      setStreaming(false)
    }
  }, [stopStream, resIndex, deviceId, attachStream, refreshDevices])

  // Re-apply constraints live when device / resolution changes mid-stream.
  const startCameraRef = useRef(startCamera)
  useEffect(() => { startCameraRef.current = startCamera }, [startCamera])
  const streamingRef = useRef(streaming)
  useEffect(() => { streamingRef.current = streaming }, [streaming])
  useEffect(() => {
    if (mode !== 'camera' || !streamingRef.current) return
    void startCameraRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resIndex, deviceId])

  // ── Screen / window sources ────────────────────────────────────────────────
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
    const capGen = streamGenRef.current
    setActiveSourceId(sourceId)
    setStreamError(null)
    // Preferred (modern) path: pre-select the source in the main process, then
    // getDisplayMedia（同 VideoStudioView；图片站不带系统声——纯取帧）。
    try {
      await window.rgbbox.selectCaptureSource(sourceId)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } } })
      attachStream(stream, capGen)
      return
    } catch (modernErr) {
      // Fall back to the legacy desktop constraint if getDisplayMedia is unavailable.
      try {
        const constraints = {
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxFrameRate: 60,
            },
          },
        } as unknown as MediaStreamConstraints
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        attachStream(stream, capGen)
      } catch (legacyErr) {
        const err = legacyErr ?? modernErr
        setStreamError(err instanceof Error ? err.message : String(err))
        setStreaming(false)
      }
    }
  }, [stopStream, attachStream])

  // ── Video sources ──────────────────────────────────────────────────────────
  /** Tear down any active player source (blob URL or hls.js instance). */
  const clearPlayerSource = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setUsingHls(false)
    setPlayerUrl((prev) => { if (prev.startsWith('blob:')) URL.revokeObjectURL(prev); return '' })
  }, [])

  const onPlayerFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    clearPlayerSource()
    setStreamError(null)
    setPlayerUrl(URL.createObjectURL(file))
    setPlayerName(file.name)
  }, [clearPlayerSource])

  /**
   * Load a network video stream（自 VideoStudioView 平移）: direct progressive
   * formats bind straight to the <video> element; HLS playlists (.m3u8) play
   * through hls.js (MSE), falling back to a direct bind where hls.js is
   * unsupported and the platform handles HLS natively.
   */
  const loadStreamUrl = useCallback((rawUrl: string) => {
    const url = rawUrl.trim()
    if (!url) return
    clearPlayerSource()
    setStreamError(null)
    setPlayerName(url)
    const el = playerRef.current
    const isHls = /\.m3u8(\?|#|$)/i.test(url)
    if (isHls && Hls.isSupported() && el) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true })
      hlsRef.current = hls
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setStreamError(`HLS: ${data.details}`)
          setUsingHls(false)
          hls.destroy()
          if (hlsRef.current === hls) hlsRef.current = null
        }
      })
      hls.loadSource(url)
      hls.attachMedia(el)
      void el.play().catch(() => { /* autoplay may defer */ })
      setUsingHls(true)
    } else {
      setPlayerUrl(url)
    }
  }, [clearPlayerSource])

  // ── Mode switch: reload source lists / stop the outgoing live stream ────────
  useEffect(() => {
    if (mode === 'camera') void refreshDevices()
    if (mode === 'screen') void refreshSources()
  }, [mode, refreshDevices, refreshSources])

  const prevModeRef = useRef<ImageSourceMode>(mode)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      stopStream()
      prevModeRef.current = mode
    }
  }, [mode, stopStream])

  // Unmount: stop tracks, destroy hls, revoke the blob URL.
  useEffect(() => () => {
    stopStream()
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setPlayerUrl((prev) => { if (prev.startsWith('blob:')) URL.revokeObjectURL(prev); return '' })
  }, [stopStream])

  return {
    mode, setMode,
    // live (camera / screen)
    videoRef, streaming, streamError, streamInfo, stopStream,
    // camera
    devices, deviceId, setDeviceId, resIndex, setResIndex, refreshDevices, startCamera,
    // screen
    sources, loadingSources, activeSourceId, refreshSources, startScreenCapture,
    // video source
    playerRef, playerUrl, playerName, streamUrl, setStreamUrl,
    usingHls, mediaLoaded, playerCrossOrigin,
    loadStreamUrl, onPlayerFile, playerFileInputRef,
    setStreamError, clearPlayerSource,
  }
}
