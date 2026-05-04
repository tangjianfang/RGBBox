import { Activity, Download, FilePlus, Gauge, Languages, Link2, Link2Off, Mic, MicOff, Monitor, MoreVertical, Pause, Pencil, Play, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { defaultProfile, effectPresets } from '../../shared/defaultProfile'
import type { BlendMode, DisplayTopology, EffectKind, EffectLayer, EngineStatus, Profile, ProfileMeta, RgbFrame } from '../../shared/types'
import { useI18n } from './i18n'
import { DisplayMap } from './components/DisplayMap'
import { EffectsView } from './components/EffectsView'
import { PreviewGrid } from './components/PreviewGrid'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import type { WorkerInput } from './workers/previewEngineWorker'

type View = 'workspace' | 'effects' | 'profiles' | 'diagnostics'

// Human-readable parameter metadata — labels pulled from i18n in render
const PARAM_META: Record<string, { labelKey: string; min: number; max: number; step: number; unit?: string }> = {
  speed:       { labelKey: 'Speed',       min: 0,    max: 2,    step: 0.05, unit: '×' },
  spread:      { labelKey: 'Spread',      min: 0.5,  max: 3,    step: 0.1,  unit: '×' },
  width:       { labelKey: 'Width',       min: 0,    max: 1,    step: 0.05 },
  saturation:  { labelKey: 'Saturation',  min: 0,    max: 2,    step: 0.05, unit: '×' },
  contrast:    { labelKey: 'Contrast',    min: 0,    max: 2,    step: 0.05, unit: '×' },
  intensity:   { labelKey: 'Intensity',   min: 0,    max: 1,    step: 0.05 },
  density:     { labelKey: 'Density',     min: 0,    max: 1,    step: 0.05 },
  frequency:   { labelKey: 'Rings',       min: 1,    max: 10,   step: 0.5 },
  tail:        { labelKey: 'Tail',        min: 0.05, max: 0.95, step: 0.05 },
  hueShift:    { labelKey: 'Hue Shift',   min: -180, max: 180,  step: 5,    unit: '°' },
  sensitivity: { labelKey: 'Sensitivity', min: 0.2,  max: 3,    step: 0.1,  unit: '×' },
  angle:       { labelKey: 'param.angle', min: 0,    max: 360,  step: 5,    unit: '°' },
  // Static text params
  textX:       { labelKey: 'param.textX',    min: 0,   max: 1,   step: 0.05 },
  textY:       { labelKey: 'param.textY',    min: 0,   max: 1,   step: 0.05 },
  textScale:   { labelKey: 'param.textScale', min: 1,  max: 4,   step: 1 },
  textWeight:  { labelKey: 'param.textWeight', min: 100, max: 900, step: 100 },
}

// performanceLabels is now computed inside the App component using t()

function activeLayer(profile: Profile) {
  const scene = profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
  return scene.layers.find((l) => l.enabled) ?? scene.layers[0]
}

function activeScene(profile: Profile) {
  return profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]
}

function updateLayer(profile: Profile, layerId: string, patch: Partial<EffectLayer>): Profile {
  const sceneId = (profile.scenes.find((c) => c.id === profile.activeSceneId) ?? profile.scenes[0]).id
  return {
    ...profile,
    scenes: profile.scenes.map((s) =>
      s.id !== sceneId ? s : { ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }
    )
  }
}

/**
 * Extract the sub-region of a virtual-canvas frame that corresponds to a given display's
 * physical position in the virtual desktop. Used in linked-display mode so each overlay
 * only shows its own portion of the full virtual canvas.
 */
function extractSubFrame(
  virtualFrame: RgbFrame,
  displayId: number,
  topology: DisplayTopology
): RgbFrame | null {
  const display = topology.displays.find((d) => d.id === displayId)
  if (!display) return null
  const vb = topology.virtualBounds
  if (vb.width === 0 || vb.height === 0) return null

  const offsetX = Math.round((display.bounds.x - vb.x) / vb.width * virtualFrame.columns)
  const offsetY = Math.round((display.bounds.y - vb.y) / vb.height * virtualFrame.rows)
  const dispCols = Math.round(display.bounds.width / vb.width * virtualFrame.columns)
  const dispRows = Math.round(display.bounds.height / vb.height * virtualFrame.rows)

  if (dispCols <= 0 || dispRows <= 0) return null

  const pixels = new Uint8ClampedArray(dispCols * dispRows * 3)
  for (let y = 0; y < dispRows; y++) {
    for (let x = 0; x < dispCols; x++) {
      const srcI = ((offsetY + y) * virtualFrame.columns + Math.min(virtualFrame.columns - 1, offsetX + x)) * 3
      const dstI = (y * dispCols + x) * 3
      pixels[dstI]     = virtualFrame.pixels[srcI]
      pixels[dstI + 1] = virtualFrame.pixels[srcI + 1]
      pixels[dstI + 2] = virtualFrame.pixels[srcI + 2]
    }
  }
  return { columns: dispCols, rows: dispRows, pixels, generatedAt: virtualFrame.generatedAt }
}

let _layerCounter = 100

export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topology, setTopology] = useState<DisplayTopology | null>(null)
  const [frame, setFrame] = useState<RgbFrame | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ running: true, fps: 30, output: 'virtual-preview' })
  const [version, setVersion] = useState('0.1.0')
  const [savedProfiles, setSavedProfiles] = useState<ProfileMeta[]>([])
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileEditMode, setProfileEditMode] = useState<'new' | 'rename' | null>(null)
  const [profileEditName, setProfileEditName] = useState('')
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)

  const refreshProfiles = useCallback(() => {
    window.rgbbox.listProfiles().then(setSavedProfiles)
  }, [])

  useEffect(() => { refreshProfiles() }, [refreshProfiles])

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return undefined
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileMenuOpen])

  // ── UI state persisted to localStorage ──────────────────────────────────
  const [selectedLayerId, setSelectedLayerId] = useState(() =>
    localStorage.getItem('rgbbox:selectedLayerId') ?? 'layer-screen-ambient'
  )
  const [currentView, setCurrentView] = useState<View>(() => {
    const v = localStorage.getItem('rgbbox:view') as View | null
    return v ?? 'workspace'
  })
  const [audioEnabled, setAudioEnabled] = useState(() =>
    localStorage.getItem('rgbbox:audio') === '1'
  )
  const [audioDeviceId, setAudioDeviceId] = useState(() =>
    localStorage.getItem('rgbbox:audioDevice') ?? ''
  )
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [overlayDisplayIds, setOverlayDisplayIds] = useState<number[]>([])
  const [powerSaveBlock, setPowerSaveBlock] = useState(false)
  const audio = useAudioAnalyzer(audioEnabled, audioDeviceId)

  // ── Engine Worker ─────────────────────────────────────────────────────────
  // Created once; the render loop sends work to it and receives frames via
  // postMessage/onmessage instead of going through IPC.
  const workerRef = useRef<Worker | null>(null)
  const overlayIdsRef = useRef<number[]>(overlayDisplayIds)
  overlayIdsRef.current = overlayDisplayIds
  const topologyRef = useRef<DisplayTopology | null>(topology)
  topologyRef.current = topology

  /** Ripple burst: set on canvas click, cleared after 2.5 s (matches burstDuration in effects.ts). */
  const rippleBurstRef = useRef<{ cx: number; cy: number; clickedAt: number } | null>(null)
  const rippleBurstTimerRef = useRef<number | null>(null)

  const handleRippleClick = useCallback((nx: number, ny: number) => {
    if (rippleBurstTimerRef.current !== null) window.clearTimeout(rippleBurstTimerRef.current)
    rippleBurstRef.current = { cx: nx, cy: ny, clickedAt: performance.now() }
    rippleBurstTimerRef.current = window.setTimeout(() => {
      rippleBurstRef.current = null
      rippleBurstTimerRef.current = null
    }, 2600)
  }, [])

  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/previewEngineWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    Promise.all([
      window.rgbbox.getDefaultProfile(),
      window.rgbbox.getDisplayTopology(),
      window.rgbbox.getEngineStatus(),
      window.rgbbox.getAppVersion(),
      window.rgbbox.getOverlayDisplayIds(),
      window.rgbbox.getPowerSaveBlock()
    ]).then(([loadedProfile, loadedTopology, loadedStatus, loadedVersion, loadedOverlays, loadedPSB]) => {
      // Back-fill fields added after the profile was first persisted
      const migratedProfile = {
        ...loadedProfile,
        sampling: {
          ...loadedProfile.sampling,
          saturationBoost: loadedProfile.sampling.saturationBoost ?? 1.5
        }
      }
      setProfile(migratedProfile)
      setTopology(loadedTopology)
      setStatus(loadedStatus)
      setVersion(loadedVersion)
      setOverlayDisplayIds(loadedOverlays)
      setPowerSaveBlock(loadedPSB)
    })
  }, [])

  const handleToggleOverlay = useCallback(async (displayId: number) => {
    if (overlayDisplayIds.includes(displayId)) {
      await window.rgbbox.closeOverlay(displayId)
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    } else {
      await window.rgbbox.openOverlay(displayId)
      setOverlayDisplayIds((prev) => [...prev, displayId])
    }
  }, [overlayDisplayIds])

  // ── Persist UI state to localStorage ────────────────────────────────────
  useEffect(() => { localStorage.setItem('rgbbox:view', currentView) }, [currentView])
  useEffect(() => { localStorage.setItem('rgbbox:audio', audioEnabled ? '1' : '0') }, [audioEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:audioDevice', audioDeviceId) }, [audioDeviceId])
  useEffect(() => { localStorage.setItem('rgbbox:selectedLayerId', selectedLayerId) }, [selectedLayerId])

  // Enumerate audio input devices (labels populated after first getUserMedia permission)
  useEffect(() => {
    if (!audioEnabled) return undefined
    const enumerate = async (): Promise<void> => {
      const all = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(all.filter((d) => d.kind === 'audioinput'))
    }
    // Enumerate immediately, then again after 800ms (labels appear after permission)
    enumerate()
    const timer = window.setTimeout(enumerate, 800)
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => {
      window.clearTimeout(timer)
      navigator.mediaDevices.removeEventListener('devicechange', enumerate)
    }
  }, [audioEnabled])

  useEffect(() => {
    if (!profile) return undefined
    const timer = window.setTimeout(() => { window.rgbbox.saveProfile(profile) }, 350)
    return () => window.clearTimeout(timer)
  }, [profile])

  // ── Display hotplug — refresh topology when monitors are added/removed ──
  useEffect(() => {
    return window.rgbbox.onDisplayTopologyChanged(async () => {
      const newTopology = await window.rgbbox.getDisplayTopology()
      setTopology(newTopology)
    })
  }, [])

  useEffect(() => {
    if (!profile || !status.running || !workerRef.current) return undefined

    let cancelled = false
    const intervalMs = Math.max(16, Math.floor(1000 / profile.sampling.fps))
    let timerId: number | null = null
    const worker = workerRef.current
    const scene = profile.scenes.find((s) => s.id === profile.activeSceneId) ?? profile.scenes[0]

    const tick = async (): Promise<void> => {
      if (cancelled) return

      const audioInput = audio.active
        ? { bass: audio.bass, mid: audio.mid, high: audio.high, beat: audio.beat, freqBands: audio.freqBands }
        : undefined

      // Screen capture is only needed for screen-ambient effect and when no overlays are active
      const needsCapture =
        overlayIdsRef.current.length === 0 &&
        scene.layers.some((l) => l.enabled && l.kind === 'screen-ambient')

      let screenSample: RgbFrame | undefined
      if (needsCapture) {
        const captured = await window.rgbbox.captureScreenSample(
          profile.sampling.columns,
          profile.sampling.rows,
          false  // hasOverlays already checked above
        )
        screenSample = captured ?? undefined
      }

      if (cancelled) return

      // Send to worker; transfer screen sample buffer (zero-copy) if present
      const burst = rippleBurstRef.current
      const rippleBurst = burst
        ? { cx: burst.cx, cy: burst.cy, burstAge: (performance.now() - burst.clickedAt) / 1000 }
        : undefined
      const msg: WorkerInput = { profile, audioInput, screenSample, rippleBurst }
      if (screenSample) {
        worker.postMessage(msg, [screenSample.pixels.buffer])
      } else {
        worker.postMessage(msg)
      }
    }

    const onWorkerMessage = (e: MessageEvent<RgbFrame>): void => {
      if (cancelled) return
      const frame = e.data
      setFrame(frame)
      // Push to any open overlay windows (fire-and-forget, not awaited)
      if (overlayIdsRef.current.length > 0) {
        const topo = topologyRef.current
        if (scene.linkedDisplays && topo && topo.displays.length > 1) {
          // Linked-display mode: each overlay gets only its sub-region of the virtual canvas
          for (const displayId of overlayIdsRef.current) {
            const subFrame = extractSubFrame(frame, displayId, topo)
            if (subFrame) window.rgbbox.pushFrameToDisplay(displayId, subFrame)
          }
        } else {
          window.rgbbox.pushFrameToOverlays(frame)
        }
      }
      timerId = window.setTimeout(tick, intervalMs)
    }

    worker.addEventListener('message', onWorkerMessage)
    void tick()

    return () => {
      cancelled = true
      if (timerId !== null) window.clearTimeout(timerId)
      worker.removeEventListener('message', onWorkerMessage)
    }
  }, [profile, status.running, audio])

  const scene = useMemo(() => (profile ? activeScene(profile) : null), [profile])

  const selectedLayer = useMemo(() => {
    if (!profile || !scene) return null
    return scene.layers.find((l) => l.id === selectedLayerId) ?? activeLayer(profile)
  }, [profile, scene, selectedLayerId])

  const updateSelectedLayer = useCallback((patch: Partial<EffectLayer>) => {
    setProfile((cur) => cur ? updateLayer(cur, selectedLayerId, patch) : cur)
  }, [selectedLayerId])

  const setSamplingValue = useCallback((key: keyof Profile['sampling'], value: number | boolean) => {
    setProfile((cur) => cur ? { ...cur, sampling: { ...cur.sampling, [key]: value } } : cur)
  }, [])

  // ── Grid density mode ─────────────────────────────────────────────────
  // Single "long-edge LED count" drives both columns and rows from display aspect ratio.
  // Advanced mode falls back to the old independent sliders.
  const [gridAdvanced, setGridAdvanced] = useState(() => localStorage.getItem('rgbbox:gridAdvanced') === '1')
  useEffect(() => { localStorage.setItem('rgbbox:gridAdvanced', gridAdvanced ? '1' : '0') }, [gridAdvanced])

  // Display aspect ratio: virtual-desktop ratio in linked mode, primary display otherwise
  const displayAspectRatioRef = useRef<number>(16 / 9)
  useEffect(() => {
    if (!topology) return
    const s = profile ? activeScene(profile) : null
    if (s?.linkedDisplays) {
      const vb = topology.virtualBounds
      displayAspectRatioRef.current = vb.width / Math.max(1, vb.height)
    } else {
      const primary = topology.displays.find((d) => d.primary) ?? topology.displays[0]
      if (primary) displayAspectRatioRef.current = primary.bounds.width / Math.max(1, primary.bounds.height)
    }
  })

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
      const clamped = Math.max(8, Math.min(160, longEdge))
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
      const newCols = Math.max(1, Math.min(320, cols))
      const newRows = aspectLocked ? Math.max(1, Math.min(180, Math.round(newCols / aspectRatioRef.current))) : cur.sampling.rows
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  const setRows = useCallback((rows: number) => {
    setProfile((cur) => {
      if (!cur) return cur
      const newRows = Math.max(1, Math.min(180, rows))
      const newCols = aspectLocked ? Math.max(1, Math.min(320, Math.round(newRows * aspectRatioRef.current))) : cur.sampling.columns
      return { ...cur, sampling: { ...cur.sampling, columns: newCols, rows: newRows } }
    })
  }, [aspectLocked])

  const selectEffect = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind)
    if (!preset) return
    updateSelectedLayer({ name: preset.label, kind: preset.kind, parameters: { ...preset.defaults } })
  }, [updateSelectedLayer])

  const setSelectedLayerValue = useCallback(<K extends keyof EffectLayer>(key: K, value: EffectLayer[K]) => {
    updateSelectedLayer({ [key]: value } as Partial<EffectLayer>)
  }, [updateSelectedLayer])

  const setLayerParameter = useCallback((name: string, value: number | string | boolean) => {
    if (!selectedLayer) return
    updateSelectedLayer({ parameters: { ...selectedLayer.parameters, [name]: value } })
  }, [selectedLayer, updateSelectedLayer])

  const toggleLayerEnabled = useCallback((layerId: string) => {
    setProfile((cur) => cur ? updateLayer(cur, layerId, {
      enabled: !activeScene(cur).layers.find((l) => l.id === layerId)?.enabled
    }) : cur)
  }, [])

  const toggleLinkedDisplays = useCallback(() => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) =>
          s.id !== sceneId ? s : { ...s, linkedDisplays: !s.linkedDisplays }
        )
      }
    })
  }, [])

  const addLayer = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind) ?? effectPresets[0]
    _layerCounter += 1
    const newLayer: EffectLayer = {
      id: `layer-${_layerCounter}`,
      name: preset.label,
      kind: preset.kind,
      enabled: true,
      opacity: 0.75,
      blendMode: 'screen',
      parameters: { ...preset.defaults }
    }
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: [...s.layers, newLayer] })
      }
    })
    setSelectedLayerId(newLayer.id)
  }, [])

  const deleteLayer = useCallback((layerId: string) => {
    setProfile((cur) => {
      if (!cur) return cur
      const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
      return {
        ...cur,
        scenes: cur.scenes.map((s) => s.id !== sceneId ? s : { ...s, layers: s.layers.filter((l) => l.id !== layerId) })
      }
    })
  }, [])

  const toggleEngine = useCallback(() => {
    window.rgbbox.setEngineRunning(!status.running).then(setStatus)
  }, [status.running])

  // Listen for effect-switch requests coming from the overlay context menu
  useEffect(() => {
    return window.rgbbox.onOverlayEffectChanged((kind) => {
      if (kind !== null) selectEffect(kind as EffectKind)
    })
  }, [selectEffect])

  // Sync overlay state when user closes an overlay window directly
  useEffect(() => {
    return window.rgbbox.onOverlayClosed((displayId) => {
      setOverlayDisplayIds((prev) => prev.filter((id) => id !== displayId))
    })
  }, [])

  // ── Profile menu actions ─────────────────────────────────────────────────
  const handleProfileNew = useCallback(() => {
    setProfileMenuOpen(false)
    setProfileEditName('')
    setProfileEditMode('new')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [])

  const handleProfileRename = useCallback(() => {
    if (!profile) return
    setProfileMenuOpen(false)
    setProfileEditName(profile.name)
    setProfileEditMode('rename')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [profile])

  const handleProfileEditConfirm = useCallback(async () => {
    const name = profileEditName.trim()
    if (!name) { setProfileEditMode(null); return }
    if (profileEditMode === 'new') {
      const newId = `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      const newProfile: Profile = { ...defaultProfile, id: newId, name }
      await window.rgbbox.saveProfileAs(newProfile)
      setProfile(newProfile)
      refreshProfiles()
    } else if (profileEditMode === 'rename' && profile) {
      const renamed: Profile = { ...profile, name }
      if (savedProfiles.find((p) => p.id === profile.id)) {
        await window.rgbbox.saveProfileAs(renamed)
        refreshProfiles()
      }
      setProfile(renamed)
    }
    setProfileEditMode(null)
  }, [profileEditMode, profileEditName, profile, savedProfiles, refreshProfiles])

  const handleProfileDelete = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    if (!savedProfiles.find((p) => p.id === profile.id)) return
    await window.rgbbox.deleteProfile(profile.id)
    const remaining = savedProfiles.filter((p) => p.id !== profile.id)
    setSavedProfiles(remaining)
    if (remaining.length > 0) {
      const first = await window.rgbbox.loadProfileById(remaining[0].id)
      if (first) { setProfile(first); return }
    }
    setProfile({ ...defaultProfile })
  }, [profile, savedProfiles])

  const handleProfileImport = useCallback(async () => {
    setProfileMenuOpen(false)
    const loaded = await window.rgbbox.importProfileDialog()
    if (loaded) { setProfile(loaded); refreshProfiles() }
  }, [refreshProfiles])

  const handleProfileExport = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    await window.rgbbox.exportProfileDialog(profile)
  }, [profile])

  const performanceLabels: Record<Profile['performanceMode'], string> = {
    battery: t('perf.battery'),
    balanced: t('perf.balanced'),
    extreme: t('perf.extreme')
  }

  if (!profile || !topology) {
    return <main className="boot-screen">RGBBox</main>
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">RB</div>
          <div>
            <h1>RGBBox</h1>
            <p>v{version}</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main sections">
          <button className={`nav-item ${currentView === 'workspace' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('workspace')}>
            <Monitor size={18} />
            {t('nav.workspace')}
          </button>
          <button className={`nav-item ${currentView === 'effects' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('effects')}>
            <Sparkles size={18} />
            {t('nav.effects')}
          </button>
          <button className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('diagnostics')}>
            <Gauge size={18} />
            {t('nav.diagnostics')}
          </button>
        </nav>

        <div className="sidebar-audio">
          <button
            className={`audio-toggle ${audioEnabled ? 'active' : ''}`}
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            title={audioEnabled ? t('audio.on') : t('audio.off')}
          >
            {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            <span>{audioEnabled ? t('audio.on') : t('audio.off')}</span>
          </button>
          {audioEnabled && (
            <select
              className="audio-device-select"
              value={audioDeviceId}
              title={t('audio.deviceLabel')}
              onChange={(e) => setAudioDeviceId(e.target.value)}
            >
              <option value="">{t('audio.defaultDevice')}</option>
              <option value="__system_audio__">{t('audio.systemAudio')}</option>
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || d.deviceId.slice(0, 12)}
                </option>
              ))}
            </select>
          )}
          {audioEnabled && audio.active && (
            <div className="audio-meter-row">
              <div className="audio-meter" style={{ '--level': audio.bass } as React.CSSProperties} title="Bass" />
              <div className="audio-meter" style={{ '--level': audio.mid } as React.CSSProperties} title="Mid" />
              <div className="audio-meter" style={{ '--level': audio.high } as React.CSSProperties} title="High" />
            </div>
          )}
        </div>

        <section className="status-panel" aria-label="Engine status">
          <div>
            <span>{t('engine.label')}</span>
            <strong>{status.running ? t('engine.running') : t('engine.paused')}</strong>
          </div>
          <button className="icon-button" type="button" onClick={toggleEngine} aria-label="Toggle engine">
            {status.running ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </section>
        <label className="status-panel" style={{ cursor: 'pointer' }}>
          <div>
            <span>{t('power.label')}</span>
            <strong>{powerSaveBlock ? t('power.on') : t('power.off')}</strong>
          </div>
          <input
            type="checkbox"
            checked={powerSaveBlock}
            onChange={(e) => {
              window.rgbbox.setPowerSaveBlock(e.target.checked).then(setPowerSaveBlock)
            }}
          />
        </label>

        <div className="sidebar-footer">
          <button
            className="lang-toggle-btn"
            type="button"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            title="Toggle language"
          >
            <Languages size={14} />
            {t('lang.toggle')}
          </button>
        </div>
      </aside>

      <section className="workspace">
        {currentView === 'workspace' && (
          <div className="workspace-inner">

            {/* ── Left FX sidebar ──────────────────────────────────────── */}
            <aside className="fx-sidebar">

              {/* Profile bar */}
              <div className="fx-profile-bar">
                {profileEditMode ? (
                  <>
                    <input
                      ref={editInputRef}
                      className="profile-select profile-edit-input"
                      type="text"
                      value={profileEditName}
                      placeholder={t('profile.namePlaceholder')}
                      onChange={(e) => setProfileEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleProfileEditConfirm()
                        if (e.key === 'Escape') setProfileEditMode(null)
                      }}
                    />
                    <button className="icon-button small" type="button" onClick={handleProfileEditConfirm} title="OK">✓</button>
                    <button className="icon-button small" type="button" onClick={() => setProfileEditMode(null)} title="Cancel">✕</button>
                  </>
                ) : (
                  <>
                    <select
                      className="profile-select"
                      value={savedProfiles.find((p) => p.id === profile.id)?.id ?? ''}
                      onChange={async (e) => {
                        if (!e.target.value) return
                        const loaded = await window.rgbbox.loadProfileById(e.target.value)
                        if (loaded) setProfile(loaded)
                      }}
                    >
                      <option value="" disabled>{t('profile.label')}</option>
                      {!savedProfiles.find((p) => p.id === profile.id) && (
                        <option value="">{profile.name}</option>
                      )}
                      {savedProfiles.map((meta) => (
                        <option key={meta.id} value={meta.id}>{meta.name}</option>
                      ))}
                    </select>
                    <div className="profile-menu-anchor" ref={profileMenuRef}>
                      <button
                        className="icon-button small"
                        type="button"
                        onClick={() => setProfileMenuOpen((v) => !v)}
                        title={t('profile.label')}
                      >
                        <MoreVertical size={13} />
                      </button>
                      {profileMenuOpen && (
                        <div className="profile-menu">
                          <button className="profile-menu-item" type="button" onClick={handleProfileNew}>
                            <FilePlus size={12} /> {t('profile.new')}
                          </button>
                          <button className="profile-menu-item" type="button" onClick={handleProfileRename}>
                            <Pencil size={12} /> {t('profile.rename')}
                          </button>
                          {savedProfiles.find((p) => p.id === profile.id) && (
                            <button className="profile-menu-item danger" type="button" onClick={handleProfileDelete}>
                              <Trash2 size={12} /> {t('profile.delete')}
                            </button>
                          )}
                          <div className="profile-menu-divider" />
                          <button className="profile-menu-item" type="button" onClick={handleProfileImport}>
                            <Upload size={12} /> {t('profile.import')}
                          </button>
                          <button className="profile-menu-item" type="button" onClick={handleProfileExport}>
                            <Download size={12} /> {t('profile.export')}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="fx-sidebar-header">
                <span className="fx-section-title">{t('fx.layers')}</span>
                <button
                  className="icon-button small"
                  type="button"
                  onClick={() => addLayer('rainbow')}
                  title={t('fx.addLayer')}
                >
                  <Plus size={13} />
                </button>
              </div>

              <div className="layer-stack" aria-label="Effect layer stack">
                {scene?.layers.map((layer) => (
                  <div
                    className={`layer-row ${selectedLayer?.id === layer.id ? 'selected' : ''}`}
                    key={layer.id}
                  >
                    <input
                      className="layer-checkbox"
                      type="checkbox"
                      checked={layer.enabled}
                      onChange={() => toggleLayerEnabled(layer.id)}
                      title={layer.enabled ? t('layer.enable') : t('layer.disable')}
                      aria-label="Toggle layer"
                    />
                    <button
                      className="layer-name-btn"
                      type="button"
                      onClick={() => setSelectedLayerId(layer.id)}
                    >
                      <span>{layer.name}</span>
                      <strong>{Math.round(layer.opacity * 100)}%</strong>
                    </button>
                    {scene.layers.length > 1 && (
                      <button
                        className="layer-delete-btn"
                        type="button"
                        title={t('layer.delete')}
                        onClick={() => deleteLayer(layer.id)}
                        aria-label="Delete layer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="fx-divider">
                <span>{t('fx.effects')} — {selectedLayer?.name ?? t('fx.noLayer')}</span>
              </div>

              {/* Effect kind picker — per selected layer */}
              <div className="effect-kind-grid" aria-label="Effect type picker">
                {effectPresets.map((preset) => (
                  <button
                    className={`effect-kind-btn ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                    key={preset.kind}
                    type="button"
                    onClick={() => selectEffect(preset.kind)}
                    title={preset.description}
                  >
                    {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>

              {/* Per-layer parameters */}
              {selectedLayer && (
                <div className="layer-params-panel">
                  <label className="control-line">
                    <span>{t('fx.opacity')}</span>
                    <input min={0} max={1} step={0.05} type="range" value={selectedLayer.opacity}
                      onChange={(e) => setSelectedLayerValue('opacity', Number(e.target.value))} />
                    <strong>{Math.round(selectedLayer.opacity * 100)}%</strong>
                  </label>
                  <label className="select-line">
                    <span>{t('fx.blend')}</span>
                    <select value={selectedLayer.blendMode}
                      onChange={(e) => setSelectedLayerValue('blendMode', e.target.value as BlendMode)}>
                      <option value="normal">{t('blend.normal')}</option>
                      <option value="screen">{t('blend.screen')}</option>
                      <option value="add">{t('blend.add')}</option>
                      <option value="multiply">{t('blend.multiply')}</option>
                    </select>
                  </label>
                  {Object.entries(selectedLayer.parameters)
                    .filter(([name]) => !name.startsWith('_'))
                    .map(([name, value]) => {
                      const meta = PARAM_META[name]
                      // label: use i18n key if available (e.g. 'param.textX'), otherwise meta.labelKey or param name
                      const labelKey = meta?.labelKey ?? name
                      const label = (labelKey.includes('.') ? t(labelKey as Parameters<typeof t>[0]) : labelKey)
                      const unit = meta?.unit ?? ''
                      // Special case: text string parameter (not a color hex)
                      if (typeof value === 'string' && !value.startsWith('#')) {
                        return (
                          <label className="parameter-line text-param" key={name}>
                            <span>{name === 'text' ? t('param.text') : label}</span>
                            <input
                              className="text-param-input"
                              type="text"
                              value={value}
                              placeholder={name === 'text' ? t('param.textPlaceholder') : ''}
                              onChange={(e) => setLayerParameter(name, e.target.value)}
                            />
                          </label>
                        )
                      }
                      return (
                        <label className="parameter-line" key={name}>
                          <span>{name === 'color' ? t('param.bgColor') : name === 'textColor' ? t('param.textColor') : label}</span>
                          {typeof value === 'string' && value.startsWith('#') ? (
                            <input type="color" value={value}
                              onChange={(e) => setLayerParameter(name, e.target.value)} />
                          ) : typeof value === 'number' ? (
                            <input
                              min={meta?.min ?? 0}
                              max={meta?.max ?? 2}
                              step={meta?.step ?? 0.05}
                              type="range"
                              value={value}
                              onChange={(e) => setLayerParameter(name, Number(e.target.value))}
                            />
                          ) : (
                            <input checked={Boolean(value)} type="checkbox"
                              onChange={(e) => setLayerParameter(name, e.target.checked)} />
                          )}
                          <strong>
                            {typeof value === 'number'
                              ? `${meta?.step && meta.step >= 1 ? Math.round(value) : value.toFixed(2)}${unit}`
                              : String(value)}
                          </strong>
                        </label>
                      )
                    })}
                </div>
              )}
            </aside>

            {/* ── Right main content ───────────────────────────────────── */}
            <div className="workspace-main">
              <header className="workspace-header">
                <div>
                  <p className="eyebrow">{t('ws.eyebrow')}</p>
                  <h2
                    className="profile-name-header"
                    title={t('profile.label')}
                    style={{ cursor: 'default' }}
                  >
                    {profile.name}
                  </h2>
                </div>
                <div className="metric-row">
                  <div className="metric">
                    <span>{t('ws.displays')}</span>
                    <strong>{topology.displays.length}</strong>
                  </div>
                  <div className="metric">
                    <span>{t('ws.grid')}</span>
                    <strong>{profile.sampling.columns}×{profile.sampling.rows}</strong>
                  </div>
                  <div className="metric">
                    <span>{t('ws.mode')}</span>
                    <strong>{performanceLabels[profile.performanceMode]}</strong>
                  </div>
                </div>
              </header>

              <div className="content-grid">
                <section className="panel preview-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('preview.eyebrow')}</p>
                      <h3>{t('preview.title')}</h3>
                    </div>
                    <span className="chip">{status.output}</span>
                  </div>
                  <PreviewGrid
                    frame={frame}
                    onRippleClick={scene?.layers.some((l) => l.enabled && l.kind === 'ripple') ? handleRippleClick : undefined}
                  />
                </section>

                <section className="panel map-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('map.eyebrow')}</p>
                      <h3>{t('map.title')}</h3>
                    </div>
                    <span className="chip">{topology.platform}</span>
                  </div>
                  <DisplayMap topology={topology} overlayDisplayIds={overlayDisplayIds} onToggleOverlay={handleToggleOverlay} />
                  {topology.displays.length > 1 && (
                    <div className="linked-display-row">
                      <button
                        className={`aspect-lock-btn${scene?.linkedDisplays ? ' locked' : ''}`}
                        title={t('scene.linkedDisplays.hint')}
                        onClick={toggleLinkedDisplays}
                        type="button"
                      >
                        <Link2 size={12} />
                        <span>{t('scene.linkedDisplays')}</span>
                      </button>
                      {scene?.linkedDisplays && (
                        <span className="linked-hint">{t('scene.linkedDisplays.hint')}</span>
                      )}
                    </div>
                  )}
                  {topology.displays.length > 1 && (
                    <div className="linked-display-row">
                      <button
                        className={`aspect-lock-btn${scene?.linkedDisplays ? ' locked' : ''}`}
                        title={t('scene.linkedDisplays.hint')}
                        onClick={toggleLinkedDisplays}
                        type="button"
                      >
                        <Link2 size={12} />
                        <span>{t('scene.linkedDisplays')}</span>
                      </button>
                      {scene?.linkedDisplays && (
                        <span className="linked-hint">{t('scene.linkedDisplays.hint')}</span>
                      )}
                    </div>
                  )}
                </section>

                {/* Sampling settings — spans both columns */}
                <section className="panel sampling-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('sampling.eyebrow')}</p>
                      <h3>{t('sampling.title')}</h3>
                    </div>
                    <span className="chip">{t('sampling.title')}</span>
                  </div>
                  <div className="sampling-controls">
                    {/* ── Auto density mode (default) ── */}
                    {!gridAdvanced ? (
                      <>
                        <label className="control-line">
                          <span>{t('sampling.resolution')}</span>
                          <input min={8} max={160} type="range"
                            value={Math.max(profile.sampling.columns, profile.sampling.rows)}
                            onChange={(e) => setGridDensity(Number(e.target.value))} />
                          <strong>{profile.sampling.columns} × {profile.sampling.rows}</strong>
                        </label>
                        <div className="aspect-lock-row">
                          <button className="aspect-lock-btn" onClick={matchDisplayRatio} type="button">
                            <Monitor size={12} />
                            <span>{t('sampling.matchRatio')}</span>
                          </button>
                          <button className="aspect-lock-btn" onClick={() => setGridAdvanced(true)} type="button">
                            <span>{t('sampling.advanced')}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      /* ── Manual mode (advanced) ── */
                      <>
                        <label className="control-line">
                          <span>{t('sampling.columns')}</span>
                          <input min={1} max={320} type="range" value={profile.sampling.columns}
                            onChange={(e) => setColumns(Number(e.target.value))} />
                          <strong>{profile.sampling.columns}</strong>
                        </label>
                        <div className="aspect-lock-row">
                          <button
                            className={`aspect-lock-btn${aspectLocked ? ' locked' : ''}`}
                            title={t('sampling.aspectLock')}
                            onClick={toggleAspectLock}
                            type="button"
                          >
                            {aspectLocked ? <Link2 size={12} /> : <Link2Off size={12} />}
                            <span>{t('sampling.aspectLock')}</span>
                          </button>
                          <button className="aspect-lock-btn locked" onClick={() => { setGridAdvanced(false); matchDisplayRatio() }} type="button">
                            <span>{t('sampling.autoGrid')}</span>
                          </button>
                        </div>
                        <label className="control-line">
                          <span>{t('sampling.rows')}</span>
                          <input min={1} max={180} type="range" value={profile.sampling.rows}
                            onChange={(e) => setRows(Number(e.target.value))} />
                          <strong>{profile.sampling.rows}</strong>
                        </label>
                      </>
                    )}
                    <label className="control-line">
                      <span>{t('sampling.smooth')}</span>
                      <input min={0} max={0.9} step={0.05} type="range" value={profile.sampling.smoothing}
                        onChange={(e) => setSamplingValue('smoothing', Number(e.target.value))} />
                      <strong>{profile.sampling.smoothing.toFixed(2)}</strong>
                    </label>
                    <label className="control-line">
                      <span>{t('sampling.saturation')}</span>
                      <input min={0.5} max={3} step={0.1} type="range" value={profile.sampling.saturationBoost ?? 1.5}
                        onChange={(e) => setSamplingValue('saturationBoost', Number(e.target.value))} />
                      <strong>{(profile.sampling.saturationBoost ?? 1.5).toFixed(1)}×</strong>
                    </label>
                    <label className="control-line">
                      <span>{t('sampling.brightness')}</span>
                      <input min={0.1} max={2} step={0.05} type="range" value={profile.sampling.brightnessLimit}
                        onChange={(e) => setSamplingValue('brightnessLimit', Number(e.target.value))} />
                      <strong>{Math.round(profile.sampling.brightnessLimit * 100)}%</strong>
                    </label>
                    <label className="control-line">
                      <span>{t('sampling.fps')}</span>
                      <input min={15} max={60} step={15} type="range" value={profile.sampling.fps}
                        onChange={(e) => setSamplingValue('fps', Number(e.target.value))} />
                      <strong>{profile.sampling.fps}</strong>
                    </label>
                    <label className="toggle-line sampling-toggle">
                      <input checked={profile.sampling.usePerformanceGuard} type="checkbox"
                        onChange={(e) => setSamplingValue('usePerformanceGuard', e.target.checked)} />
                      <span>{t('sampling.perfGuard')}</span>
                    </label>
                  </div>
                </section>
              </div>
            </div>

          </div>
        )}

        {currentView === 'effects' && (
          <EffectsView
            activeKind={selectedLayer?.kind ?? 'static'}
            onSelectEffect={(kind) => {
              selectEffect(kind)
              setCurrentView('workspace')
            }}
          />
        )}

        {currentView === 'diagnostics' && (
          <div className="diagnostics-view">
            <header className="workspace-header">
              <div>
                <p className="eyebrow">{t('diag.eyebrow')}</p>
                <h2>{t('diag.title')}</h2>
              </div>
              <Activity size={24} />
            </header>
            <div className="panel" style={{ maxWidth: 560 }}>
              <dl className="diagnostics-list">
                <div><dt>{t('diag.virtualBounds')}</dt><dd>{topology.virtualBounds.width}×{topology.virtualBounds.height}</dd></div>
                <div><dt>{t('diag.frameAge')}</dt><dd>{frame ? `${Math.max(0, Date.now() - frame.generatedAt)} ms` : t('diag.waiting')}</dd></div>
                <div><dt>{t('diag.brightGain')}</dt><dd>{Math.round(profile.sampling.brightnessLimit * 100)}%</dd></div>
                <div><dt>{t('diag.gridSize')}</dt><dd>{profile.sampling.columns}×{profile.sampling.rows} ({profile.sampling.columns * profile.sampling.rows} pixels)</dd></div>
                <div><dt>{t('diag.activeLayers')}</dt><dd>{scene?.layers.filter((l) => l.enabled).length ?? 0}</dd></div>
                <div><dt>{t('diag.targetFps')}</dt><dd>{profile.sampling.fps}</dd></div>
                <div><dt>{t('diag.platform')}</dt><dd>{topology.platform}</dd></div>
                <div><dt>{t('diag.audio')}</dt><dd>{audio.active ? `Active — Bass ${(audio.bass * 100).toFixed(0)}%` : t('diag.off')}</dd></div>
                {topology.displays.map((d) => (
                  <div key={d.id}>
                    <dt>{d.label}{d.primary ? ' (primary)' : ''}</dt>
                    <dd>{d.bounds.width}×{d.bounds.height} @{d.scaleFactor}×</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
