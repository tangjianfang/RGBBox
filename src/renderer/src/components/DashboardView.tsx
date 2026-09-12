import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import type { View } from '../hooks/tabNavigation'
import { DASHBOARD_SECTIONS, MODULE_META } from './shellModules'

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
  openTabs: View[]
  model3dEnabled: boolean
  status: DashboardStatus
}

export function DashboardView({ onOpen, openTabs, model3dEnabled, status }: DashboardViewProps) {
  const { t } = useI18n()
  return (
    <div className="dashboard">
      <div className="dash-status">
        <button
          type="button"
          className="icon-button"
          onClick={status.onToggleEngine}
          aria-label="Toggle engine"
        >
          {status.running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className={`dash-dot${status.running ? ' on' : ''}`} />
        <span>{status.running ? t('engine.running') : t('engine.paused')}</span>
        <span className="dash-sep">·</span>
        <span>{t('dash.status.effect')}: {status.effectName}</span>
        <span className="dash-sep">·</span>
        <span>{status.fps > 0 ? `${status.fps} fps` : '—'}</span>
        <span className="dash-sep">·</span>
        <span>{t('dash.status.overlay')}: {status.overlayCount}</span>
        {status.audioEnabled && (
          <>
            <span className="dash-sep">·</span>
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
          </>
        )}
      </div>

      {DASHBOARD_SECTIONS.map((section) => (
        <section key={section.key} className="dash-section">
          <h3>{t(section.key)}</h3>
          <div className="dash-cards">
            {section.views.map((view) => {
              if (view === 'model3d' && !model3dEnabled) return null
              const meta = MODULE_META[view as keyof typeof MODULE_META]
              const Icon = meta.icon
              const isOpen = openTabs.includes(view)
              return (
                <button
                  key={view}
                  type="button"
                  className={`dash-card${isOpen ? ' is-open' : ''}`}
                  onClick={() => onOpen(view)}
                >
                  <Icon size={22} />
                  <strong>{t(meta.labelKey)}</strong>
                  <span>{t(meta.descKey)}</span>
                  {isOpen && <i className="dash-open-dot" title={t('dash.opened')} />}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
