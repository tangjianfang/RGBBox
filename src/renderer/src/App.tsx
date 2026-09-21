import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { effectPresets } from '../../shared/defaultProfile'
import type { CaptureProviderStatus, DisplayTopology, EffectKind, EffectLayer, EngineMetrics, EngineStatus, Profile, ProcessCpuSample, RgbFrame } from '../../shared/types'
import { resolveFrameRenderStyle } from '../../shared/types'
import { isGpuDirectEffect } from './gl/effectGl'
import { useI18n } from './i18n'
import { EffectsView } from './components/EffectsView'
import { ShutdownTimerPanel } from './components/ShutdownTimerPanel'
// R147 P4: heavy views load on demand — three.js (via MiniGames/3D previews),
// the AI lab, the media studios and their dependency trees no longer sit in
// the main chunk; keep-alive semantics are unaffected (the wrappers below
// keep instances mounted after first load, `visible` just toggles display).
const MiniGamesView    = lazy(() => import('./components/MiniGamesView').then((m) => ({ default: m.MiniGamesView })))
const AudioStudioView  = lazy(() => import('./components/AudioStudioView').then((m) => ({ default: m.AudioStudioView })))
const VideoStudioView  = lazy(() => import('./components/VideoStudioView').then((m) => ({ default: m.VideoStudioView })))
const ArchitectureView = lazy(() => import('./components/ArchitectureView').then((m) => ({ default: m.ArchitectureView })))
const AiLabView        = lazy(() => import('./components/AiLabView').then((m) => ({ default: m.AiLabView })))
const WorkspaceView    = lazy(() => import('./components/WorkspaceView').then((m) => ({ default: m.WorkspaceView })))
import { formatMediaTime } from '../../shared/timeFormat'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'
import { MetricsCollector } from './engine/metricsCollector'
import { loadStoredView, persistView, resolveInitialView, type View } from './hooks/tabNavigation'
import { AppShell } from './components/AppShell'
import { VisionAssistant } from './components/vision/VisionAssistant'
import { ModuleRail } from './components/ModuleRail'
import { DashboardView } from './components/DashboardView'
import { SettingsView } from './components/SettingsView'
import { AiListenOverlay } from './components/AiListenOverlay'
import { getTabMeta } from './components/shellModules'
import { DiagnosticsView } from './components/DiagnosticsView'
import { Model3DView } from './components/Model3DView'
import type { AmbientPreset } from './domain/ambientPresets'
import { AUTOMATION_TARGET_PARAMS } from './domain/automation'
import { activeLayer, activeScene, updateLayer } from './domain/profileUtils'
import { distributeFrameToOverlays } from './domain/overlayDistribution'
// R147 P3b: domain hooks — each owns one slice of former App state verbatim.
import { useProfileManager } from './hooks/domains/useProfileManager'
import { useOverlayTopology } from './hooks/domains/useOverlayTopology'
import { useScheduleDomain } from './hooks/domains/useScheduleDomain'
import { useAutomationDomain } from './hooks/domains/useAutomationDomain'
import { useRandomizerDomain } from './hooks/domains/useRandomizerDomain'
import { useShutdownTimer } from './hooks/domains/useShutdownTimer'
import { useSamplingDomain } from './hooks/domains/useSamplingDomain'
import { useLayerActions } from './hooks/domains/useLayerActions'
import { useSettingsMirror } from './hooks/domains/useSettingsMirror'
import { useEngineLoop } from './hooks/useEngineLoop'
import { usePersistedFlag, usePersistedState } from './hooks/usePersistedState'

// R85: View union + tab navigation moved to hooks/tabNavigation (dashboard + settings added).
const MODEL3D_VIEW_ENABLED = false

const EMPTY_ENGINE_METRICS: EngineMetrics = {
  frameCount: 0,
  avgFrameMs: 0,
  p95FrameMs: 0,
  lastFrameMs: 0,
  workerProcessMs: 0,
  captureMs: 0,
  outputMs: 0,
  droppedTicks: 0
}

/**
 * R147 P3: App is now an orchestration layer — boot, view routing, the engine
 * loop wiring (refs only) and shell assembly. Feature state lives in domain/
 * pure functions (P1), domain hooks (P3b) and view components (P3a).
 */
export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topology, setTopology] = useState<DisplayTopology | null>(null)
  /**
   * Latest frame from the worker, stored in a ref so updates never trigger a
   * React re-render.  PreviewGrid polls this ref in its own rAF loop.
   */
  const frameRef = useRef<RgbFrame | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ running: true, fps: 30, output: 'virtual-preview' })
  const [captureProvider, setCaptureProvider] = useState<CaptureProviderStatus | null>(null)
  const [engineMetrics, setEngineMetrics] = useState<EngineMetrics>(EMPTY_ENGINE_METRICS)
  // R46: objective per-process CPU% breakdown for the Diagnostics view (see
  // ipc.ts#getProcessCpuSamples) — lets CPU investigations point at a
  // specific process (main/renderer/gpu-process/utility) instead of relying
  // on a single aggregate Task Manager number.
  const [processCpuSamples, setProcessCpuSamples] = useState<ProcessCpuSample[]>([])
  const [version, setVersion] = useState('0.1.0')

  // ── UI state persisted to localStorage ──────────────────────────────────
  const [selectedLayerId, setSelectedLayerId] = usePersistedState('rgbbox:selectedLayerId', 'layer-rainbow', { raw: true })
  // R86: single-view navigation — left rail direct switching, last view persisted
  // R142-E4b: app root for the vision assistant's full-window cursor overlay
  const appRootRef = useRef<HTMLElement | null>(null)
  const [activeView, setActiveView] = useState<View>(() =>
    resolveInitialView(loadStoredView(localStorage), MODEL3D_VIEW_ENABLED)
  )
  useEffect(() => { persistView(activeView) }, [activeView])
  // R91.2: keep-alive gate — the video studio mounts on first visit and stays
  // mounted (hidden) afterwards so playback survives view switches.
  const [videoVisited, setVideoVisited] = useState<boolean>(() => activeView === 'video')
  useEffect(() => { if (activeView === 'video') setVideoVisited(true) }, [activeView])
  // R147 P4: audio wrapper follows the same visited-gate as video — with the
  // view now lazy-loaded, an always-mounted wrapper would fetch the chunk at
  // boot; the gate defers first mount (and the chunk) to the first visit and
  // keeps it alive afterwards, exactly like the video studio.
  const [audioVisited, setAudioVisited] = useState<boolean>(() => activeView === 'audio')
  useEffect(() => { if (activeView === 'audio') setAudioVisited(true) }, [activeView])
  const [allEffectsOpen, setAllEffectsOpen] = usePersistedFlag('rgbbox:allEffectsOpen', false)
  const [advancedControlsOpen, setAdvancedControlsOpen] = usePersistedFlag('rgbbox:advancedControlsOpen', false)
  const [audioEnabled, setAudioEnabled] = usePersistedFlag('rgbbox:audio', false)
  const [audioDeviceId, setAudioDeviceId] = usePersistedState('rgbbox:audioDevice', '', { raw: true })
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([])
  // R45: reactive counterpart of windowVisibleRef (declared below) — a plain
  // ref wouldn't cause `audioShouldAnalyze` to recompute when visibility
  // changes, since nothing else re-renders App at that moment. Minimize/
  // restore/hide/show are rare, low-frequency events, so the extra re-render
  // here is negligible.
  const [windowVisible, setWindowVisible] = useState(true)

  // ── Engine Worker ─────────────────────────────────────────────────────────
  // Created once; the render loop sends work to it and receives frames via
  // postMessage/onmessage instead of going through IPC.
  const workerRef = useRef<Worker | null>(null)
  // R42: lets the tick loop below know the latest view/visibility without
  // being a useEffect dependency (adding activeView there would tear down
  // and recreate the worker on every tab switch).
  const activeViewRef = useRef<View>(activeView)
  activeViewRef.current = activeView
  // R43: main-window visibility per the IPC signal from main/index.ts (NOT
  // document.hidden — see ipc.ts#mainWindowVisibilityChanged for why that
  // stopped being reliable after R38). Defaults to true (visible) until the
  // first IPC message arrives.
  const windowVisibleRef = useRef<boolean>(true)
  useEffect(() => {
    return window.rgbbox.onMainWindowVisibilityChanged((visible) => {
      windowVisibleRef.current = visible
      setWindowVisible(visible)
    })
  }, [])

  const scene = useMemo(() => (profile ? activeScene(profile) : null), [profile])

  const selectedLayer = useMemo(() => {
    if (!profile || !scene) return null
    return scene.layers.find((l) => l.id === selectedLayerId) ?? activeLayer(profile)
  }, [profile, scene, selectedLayerId])

  const updateSelectedLayer = useCallback((patch: Partial<EffectLayer>) => {
    setProfile((cur) => cur ? updateLayer(cur, selectedLayerId, patch) : cur)
  }, [selectedLayerId])

  // selectEffect/applyAmbientPreset stay here (not in useLayerActions): four
  // domain hooks consume selectEffect, and it depends only on
  // updateSelectedLayer/selectedLayerId — moving it into the layer hook would
  // create a circular dependency.
  const selectEffect = useCallback((kind: EffectKind) => {
    const preset = effectPresets.find((p) => p.kind === kind)
    if (!preset) return
    updateSelectedLayer({ name: preset.label, kind: preset.kind, parameters: { ...preset.defaults } })
  }, [updateSelectedLayer, selectedLayerId])

  const applyAmbientPreset = useCallback((preset: AmbientPreset) => {
    const effectPreset = effectPresets.find((p) => p.kind === preset.effectKind)
    updateSelectedLayer({
      kind: preset.effectKind,
      name: effectPreset?.label ?? preset.effectKind,
      parameters: { ...preset.parameters, _quickProfile: preset.id },
      opacity: preset.opacity,
      blendMode: preset.blendMode,
    })
  }, [updateSelectedLayer])

  // ── Domain hooks (R147 P3b) ───────────────────────────────────────────────
  const profileManager = useProfileManager({ profile, setProfile, selectedLayer, setSelectedLayerId, t })
  const overlayTopology = useOverlayTopology({ setTopology, selectEffect })
  const scheduleDomain = useScheduleDomain({ selectedLayer, selectEffect })
  const {
    automationEnabled, setAutomationEnabled,
    automationMode, setAutomationMode,
    automatedParams, toggleAutomatedParam,
  } = useAutomationDomain()
  const {
    favoriteEffectKinds, toggleFavoriteEffect,
    randomizerMode, setRandomizerMode,
    randomizerLockedParams, toggleRandomizerParamLock,
  } = useRandomizerDomain({ selectedLayer, selectEffect })
  const layerActions = useLayerActions({
    setProfile, setSelectedLayerId, selectedLayer, updateSelectedLayer,
    randomizerMode, randomizerLockedParams,
  })
  const {
    shutdownInfo, shutdownPanelOpen, setShutdownPanelOpen,
    armShutdownTimer, cancelShutdownTimer,
  } = useShutdownTimer()
  const settingsMirror = useSettingsMirror()
  const sampling = useSamplingDomain({
    profile, setProfile, topology,
    overlayDisplayIds: overlayTopology.overlayDisplayIds,
    overlayIdsRef: overlayTopology.overlayIdsRef,
    sceneLinked: scene?.linkedDisplays,
  })

  const topologyRef = useRef<DisplayTopology | null>(topology)
  topologyRef.current = topology

  // R45: pause the (getUserMedia + AnalyserNode) audio pipeline's actual FFT
  // analysis/state-update work when nothing needs the data — mirrors the
  // R42/R43 "is anyone consuming a frame" gate used for the effect tick loop.
  // Audio-reactive effects (audio-beat/audio-equalizer) still need live data
  // while an overlay is projecting them, regardless of main-window visibility.
  const audioShouldAnalyze = overlayTopology.overlayDisplayIds.length > 0 || (windowVisible && activeView === 'workspace')

  // R147 P2: the analyzer handle carries its own always-fresh data ref
  // (updated every analysis tick, ~60Hz) — the engine tick loop reads
  // `audio.ref.current` directly. The old per-render state mirror re-rendered
  // the whole App ~20x/sec while audio was on; the hook's React state now
  // only changes on active/error transitions.
  const audio = useAudioAnalyzer(audioEnabled, audioDeviceId, audioShouldAnalyze)
  // R147 P2: engine-loop config bridge — profile / selectedLayerId / automation*
  // flow into the tick closures through this ref so the effect and its timer
  // are created ONCE per run instead of being torn down and rebuilt on every
  // slider drag. fps is re-read on every self-scheduled timeout, so changing
  // the sampling fps still takes effect on the next tick.
  const engineConfigRef = useRef({ profile, selectedLayerId, automationEnabled, automationMode, automatedParams })
  engineConfigRef.current = { profile, selectedLayerId, automationEnabled, automationMode, automatedParams }
  const metricsCollectorRef = useRef(new MetricsCollector())

  // R85: live fps for the dashboard status strip. status.fps (EngineStatus) is a
  // boot-time value that never updates — the measured rate lives in the rolling
  // metrics collector, which is fed by the worker on every frame regardless of
  // the active view. Sample it once per second while the dashboard is showing.
  const [dashFps, setDashFps] = useState(0)
  useEffect(() => {
    if (activeView !== 'dashboard') return undefined
    const id = window.setInterval(() => {
      const snap = metricsCollectorRef.current.snapshot()
      setDashFps(snap.avgFrameMs > 0 ? Math.min(Math.round(1000 / snap.avgFrameMs), 999) : 0)
    }, 1000)
    return () => window.clearInterval(id)
  }, [activeView])

  /** Ripple burst: set on canvas click, cleared after 2.5 s (matches burstDuration in effects.ts). */
  const rippleBurstRef = useRef<{ cx: number; cy: number; clickedAt: number } | null>(null)
  const rippleBurstTimerRef = useRef<number | null>(null)

  /**
   * Flat RGB bytes from the latest engine frame — shared with SplatViewer so its
   * rAF loop can drive LED PointLights without going through React state.
   * Mutated in-place on every worker response; never triggers a re-render.
   */
  const ledColorsRef = useRef<Uint8Array>(new Uint8Array(0))

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
      window.rgbbox.getPowerSaveBlock(),
      window.rgbbox.listProfiles(),
      window.rgbbox.getCaptureProviderStatus(),
      window.rgbbox.getAutoLaunch(),
    ]).then(async ([loadedProfile, loadedTopology, loadedStatus, loadedVersion, loadedOverlays, loadedPSB, loadedProfiles, loadedCaptureProvider, loadedAutoLaunch]) => {
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
      overlayTopology.setOverlayDisplayIds(loadedOverlays)
      settingsMirror.setPowerSaveBlock(loadedPSB)
      setCaptureProvider(loadedCaptureProvider)
      settingsMirror.setAutoLaunch(loadedAutoLaunch)
      // Ensure the current working profile is always present in the named slots.
      // On first launch (profiles/ directory empty) or after a reset, this seeds
      // the list so the dropdown is never empty.
      if (!loadedProfiles.find((p) => p.id === migratedProfile.id)) {
        const meta = await window.rgbbox.saveProfileAs(migratedProfile)
        profileManager.setSavedProfiles([...loadedProfiles, meta])
      } else {
        profileManager.setSavedProfiles(loadedProfiles)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot-once fan-out; hook setters are stable
  }, [])

  // R45: engineMetrics/captureProvider are only ever displayed in the
  // Diagnostics view (see the `diag.*` rows below), but this interval used to
  // run unconditionally forever — a 1 Hz IPC round-trip (getCaptureProviderStatus)
  // plus a React state update (re-rendering the whole App tree) even while
  // minimized/hidden with nothing being rendered. Gated on the Diagnostics tab
  // actually being the visible one.
  useEffect(() => {
    if (activeView !== 'diagnostics') return undefined
    const timer = window.setInterval(() => {
      setEngineMetrics(metricsCollectorRef.current.snapshot())
      void window.rgbbox.getCaptureProviderStatus().then(setCaptureProvider)
      void window.rgbbox.getProcessCpuSamples().then(setProcessCpuSamples)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activeView])

  // Enumerate audio input and output devices (labels populated after first getUserMedia permission)
  useEffect(() => {
    if (!audioEnabled) return undefined
    const enumerate = async (): Promise<void> => {
      const all = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(all.filter((d) => d.kind === 'audioinput'))
      setSpeakerDevices(
        all.filter(
          (d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications'
        )
      )
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

  // ── Engine tick loop (R147 P2 stabilized; P3b extracted to a hook) ────────
  useEngineLoop({
    profile, running: status.running, workerRef, engineConfigRef,
    audioRef: audio.ref,
    overlayIdsRef: overlayTopology.overlayIdsRef,
    overlayConfigsRef: overlayTopology.overlayConfigsRef,
    topologyRef, activeViewRef, windowVisibleRef,
    frameRef, ledColorsRef, metricsCollectorRef, rippleBurstRef,
  })

  // R87: same consumer condition as the tick-loop gate (R42/R43) — used by the
  // Diagnostics frame-age row to explain a growing age as "idle", not "unhealthy".
  const frameConsumerActive = overlayTopology.overlayDisplayIds.length > 0 || (windowVisible && activeView === 'workspace')

  /** Frame handler for GPU 3D effects — Preview3D calls this instead of the worker. */
  const handleFrame3D = useCallback((frame: RgbFrame) => {
    const startedAt = performance.now()
    frame.showGap = profile?.sampling.showGap ?? false
    frame.renderStyle = resolveFrameRenderStyle(profile?.sampling.renderStyle, profile ? activeLayer(profile)?.kind : null)
    frameRef.current = frame
    // Copy pixel data for the 3D splat viewer LED lights
    if (ledColorsRef.current.length !== frame.pixels.length) {
      ledColorsRef.current = new Uint8Array(frame.pixels.length)
    }
    ledColorsRef.current.set(frame.pixels)
    distributeFrameToOverlays(frame, scene, topologyRef.current, overlayTopology.overlayIdsRef.current, overlayTopology.overlayConfigsRef.current)
    const outputMs = 0
    metricsCollectorRef.current.add({
      timestamp: Date.now(),
      workerProcessMs: 0,
      textMaskMs: 0,
      renderMs: performance.now() - startedAt,
      captureMs: 0,
      roundTripMs: performance.now() - startedAt,
      outputMs,
      droppedTicks: 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + profile/scene via closure; overlay refs are stable
  }, [profile, scene])

  // R35 follow-up: the GPU-direct preview path only produces a *correct*
  // picture when exactly one layer is enabled — it renders that single
  // effect in isolation, so if other layers are also enabled and blended in
  // (the default scene ships 3: aurora+fire+neon-pulse) a solo GPU render
  // would silently omit them and mislead the user. Gate on `selectedLayer`
  // (what the Effects picker actually edits — the earlier `activeLayer()`
  // check looked at the scene's first *enabled* layer instead, which is a
  // different layer whenever the user edits anything but that one, and was
  // why switching to 'rainbow' appeared to do nothing).
  const gpuDirectLayer = useMemo(() => {
    if (!scene || !selectedLayer) return null
    const enabledLayers = scene.layers.filter((l) => l.enabled)
    const isSoloEnabled = enabledLayers.length === 1 && enabledLayers[0].id === selectedLayer.id
    return isSoloEnabled && isGpuDirectEffect(selectedLayer.kind) ? selectedLayer : null
  }, [scene, selectedLayer])

  const favoriteEffectPresets = useMemo(() => {
    return favoriteEffectKinds
      .map((kind) => effectPresets.find((preset) => preset.kind === kind))
      .filter((preset): preset is (typeof effectPresets)[number] => Boolean(preset))
  }, [favoriteEffectKinds])

  const automatableParams = useMemo(() => {
    if (!selectedLayer) return []
    return AUTOMATION_TARGET_PARAMS.filter((name) => typeof selectedLayer.parameters[name] === 'number')
  }, [selectedLayer])

  const toggleEngine = useCallback(() => {
    window.rgbbox.setEngineRunning(!status.running).then(setStatus)
  }, [status.running])

  const performanceLabels: Record<Profile['performanceMode'], string> = {
    battery: t('perf.battery'),
    balanced: t('perf.balanced'),
    extreme: t('perf.extreme')
  }

  const audioErrorLabel = useMemo(() => {
    switch (audio.status.error) {
      case 'permission-denied':
        return t('audio.error.permissionDenied')
      case 'source-unavailable':
        return t('audio.error.sourceUnavailable')
      case 'capture-failed':
        return t('audio.error.captureFailed')
      default:
        return ''
    }
  }, [audio.status.error, t])

  if (!profile || !topology) {
    return (
      <>
        <div className="titlebar-drag" aria-hidden="true" />
        <main className="boot-screen">RGBBox</main>
      </>
    )
  }

  return (
    <>
      <div className="titlebar-drag" aria-hidden="true" />
      <main className="app-shell" ref={appRootRef}>
      <AppShell
        title={t(getTabMeta(activeView).labelKey)}
        onOpenSettings={() => setActiveView('settings')}
        rail={
          <ModuleRail
            activeView={activeView}
            onSwitch={setActiveView}
            onOpenSettings={() => setActiveView('settings')}
            isSettingsActive={activeView === 'settings'}
            model3dEnabled={MODEL3D_VIEW_ENABLED}
          />
        }
        version={version}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((v) => !v)}
        audioSubscribe={audio.status.active ? audio.subscribe : undefined}
        audioErrorLabel={audioErrorLabel || undefined}
        lang={lang}
        onToggleLang={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        shutdownLabel={
          shutdownInfo && shutdownInfo.remainingMs > 0
            ? formatMediaTime(Math.ceil(shutdownInfo.remainingMs / 1000))
            : ''
        }
        onShutdownClick={() => setShutdownPanelOpen((v) => !v)}
      >
      {/* R73: scheduled-shutdown HUD (fixed floating card) */}
      {shutdownPanelOpen && (
        <ShutdownTimerPanel
          deadlineMs={shutdownInfo?.deadlineMs ?? null}
          totalMs={shutdownInfo?.totalMs ?? 0}
          remainingMs={shutdownInfo?.remainingMs ?? 0}
          onArm={armShutdownTimer}
          onCancel={cancelShutdownTimer}
          onClose={() => setShutdownPanelOpen(false)}
        />
      )}

      <section className="workspace">
        {activeView === 'dashboard' && (
          <DashboardView
            onOpen={setActiveView}
            model3dEnabled={MODEL3D_VIEW_ENABLED}
            status={{
              running: status.running,
              onToggleEngine: toggleEngine,
              effectName:
                effectPresets.find((p) => p.kind === (selectedLayer?.kind ?? 'static'))?.label
                ?? selectedLayer?.kind ?? 'static',
              fps: dashFps,
              audioEnabled,
              audioDeviceId,
              audioDevices,
              speakerDevices,
              onSelectAudioDevice: setAudioDeviceId,
              overlayCount: overlayTopology.overlayDisplayIds.length,
              version
            }}
          />
        )}
        {activeView === 'settings' && (
          <SettingsView
            running={status.running}
            onToggleEngine={toggleEngine}
            powerSaveBlock={settingsMirror.powerSaveBlock}
            onPowerSaveBlock={(v) => { window.rgbbox.setPowerSaveBlock(v).then(settingsMirror.setPowerSaveBlock) }}
            autoLaunch={settingsMirror.autoLaunch}
            onAutoLaunch={(v) => { window.rgbbox.setAutoLaunch(v).then(settingsMirror.setAutoLaunch) }}
            screensaverEnabled={settingsMirror.screensaverEnabled}
            screensaverMinutes={settingsMirror.screensaverMinutes}
            onScreensaver={settingsMirror.applyScreensaverSettings}
            snipHotkey={settingsMirror.snipHotkey}
            onSnipHotkey={settingsMirror.applySnipHotkey}
          />
        )}
        {activeView === 'ai' && (
          <Suspense fallback={null}><AiLabView /></Suspense>
        )}
        {activeView === 'workspace' && (
          <Suspense fallback={null}>
          <WorkspaceView
            profile={profile}
            scene={scene}
            selectedLayer={selectedLayer}
            savedProfiles={profileManager.savedProfiles}
            setProfile={setProfile}
            setSelectedLayerId={setSelectedLayerId}
            profileMenuOpen={profileManager.profileMenuOpen}
            setProfileMenuOpen={profileManager.setProfileMenuOpen}
            profileEditMode={profileManager.profileEditMode}
            setProfileEditMode={profileManager.setProfileEditMode}
            profileEditName={profileManager.profileEditName}
            setProfileEditName={profileManager.setProfileEditName}
            editInputRef={profileManager.editInputRef}
            profileMenuRef={profileManager.profileMenuRef}
            handleProfileEditConfirm={profileManager.handleProfileEditConfirm}
            handleProfileDuplicate={profileManager.handleProfileDuplicate}
            handleProfileRename={profileManager.handleProfileRename}
            handleProfileDelete={profileManager.handleProfileDelete}
            handleProfileImport={profileManager.handleProfileImport}
            handleProfileExport={profileManager.handleProfileExport}
            refreshProfiles={profileManager.refreshProfiles}
            addLayer={layerActions.addLayer}
            toggleLayerEnabled={layerActions.toggleLayerEnabled}
            deleteLayer={layerActions.deleteLayer}
            selectEffect={selectEffect}
            updateSelectedLayer={updateSelectedLayer}
            setLayerParameter={layerActions.setLayerParameter}
            setSelectedLayerValue={layerActions.setSelectedLayerValue}
            favoriteEffectPresets={favoriteEffectPresets}
            applyAmbientPreset={applyAmbientPreset}
            applyQuickDimension={layerActions.applyQuickDimension}
            randomizeSelectedLayer={layerActions.randomizeSelectedLayer}
            allEffectsOpen={allEffectsOpen}
            setAllEffectsOpen={setAllEffectsOpen}
            advancedControlsOpen={advancedControlsOpen}
            setAdvancedControlsOpen={setAdvancedControlsOpen}
            importLayerPackRef={profileManager.importLayerPackRef}
            handleImportLayerPack={profileManager.handleImportLayerPack}
            exportLayerPack={profileManager.exportLayerPack}
            randomizerMode={randomizerMode}
            setRandomizerMode={setRandomizerMode}
            randomizerLockedParams={randomizerLockedParams}
            toggleRandomizerParamLock={toggleRandomizerParamLock}
            scheduleEnabled={scheduleDomain.scheduleEnabled}
            setScheduleEnabled={scheduleDomain.setScheduleEnabled}
            scheduleEffects={scheduleDomain.scheduleEffects}
            setScheduleEffect={scheduleDomain.setScheduleEffect}
            activeScheduleBlock={scheduleDomain.activeScheduleBlock}
            scheduledEffectKind={scheduleDomain.scheduledEffectKind}
            automationEnabled={automationEnabled}
            setAutomationEnabled={setAutomationEnabled}
            automationMode={automationMode}
            setAutomationMode={setAutomationMode}
            automatedParams={automatedParams}
            toggleAutomatedParam={toggleAutomatedParam}
            automatableParams={automatableParams}
            topology={topology}
            overlayDisplayIds={overlayTopology.overlayDisplayIds}
            overlayConfigs={overlayTopology.overlayConfigs}
            handleToggleOverlay={overlayTopology.handleToggleOverlay}
            handleOverlayConfigChange={overlayTopology.handleOverlayConfigChange}
            toggleLinkedDisplays={layerActions.toggleLinkedDisplays}
            updateVideoWall={layerActions.updateVideoWall}
            previewFullscreen={sampling.previewFullscreen}
            togglePreviewFullscreen={sampling.togglePreviewFullscreen}
            previewFullscreenWrapRef={sampling.previewFullscreenWrapRef}
            previewAspectRatio={sampling.previewAspectRatio}
            frameRef={frameRef}
            gpuDirectLayer={gpuDirectLayer}
            handleFrame3D={handleFrame3D}
            handleRippleClick={handleRippleClick}
            statusOutput={status.output}
            performanceLabels={performanceLabels}
            samplingCollapsed={sampling.samplingCollapsed}
            setSamplingCollapsed={sampling.setSamplingCollapsed}
            samplingTab={sampling.samplingTab}
            setSamplingTab={sampling.setSamplingTab}
            gridAdvanced={sampling.gridAdvanced}
            setGridAdvanced={sampling.setGridAdvanced}
            aspectLocked={sampling.aspectLocked}
            toggleAspectLock={sampling.toggleAspectLock}
            setGridDensity={sampling.setGridDensity}
            setColumns={sampling.setColumns}
            setRows={sampling.setRows}
            matchDisplayRatio={sampling.matchDisplayRatio}
            setSamplingValue={sampling.setSamplingValue}
          />
          </Suspense>
        )}

        {activeView === 'effects' && (
          <EffectsView
            activeKind={selectedLayer?.kind ?? 'static'}
            favoriteKinds={favoriteEffectKinds}
            onSelectEffect={(kind) => {
              selectEffect(kind)
              setActiveView('workspace')
            }}
            onToggleFavorite={toggleFavoriteEffect}
          />
        )}

        {activeView === 'games' && (
          <Suspense fallback={null}><MiniGamesView /></Suspense>
        )}

        {/* R60: this wrapper stays mounted (display:none instead of unmounting)
            so audio keeps playing across tab switches (R42) — but as a plain
            block-level flex item with no `flex`/`min-height` of its own, it
            sized to its content ("auto") instead of stretching to fill
            `.workspace`'s available height. AudioStudioView's own root sets
            `height:100%`, but that only resolves against a parent with a
            *definite* height — an auto-sized parent makes it a no-op, so the
            whole audio view (playlist/visualizer included) was never actually
            height-bounded. That let content silently overflow `.workspace`'s
            `overflow:hidden` and get clipped (the "频谱图表只显示了一半" bug after
            un-maximizing) instead of properly triggering the intended inner
            `overflow:auto` scrollbars (the "播放列表没有滚动条" bug). */}
        {audioVisited && (
        <div className="audio-view-wrapper" style={{ display: activeView === 'audio' ? undefined : 'none' }}>
          <Suspense fallback={null}><AudioStudioView visible={activeView === 'audio'} /></Suspense>
          {activeView === 'audio' && <AiListenOverlay />}
        </div>
        )}

        {/* R91.2: the video studio stays mounted after first visit (keep-alive,
            same pattern as the audio view above) — switching views only hides
            it, so a playing movie keeps sounding and the MiniPlayerCard can
            take over. Heavy views (3D/games) keep the old unmount behavior. */}
        {videoVisited && (
          <div className="video-view-anchor" style={{ display: activeView === 'video' ? undefined : 'none' }}>
            <Suspense fallback={null}><VideoStudioView visible={activeView === 'video'} onReturnToVideo={() => setActiveView('video')} /></Suspense>
            {activeView === 'video' && <AiListenOverlay />}
          </div>
        )}

        {MODEL3D_VIEW_ENABLED && activeView === 'model3d' && (
          <Model3DView ledColorsRef={ledColorsRef} engineRunning={status.running} onBack={() => setActiveView('workspace')} />
        )}

        {activeView === 'architecture' && (
          <Suspense fallback={null}><ArchitectureView /></Suspense>
        )}

        {activeView === 'diagnostics' && (
          <DiagnosticsView
            topology={topology}
            profile={profile}
            scene={scene}
            engineMetrics={engineMetrics}
            captureProvider={captureProvider}
            processCpuSamples={processCpuSamples}
            frameRef={frameRef}
            frameConsumerActive={frameConsumerActive}
            engineRunning={status.running}
            audioRef={audio.ref}
            audioErrorLabel={audioErrorLabel}
          />
        )}

      </section>
      </AppShell>
      <VisionAssistant activeView={activeView} onNavigate={setActiveView} rootRef={appRootRef} />
    </main>
    </>
  )
}
