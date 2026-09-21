import { Activity } from 'lucide-react'
import type { RefObject } from 'react'
import type { JSX } from 'react'
import type { CaptureProviderStatus, DisplayTopology, EngineMetrics, ProcessCpuSample, Profile, RgbFrame, Scene } from '../../../shared/types'
import { frameAgeState } from '../engine/frameAge'
import { formatMs } from '../domain/profileUtils'
import { useI18n } from '../i18n'

/**
 * R147 P3b: the diagnostics view, extracted verbatim from App.tsx's inline
 * JSX. Reads the live audio analyser through its ref channel (no re-renders).
 */
export function DiagnosticsView(props: {
  topology: DisplayTopology
  profile: Profile
  scene: Scene | null
  engineMetrics: EngineMetrics
  captureProvider: CaptureProviderStatus | null
  processCpuSamples: ProcessCpuSample[]
  frameRef: RefObject<RgbFrame | null>
  frameConsumerActive: boolean
  engineRunning: boolean
  audioRef: RefObject<{ active: boolean; bass: number }>
  audioErrorLabel: string
}): JSX.Element {
  const { t } = useI18n()
  const { topology, profile, scene, engineMetrics, captureProvider, processCpuSamples, frameRef, frameConsumerActive, engineRunning, audioRef, audioErrorLabel } = props

  // R151.4: mini-bars for the frame-time metrics are scaled against the
  // configured frame budget; anything over budget rides the warn hue.
  const frameBudgetMs = 1000 / Math.max(1, profile.sampling.fps)
  const barPct = (ms: number): number => Math.max(2, Math.min(100, (ms / frameBudgetMs) * 100))
  const overBudget = (ms: number): boolean => ms > frameBudgetMs
  const latencyBar = (label: string, ms: number): JSX.Element => (
    <div>
      <dt>{label}</dt>
      <dd className="diag-dd-bar">
        <span className="diag-val">{formatMs(ms)}</span>
        <span className="diag-bar" aria-hidden="true">
          <span className={overBudget(ms) ? 'diag-bar-fill warn' : 'diag-bar-fill'} style={{ width: `${barPct(ms)}%` }} />
        </span>
      </dd>
    </div>
  )

  return (
    <div className="diagnostics-view">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('diag.eyebrow')}</p>
          <h2>{t('diag.title')}</h2>
        </div>
        <Activity size={24} />
      </header>
      {/* R151.4 (review §12.3): the 13-row single list becomes a 2×2 card
          grid — latency / pipeline / environment / per-process CPU — so both
          columns carry weight instead of a long table beside an empty one. */}
      <div className="diagnostics-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t('diag.eyebrow')}</p>
              <h3>{t('diag.group.latency')}</h3>
            </div>
          </div>
          <dl className="diagnostics-list">
            <div>
              <dt>{t('diag.frameAge')}</dt>
              <dd>{(() => {
                // R87: a growing age on this page usually means the tick loop is
                // gated (R42/R43), not that the engine is unhealthy — say so.
                const state = frameAgeState(
                  frameRef.current?.generatedAt ?? null,
                  Date.now(),
                  frameConsumerActive,
                  engineRunning
                )
                if (state.kind === 'waiting') return t('diag.waiting')
                if (state.kind === 'idle') return t(state.reason === 'paused' ? 'diag.frameIdlePaused' : 'diag.frameIdleNoConsumer')
                return `${state.ms} ms`
              })()}</dd>
            </div>
            {latencyBar(t('diag.avgFrameMs'), engineMetrics.avgFrameMs)}
            {latencyBar(t('diag.p95FrameMs'), engineMetrics.p95FrameMs)}
            <div><dt>{t('diag.workerMs')}</dt><dd>{formatMs(engineMetrics.workerProcessMs)}</dd></div>
            <div><dt>{t('diag.captureMs')}</dt><dd>{formatMs(engineMetrics.captureMs || captureProvider?.lastCaptureMs)}</dd></div>
            <div><dt>{t('diag.outputMs')}</dt><dd>{formatMs(engineMetrics.outputMs)}</dd></div>
            <div><dt>{t('diag.droppedTicks')}</dt><dd>{engineMetrics.droppedTicks}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t('diag.eyebrow')}</p>
              <h3>{t('diag.group.pipeline')}</h3>
            </div>
          </div>
          <dl className="diagnostics-list">
            <div><dt>{t('diag.virtualBounds')}</dt><dd>{topology.virtualBounds.width}×{topology.virtualBounds.height}</dd></div>
            <div><dt>{t('diag.gridSize')}</dt><dd>{profile.sampling.columns}×{profile.sampling.rows} ({profile.sampling.columns * profile.sampling.rows} pixels)</dd></div>
            <div><dt>{t('diag.activeLayers')}</dt><dd>{scene?.layers.filter((l) => l.enabled).length ?? 0}</dd></div>
            <div><dt>{t('diag.targetFps')}</dt><dd>{profile.sampling.fps}</dd></div>
            <div><dt>{t('diag.brightGain')}</dt><dd>{Math.round(profile.sampling.brightnessLimit * 100)}%</dd></div>
            <div><dt>{t('diag.audio')}</dt><dd>{audioRef.current.active ? t('diag.audioBass').replace('{bass}', (audioRef.current.bass * 100).toFixed(0)) : audioErrorLabel || t('diag.off')}</dd></div>
          </dl>
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t('diag.eyebrow')}</p>
              <h3>{t('diag.group.env')}</h3>
            </div>
          </div>
          <dl className="diagnostics-list">
            <div><dt>{t('diag.platform')}</dt><dd>{topology.platform}</dd></div>
            <div>
              <dt>{t('diag.captureProvider')}</dt>
              <dd title={captureProvider?.fallbackReason ?? undefined}>
                {captureProvider ? captureProvider.active : '—'}
              </dd>
            </div>
            {topology.displays.map((d) => (
              <div key={d.id}>
                <dt>{d.label}{d.primary ? ` ${t('diag.displayPrimary')}` : ''}</dt>
                <dd>{d.bounds.width}×{d.bounds.height} @{d.scaleFactor}×</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* R46: objective per-process CPU% breakdown — see PRD-0002 R46.
            Lets CPU investigations point at a specific OS process
            (main/renderer/gpu-process/utility) instead of one aggregate
            Task Manager number, which on Windows groups every
            Electron-owned process under one collapsible tree. */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{t('diag.processCpu.eyebrow')}</p>
              <h3>{t('diag.processCpu.title')}</h3>
            </div>
          </div>
          <table className="process-cpu-table">
            <thead>
              <tr>
                <th>{t('diag.processCpu.type')}</th>
                <th>PID</th>
                <th>{t('diag.processCpu.cpu')}</th>
              </tr>
            </thead>
            <tbody>
              {processCpuSamples.length === 0 ? (
                <tr><td colSpan={3}>{t('diag.waiting')}</td></tr>
              ) : (
                [...processCpuSamples]
                  .sort((a, b) => b.cpuPercent - a.cpuPercent)
                  .map((p) => (
                    <tr key={p.pid}>
                      <td className="process-cpu-type" title={`${p.type}${p.name ? ` (${p.name})` : ''}`}>{p.type}{p.name ? ` (${p.name})` : ''}</td>
                      <td>{p.pid}</td>
                      <td className={p.cpuPercent > 20 ? 'process-cpu-high' : ''}>{p.cpuPercent.toFixed(1)}%</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
