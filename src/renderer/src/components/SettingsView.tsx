import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import { showConfirm } from '../domain/appDialog'
import { PRESET_SNIP_HOTKEYS } from '../../../shared/snipHotkeys'
import { UI_FONT_SCALE_TIERS } from '../domain/uiFontScale'
import { UI_THEME_OPTIONS } from '../domain/uiTheme'
import { clearAllGameData, type GameId } from '../domain/gamesTelemetry'
import { resetOnboarding } from '../vision/onboarding'
import { MACRO_PRESETS, buildPresetMap, persistMacroMap, loadMacroMap, validateMacroMap, macroDiff } from '../domain/gestureMacro'
import type { MacroMap, MacroDiffEntry } from '../domain/gestureMacro'
import { GESTURE_SCENE_MAP, GESTURES, SCENES, ACTIONS } from '../vision/gestureActions'
import { USER_VOCAB } from '../vision/hostProtocol'

export interface SettingsViewProps {
  // Runtime
  running: boolean
  onToggleEngine: () => void
  powerSaveBlock: boolean
  onPowerSaveBlock: (v: boolean) => void
  autoLaunch: boolean
  onAutoLaunch: (v: boolean) => void
  // Screensaver (R74)
  screensaverEnabled: boolean
  screensaverMinutes: number
  onScreensaver: (cfg: { enabled?: boolean; idleMinutes?: number }) => void
  // Hotkeys (R81)
  snipHotkey: string
  onSnipHotkey: (k: string) => void
  // Appearance (R160.4): Dynamic-Type-equivalent font scale
  uiFontScale: string
  onUiFontScale: (id: string) => void
  // Appearance (R148 S5): UI theme — dark default / light / follow system
  uiTheme: string
  onUiTheme: (id: string) => void
  // AI (R83→R88): moved to the AI Lab view
}

export function SettingsView(props: SettingsViewProps) {
  const { t, lang } = useI18n()
  const [gamesClearedAt, setGamesClearedAt] = useState<number | null>(null)
  const [visionReplayAt, setVisionReplayAt] = useState<number | null>(null)
  // R306/T8: gesture macros — preset picker + the 6×7 matrix + the shared
  // conflict gate. Games scenes stay exempt (R131 owns that surface).
  const L = lang === 'zh' ? 'zh' : 'en'
  const [macroMap, setMacroMap] = useState(() => loadMacroMap())
  const [macroPreset, setMacroPreset] = useState('default')
  // R309d: preset selection is a PREVIEW first — the exact cell diffs render
  // and nothing is written until the user confirms (blind apply rewired
  // gestures sight-unseen)
  const [macroPreview, setMacroPreview] = useState<{ id: string; map: MacroMap; diffs: MacroDiffEntry[] } | null>(null)
  const macroConflicts = validateMacroMap(macroMap)
  const MACRO_SCENES = SCENES.filter((s) => s !== 'games')
  const chooseMacroPreset = (id: string): void => {
    const map = id === 'default' ? GESTURE_SCENE_MAP : buildPresetMap(id)
    const diffs = macroDiff(loadMacroMap(), map)
    setMacroPreview(diffs.length ? { id, map, diffs } : null)
    if (!diffs.length) applyMacroPreset(id) // no-op apply: confirm directly
  }
  const applyMacroPreset = (id: string): void => {
    const map = id === 'default' ? GESTURE_SCENE_MAP : buildPresetMap(id)
    if (persistMacroMap(map).length) return // shipped presets always clean
    setMacroMap(map)
    setMacroPreset(id)
    setMacroPreview(null)
  }
  const editMacroCell = (g: string, s: string, action: string): void => {
    const next = { ...macroMap, [g]: { ...macroMap[g], [s]: { ...macroMap[g][s], action } } }
    if (persistMacroMap(next).length) return // closed action set — unreachable, gate anyway
    setMacroMap(next)
    setMacroPreset('') // a hand-edited table is no longer a shipped preset
  }
  return (
    <div className="settings-view">
      {/* R189 Q-5: topbar already shows '设置' — the duplicate in-view header
          is removed; the groups grid starts directly. */}
      <div className="settings-groups">
        <section className="panel settings-group" data-group="run">
          <h3>{t('settings.group.run')}</h3>
          <div className="status-panel">
            <div>
              <span>{t('engine.label')}</span>
              <strong>{props.running ? t('engine.running') : t('engine.paused')}</strong>
            </div>
            <button className="icon-button" type="button" onClick={props.onToggleEngine} aria-label="Toggle engine">
              {props.running ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </div>
          <label className="status-panel" style={{ cursor: 'pointer' }}>
            <div>
              <span>{t('power.label')}</span>
              <strong>{props.powerSaveBlock ? t('power.on') : t('power.off')}</strong>
            </div>
            <input type="checkbox" checked={props.powerSaveBlock} onChange={(e) => props.onPowerSaveBlock(e.target.checked)} />
          </label>
          <label className="status-panel" style={{ cursor: 'pointer' }}>
            <div>
              <span>{t('autoLaunch.label')}</span>
              <strong>{props.autoLaunch ? t('autoLaunch.on') : t('autoLaunch.off')}</strong>
            </div>
            <input type="checkbox" checked={props.autoLaunch} onChange={(e) => props.onAutoLaunch(e.target.checked)} />
          </label>
        </section>

        <section className="panel settings-group" data-group="screensaver">
          <h3>{t('settings.group.screensaver')}</h3>
          <label className="status-panel" style={{ cursor: 'pointer' }} title={t('screensaver.hint')}>
            <div>
              <span>{t('screensaver.label')}</span>
              <strong>{props.screensaverEnabled ? t('screensaver.on') : t('screensaver.off')}</strong>
            </div>
            <input
              type="checkbox"
              checked={props.screensaverEnabled}
              onChange={(e) => props.onScreensaver({ enabled: e.target.checked })}
            />
          </label>
          {props.screensaverEnabled && (
            <div className="status-panel" title={t('screensaver.hint')}>
              <span>{t('screensaver.threshold')}</span>
              <select
                data-setting="screensaver-minutes"
                value={props.screensaverMinutes}
                onChange={(e) => props.onScreensaver({ idleMinutes: Number(e.target.value) })}
              >
                {[1, 5, 10, 30].map((m) => (
                  <option key={m} value={m}>{m} {t('screensaver.minUnit')}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="panel settings-group" data-group="hotkey">
          <h3>{t('settings.group.hotkey')}</h3>
          <div className="status-panel" title={t('snip.hotkeyHint')}>
            <span>{t('snip.hotkeyLabel')}</span>
            <select
              data-setting="snip-hotkey"
              value={props.snipHotkey}
              onChange={(e) => props.onSnipHotkey(e.target.value)}
            >
              {PRESET_SNIP_HOTKEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </section>

        {/* R160.4: appearance — font scale tiers ride the rem-rooted type ramp. */}
        <section className="panel settings-group" data-group="appearance">
          <h3>{t('settings.group.appearance')}</h3>
          <div className="status-panel" title={t('uiFontScale.hint')}>
            <span>{t('uiFontScale.label')}</span>
            <select
              data-setting="ui-font-scale"
              value={props.uiFontScale}
              onChange={(e) => props.onUiFontScale(e.target.value)}
            >
              {UI_FONT_SCALE_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>{t(`uiFontScale.tier.${tier.id}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </div>
          {/* R148 S5: theme — dark default (stage-first), light flips the chrome
              token layer, system rides prefers-color-scheme with live re-resolve. */}
          <div className="status-panel" title={t('uiTheme.hint')}>
            <span>{t('uiTheme.label')}</span>
            <select
              data-setting="ui-theme"
              value={props.uiTheme}
              onChange={(e) => props.onUiTheme(e.target.value)}
            >
              {UI_THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{t(`uiTheme.option.${opt.id}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </div>
          {/* R236.3: privacy statement pointer — plain text only (no window):
              the camera pipeline is fully local; full statement in docs/PRIVACY.md. */}
          <p className="ai-hint-line" data-field="privacy-note" title={t('settings.privacy.note')}>
            {t('settings.privacy.label')} — {t('settings.privacy.note')}
          </p>
        </section>

        {/* R198(FR-G02.3): games — clear local telemetry (bests kept by default). */}
        <section className="panel settings-group" data-group="games">
          <h3>{t('settings.group.games')}</h3>
          <div className="status-panel" title={t('settings.games.clearHint')}>
            <span>{t('settings.games.clearLabel')}</span>
            <button
              type="button"
              className="video-btn"
              data-setting="games-clear-data"
              onClick={async () => {
                // 两段确认:先清遥测(保留最高分);再问是否连最高分一起清
                // R302: 应用内 danger 对话框（原 window.confirm 系统白底弹框）
                if (!(await showConfirm({ message: t('settings.games.clearConfirm'), danger: true }))) return
                clearAllGameData(localStorage, false, (id: GameId) => `rgbbox:gamesBest:${id === 'td' ? 'balloon' : id}`)
                if (await showConfirm({ message: t('settings.games.clearBestConfirm'), danger: true })) {
                  clearAllGameData(localStorage, true, (id: GameId) => `rgbbox:gamesBest:${id === 'td' ? 'balloon' : id}`)
                }
                setGamesClearedAt(Date.now())
              }}
            >{t('settings.games.clearBtn')}</button>
          </div>
          {gamesClearedAt !== null && <p className="ai-hint-line" data-field="games-cleared">{t('settings.games.cleared')}</p>}
          {/* R246: 体感向导重看入口 — clears the done-flag; the wizard re-opens
              the next time the gesture assistant is enabled (a mounted one
              re-opens immediately via the reset event). */}
          <div className="status-panel" title={t('settings.vision.replayHint')}>
            <span>{t('settings.vision.replayLabel')}</span>
            <button
              type="button"
              className="video-btn"
              data-setting="vision-replay-onboarding"
              onClick={() => { resetOnboarding(); setVisionReplayAt(Date.now()) }}
            >{t('settings.vision.replayBtn')}</button>
          </div>
          {visionReplayAt !== null && <p className="ai-hint-line" data-field="vision-replay">{t('settings.vision.replayDone')}</p>}
        </section>

        {/* R306/T8: 手势宏 — 三套预设 + 6×7 映射表编辑 + 共享冲突校验。 */}
        <section className="panel settings-group" data-macro="gestures">
          <h3>{t('settings.group.gestures')}</h3>
          <div className="status-panel">
            <span>{t('settings.macro.preset')}</span>
            <select
              className="settings-select"
              data-setting="macro-preset"
              value={macroPreset}
              onChange={(e) => chooseMacroPreset(e.target.value)}
            >
              <option value="default">{t('settings.macro.default')}</option>
              {MACRO_PRESETS.map((p) => <option key={p.id} value={p.id}>{p[L]}</option>)}
            </select>
            <span data-field="macro-conflicts">{t('settings.macro.conflicts')} {macroConflicts.length}</span>
          </div>
          {macroConflicts.length > 0 && (
            <ul className="macro-conflict-list">
              {macroConflicts.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
          {macroPreview != null && (
            <div className="macro-preview" data-field="macro-preview">
              <p>{t('settings.macro.previewTitle')}（{macroPreview.diffs.length}）</p>
              <ul>
                {macroPreview.diffs.map((d) => (
                  <li key={`${d.gesture}:${d.scene}`} data-diff={`${d.gesture}:${d.scene}`}>
                    {`${d.gesture} × ${d.scene}: ${d.from} → ${d.to}`}
                  </li>
                ))}
              </ul>
              <button type="button" className="video-btn" data-action="macro-apply" onClick={() => applyMacroPreset(macroPreview.id)}>
                {t('settings.macro.apply')}
              </button>
              <button type="button" className="video-btn" data-action="macro-cancel" onClick={() => setMacroPreview(null)}>
                {t('settings.macro.cancel')}
              </button>
            </div>
          )}
          <table className="macro-table">
            <thead>
              <tr>
                <th>{t('settings.macro.col.gesture')}</th>
                {MACRO_SCENES.map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {GESTURES.map((g) => {
                const label = USER_VOCAB.find((w) => w.id === g)
                return (
                  <tr key={g}>
                    <th scope="row">{label ? label[L] : g}</th>
                    {MACRO_SCENES.map((s) => (
                      <td key={s}>
                        <select
                          className="settings-select macro-cell"
                          data-cell={`${g}:${s}`}
                          value={macroMap[g][s].action}
                          onChange={(e) => editMacroCell(g, s, e.target.value)}
                        >
                          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
