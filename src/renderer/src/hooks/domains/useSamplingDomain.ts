import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { DisplayTopology, Profile } from '../../../../shared/types'
import { resolveTargetDisplayAspect } from '../../../../engine/targetDisplayAspect'
import { activeScene } from '../../domain/profileUtils'

/**
 * R147 P3b: sampling/grid/preview-panels domain, moved verbatim from App.tsx —
 * grid density mode (auto long-edge vs advanced manual), the R40 collapsible
 * sampling tabs, aspect lock, the R61/R66 target display aspect computation
 * and the R64 preview-fullscreen diagnostic mode. All localStorage-persisted.
 */
export function useSamplingDomain(args: {
  profile: Profile | null
  setProfile: Dispatch<SetStateAction<Profile | null>>
  topology: DisplayTopology | null
  overlayDisplayIds: number[]
  overlayIdsRef: RefObject<number[]>
  sceneLinked: boolean | undefined
}) {
  const { profile, setProfile, topology, overlayDisplayIds, overlayIdsRef, sceneLinked } = args

  // ── Grid density mode ─────────────────────────────────────────────────
  // Single "long-edge LED count" drives both columns and rows from display aspect ratio.
  // Advanced mode falls back to the old independent sliders.
  const [gridAdvanced, setGridAdvanced] = useState(() => localStorage.getItem('rgbbox:gridAdvanced') === '1')
  useEffect(() => { localStorage.setItem('rgbbox:gridAdvanced', gridAdvanced ? '1' : '0') }, [gridAdvanced])

  // R40: the sampling panel used to stack every control (resolution, aspect,
  // smoothing, saturation, brightness, fps, toggles, render style) in one
  // long full-width block below the preview/map row, pushing the display
  // topology map far down the page. Split into collapsible tabs so only one
  // small group of controls is visible at a time (persisted like the other
  // panel-shape preferences above).
  const [samplingCollapsed, setSamplingCollapsed] = useState(() => localStorage.getItem('rgbbox:samplingCollapsed') === '1')
  useEffect(() => { localStorage.setItem('rgbbox:samplingCollapsed', samplingCollapsed ? '1' : '0') }, [samplingCollapsed])
  const [samplingTab, setSamplingTab] = useState<'resolution' | 'appearance' | 'performance'>(
    () => (localStorage.getItem('rgbbox:samplingTab') as 'resolution' | 'appearance' | 'performance') || 'resolution'
  )
  useEffect(() => { localStorage.setItem('rgbbox:samplingTab', samplingTab) }, [samplingTab])

  const setSamplingValue = useCallback((key: keyof Profile['sampling'], value: number | boolean | string) => {
    setProfile((cur) => cur ? { ...cur, sampling: { ...cur.sampling, [key]: value } } : cur)
  }, [])

  // Display aspect ratio: virtual-desktop ratio in linked mode, otherwise the
  // REAL target overlay display's aspect ratio when exactly one overlay is
  // active (R66 — see targetDisplayAspect.ts for why this must NOT just
  // always be the primary display), falling back to primary when there's no
  // single unambiguous target.
  const displayAspectRatioRef = useRef<number>(16 / 9)
  useEffect(() => {
    if (!topology) return
    const s = profile ? activeScene(profile) : null
    displayAspectRatioRef.current = resolveTargetDisplayAspect(topology, overlayIdsRef.current, Boolean(s?.linkedDisplays))
  })

  // R61: the in-app "RGB 画布预览" panel used a CSS-hardcoded `aspect-ratio:
  // 16/9` regardless of the actual target display's real aspect ratio. The
  // overlay window, in contrast, always renders at the exact physical display
  // resolution (whatever that is — 16:10, 21:9 ultrawide, 4:3, portrait, or a
  // multi-display virtual span). Since both PreviewGl instances stretch the
  // same RgbFrame to fill their own canvas edge-to-edge (R30.1), a preview box
  // locked to 16:9 stretches the frame differently than the real output
  // whenever the display isn't 16:9 — the two only "coincidentally" matched
  // for 16:9 monitors. Computed the same way as `displayAspectRatioRef` above
  // but as reactive state (not a ref) so it can actually drive a re-render /
  // CSS value on the preview panel.
  //
  // R66: MUST also react to `overlayDisplayIds` — see `displayAspectRatioRef`
  // above and `targetDisplayAspect.ts` for why "always use the primary
  // display" was itself the remaining root cause of preview/overlay mismatch
  // even after R62/R63/R65 unified the rest of the rendering pipeline.
  const previewAspectRatio = useMemo(() => {
    return resolveTargetDisplayAspect(topology, overlayDisplayIds, Boolean(sceneLinked))
  }, [topology, sceneLinked, overlayDisplayIds])

  // R64: diagnostic "预览全屏" mode — lets the user A/B compare the in-app
  // preview (same PreviewGl/overlay=false pipeline, same opaque main window,
  // no separate transparent BrowserWindow) blown up to the REAL physical
  // screen resolution, against the actual overlay-window projection. If the
  // fullscreen preview looks smooth/undistorted, the shared rendering/aspect
  // pipeline is fine and the remaining discrepancy is specific to the overlay
  // window's own presentation path (separate transparent/frameless
  // BrowserWindow, alpha blending, Windows exclusive-fullscreen); if the
  // fullscreen preview ALSO looks wrong, the shared pipeline itself still has
  // a bug. Mirrors the existing `toggleFullscreen`/`fullscreenchange` pattern
  // already used by VideoStudioView.tsx / AudioStudioView.tsx.
  const previewFullscreenWrapRef = useRef<HTMLDivElement | null>(null)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)

  const togglePreviewFullscreen = useCallback(() => {
    const el = previewFullscreenWrapRef.current
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* noop */ })
      return
    }
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => setPreviewFullscreen((v) => !v))
    } else {
      // No native Fullscreen API support — fall back to the CSS-driven overlay.
      setPreviewFullscreen((v) => !v)
    }
  }, [])

  // Keep local state in sync with the actual fullscreen element (handles ESC,
  // which the native Fullscreen API intercepts itself before any keydown
  // listener sees it).
  useEffect(() => {
    const onFsChange = (): void => {
      setPreviewFullscreen(document.fullscreenElement === previewFullscreenWrapRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ESC exits the CSS-overlay fullscreen fallback (native fullscreen handles ESC itself).
  useEffect(() => {
    if (!previewFullscreen || document.fullscreenElement) return undefined
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPreviewFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewFullscreen])

  /** Snap columns/rows to display aspect ratio while keeping the long-edge count. */
  const matchDisplayRatio = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur
      const ar = displayAspectRatioRef.current
      const longEdge = Math.max(cur.sampling.columns, cur.sampling.rows)
      const cols = ar >= 1 ? longEdge : Math.max(1, Math.round(longEdge * ar))
      const rows = ar >= 1 ? Math.max(1, Math.round(longEdge / ar)) : longEdge
      return { ...cur, sampling: { ...cur.sampling, columns: cols, rows: rows } }
    })
  }, [])

  /** Drive both dimensions from a single long-edge count using display aspect ratio. */
  const setGridDensity = useCallback((longEdge: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const ar = displayAspectRatioRef.current
      const clamped = Math.max(8, Math.min(320, longEdge))
      const cols = ar >= 1 ? clamped : Math.max(1, Math.round(clamped * ar))
      const rows = ar >= 1 ? Math.max(1, Math.round(clamped / ar)) : clamped
      return { ...cur, sampling: { ...cur.sampling, columns: cols, rows: rows } }
    })
  }, [])

  const [aspectLocked, setAspectLocked] = useState(() => localStorage.getItem('rgbbox:aspectLock') === '1')
  const aspectRatioRef = useRef<number>(16 / 9)

  const toggleAspectLock = useCallback(() => {
    setAspectLocked((locked) => {
      const next = !locked
      if (next) {
        // capture current ratio at the moment of locking
        setProfile((cur) => {
          if (cur) aspectRatioRef.current = cur.sampling.columns / cur.sampling.rows
          return cur
        })
      }
      localStorage.setItem('rgbbox:aspectLock', next ? '1' : '0')
      return next
    })
  }, [])

  const setColumns = useCallback((cols: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const newCols = Math.max(1, Math.min(960, cols))
      const newRows = aspectLocked ? Math.max(1, Math.min(540, Math.round(newCols / aspectRatioRef.current))) : cur.sampling.rows
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  const setRows = useCallback((rows: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const newRows = Math.max(1, Math.min(540, rows))
      const newCols = aspectLocked ? Math.max(1, Math.min(960, Math.round(newRows * aspectRatioRef.current))) : cur.sampling.columns
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  return {
    gridAdvanced, setGridAdvanced,
    samplingCollapsed, setSamplingCollapsed,
    samplingTab, setSamplingTab,
    setSamplingValue,
    previewAspectRatio,
    previewFullscreen, togglePreviewFullscreen, previewFullscreenWrapRef,
    matchDisplayRatio, setGridDensity,
    aspectLocked, toggleAspectLock,
    setColumns, setRows,
  }
}
