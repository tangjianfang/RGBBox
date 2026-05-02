import { Activity, Gauge, Languages, Mic, MicOff, Monitor, Pause, Play, Plus, SlidersHorizontal, Sparkles, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { effectPresets } from '../../shared/defaultProfile'
import type { BlendMode, DisplayTopology, EffectKind, EffectLayer, EngineStatus, Profile, RgbFrame } from '../../shared/types'
import { useI18n } from './i18n'
import { DisplayMap } from './components/DisplayMap'
import { EffectsView } from './components/EffectsView'
import { PreviewGrid } from './components/PreviewGrid'
import { ProfileManager } from './components/ProfileManager'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'

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
  // Static text params
  textX:       { labelKey: 'param.textX',    min: 0,   max: 1,   step: 0.05 },
  textY:       { labelKey: 'param.textY',    min: 0,   max: 1,   step: 0.05 },
  textScale:   { labelKey: 'param.textScale', min: 1,  max: 4,   step: 1 },
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

let _layerCounter = 100

export function App(): JSX.Element {
  const { t, lang, setLang } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topology, setTopology] = useState<DisplayTopology | null>(null)
  const [frame, setFrame] = useState<RgbFrame | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ running: true, fps: 30, output: 'virtual-preview' })
  const [version, setVersion] = useState('0.1.0')
  const [showProfileManager, setShowProfileManager] = useState(false)
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
  const [overlayDisplayIds, setOverlayDisplayIds] = useState<number[]>([])
  const [powerSaveBlock, setPowerSaveBlock] = useState(false)
  const audio = useAudioAnalyzer(audioEnabled)

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
  useEffect(() => { localStorage.setItem('rgbbox:selectedLayerId', selectedLayerId) }, [selectedLayerId])

  useEffect(() => {
    if (!profile) return undefined
    const timer = window.setTimeout(() => { window.rgbbox.saveProfile(profile) }, 350)
    return () => window.clearTimeout(timer)
  }, [profile])

  useEffect(() => {
    if (!profile || !status.running) return undefined

    let cancelled = false
    const intervalMs = Math.max(16, Math.floor(1000 / profile.sampling.fps))
    let timerId: number | null = null

    const tick = () => {
      const audioInput = audio.active
        ? { bass: audio.bass, mid: audio.mid, high: audio.high, beat: audio.beat }
        : undefined

      window.rgbbox.renderPreviewFrame(profile, audioInput).then((nextFrame) => {
        if (!cancelled) {
          setFrame(nextFrame)
          // Schedule next tick only after current IPC call completes
          timerId = window.setTimeout(tick, intervalMs)
        }
      })
    }

    tick()
    return () => { cancelled = true; if (timerId !== null) window.clearTimeout(timerId) }
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
      {showProfileManager && (
        <ProfileManager
          currentProfile={profile}
          onLoad={(p) => setProfile(p)}
          onClose={() => setShowProfileManager(false)}
        />
      )}
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
            className="sidebar-profile-btn"
            type="button"
            onClick={() => setShowProfileManager(true)}
            title={t('profile.label')}
          >
            <Users size={15} />
            <span>{profile.name}</span>
          </button>
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
                    <button
                      className={`layer-enable-dot ${layer.enabled ? 'on' : 'off'}`}
                      type="button"
                      title={layer.enabled ? t('layer.enable') : t('layer.disable')}
                      onClick={() => toggleLayerEnabled(layer.id)}
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
                    {preset.label}
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
                    onClick={() => setShowProfileManager(true)}
                    style={{ cursor: 'pointer' }}
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
                  <PreviewGrid frame={frame} />
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
                </section>

                {/* Sampling settings — spans both columns */}
                <section className="panel sampling-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('sampling.eyebrow')}</p>
                      <h3>{t('sampling.title')}</h3>
                    </div>
                    <SlidersHorizontal size={18} />
                  </div>
                  <div className="sampling-controls">
                    <label className="control-line">
                      <span>{t('sampling.columns')}</span>
                      <input min={1} max={96} type="range" value={profile.sampling.columns}
                        onChange={(e) => setSamplingValue('columns', Number(e.target.value))} />
                      <strong>{profile.sampling.columns}</strong>
                    </label>
                    <label className="control-line">
                      <span>{t('sampling.rows')}</span>
                      <input min={1} max={54} type="range" value={profile.sampling.rows}
                        onChange={(e) => setSamplingValue('rows', Number(e.target.value))} />
                      <strong>{profile.sampling.rows}</strong>
                    </label>
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
