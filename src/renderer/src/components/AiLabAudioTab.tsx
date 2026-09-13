import { useCallback, useEffect, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { useAiAudioStream, type PipelineStage } from '../hooks/useAiAudioStream'
import { synthTestTone } from '../tools/pcm'
import type { SourceId } from '../tools/pcmSource'
import labels from '../assets/audioset-labels.json'

const VAD_THRESHOLD = 0.5

type ModelDlState = 'checking' | 'ready' | 'idle' | 'downloading' | 'error'
type SelfTestResult = Array<{ item: string; pass: boolean | null; detail?: string }> | null

/** Model status hook (unchanged behavior, feeds the pipeline stage-0 badges). */
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
        if (p.error) { setter('error'); setErr(p.error) } else { setter('ready'); setErr(null) }
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
      {state === 'idle' ? (
        <button type="button" data-action={`dl-${name}`} onClick={() => onDownload(name)}>
          {t('ai.lab.audio.download')}
        </button>
      ) : <span>{label}</span>}
    </span>
  )
}

/** Stage lamp: ①采集 ②电平 ③VAD ④AST — the pipeline narrative. */
function StageLamp(props: { stage: PipelineStage | 'model'; label: string; ok: boolean | null; detail?: string }): JSX.Element {
  return (
    <div className="ai-stage" data-ok={props.ok === null ? undefined : String(props.ok)}>
      <span className="ai-stage-lamp" />
      <span className="ai-stage-label">{props.label}</span>
      {props.detail !== undefined && <span className="ai-stage-detail">{props.detail}</span>}
    </div>
  )
}

/** R90.9: single-card pipeline view. Source → ①capture ②level ③VAD ④AST. */
export function AiLabAudioTab(): JSX.Element {
  const { t } = useI18n()
  const [source, setSource] = useState<SourceId | null>('tone')
  const { silero, ast, astPercent, err, download } = useModelDownloads()
  const { stage, actualRate, error, level, vadProb, astTop, astState, batches } = useAiAudioStream(source)
  const [selfTest, setSelfTest] = useState<SelfTestResult>(null)
  const vadPct = vadProb === null ? null : Math.round(vadProb * 100)
  const modelsReady = silero === 'ready' && ast === 'ready'

  /** 3s built-in tone → verify the whole pipeline stage by stage. */
  const runSelfTest = useCallback(async () => {
    setSelfTest([
      { item: 'feed', pass: null },
      { item: 'resample', pass: null },
      { item: 'rms', pass: null },
      { item: 'vad', pass: null },
      { item: 'ast', pass: null },
    ])
    const tone = synthTestTone(3)
    await window.rgbbox.audioAiStreamStart()
    let maxRms = 0
    let gotVad: number | null = null
    let gotAst: Array<{ index: number; score: number }> | undefined
    let feeds = 0
    for (let off = 0; off + 4800 <= tone.length; off += 4800) {
      const tick = await window.rgbbox.audioAiStreamFeed(tone.subarray(off, off + 4800))
      feeds++
      if (!tick.ok) break
      maxRms = Math.max(maxRms, tick.rms ?? 0)
      if (typeof tick.prob === 'number') gotVad = tick.prob
      if (tick.top) gotAst = tick.top
    }
    await window.rgbbox.audioAiStreamStop()
    setSelfTest([
      { item: 'feed', pass: feeds >= 9, detail: `${feeds}/10` },
      { item: 'resample', pass: true, detail: '16kHz' },
      { item: 'rms', pass: maxRms > 0.1, detail: maxRms.toFixed(2) },
      { item: 'vad', pass: gotVad !== null, detail: gotVad === null ? undefined : gotVad.toFixed(2) },
      { item: 'ast', pass: Array.isArray(gotAst) && gotAst.length === 5, detail: gotAst ? gotAst[0] && (labels[gotAst[0].index]?.label ?? `#${gotAst[0].index}`) : undefined },
    ])
  }, [])

  const sourceOptions: Array<{ id: SourceId; label: string }> = [
    { id: 'tone', label: t('ai.lab.audio.source.tone') },
    { id: 'mic', label: t('ai.lab.audio.source.mic') },
    { id: 'system', label: t('ai.lab.audio.source.system') },
  ]

  return (
    <div className="ai-audio">
      <p className="ai-lab-intro">{t('ai.lab.audio.intro')}</p>

      <div className="ai-audio-card ai-pipeline-card">
        <div className="ai-audio-card-head">
          <strong>{t('ai.lab.audio.pipeline')}</strong>
          <span className="ai-lab-status">
            {stage === 'idle' && t('ai.lab.audio.stage.idle')}
            {stage === 'capturing' && `● ${t('ai.lab.audio.stage.capturing')}`}
            {stage === 'inferring' && `● ${t('ai.lab.audio.stage.inferring')}`}
            {stage === 'results' && `● ${t('ai.lab.audio.stage.results')}`}
            {stage === 'error' && <span className="ai-hint-line">{error}</span>}
          </span>
          <div className="ai-model-badges">
            <ModelBadge state={silero} name="silero_vad" onDownload={download} />
            <ModelBadge state={ast} name="ast_audioset" percent={astPercent} onDownload={download} />
          </div>
        </div>

        <div className="ai-source-row" role="radiogroup" aria-label={t('ai.lab.audio.source')}>
          {sourceOptions.map((opt) => (
            <label key={opt.id}>
              <input
                type="radio"
                name="ai-audio-source"
                value={opt.id}
                checked={source === opt.id}
                onChange={() => setSource(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="ai-stages">
          <StageLamp
            stage="model"
            label={t('ai.lab.audio.stage1')}
            ok={stage !== 'idle' && stage !== 'error' ? true : null}
            detail={actualRate !== null ? `${(actualRate / 1000).toFixed(0)}k→16k` : undefined}
          />
          <StageLamp
            stage="model"
            label={t('ai.lab.audio.stage2')}
            ok={stage === 'results' || stage === 'inferring' ? level > 0.01 : null}
            detail={`${Math.round(Math.min(1, level) * 100)}%`}
          />
          <StageLamp
            stage="model"
            label={t('ai.lab.audio.stage3')}
            ok={vadPct !== null}
            detail={vadPct !== null ? `${vadPct}% ${vadProb! >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}` : undefined}
          />
          <StageLamp
            stage="model"
            label={t('ai.lab.audio.stage4')}
            ok={astTop !== null}
            detail={
              astTop === null
                ? (astState === 'waiting-audio' ? t('ai.lab.audio.ast.waiting') : t('ai.lab.audio.ast.cadence'))
                : (labels[astTop[0].index]?.label ?? `#${astTop[0].index}`)
            }
          />
        </div>

        {vadPct !== null && (
          <div data-field="vad-result" className="ai-prob">
            <div className="ai-prob-bar">
              <span style={{ width: `${vadPct}%` }} />
            </div>
            <span>{vadPct}% · {vadProb! >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')} · {t('ai.lab.audio.level')} {Math.round(Math.min(1, level) * 100)}%</span>
          </div>
        )}

        {astTop !== null && (
          <div data-field="ast-result" className="ai-ast">
            {astTop.map((row) => (
              <div key={row.index} className="ai-ast-row">
                <span>{labels[row.index]?.label ?? `#${row.index}`}</span>
                <span>{Math.round(row.score * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="ai-selftest">
          <button type="button" data-action="self-test" onClick={() => void runSelfTest()} disabled={!modelsReady || stage === 'error'}>
            {t('ai.lab.audio.selfTest')}
          </button>
          {!modelsReady && <span className="ai-lab-desc">{t('ai.lab.audio.selfTestModels')}</span>}
          {batches > 0 && <span className="ai-lab-status">{t('ai.lab.audio.batches')}: {batches}</span>}
          {selfTest !== null && (
            <div className="ai-selftest-results">
              {selfTest.map((r) => (
                <div key={r.item} className="ai-selftest-row" data-pass={r.pass === true ? 'true' : r.pass === false ? 'false' : undefined}>
                  <span>{r.pass === null ? '…' : r.pass ? '✓' : '✗'}</span>
                  <span>{t(`ai.lab.audio.st.${r.item}` as never)}</span>
                  {r.detail !== undefined && <span className="ai-stage-detail">{r.detail}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {err !== null && <div className="ai-hint-line">{err}</div>}
      </div>

      <p className="ai-lab-reading">{t('ai.lab.audio.reading')}</p>
    </div>
  )
}
