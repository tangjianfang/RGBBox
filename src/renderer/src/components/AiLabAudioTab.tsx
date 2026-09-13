import { useCallback, useEffect, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { useAiAudioStream, type AiAudioSource } from '../hooks/useAiAudioStream'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5

type ModelDlState = 'checking' | 'ready' | 'idle' | 'downloading' | 'error'

/** R90.8: model manager — per-model cached/download status with retry. */
function useModelDownloads(): {
  silero: ModelDlState
  ast: ModelDlState
  astPercent: number
  err: string | null
  download: (name: 'silero_vad' | 'ast_audioset') => void
  refresh: () => void
} {
  const { t } = useI18n()
  const [silero, setSilero] = useState<ModelDlState>('checking')
  const [ast, setAst] = useState<ModelDlState>('checking')
  const [astPercent, setAstPercent] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await window.rgbbox.audioAiStatus()
      setSilero(s.sileroCached ? 'ready' : 'idle')
      setAst(s.astCached ? 'ready' : 'idle')
      setErr(null)
    } catch {
      setSilero('idle')
      setAst('idle')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const unsub = window.rgbbox.onModelDownloadProgress((p) => {
      if (p.name !== 'silero_vad' && p.name !== 'ast_audioset') return
      const isSilero = p.name === 'silero_vad'
      const setter = isSilero ? setSilero : setAst
      if (p.done) {
        if (p.error) {
          setter('error')
          setErr(p.error)
        } else {
          setter('ready')
          setErr(null)
        }
        void refresh()
      } else if (p.error) {
        setErr(`${t('ai.lab.audio.progress')} — ${p.error}`)
      } else {
        setErr(null)
        if (!isSilero) setAstPercent(Math.round(p.percent))
        setter('downloading')
      }
    })
    return unsub
  }, [refresh, t])

  const download = useCallback((name: 'silero_vad' | 'ast_audioset') => {
    if (name === 'silero_vad') setSilero('downloading')
    else { setAst('downloading'); setAstPercent(0) }
    void window.rgbbox.modelDownload(name).catch(() => undefined)
  }, [])

  return { silero, ast, astPercent, err, download, refresh }
}

/** R90.8: continuous audio AI detection — VAD probability updates live
 *  (every ~300ms feed) and AST classifies the last 3s on a 2s cadence. */
export function AiLabAudioTab(): JSX.Element {
  const { t } = useI18n()
  const [source, setSource] = useState<AiAudioSource | null>(null)
  const { silero, ast, astPercent, err, download, refresh } = useModelDownloads()
  const { running, error, vadProb, astTop } = useAiAudioStream(source)
  const vadPct = vadProb === null ? null : Math.round(vadProb * 100)

  const modelRow = (label: string, state: ModelDlState, name: 'silero_vad' | 'ast_audioset', percent?: number) => (
    <div className="ai-model-row" data-model={name}>
      <span className="ai-model-dot" data-state={state} />
      <span className="ai-model-name">{label}</span>
      {state === 'checking' && <span className="ai-lab-status">…</span>}
      {state === 'ready' && <span className="ai-model-state on">{t('ai.lab.audio.modelReady')}</span>}
      {state === 'downloading' && (
        <span className="ai-lab-status">
          {t('ai.lab.audio.progress')} {name === 'ast_audioset' ? percent : ''}%
        </span>
      )}
      {state === 'error' && <span className="ai-hint-line">{t('ai.lab.audio.modelFailed')}</span>}
      {state === 'idle' && (
        <button type="button" data-action={`dl-${name}`} onClick={() => download(name)}>
          {t('ai.lab.audio.download')}
        </button>
      )}
    </div>
  )

  return (
    <div className="ai-audio">
      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.models')}</strong>
          <button type="button" className="ai-model-refresh" onClick={() => void refresh()} title={t('ai.lab.audio.recheck')}>
            {t('ai.lab.audio.recheck')}
          </button>
        </div>
        {modelRow('Silero VAD (0.6MB)', silero, 'silero_vad')}
        {modelRow('AST AudioSet (91MB)', ast, 'ast_audioset', astPercent)}
        {err !== null && <div className="ai-hint-line">{err}</div>}
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.live')}</strong>
          <span className="ai-lab-status">
            {running && `● ${t('ai.lab.audio.liveOn')}`}
            {error && <span className="ai-hint-line">{error}</span>}
          </span>
        </div>
        <div className="ai-source-row" role="radiogroup" aria-label={t('ai.lab.audio.source')}>
          <label>
            <input
              type="radio"
              name="ai-audio-source"
              checked={source === 'mic'}
              onChange={() => setSource(source === 'mic' ? null : 'mic')}
            />
            <span>{t('ai.lab.audio.source.mic')}</span>
          </label>
          <label>
            <input
              type="radio"
              name="ai-audio-source"
              checked={source === 'system'}
              onChange={() => setSource(source === 'system' ? null : 'system')}
            />
            <span>{t('ai.lab.audio.source.system')}</span>
          </label>
        </div>
        <p className="ai-lab-desc">{t('ai.lab.audio.desc.live')}</p>
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.vad')}</strong>
          {vadPct !== null && <span className="ai-lab-status">{vadPct}%</span>}
        </div>
        {vadPct !== null ? (
          <div data-field="vad-result" className="ai-prob">
            <div className="ai-prob-bar">
              <span style={{ width: `${vadPct}%` }} />
            </div>
            <span>{vadProb! >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}</span>
          </div>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.vad.hint')}</p>
        )}
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.ast')}</strong>
        </div>
        {astTop !== null ? (
          <div data-field="ast-result" className="ai-ast">
            {astTop.map((row) => (
              <div key={row.index} className="ai-ast-row">
                <span>{labels[row.index]?.label ?? `#${row.index}`}</span>
                <span>{Math.round(row.score * 100)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.ast.hint')}</p>
        )}
      </div>
    </div>
  )
}
