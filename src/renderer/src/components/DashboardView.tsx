import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import { isViewReachable, type View } from '../hooks/tabNavigation'
import { CARD_VIEWS, MODULE_META } from './shellModules'
import { DashStageStrip } from './DashStageStrip'
import type { CardPerformanceMode } from '../domain/cardAnimation'
import type { EffectKind, EffectLayer } from '../../../shared/types'

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
  /** R303: 舞台条直渲当前效果所需（App 传选中图层）；null = profile 未就绪，渲染空舞台。 */
  effect: { kind: EffectKind; parameters: EffectLayer['parameters'] } | null
  /** R303: 舞台条帧率预算来源（battery/balanced/extreme）。 */
  performanceMode?: CardPerformanceMode
}

/**
 * R303: 仪表盘「舞台条」布局——整页一次大胆，其余克制：
 *   ① 灯效舞台条（Hero）：当前灯效的实时颜色带 + 引擎主开关；
 *   ② 状态降级为仪表读数行（小号 mono 数字，细分隔线簇）；
 *   ③ 模块磁贴长出描述（dash.desc.* 此前从未渲染）+ 9 色 tint；
 *   ④ 无折叠组——仪表盘不该默认收起。
 * 取代 R86 的 Synapse 式 5 等权卡片 + `<details>` 组结构。
 */
export function DashboardView({ onOpen, model3dEnabled, status, effect, performanceMode }: DashboardViewProps) {
  const { t } = useI18n()
  return (
    <div className="dashboard">
      <section className="dash-stage" aria-label={t('dash.stage.ariaLabel')}>
        <div className="dash-stage-head">
          <span className={`dash-stage-dot ${status.running ? 'on' : ''}`} aria-hidden="true" />
          <strong className="dash-stage-state">{status.running ? t('engine.running') : t('engine.paused')}</strong>
          <button
            type="button"
            className="dash-stage-toggle"
            onClick={status.onToggleEngine}
            aria-label={t('a11y.toggleEngine')}
          >
            {status.running ? <Pause size={14} /> : <Play size={14} />}
            {status.running ? t('dash.pause') : t('dash.start')}
          </button>
        </div>
        <div className="dash-stage-band">
          {effect !== null ? (
            <DashStageStrip
              kind={effect.kind}
              parameters={effect.parameters}
              running={status.running}
              performanceMode={performanceMode}
            />
          ) : (
            <div className="dash-stage-strip dash-stage-idle" aria-hidden="true" />
          )}
        </div>
        <div className="dash-readouts">
          <div className="dash-readout">
            <span className="dash-readout-k">{t('dash.card.effect')}</span>
            <strong className="dash-readout-v">{status.effectName}</strong>
          </div>
          <div className="dash-readout">
            <span className="dash-readout-k">{t('dash.card.fps')}</span>
            <strong className="dash-readout-v mono">{status.fps > 0 ? status.fps : '—'}</strong>
          </div>
          <div className="dash-readout">
            <span className="dash-readout-k">{t('dash.card.overlay')}</span>
            <strong className="dash-readout-v">{status.overlayCount}</strong>
          </div>
          <div className="dash-readout">
            <span className="dash-readout-k">{t('dash.card.audio')}</span>
            {status.audioEnabled ? (
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
            ) : (
              <strong className="dash-readout-v">{t('audio.off')}</strong>
            )}
          </div>
        </div>
      </section>

      <section className="dash-modules">
        <h3 className="dash-section-title">{t('dash.group.modules')}</h3>
        <div className="dash-tiles">
          {CARD_VIEWS.map((view) => {
            if (!isViewReachable(view, model3dEnabled)) return null
            const meta = MODULE_META[view]
            const Icon = meta.icon
            return (
              <button key={view} type="button" className="dash-tile" onClick={() => onOpen(view)}>
                <span className="dash-tile-icon" data-tint={meta.tint}><Icon size={24} /></span>
                <span className="dash-tile-label">{t(meta.labelKey)}</span>
                <span className="dash-tile-desc">{t(meta.descKey)}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
