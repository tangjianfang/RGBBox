/**
 * ImageStudioView — 图片工作站（R333）。
 *
 * 视频工作站迁出的全部图片处理编排在此 re-host（组件文件零改动，换宿主）：
 *   • 取帧源：本地视频文件 / 直连 URL（m3u8 经 hls.js）/ 相机 / 屏幕-窗口，
 *     源编排见 hooks/useImageSourcePreview（域 hook）。
 *   • 拍照（整帧咔嚓即下载，R76.3）/ 区域框选（冻结帧→框选→裁剪→标注，
 *     R75.2/R75.3，S 快捷键）/ 窗口句柄截图（R290.2）。
 *   • 全局截图入口（R333：经 rgbbox:snip:start 调主进程 startSnip——托盘/
 *     热键同一管线）+ 热键提示。
 *   • CaptureFilmstrip 拍摄缓存胶片栏 + AnnotateOverlay 就地标注器
 *     （OCR / AI 整理 / 翻译 / 问 AI 内嵌于标注器，随组件整体保留）。
 *
 * 布局复刻 R78.4：.images-layout/.images-stage min-width:0 链 + 胶片栏
 * flex-wrap:nowrap，AnnotateOverlay 绝对定位覆盖舞台（.images-stage 相对定位）。
 */
import {
  AppWindow, Camera, CameraOff, Frame, Image as ImageIcon, Link as LinkIcon, Monitor,
  MonitorPlay, RefreshCw, Scissors, Video as VideoIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { showConfirm } from '../domain/appDialog'
import type { CaptureEntry, CaptureSource } from '../../../shared/types'
import { useImageSourcePreview, RESOLUTIONS } from '../hooks/useImageSourcePreview'
import { usePreviewZoom } from './video/usePreviewZoom'
import { PreviewZoomBar } from './video/PreviewZoomBar'
import { freezeVideoFrame } from './video/frameCapture'
import { RegionSnipOverlay } from './video/RegionSnipOverlay'
import { AnnotateOverlay } from './video/AnnotateOverlay'
import { CaptureFilmstrip } from './CaptureFilmstrip'
import { describeMediaError, formatMediaFailure } from '../domain/mediaError'
import type { Rect } from './video/previewTransform'

/** R333: 图片工作站自己的 localStorage key（胶片栏折叠等；与视频站缓存互不干扰）。 */
const IMAGES_CACHE_KEY = 'rgbbox:imagesCache'

interface ImagesCache {
  filmstripVisible: boolean
}

function loadImagesCache(): Partial<ImagesCache> {
  try {
    const raw = localStorage.getItem(IMAGES_CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveImagesCache(cache: ImagesCache): void {
  try {
    localStorage.setItem(IMAGES_CACHE_KEY, JSON.stringify(cache))
  } catch { /* ignore */ }
}

export function ImageStudioView(): JSX.Element {
  const { t } = useI18n()
  const src = useImageSourcePreview()
  const { mode } = src

  // ── Preview zoom（两个舞台面各自一个实例，随模式条件渲染挂载） ───────────
  const liveWrapRef = useRef<HTMLDivElement | null>(null)
  const liveZoom = usePreviewZoom(liveWrapRef)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)
  const playerZoom = usePreviewZoom(playerWrapRef)

  // R75.1: feed native size into the zoom hooks (loadedmetadata + resize).
  useEffect(() => {
    const el = src.videoRef.current
    if (!el) return
    const onMeta = () => { if (el.videoWidth) liveZoom.setNativeSize({ w: el.videoWidth, h: el.videoHeight }) }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('resize', onMeta)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('resize', onMeta)
    }
  }, [mode, src.streaming, liveZoom.setNativeSize])

  useEffect(() => {
    const el = src.playerRef.current
    if (!el) return
    const onMeta = () => { if (el.videoWidth) playerZoom.setNativeSize({ w: el.videoWidth, h: el.videoHeight }) }
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('resize', onMeta)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('resize', onMeta)
    }
  }, [src.playerUrl, src.usingHls, playerZoom.setNativeSize])

  // ── Snapshot annotate (R76: 编排自 VideoStudioView 平移) ──────────────────
  const [annotateSource, setAnnotateSource] = useState<HTMLCanvasElement | string | null>(null)
  const [editorToastMsg, setEditorToastMsg] = useState('')
  const editorToastTimerRef = useRef<number | null>(null)
  const editorToast = useCallback((msg: string) => {
    setEditorToastMsg(msg)
    if (editorToastTimerRef.current) window.clearTimeout(editorToastTimerRef.current)
    editorToastTimerRef.current = window.setTimeout(() => setEditorToastMsg(''), 2600)
  }, [])

  // ── Capture cache filmstrip (R77.1: mount 时重取，胶片栏随视图 mount 天然刷新) ──
  const [captures, setCaptures] = useState<CaptureEntry[]>([])
  const refreshCaptures = useCallback(() => {
    window.rgbbox.capturesList().then(setCaptures).catch(() => { /* best-effort */ })
  }, [])
  useEffect(() => { refreshCaptures() }, [refreshCaptures])
  const [filmstripVisible, setFilmstripVisible] = useState(() => loadImagesCache().filmstripVisible ?? true)
  useEffect(() => { saveImagesCache({ filmstripVisible }) }, [filmstripVisible])

  const downloadPng = useCallback((dataUrl: string, prefix: string) => {
    // R75.2: 纯像素导出，无任何水印
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${prefix}-${Date.now()}.png`
    a.click()
  }, [])

  // ── Region snip (R75.3): freeze current frame, drag a selection, crop ──────
  const [snipActive, setSnipActive] = useState(false)
  const [snipFrame, setSnipFrame] = useState<HTMLCanvasElement | null>(null)
  const startSnip = useCallback(() => {
    if (snipActive) return
    const source = mode === 'video' ? src.playerRef.current : src.videoRef.current
    if (!source?.videoWidth) return
    const frame = freezeVideoFrame(source, '', false)
    if (!frame) return
    if (mode === 'video') src.playerRef.current?.pause()
    setSnipFrame(frame)
    setSnipActive(true)
  }, [snipActive, mode, src.playerRef, src.videoRef])

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
      // R92: cross-origin frames taint the canvas — bail before the annotator
      // hits the same wall on save.
      editorToast(t('video.capture.fail'))
      return
    }
    // R76.3: 框选确认后就地标注（微信流程）；R77.1: 裁剪结果自动入缓存
    void window.rgbbox.capturesAdd(dataUrl, 'snip').then(refreshCaptures).catch(() => { /* best-effort */ })
    setAnnotateSource(out)
  }, [snipFrame, cancelSnip, refreshCaptures, editorToast, t])

  // R75.3: S 快捷键（有源即可框选；输入控件聚焦时豁免）
  const hasSource = src.streaming || (mode === 'video' && src.mediaLoaded)
  useEffect(() => {
    if (!hasSource || snipActive) return
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); startSnip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasSource, snipActive, startSnip])

  // ── Photo capture（R76.3 咔嚓即下载 / R75.2 原生分辨率全帧 / R92 toast） ──
  const capturePhoto = useCallback(() => {
    const source = mode === 'video' ? src.playerRef.current : src.videoRef.current
    if (!source || !source.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = source.videoWidth
    canvas.height = source.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    let url: string
    try {
      url = canvas.toDataURL('image/png')
    } catch {
      // R92: cross-origin frames taint the canvas — tell the user.
      editorToast(t('video.capture.fail'))
      return
    }
    // R76.3: 拍照恢复「咔嚓即下载」；R77.1: 自动入拍摄缓存
    downloadPng(url, 'rgbbox-photo')
    void window.rgbbox.capturesAdd(url, 'photo').then(refreshCaptures).catch(() => { /* best-effort */ })
  }, [mode, src.playerRef, src.videoRef, downloadPng, refreshCaptures, editorToast, t])

  // R290.2: 按窗口句柄截图（编排自 VideoStudioView 平移）
  const snipWindowShot = useCallback(async (s: CaptureSource) => {
    try {
      const r = await window.rgbbox.snipCaptureWindow(s.id)
      if (r.ok) {
        refreshCaptures()
        editorToast(`${t('video.snipWindowOk')} · ${s.name}`)
      } else {
        editorToast(t(r.code === 'empty' ? 'video.snipWindowEmpty' : 'video.snipWindowFail'))
      }
    } catch {
      editorToast(t('video.snipWindowFail'))
    }
  }, [refreshCaptures, editorToast, t])

  // R333: 全局截图入口（与托盘/热键同一 startSnip 管线；主进程持互斥闸门）
  const startGlobalSnip = useCallback(() => {
    void window.rgbbox.snipStart().catch(() => { /* best-effort */ })
  }, [])

  // R333: 热键提示（设置域持有偏好，此处只读展示）
  const [snipHotkey, setSnipHotkey] = useState('')
  useEffect(() => {
    void window.rgbbox.snipGetHotkey().then((k) => setSnipHotkey(k)).catch(() => { /* default */ })
  }, [])

  const filteredSources = src.sources.filter((s) => s.type === 'screen' || s.type === 'window')

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="images-studio">
      <header className="workspace-header">
        {/* R189 Q-5: topbar already shows '图片工作站' — in-view H1 dedup. */}
        <div>
          <p className="eyebrow">{t('images.eyebrow')}</p>
        </div>
        <div className="video-mode-bar">
          <button type="button" className={`video-mode-btn ${mode === 'video' ? 'active' : ''}`} onClick={() => src.setMode('video')}>
            <VideoIcon size={15} /> {t('images.mode.video')}
          </button>
          <button type="button" className={`video-mode-btn ${mode === 'camera' ? 'active' : ''}`} onClick={() => src.setMode('camera')}>
            <Camera size={15} /> {t('images.mode.camera')}
          </button>
          <button type="button" className={`video-mode-btn ${mode === 'screen' ? 'active' : ''}`} onClick={() => src.setMode('screen')}>
            <MonitorPlay size={15} /> {t('images.mode.screen')}
          </button>
        </div>
      </header>

      <div className="images-layout">
        {/* ── Stage ─────────────────────────────────────────────────────── */}
        <div className="images-stage">
          {mode === 'video' ? (
            /* ── Video source stage（本地文件 / URL；原生 controls 取帧够用） ── */
            <div className="video-preview-wrap" ref={playerWrapRef}>
              <div className="video-zoom-layer" style={playerZoom.layerStyle} onDoubleClick={playerZoom.reset}>
                <video
                  key={src.playerCrossOrigin ? 'cors' : 'nocors'}
                  ref={src.playerRef}
                  crossOrigin={src.playerCrossOrigin}
                  className="video-preview video-preview-rect"
                  style={{
                    left: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.x : undefined,
                    top: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.y : undefined,
                    width: playerZoom.contentRect.w > 0 ? playerZoom.contentRect.w : '100%',
                    height: playerZoom.contentRect.h > 0 ? playerZoom.contentRect.h : '100%',
                  }}
                  src={src.playerUrl || undefined}
                  controls
                  loop
                  playsInline
                  onError={() => {
                    // R168: a corrupt/unsupported source used to die as a
                    // silent black screen — surface the MediaError instead.
                    const failure = describeMediaError(src.playerRef.current?.error ?? null)
                    if (!failure) return
                    src.setStreamError(formatMediaFailure(failure, t))
                    src.clearPlayerSource()
                  }}
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

              {/* Empty-state overlay */}
              {!src.mediaLoaded && (
                <div className="video-empty">
                  <ImageIcon size={40} />
                  <span>{src.streamError ? `⚠ ${src.streamError}` : t('images.stage.empty')}</span>
                </div>
              )}

              {src.mediaLoaded && (
                <PreviewZoomBar
                  percent={playerZoom.percent}
                  onZoomIn={() => playerZoom.zoomBy(1.1)}
                  onZoomOut={() => playerZoom.zoomBy(1 / 1.1)}
                  onReset={playerZoom.reset}
                  onOneToOne={playerZoom.oneToOne}
                  disabled={!src.mediaLoaded}
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
            </div>
          ) : (
            /* ── Live preview (camera / screen) ────────────────────────── */
            <div className="video-preview-wrap" ref={liveWrapRef}>
              <div className="video-zoom-layer" style={liveZoom.layerStyle} onDoubleClick={liveZoom.reset}>
                <video
                  ref={src.videoRef}
                  className="video-preview video-preview-rect"
                  style={{
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
              {!src.streaming && (
                <div className="video-empty">
                  {mode === 'camera' ? <CameraOff size={40} /> : <Monitor size={40} />}
                  <span>{src.streamError ? `⚠ ${src.streamError}` : t('images.stage.notLive')}</span>
                </div>
              )}

              {/* Live badges */}
              {src.streaming && src.streamInfo && (
                <div className="video-badges">
                  <span className="video-badge">{src.streamInfo}</span>
                </div>
              )}

              {src.streaming && (
                <PreviewZoomBar
                  percent={liveZoom.percent}
                  onZoomIn={() => liveZoom.zoomBy(1.1)}
                  onZoomOut={() => liveZoom.zoomBy(1 / 1.1)}
                  onReset={liveZoom.reset}
                  onOneToOne={liveZoom.oneToOne}
                  disabled={!src.streaming}
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

          {/* R77.1: 拍摄缓存胶片栏（预览区下方、传输条上方；空列表自动隐藏） */}
          <CaptureFilmstrip
            items={captures}
            collapsed={!filmstripVisible}
            onToggleCollapsed={() => setFilmstripVisible((v) => !v)}
            onClearAll={async () => {
              // R170: destructive — confirm with the count before mass delete.
              // R302: 应用内 danger 对话框。
              if (!(await showConfirm({ message: t('video.filmstrip.clearAllConfirm').replace('{count}', String(captures.length)), danger: true }))) return
              void Promise.allSettled(captures.map((it) => window.rgbbox.capturesDelete(it.id)))
                .then(refreshCaptures)
                .catch(() => { /* best-effort */ })
            }}
            onEdit={(it) => {
              window.rgbbox.capturesRead(it.id)
                .then((url) => {
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
              src.streaming ? (
                <button type="button" className="video-btn" onClick={src.stopStream}><CameraOff size={15} /> {t('images.camera.stop')}</button>
              ) : (
                <button type="button" className="video-btn video-btn-primary" onClick={() => void src.startCamera()}><Camera size={15} /> {t('images.camera.start')}</button>
              )
            )}
            {mode === 'screen' && src.streaming && (
              <button type="button" className="video-btn" onClick={src.stopStream}>{t('images.camera.stop')}</button>
            )}
            {mode === 'video' && (
              <button type="button" className="video-btn video-btn-primary" onClick={() => src.playerFileInputRef.current?.click()}>
                <VideoIcon size={15} /> {t('images.video.openFile')}
              </button>
            )}
            <input ref={src.playerFileInputRef} type="file" accept="video/*,.mkv,.mov" style={{ display: 'none' }} onChange={src.onPlayerFile} />

            {/* Universal capture buttons (any loaded source) */}
            {hasSource && (
              <>
                <span className="video-transport-sep" />
                <button type="button" className="video-btn" onClick={capturePhoto} aria-label={t('video.photo')}><ImageIcon size={15} /> {t('video.photo')}</button>
                <button type="button" className="video-btn" onClick={startSnip} disabled={snipActive} title={t('video.snip.hint')} aria-label={t('video.snip.hint')}><Frame size={15} /> {t('video.snip.button')}</button>
              </>
            )}

            {/* R333: 全局截图（独立 snip 窗口；产物经 captureStore 回到胶片栏） */}
            <span className="video-transport-sep" />
            <button type="button" className="video-btn" onClick={startGlobalSnip}><Scissors size={15} /> {t('images.globalSnip')}</button>
            {snipHotkey && (
              <span className="video-hint">{t('images.hotkeyHint').replace('{key}', snipHotkey)}</span>
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
          {mode === 'video' && (
            <section className="video-panel">
              <h3 className="video-panel-title">{t('images.panel.source')}</h3>
              <label className="video-field-label">{t('images.video.url')}</label>
              <div className="video-row">
                <input
                  className="profile-select video-url-input"
                  type="text"
                  inputMode="url"
                  spellCheck={false}
                  placeholder={t('images.video.urlPlaceholder')}
                  value={src.streamUrl}
                  onChange={(e) => src.setStreamUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') src.loadStreamUrl(src.streamUrl) }}
                />
                <button
                  type="button"
                  className="video-btn video-btn-icon"
                  onClick={() => src.loadStreamUrl(src.streamUrl)}
                  title={t('images.video.urlLoad')}
                  aria-label={t('images.video.urlLoad')}
                  disabled={!src.streamUrl.trim()}
                >
                  <LinkIcon size={14} />
                </button>
              </div>
              <p className="video-hint">{src.playerName || t('images.stage.empty')}</p>
            </section>
          )}

          {mode === 'camera' && (
            <section className="video-panel">
              <h3 className="video-panel-title">{t('images.camera.device')}</h3>
              <div className="video-row">
                <select className="profile-select" value={src.deviceId} onChange={(e) => src.setDeviceId(e.target.value)}>
                  {src.devices.length === 0 && <option value="">{t('images.camera.none')}</option>}
                  {src.devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </select>
                <button type="button" className="video-btn video-btn-icon" onClick={() => void src.refreshDevices()} title={t('video.refresh')} aria-label={t('video.refresh')}><RefreshCw size={14} /></button>
              </div>
              <label className="video-field-label">{t('video.resolution')}</label>
              <select className="profile-select" value={src.resIndex} onChange={(e) => src.setResIndex(Number(e.target.value))}>
                {RESOLUTIONS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
              </select>
              {src.streaming && (
                <p className="video-hint">{t('images.camera.start')} ✓ — {src.streamInfo}</p>
              )}
            </section>
          )}

          {mode === 'screen' && (
            <section className="video-panel">
              <div className="video-row">
                <h3 className="video-panel-title" style={{ flex: 1 }}>{t('images.screen.sources')}</h3>
                <button type="button" className="video-btn video-btn-icon" onClick={() => void src.refreshSources()} title={t('video.refresh')} aria-label={t('video.refresh')}><RefreshCw size={14} /></button>
              </div>
              <div className="video-source-grid">
                {src.loadingSources && <p className="video-hint">{t('images.screen.loading')}</p>}
                {!src.loadingSources && filteredSources.length === 0 && <p className="video-hint">{t('images.screen.empty')}</p>}
                {filteredSources.map((s) => (
                  <div
                    key={s.id}
                    className={`video-source-card ${src.activeSourceId === s.id ? 'active' : ''}`}
                    title={s.name}
                  >
                    <button
                      type="button"
                      className="video-source-pick"
                      aria-label={s.name}
                      onClick={() => void src.startScreenCapture(s.id)}
                    >
                      {s.thumbnail
                        ? <img src={s.thumbnail} alt="" />
                        : <div className="video-source-thumb-empty"><Monitor size={24} /></div>}
                      <span className="video-source-name">
                        {s.appIcon && <img className="video-source-icon" src={s.appIcon} alt="" />}
                        {s.name}
                      </span>
                    </button>
                    {/* R290.2: 窗口源专属——按窗口句柄截一张原生分辨率静态图 */}
                    {s.type === 'window' && (
                      <button
                        type="button"
                        className="video-source-shot"
                        aria-label={t('video.snipWindow')}
                        title={t('video.snipWindow')}
                        onClick={() => void snipWindowShot(s)}
                      >
                        <Camera size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="video-hint"><AppWindow size={12} /> {t('images.screen.window')} → {t('video.snipWindow')}</p>
            </section>
          )}
        </aside>
      </div>

      {editorToastMsg && <div className="video-editor-toast">{editorToastMsg}</div>}
    </div>
  )
}
