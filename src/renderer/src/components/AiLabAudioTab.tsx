import { useCallback, useEffect, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { useAiAudioStream, type AiAudioSource } from '../hooks/useAiAudioStream'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5

type ModelDlState = 'checking' | 'ready' | 'idle' | 'downloading' | 'error'

/** R90.8 review: model status lives INSIDE each feature card's header
 *  (the standalone "Detection Models" card was redundant chrome). */
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

/** Per-card model badge: status dot + state / download button, rendered in the
 *  feature card's header (R90.8 review — no standalone model card). */
function ModelBadge(props: {
  state: ModelDlState
  name: 'silero_vad' | 'ast_audioset'
  percent?: number
  onDownload: (name: 'silero_vad' | 'ast_audioset') => void
}): JSX.Element {
  const { t } = useI18n()
  const { state, name, percent, onDownload } = props
  const label =
    state === 'checking' ? '…'
    : state === 'ready' ? t('ai.lab.audio.modelReady')
    : state === 'downloading' ? `${t('ai.lab.audio.progress')} ${name === 'ast_audioset' ? percent : ''}%`
    : state === 'error' ? t('ai.lab.audio.modelFailed')
    : ''
  return (
    <span className="ai-model-badge" data-model={name} data-state={state}>
      <span className="ai-model-dot" data-state={state} />
      {state === 'idle'
        ? (
          <button type="button" data-action={`dl-${name}`} onClick={() => onDownload(name)}>
            {t('ai.lab.audio.download')}
          </button>
        )
        : <span>{label}</span>}
    </span>
  )
}

/** R90.8: continuous audio AI detection — VAD probability updates live
 *  (every ~300ms feed) and AST classifies the last 3s on a 2s cadence. */
export function AiLabAudioTab(): JSX.Element {
  const { t } = useI18n()
  // R90.8 review fix: default to the microphone so detection starts the moment
  // the tab opens (an all-unchecked state read as a bug — and it was: nothing ran).
  const [source, setSource] = useState<AiAudioSource | null>('mic')
  const { silero, ast, astPercent, err, download } = useModelDownloads()
  const { running, error, vadProb, astTop, level, astState } = useAiAudioStream(source)
  const vadPct = vadProb === null ? null : Math.round(vadProb * 100)

  return (
    <div className="ai-audio">
      <p className="ai-lab-intro">{t('ai.lab.audio.intro')}</p>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.vad')}</strong>
          <ModelBadge state={silero} name="silero_vad" onDownload={download} />
        </div>
        {running && (
          <div className="ai-level">
            <span className="ai-lab-desc">{t('ai.lab.audio.level')}</span>
            <div className="ai-prob-bar">
              <span style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }} />
            </div>
            {level < 0.01 && <span className="ai-hint-line">{t('ai.lab.audio.levelZero')}</span>}
          </div>
        )}
        {vadPct !== null ? (
          <>
            <div data-field="vad-result" className="ai-prob">
              <div className="ai-prob-bar">
                <span style={{ width: `${vadPct}%` }} />
              </div>
              <span>{vadPct}% · {vadProb! >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}</span>
            </div>
            <p className="ai-lab-reading">{t('ai.lab.audio.vad.reading')}</p>
          </>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.vad.hint')}</p>
        )}
      </div>

      <div className="ai-audio-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.title.ast')}</strong>
          {ast === 'downloading' && <span className="ai-lab-status">{t('ai.lab.audio.progress')} {astPercent}%</span>}
          <ModelBadge state={ast} name="ast_audioset" percent={astPercent} onDownload={download} />
        </div>
        {running && (
          <p className="ai-lab-desc">
            {astState === 'running' && `… ${t('ai.lab.audio.ast.running')}`}
            {astState === 'waiting-audio' && t('ai.lab.audio.ast.waiting')}
            {astState === 'cadence' && t('ai.lab.audio.ast.cadence')}
          </p>
        )}
        {astTop !== null ? (
          <>
            <div data-field="ast-result" className="ai-ast">
              {astTop.map((row) => (
                <div key={row.index} className="ai-ast-row">
                  <span>{labels[row.index]?.label ?? `#${row.index}`}</span>
                  <span>{Math.round(row.score * 100)}%</span>
                </div>
              ))}
            </div>
            <p className="ai-lab-reading">{t('ai.lab.audio.ast.reading')}</p>
          </>
        ) : (
          <p className="ai-lab-desc">{t('ai.lab.audio.ast.hint')}</p>
        )}
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
        {err !== null && <div className="ai-hint-line">{err}</div>}
      </div>
    </div>
  )
}
