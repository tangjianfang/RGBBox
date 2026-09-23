import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import { PRESET_SNIP_HOTKEYS } from '../../../shared/snipHotkeys'
import { UI_FONT_SCALE_TIERS } from '../domain/uiFontScale'

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
  // AI (R83→R88): moved to the AI Lab view
}

export function SettingsView(props: SettingsViewProps) {
  const { t } = useI18n()
  return (
    <div className="settings-view">
      <header className="workspace-header">
        <div>
          <h2>{t('menu.settings')}</h2>
        </div>
      </header>
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
        </section>
      </div>
    </div>
  )
}
