import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import { isViewReachable, type View } from '../hooks/tabNavigation'
import { CARD_VIEWS, MODULE_META } from './shellModules'

export interface DashboardStatus {
  running: boolean
  onToggleEngine: () => void
  effectName: string
  fps: number
  audioEnabled: boolean
  audioDeviceId: string
  audioDevices: MediaDeviceInfo[]
  speakerDevices: MediaDeviceInfo[]
  onSelectAudioDevice: (id: string) => void
  overlayCount: number
  version: string
}

export interface DashboardViewProps {
  onOpen: (v: View) => void
  model3dEnabled: boolean
  status: DashboardStatus
}

/** R86: Synapse-style dashboard — collapsible groups + status cards + module tiles. */
export function DashboardView({ onOpen, model3dEnabled, status }: DashboardViewProps) {
  const { t } = useI18n()
  return (
    <div className="dashboard">
      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('dash.group.status')}</summary>
        <div className="dash-cards">
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.engine')}</span>
            <div className="dash-card-value">
              <button
                type="button"
                className="icon-button"
                onClick={status.onToggleEngine}
                aria-label={t('a11y.toggleEngine')}
              >
                {status.running ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <strong>{status.running ? t('engine.running') : t('engine.paused')}</strong>
            </div>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.fps')}</span>
            <strong className="dash-card-value">{status.fps > 0 ? `${status.fps} fps` : '—'}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.effect')}</span>
            <strong className="dash-card-value">{status.effectName}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.overlay')}</span>
            <strong className="dash-card-value">{status.overlayCount}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.audio')}</span>
            <div className="dash-card-value">
              <strong>{status.audioEnabled ? t('audio.on') : t('audio.off')}</strong>
              {status.audioEnabled && (
                <select
                  className="audio-device-select"
                  value={status.audioDeviceId}
                  onChange={(e) => status.onSelectAudioDevice(e.target.value)}
                  title={t('audio.deviceLabel')}
                >
                  <option value="">{t('audio.defaultDevice')}</option>
                  {status.speakerDevices.map((d) => (
                    <option key={d.deviceId} value={`__speaker__:${d.deviceId}`}>
                      {t('audio.speakerPrefix')}{d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                  <option value="__system_audio__">{t('audio.systemAudio')}</option>
                  {status.audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </details>

      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('dash.group.modules')}</summary>
        <div className="dash-tiles">
          {CARD_VIEWS.map((view) => {
            if (!isViewReachable(view, model3dEnabled)) return null
            const meta = MODULE_META[view]
            const Icon = meta.icon
            return (
              <button key={view} type="button" className="dash-tile" onClick={() => onOpen(view)}>
                <span className="dash-tile-icon" data-tint={meta.tint}><Icon size={24} /></span>
                <span className="dash-tile-label">{t(meta.labelKey)}</span>
              </button>
            )
          })}
        </div>
      </details>
    </div>
  )
}
