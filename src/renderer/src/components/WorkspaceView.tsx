import {
  Activity, ChevronDown, ChevronUp, Clock, Download, FilePlus, Gauge, Link2, Link2Off,
  Lock, Maximize2, Minimize2, Monitor, MoreVertical, Pencil, Plus, Sparkles, Star,
  Shuffle, Trash2, Unlock, Upload,
} from 'lucide-react'
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react'
import type { JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { BlendMode, DisplayTopology, EffectKind, EffectLayer, OverlayConfig, Profile, ProfileMeta, RgbFrame, Scene } from '../../../shared/types'
import { is3DEffect, resolveFrameRenderStyle } from '../../../shared/types'
import { AMBIENT_PRESETS } from '../domain/ambientPresets'
import type { AmbientPreset } from '../domain/ambientPresets'
import type { AutomationMode } from '../domain/automation'
import type { RandomizerMode } from '../domain/randomizer'
import type { QuickDimensionId } from '../domain/quickDimensions'
import type { ScheduleBlockId } from '../domain/schedule'
import { PARAM_META } from '../domain/paramMeta'
import { activeLayer } from '../domain/profileUtils'
import { QUICK_DETAIL_OPTIONS, QUICK_ENERGY_OPTIONS, QUICK_EFFECT_KINDS, QUICK_MOTION_OPTIONS, QUICK_PALETTE_OPTIONS } from '../domain/quickDimensions'
import { SCHEDULE_BLOCKS } from '../domain/schedule'
import { useI18n } from '../i18n'
import { CustomPaintEditor } from './CustomPaintEditor'
import { DisplayMap } from './DisplayMap'
import { ImagePaintEditor } from './ImagePaintEditor'
import { Preview3D } from './Preview3D'
import { PreviewGrid } from './PreviewGrid'
import { VideoWallEditor } from './VideoWallEditor'
/**
 * R147 P3: the workspace view, extracted verbatim from App.tsx's inline JSX
 * (was ~840 lines inside the God Component). Wide props interface by design
 * for this first extraction — prop names match the former closure variable
 * names so the JSX body moved unchanged; domain hooks carved out of App
 * narrow these groups in later steps.
 */
export interface WorkspaceViewProps {
  // profile domain
  profile: Profile
  scene: Scene | null
  selectedLayer: EffectLayer | null | undefined
  savedProfiles: ProfileMeta[]
  setProfile: Dispatch<SetStateAction<Profile | null>>
  setSelectedLayerId: (id: string) => void
  // profile menu / edit state (App-owned for now)
  profileMenuOpen: boolean
  setProfileMenuOpen: Dispatch<SetStateAction<boolean>>
  profileEditMode: 'duplicate' | 'rename' | null
  setProfileEditMode: Dispatch<SetStateAction<'duplicate' | 'rename' | null>>
  profileEditName: string
  setProfileEditName: Dispatch<SetStateAction<string>>
  editInputRef: RefObject<HTMLInputElement | null>
  profileMenuRef: RefObject<HTMLDivElement | null>
  handleProfileEditConfirm: () => void
  handleProfileDuplicate: () => void
  handleProfileRename: () => void
  handleProfileDelete: () => void
  handleProfileImport: () => void
  handleProfileExport: () => void
  refreshProfiles: () => void
  // layer domain
  addLayer: (kind: EffectKind) => void
  toggleLayerEnabled: (id: string) => void
  deleteLayer: (id: string) => void
  selectEffect: (kind: EffectKind) => void
  updateSelectedLayer: (patch: Partial<EffectLayer>) => void
  setLayerParameter: (name: string, value: number | string | boolean) => void
  setSelectedLayerValue: <K extends 'opacity' | 'blendMode'>(key: K, value: EffectLayer[K]) => void
  // quick customize / effects picker
  favoriteEffectPresets: Array<{ kind: EffectKind; label: string }>
  applyAmbientPreset: (preset: AmbientPreset) => void
  applyQuickDimension: (dimension: QuickDimensionId, option: string) => void
  randomizeSelectedLayer: () => void
  allEffectsOpen: boolean
  setAllEffectsOpen: Dispatch<SetStateAction<boolean>>
  advancedControlsOpen: boolean
  setAdvancedControlsOpen: Dispatch<SetStateAction<boolean>>
  // layer pack import/export
  importLayerPackRef: RefObject<HTMLInputElement | null>
  handleImportLayerPack: (e: ChangeEvent<HTMLInputElement>) => void
  exportLayerPack: () => void
  // randomizer domain
  randomizerMode: RandomizerMode
  setRandomizerMode: Dispatch<SetStateAction<RandomizerMode>>
  randomizerLockedParams: string[]
  toggleRandomizerParamLock: (name: string) => void
  // schedule domain
  scheduleEnabled: boolean
  setScheduleEnabled: Dispatch<SetStateAction<boolean>>
  scheduleEffects: Record<ScheduleBlockId, EffectKind>
  setScheduleEffect: (block: ScheduleBlockId, kind: EffectKind) => void
  activeScheduleBlock: { id: ScheduleBlockId; labelKey: 'schedule.day' | 'schedule.evening' | 'schedule.night'; timeLabel: string; startHour: number; endHour: number }
  scheduledEffectKind: EffectKind
  // automation domain
  automationEnabled: boolean
  setAutomationEnabled: Dispatch<SetStateAction<boolean>>
  automationMode: AutomationMode
  setAutomationMode: Dispatch<SetStateAction<AutomationMode>>
  automatedParams: string[]
  toggleAutomatedParam: (name: string) => void
  automatableParams: string[]
  // topology / overlay domain
  topology: DisplayTopology
  overlayDisplayIds: number[]
  overlayConfigs: Record<number, OverlayConfig>
  handleToggleOverlay: (displayId: number) => void
  handleOverlayConfigChange: (displayId: number, config: OverlayConfig) => void
  toggleLinkedDisplays: () => void
  updateVideoWall: (layout: Scene['videoWall']) => void
  // preview domain
  previewFullscreen: boolean
  togglePreviewFullscreen: () => void
  previewFullscreenWrapRef: RefObject<HTMLDivElement | null>
  previewAspectRatio: number
  frameRef: RefObject<RgbFrame | null>
  gpuDirectLayer: EffectLayer | null
  handleFrame3D: (frame: RgbFrame) => void
  handleRippleClick: (nx: number, ny: number) => void
  statusOutput: string
  performanceLabels: Record<string, string>
  // sampling domain
  samplingCollapsed: boolean
  setSamplingCollapsed: Dispatch<SetStateAction<boolean>>
  samplingTab: 'resolution' | 'appearance' | 'performance'
  setSamplingTab: Dispatch<SetStateAction<'resolution' | 'appearance' | 'performance'>>
  gridAdvanced: boolean
  setGridAdvanced: Dispatch<SetStateAction<boolean>>
  aspectLocked: boolean
  toggleAspectLock: () => void
  setGridDensity: (value: number) => void
  setColumns: (value: number) => void
  setRows: (value: number) => void
  matchDisplayRatio: () => void
  setSamplingValue: (key: 'smoothing' | 'saturationBoost' | 'brightnessLimit' | 'renderStyle' | 'showGap' | 'fps' | 'usePerformanceGuard', value: number | string | boolean) => void
}

export function WorkspaceView(p: WorkspaceViewProps): JSX.Element {
  const {
    profile, scene, selectedLayer, savedProfiles, setProfile, setSelectedLayerId,
    profileMenuOpen, setProfileMenuOpen, profileEditMode, setProfileEditMode,
    profileEditName, setProfileEditName, editInputRef, profileMenuRef,
    handleProfileEditConfirm, handleProfileDuplicate, handleProfileRename,
    handleProfileDelete, handleProfileImport, handleProfileExport, refreshProfiles,
    addLayer, toggleLayerEnabled, deleteLayer, selectEffect, updateSelectedLayer,
    setLayerParameter, setSelectedLayerValue,
    favoriteEffectPresets, applyAmbientPreset, applyQuickDimension, randomizeSelectedLayer,
    allEffectsOpen, setAllEffectsOpen, advancedControlsOpen, setAdvancedControlsOpen,
    importLayerPackRef, handleImportLayerPack, exportLayerPack,
    randomizerMode, setRandomizerMode, randomizerLockedParams, toggleRandomizerParamLock,
    scheduleEnabled, setScheduleEnabled, scheduleEffects, setScheduleEffect,
    activeScheduleBlock, scheduledEffectKind,
    automationEnabled, setAutomationEnabled, automationMode, setAutomationMode,
    automatedParams, toggleAutomatedParam, automatableParams,
    topology, overlayDisplayIds, overlayConfigs, handleToggleOverlay,
    handleOverlayConfigChange, toggleLinkedDisplays, updateVideoWall,
    previewFullscreen, togglePreviewFullscreen, previewFullscreenWrapRef,
    previewAspectRatio, frameRef, gpuDirectLayer, handleFrame3D, handleRippleClick,
    statusOutput, performanceLabels,
    samplingCollapsed, setSamplingCollapsed, samplingTab, setSamplingTab,
    gridAdvanced, setGridAdvanced, aspectLocked, toggleAspectLock,
    setGridDensity, setColumns, setRows, matchDisplayRatio, setSamplingValue,
  } = p
  void refreshProfiles
  const { t } = useI18n()
  return (
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
                      value={profile.id}
                      onChange={async (e) => {
                        const targetId = e.target.value
                        if (!targetId) return
                        const loaded = await window.rgbbox.loadProfileById(targetId)
                        if (loaded) {
                          // Reset selected layer so it points to an actual layer in the
                          // new profile — without this, updateLayer silently no-ops.
                          const newScene = loaded.scenes.find((s) => s.id === loaded.activeSceneId) ?? loaded.scenes[0]
                          const firstLayer = newScene?.layers[0]
                          if (firstLayer) setSelectedLayerId(firstLayer.id)
                          setProfile(loaded)
                        }
                      }}
                    >
                      {!savedProfiles.find((p) => p.id === profile.id) && (
                        <option value={profile.id}>{profile.name}</option>
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
                          <button className="profile-menu-item" type="button" onClick={handleProfileDuplicate}>
                            <FilePlus size={12} /> {t('profile.duplicate')}
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
                <div className="fx-header-actions">
                  <input
                    accept=".json"
                    aria-label={t('pack.import')}
                    className="sr-only"
                    ref={importLayerPackRef}
                    type="file"
                    onChange={handleImportLayerPack}
                  />
                  <button
                    className="icon-button small"
                    disabled={!selectedLayer}
                    title={t('pack.export')}
                    type="button"
                    onClick={exportLayerPack}
                  >
                    <Upload size={13} />
                  </button>
                  <button
                    className="icon-button small"
                    title={t('pack.import')}
                    type="button"
                    onClick={() => importLayerPackRef.current?.click()}
                  >
                    <Download size={13} />
                  </button>
                  <button
                    className="icon-button small"
                    type="button"
                    onClick={() => addLayer('rainbow')}
                    title={t('fx.addLayer')}
                  >
                    <Plus size={13} />
                  </button>
                </div>
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

              {favoriteEffectPresets.length > 0 && (
                <div className="favorite-effect-strip" aria-label={t('effects.favorites')}>
                  {favoriteEffectPresets.map((preset, index) => (
                    <button
                      className={`favorite-effect-chip ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                      key={preset.kind}
                      type="button"
                      onClick={() => selectEffect(preset.kind)}
                      title={`Alt+${index + 1} · ${preset.label}`}
                    >
                      <Star size={11} fill="currentColor" />
                      <span>{t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedLayer && (
                <div className="quick-customize-panel">
                  <div className="quick-panel-header">
                    <span className="ambient-label">{t('quick.title')}</span>
                    <button className="icon-button small" type="button" onClick={randomizeSelectedLayer} title={t('effects.randomize')}>
                      <Shuffle size={13} />
                    </button>
                  </div>
                  <div className="quick-profile-row" aria-label={t('quick.profile')}>
                    {AMBIENT_PRESETS.map((ap) => (
                      <button
                        key={ap.id}
                        className={`quick-profile-btn ${String(selectedLayer.parameters._quickProfile ?? '') === ap.id ? 'active' : ''}`}
                        type="button"
                        title={t(ap.labelKey as Parameters<typeof t>[0])}
                        onClick={() => applyAmbientPreset(ap)}
                      >
                        <span>{t(ap.labelKey as Parameters<typeof t>[0])}</span>
                      </button>
                    ))}
                  </div>
                  <div className="quick-tune-stack">
                    <div className="quick-segment-row">
                      <span>{t('quick.motion')}</span>
                      <div className="quick-segment-control">
                        {QUICK_MOTION_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickMotion ?? 'flow') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('motion', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.energy')}</span>
                      <div className="quick-segment-control">
                        {QUICK_ENERGY_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickEnergy ?? 'balanced') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('energy', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.detail')}</span>
                      <div className="quick-segment-control">
                        {QUICK_DETAIL_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickDetail ?? 'balanced') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('detail', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                    <div className="quick-segment-row">
                      <span>{t('quick.palette')}</span>
                      <div className="quick-segment-control">
                        {QUICK_PALETTE_OPTIONS.map((option) => {
                          const active = String(selectedLayer.parameters._quickPalette ?? 'cool') === option.id
                          return <button key={option.id} className={active ? 'active' : ''} type="button" onClick={() => applyQuickDimension('palette', option.id)}>{t(option.labelKey as Parameters<typeof t>[0])}</button>
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="quick-effects-panel">
                <span className="ambient-label">{t('quick.effects')}</span>
                <div className="effect-kind-grid compact-effect-grid" aria-label={t('quick.effects')}>
                  {QUICK_EFFECT_KINDS.map((kind) => {
                    const preset = effectPresets.find((candidate) => candidate.kind === kind)
                    if (!preset) return null
                    return (
                      <button
                        className={`effect-kind-btn ${selectedLayer?.kind === preset.kind ? 'selected' : ''}`}
                        key={preset.kind}
                        type="button"
                        onClick={() => selectEffect(preset.kind)}
                        title={preset.description}
                      >
                        {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                      </button>
                    )
                  })}
                </div>
                <button className="advanced-toggle-row" type="button" onClick={() => setAllEffectsOpen((open) => !open)}>
                  <Sparkles size={13} />
                  <span>{t('quick.allEffects')}</span>
                  <strong>{allEffectsOpen ? t('quick.hide') : t('quick.show')}</strong>
                </button>
                {allEffectsOpen && (
                  <div className="effect-kind-grid all-effects-grid" aria-label="Effect type picker">
                    {effectPresets
                      .filter((preset) => !QUICK_EFFECT_KINDS.includes(preset.kind))
                      .map((preset) => (
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
                )}
              </div>

              {/* Per-layer parameters */}
              {selectedLayer && (
                <div className="layer-params-panel">
                  <button className="advanced-toggle-row" type="button" onClick={() => setAdvancedControlsOpen((open) => !open)}>
                    <Gauge size={13} />
                    <span>{t('quick.advanced')}</span>
                    <strong>{advancedControlsOpen ? t('quick.hide') : t('quick.show')}</strong>
                  </button>
                  {advancedControlsOpen && (
                    <>
                      <div className="layer-tools-row">
                        <select
                          className="randomizer-select"
                          value={randomizerMode}
                          title={t('effects.randomizeMode')}
                          onChange={(e) => setRandomizerMode(e.target.value as RandomizerMode)}
                        >
                          <option value="subtle">{t('effects.randomize.subtle')}</option>
                          <option value="bold">{t('effects.randomize.bold')}</option>
                          <option value="calm">{t('effects.randomize.calm')}</option>
                          <option value="energy">{t('effects.randomize.energy')}</option>
                        </select>
                        <button className="layer-action-btn" type="button" onClick={randomizeSelectedLayer} title={t('effects.randomize')}>
                          <Shuffle size={13} />
                          <span>{t('effects.randomize')}</span>
                        </button>
                      </div>
                      <div className="schedule-panel">
                    <button
                      className={`schedule-toggle ${scheduleEnabled ? 'active' : ''}`}
                      type="button"
                      onClick={() => setScheduleEnabled((enabled) => !enabled)}
                      title={t('schedule.toggle')}
                    >
                      <Clock size={13} />
                      <span>{t('schedule.title')}</span>
                      <strong>{scheduleEnabled ? t('schedule.on') : t('schedule.off')}</strong>
                    </button>
                    {scheduleEnabled && (
                      <div className="schedule-block-list">
                        <div className="schedule-active-line">
                          {t('schedule.active')}: {t(activeScheduleBlock.labelKey)} · {t((`effect.${scheduledEffectKind}`) as Parameters<typeof t>[0])}
                        </div>
                        {SCHEDULE_BLOCKS.map((block) => (
                          <label className="schedule-block-row" key={block.id}>
                            <span>{t(block.labelKey)}</span>
                            <small>{block.timeLabel}</small>
                            <select
                              value={scheduleEffects[block.id]}
                              onChange={(event) => setScheduleEffect(block.id, event.target.value as EffectKind)}
                            >
                              {effectPresets.map((preset) => (
                                <option key={preset.kind} value={preset.kind}>
                                  {t((`effect.${preset.kind}`) as Parameters<typeof t>[0])}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {automatableParams.length > 0 && (
                    <div className="automation-panel">
                      <div className="automation-toolbar">
                        <button
                          className={`schedule-toggle ${automationEnabled ? 'active' : ''}`}
                          type="button"
                          onClick={() => setAutomationEnabled((enabled) => !enabled)}
                          title={t('automation.toggle')}
                        >
                          <Activity size={13} />
                          <span>{t('automation.title')}</span>
                          <strong>{automationEnabled ? t('schedule.on') : t('schedule.off')}</strong>
                        </button>
                        <select
                          className="automation-mode-select"
                          value={automationMode}
                          title={t('automation.mode')}
                          onChange={(event) => setAutomationMode(event.target.value as AutomationMode)}
                        >
                          <option value="sine">{t('automation.sine')}</option>
                          <option value="triangle">{t('automation.triangle')}</option>
                          <option value="pulse">{t('automation.pulse')}</option>
                        </select>
                      </div>
                      <div className="automation-param-row">
                        {automatableParams.map((name) => {
                          const active = automatedParams.includes(name)
                          const meta = PARAM_META[name]
                          const label = meta?.labelKey?.includes('.') ? t(meta.labelKey as Parameters<typeof t>[0]) : meta?.labelKey ?? name
                          return (
                            <button
                              className={`automation-param-chip ${active ? 'active' : ''}`}
                              key={name}
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggleAutomatedParam(name)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* ── Zone Mask ────────────────────────────────────────── */}
                  <div className="zone-mask-panel">
                    <span className="zone-mask-label">{t('mask.title')}</span>
                    <div className="zone-mask-buttons">
                      {(['full', 'top', 'bottom', 'left', 'right', 'center', 'corners'] as const).map((zone) => {
                        const active = (String(selectedLayer.parameters._maskZone ?? 'full')) === zone
                        return (
                          <button
                            key={zone}
                            className={`zone-mask-btn ${active ? 'active' : ''}`}
                            type="button"
                            aria-pressed={active}
                            title={t(`mask.${zone}` as Parameters<typeof t>[0])}
                            onClick={() => setLayerParameter('_maskZone', zone)}
                          >
                            {t(`mask.${zone}` as Parameters<typeof t>[0])}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* ── Display Slot (multi-display linked mode) ──────────── */}
                  {scene?.linkedDisplays && topology.displays.length > 1 && (
                    <div className="zone-mask-panel">
                      <span className="zone-mask-label">{t('display.slotTitle')}</span>
                      <div className="zone-mask-buttons">
                        {(['all', ...topology.displays.map((_, i) => String(i))] as const).map((slot) => {
                          const active = (String(selectedLayer.parameters._displaySlot ?? 'all')) === slot
                          const label = slot === 'all' ? t('display.slotAll') : `${t('display.slotN')} ${Number(slot) + 1}`
                          return (
                            <button
                              key={slot}
                              className={`zone-mask-btn ${active ? 'active' : ''}`}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setLayerParameter('_displaySlot', slot)}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
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
                  {/* Custom Paint editor */}
                  {selectedLayer.kind === 'custom-paint' && (
                    <CustomPaintEditor
                      columns={profile?.sampling.columns ?? 24}
                      rows={profile?.sampling.rows ?? 14}
                      pixelData={(() => {
                        try {
                          const raw = String(selectedLayer.parameters.pixelData ?? '')
                          return raw ? JSON.parse(raw) as string[] : []
                        } catch { return [] }
                      })()}
                      onChange={(pixels) => setLayerParameter('pixelData', JSON.stringify(pixels))}
                    />
                  )}
                  {/* Image Paint editor */}
                  {selectedLayer.kind === 'image-paint' && (
                    <ImagePaintEditor
                      columns={profile?.sampling.columns ?? 24}
                      rows={profile?.sampling.rows ?? 14}
                      imageDataList={(() => {
                        try {
                          const raw = String(selectedLayer.parameters.imageDataList ?? '')
                          return raw ? JSON.parse(raw) as string[][] : []
                        } catch { return [] }
                      })()}
                      activeImageIndex={Number(selectedLayer.parameters.activeImageIndex ?? 0)}
                      transitionSpeed={Number(selectedLayer.parameters.transitionSpeed ?? 3)}
                      animateTransition={selectedLayer.parameters.animateTransition !== false}
                      onChange={(data) => {
                        updateSelectedLayer({
                          parameters: {
                            ...selectedLayer.parameters,
                            imageDataList: JSON.stringify(data.imageDataList),
                            activeImageIndex: data.activeImageIndex,
                            transitionSpeed: data.transitionSpeed,
                            animateTransition: data.animateTransition,
                          }
                        })
                      }}
                    />
                  )}
                  {selectedLayer.kind !== 'custom-paint' && selectedLayer.kind !== 'image-paint' && Object.entries(selectedLayer.parameters)
                    .filter(([name]) => !name.startsWith('_'))
                    .map(([name, value]) => {
                      const meta = PARAM_META[name]
                      // label: use i18n key if available (e.g. 'param.textX'), otherwise meta.labelKey or param name
                      const labelKey = meta?.labelKey ?? name
                      const label = (labelKey.includes('.') ? t(labelKey as Parameters<typeof t>[0]) : labelKey)
                      const unit = meta?.unit ?? ''
                      const locked = randomizerLockedParams.includes(name)
                      const lockTitle = locked ? t('effects.unlockParam') : t('effects.lockParam')
                      const lockButton = (
                        <button
                          className={`parameter-lock-btn ${locked ? 'locked' : ''}`}
                          type="button"
                          aria-pressed={locked}
                          title={lockTitle}
                          onClick={() => toggleRandomizerParamLock(name)}
                        >
                          {locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                      )
                      // Special case: text string parameter (not a color hex)
                      if (typeof value === 'string' && !value.startsWith('#')) {
                        return (
                          <div className="parameter-line text-param" key={name}>
                            <span>{name === 'text' ? t('param.text') : label}</span>
                            <input
                              className="text-param-input"
                              type="text"
                              value={value}
                              placeholder={name === 'text' ? t('param.textPlaceholder') : ''}
                              onChange={(e) => setLayerParameter(name, e.target.value)}
                            />
                            {lockButton}
                          </div>
                        )
                      }
                      return (
                        <div className="parameter-line" key={name}>
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
                          {lockButton}
                          <strong>
                            {typeof value === 'number'
                              ? `${meta?.step && meta.step >= 1 ? Math.round(value) : value.toFixed(2)}${unit}`
                              : String(value)}
                          </strong>
                        </div>
                      )
                    })}
                    </>
                  )}
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
                    <div className="preview-header-actions">
                      <button
                        className="preview-fullscreen-btn"
                        title={t(previewFullscreen ? 'preview.exitFullscreen' : 'preview.fullscreen')}
                        onClick={togglePreviewFullscreen}
                        type="button"
                      >
                        {previewFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                      </button>
                      <span className="chip">{statusOutput}</span>
                    </div>
                  </div>
                  <div
                    ref={previewFullscreenWrapRef}
                    className={`preview-fullscreen-wrap${previewFullscreen ? ' is-fullscreen' : ''}`}
                  >
                    {is3DEffect(activeLayer(profile).kind) ? (
                      <Preview3D
                        layer={activeLayer(profile)}
                        columns={profile.sampling.columns}
                        rows={profile.sampling.rows}
                        onFrame={handleFrame3D}
                        aspectRatio={previewAspectRatio}
                      />
                    ) : (
                      <PreviewGrid
                        frameRef={frameRef}
                        showGap={profile.sampling.showGap ?? false}
                        renderStyle={resolveFrameRenderStyle(profile.sampling.renderStyle, activeLayer(profile)?.kind)}
                        gpuLayer={gpuDirectLayer}
                        onRippleClick={scene?.layers.some((l) => l.enabled && l.kind === 'ripple') ? handleRippleClick : undefined}
                        displayCount={scene?.linkedDisplays ? topology.displays.length : 1}
                        aspectRatio={previewAspectRatio}
                      />
                    )}
                  </div>
                </section>

                <section className="panel map-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('map.eyebrow')}</p>
                      <h3>{t('map.title')}</h3>
                    </div>
                    <span className="chip">{topology.platform}</span>
                  </div>
                  <DisplayMap topology={topology} overlayDisplayIds={overlayDisplayIds} onToggleOverlay={handleToggleOverlay} overlayConfigs={overlayConfigs} onOverlayConfigChange={handleOverlayConfigChange} />
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
                    <VideoWallEditor
                      layout={scene?.videoWall}
                      topology={topology}
                      onChange={updateVideoWall}
                    />
                  )}
                </section>

                {/* Sampling settings — spans both columns; R40: collapsible + tabbed to
                    reduce the vertical footprint so the display topology map above has
                    more room without excessive scrolling. */}
                <section className="panel sampling-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">{t('sampling.eyebrow')}</p>
                      <h3>{t('sampling.title')}</h3>
                    </div>
                    <button
                      className="aspect-lock-btn sampling-collapse-btn"
                      type="button"
                      onClick={() => setSamplingCollapsed((v) => !v)}
                      title={t(samplingCollapsed ? 'sampling.expand' : 'sampling.collapse')}
                    >
                      {samplingCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      <span>{t(samplingCollapsed ? 'sampling.expand' : 'sampling.collapse')}</span>
                    </button>
                  </div>
                  {!samplingCollapsed && (
                    <>
                      <div className="sampling-tabs" role="tablist">
                        {(['resolution', 'appearance', 'performance'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            role="tab"
                            aria-selected={samplingTab === tab}
                            className={`sampling-tab${samplingTab === tab ? ' active' : ''}`}
                            onClick={() => setSamplingTab(tab)}
                          >
                            {t(`sampling.tab.${tab}` as Parameters<typeof t>[0])}
                          </button>
                        ))}
                      </div>
                      <div className="sampling-controls">
                        {samplingTab === 'resolution' && (
                          <>
                            {/* ── Auto density mode (default) ── */}
                            {!gridAdvanced ? (
                              <>
                                <label className="control-line">
                                  <span>{t('sampling.resolution')}</span>
                                  <input min={8} max={320} type="range"
                                    value={Math.max(profile.sampling.columns, profile.sampling.rows)}
                                    onChange={(e) => setGridDensity(Number(e.target.value))} />
                                  <strong>{profile.sampling.columns} × {profile.sampling.rows}</strong>
                                </label>
                                {(() => {
                                  const px = profile.sampling.columns * profile.sampling.rows
                                  // Empirical throughput after per-column precompute optimisation:
                                  // ~250,000 pixels/sec for complex effects (fire/aurora/lightning)
                                  // on a modern CPU in a single Web Worker.
                                  const estFps = Math.min(60, Math.round(250_000 / px))
                                  const slow = estFps < 15
                                  return (
                                    <div className={`grid-fps-hint${slow ? ' grid-fps-hint--warn' : ''}`}>
                                      ~{estFps}&nbsp;{t(slow ? 'sampling.fpsSlow' : 'sampling.fpsOk')}
                                    </div>
                                  )
                                })()}
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
                                  <input min={1} max={960} type="range" value={profile.sampling.columns}
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
                                  <input min={1} max={540} type="range" value={profile.sampling.rows}
                                    onChange={(e) => setRows(Number(e.target.value))} />
                                  <strong>{profile.sampling.rows}</strong>
                                </label>
                              </>
                            )}
                          </>
                        )}
                        {samplingTab === 'appearance' && (
                          <>
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
                              <span>{t('sampling.renderStyle')}</span>
                              <select
                                value={profile.sampling.renderStyle ?? 'smooth'}
                                onChange={(e) => setSamplingValue('renderStyle', e.target.value)}
                              >
                                <option value="smooth">{t('sampling.renderStyle.smooth')}</option>
                                <option value="pixel">{t('sampling.renderStyle.pixel')}</option>
                              </select>
                            </label>
                            <label className="toggle-line sampling-toggle">
                              <input checked={profile.sampling.showGap ?? false} type="checkbox"
                                onChange={(e) => setSamplingValue('showGap', e.target.checked)} />
                              <span>{t('sampling.showGap')}</span>
                            </label>
                          </>
                        )}
                        {samplingTab === 'performance' && (
                          <>
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
                          </>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>

          </div>
  )
}
