import { Activity, Gauge, Mic, MicOff, Monitor, Pause, Play, Plus, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import { effectPresets } from '../../shared/defaultProfile'
import type { BlendMode, DisplayTopology, EffectKind, EffectLayer, EngineStatus, Profile, RgbFrame } from '../../shared/types'
import { DisplayMap } from './components/DisplayMap'
import { EffectsView } from './components/EffectsView'
import { PreviewGrid } from './components/PreviewGrid'
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer'

type View = 'workspace' | 'effects' | 'diagnostics'

// Human-readable parameter metadata
const PARAM_META: Record<string, { label: string; min: number; max: number; step: number; unit?: string }> = {
  speed:       { label: 'Speed',       min: 0,    max: 2,    step: 0.05, unit: '×' },
  spread:      { label: 'Spread',      min: 0.5,  max: 3,    step: 0.1,  unit: '×' },
  width:       { label: 'Width',       min: 0,    max: 1,    step: 0.05 },
  saturation:  { label: 'Saturation',  min: 0,    max: 2,    step: 0.05, unit: '×' },
  contrast:    { label: 'Contrast',    min: 0,    max: 2,    step: 0.05, unit: '×' },
  intensity:   { label: 'Intensity',   min: 0,    max: 1,    step: 0.05 },
  density:     { label: 'Density',     min: 0,    max: 1,    step: 0.05 },
  frequency:   { label: 'Rings',       min: 1,    max: 10,   step: 0.5 },
  tail:        { label: 'Tail',        min: 0.05, max: 0.95, step: 0.05 },
  hueShift:    { label: 'Hue Shift',   min: -180, max: 180,  step: 5,    unit: '°' },
  sensitivity: { label: 'Sensitivity', min: 0.2,  max: 3,    step: 0.1,  unit: '×' }
}

const performanceLabels: Record<Profile['performanceMode'], string> = {
  battery: '省电',
  balanced: '均衡',
  extreme: '极致'
}

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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [topology, setTopology] = useState<DisplayTopology | null>(null)
  const [frame, setFrame] = useState<RgbFrame | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ running: true, fps: 30, output: 'virtual-preview' })
  const [version, setVersion] = useState('0.1.0')
  const [selectedLayerId, setSelectedLayerId] = useState('layer-screen-ambient')
  const [currentView, setCurrentView] = useState<View>('workspace')
  const [audioEnabled, setAudioEnabled] = useState(false)
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
            Workspace
          </button>
          <button className={`nav-item ${currentView === 'effects' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('effects')}>
            <Sparkles size={18} />
            Effects
          </button>
          <button className={`nav-item ${currentView === 'diagnostics' ? 'active' : ''}`} type="button" onClick={() => setCurrentView('diagnostics')}>
            <Gauge size={18} />
            Diagnostics
          </button>
        </nav>

        <div className="sidebar-audio">
          <button
            className={`audio-toggle ${audioEnabled ? 'active' : ''}`}
            type="button"
            onClick={() => setAudioEnabled((v) => !v)}
            title={audioEnabled ? 'Disable mic input' : 'Enable audio reactive'}
          >
            {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
            <span>{audioEnabled ? 'Audio On' : 'Audio Off'}</span>
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
            <span>Engine</span>
            <strong>{status.running ? 'Running' : 'Paused'}</strong>
          </div>
          <button className="icon-button" type="button" onClick={toggleEngine} aria-label="Toggle engine">
            {status.running ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </section>
        <label className="status-panel" style={{ cursor: 'pointer' }} title="阻止系统进入屏保或睡眠">
          <div>
            <span>阻止屏保/睡眠</span>
            <strong>{powerSaveBlock ? 'On' : 'Off'}</strong>
          </div>
          <input
            type="checkbox"
            checked={powerSaveBlock}
            onChange={(e) => {
              window.rgbbox.setPowerSaveBlock(e.target.checked).then(setPowerSaveBlock)
            }}
          />
        </label>
      </aside>

      <section className="workspace">
        {currentView === 'workspace' && (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">Local-first RGB controller</p>
                <h2>{profile.name}</h2>
              </div>
              <div className="metric-row">
                <div className="metric">
                  <span>Displays</span>
                  <strong>{topology.displays.length}</strong>
                </div>
                <div className="metric">
                  <span>Grid</span>
                  <strong>{profile.sampling.columns}×{profile.sampling.rows}</strong>
                </div>
                <div className="metric">
                  <span>Mode</span>
                  <strong>{performanceLabels[profile.performanceMode]}</strong>
                </div>
              </div>
            </header>

            <div className="content-grid">
              <section className="panel preview-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Virtual output</p>
                    <h3>RGB canvas preview</h3>
                  </div>
                  <span className="chip">{status.output}</span>
                </div>
                <PreviewGrid frame={frame} />
              </section>

              <section className="panel map-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Display topology</p>
                    <h3>Multi-screen map</h3>
                  </div>
                  <span className="chip">{topology.platform}</span>
                </div>
                <DisplayMap topology={topology} overlayDisplayIds={overlayDisplayIds} onToggleOverlay={handleToggleOverlay} />
              </section>

              <section className="panel controls-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Effect layers</p>
                    <h3>{selectedLayer?.name ?? 'No layer'}</h3>
                  </div>
                  <SlidersHorizontal size={20} />
                </div>

                {/* Layer stack */}
                <div className="layer-stack" aria-label="Effect layer stack">
                  {scene?.layers.map((layer) => (
                    <div
                      className={`layer-row ${selectedLayer?.id === layer.id ? 'selected' : ''}`}
                      key={layer.id}
                    >
                      <button
                        className={`layer-enable-dot ${layer.enabled ? 'on' : 'off'}`}
                        type="button"
                        title={layer.enabled ? 'Enabled' : 'Disabled'}
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
                          title="Delete layer"
                          onClick={() => deleteLayer(layer.id)}
                          aria-label="Delete layer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button className="add-layer-btn" type="button" onClick={() => addLayer('rainbow')}>
                    <Plus size={14} /> Add Layer
                  </button>
                </div>

                {/* Effect picker (grid) */}
                <div className="preset-grid">
                  {effectPresets.map((preset) => (
                    <button
                      className={`preset-button ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
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
                  <div className="parameter-panel">
                    <label className="control-line">
                      <span>Opacity</span>
                      <input min={0} max={1} step={0.05} type="range" value={selectedLayer.opacity}
                        onChange={(e) => setSelectedLayerValue('opacity', Number(e.target.value))} />
                      <strong>{Math.round(selectedLayer.opacity * 100)}%</strong>
                    </label>
                    <label className="select-line">
                      <span>Blend</span>
                      <select value={selectedLayer.blendMode}
                        onChange={(e) => setSelectedLayerValue('blendMode', e.target.value as BlendMode)}>
                        <option value="normal">Normal</option>
                        <option value="screen">Screen</option>
                        <option value="add">Add</option>
                        <option value="multiply">Multiply</option>
                      </select>
                    </label>
                    {Object.entries(selectedLayer.parameters)
                      .filter(([name]) => !name.startsWith('_'))
                      .map(([name, value]) => {
                        const meta = PARAM_META[name]
                        const label = meta?.label ?? name
                        const unit = meta?.unit ?? ''
                        return (
                          <label className="parameter-line" key={name}>
                            <span>{label}</span>
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

                {/* Sampling controls */}
                <label className="control-line">
                  <span>Columns</span>
                  <input min={1} max={96} type="range" value={profile.sampling.columns}
                    onChange={(e) => setSamplingValue('columns', Number(e.target.value))} />
                  <strong>{profile.sampling.columns}</strong>
                </label>
                <label className="control-line">
                  <span>Rows</span>
                  <input min={1} max={54} type="range" value={profile.sampling.rows}
                    onChange={(e) => setSamplingValue('rows', Number(e.target.value))} />
                  <strong>{profile.sampling.rows}</strong>
                </label>
                <label className="control-line">
                  <span>Smooth</span>
                  <input min={0} max={0.9} step={0.05} type="range" value={profile.sampling.smoothing}
                    onChange={(e) => setSamplingValue('smoothing', Number(e.target.value))} />
                  <strong>{profile.sampling.smoothing.toFixed(2)}</strong>
                </label>
                <label className="control-line">
                  <span>饱和度</span>
                  <input min={0.5} max={3} step={0.1} type="range" value={profile.sampling.saturationBoost ?? 1.5}
                    onChange={(e) => setSamplingValue('saturationBoost', Number(e.target.value))} />
                  <strong>{(profile.sampling.saturationBoost ?? 1.5).toFixed(1)}×</strong>
                </label>
                <label className="control-line">
                  <span>亮度</span>
                  <input min={0.1} max={2} step={0.05} type="range" value={profile.sampling.brightnessLimit}
                    onChange={(e) => setSamplingValue('brightnessLimit', Number(e.target.value))} />
                  <strong>{Math.round(profile.sampling.brightnessLimit * 100)}%</strong>
                </label>
                <label className="control-line">
                  <span>FPS</span>
                  <input min={15} max={60} step={15} type="range" value={profile.sampling.fps}
                    onChange={(e) => setSamplingValue('fps', Number(e.target.value))} />
                  <strong>{profile.sampling.fps}</strong>
                </label>
                <label className="toggle-line">
                  <input checked={profile.sampling.usePerformanceGuard} type="checkbox"
                    onChange={(e) => setSamplingValue('usePerformanceGuard', e.target.checked)} />
                  <span>Performance guard</span>
                </label>
              </section>
            </div>
          </>
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
                <p className="eyebrow">Runtime</p>
                <h2>Diagnostics</h2>
              </div>
              <Activity size={24} />
            </header>
            <div className="panel" style={{ maxWidth: 560 }}>
              <dl className="diagnostics-list">
                <div><dt>Virtual bounds</dt><dd>{topology.virtualBounds.width}×{topology.virtualBounds.height}</dd></div>
                <div><dt>Frame age</dt><dd>{frame ? `${Math.max(0, Date.now() - frame.generatedAt)} ms` : 'Waiting'}</dd></div>
                <div><dt>亮度增益</dt><dd>{Math.round(profile.sampling.brightnessLimit * 100)}%</dd></div>
                <div><dt>Grid size</dt><dd>{profile.sampling.columns}×{profile.sampling.rows} ({profile.sampling.columns * profile.sampling.rows} pixels)</dd></div>
                <div><dt>Active layers</dt><dd>{scene?.layers.filter((l) => l.enabled).length ?? 0}</dd></div>
                <div><dt>Target FPS</dt><dd>{profile.sampling.fps}</dd></div>
                <div><dt>Platform</dt><dd>{topology.platform}</dd></div>
                <div><dt>Audio</dt><dd>{audio.active ? `Active — Bass ${(audio.bass * 100).toFixed(0)}%` : 'Off'}</dd></div>
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
