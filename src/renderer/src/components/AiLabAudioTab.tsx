import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n, type TranslationKey } from '../i18n'
import { startAudioRecorder, type AudioRecorderHandle } from '../tools/audioRecorder'
import labels from '../assets/audioset-labels.json'

const RECORD_SECONDS = 3
const VAD_THRESHOLD = 0.5

type CardState =
  | { kind: 'checking' }
  | { kind: 'not-downloaded' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready' }

type InferState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'running' }
  | { kind: 'error'; hint: string }

/** R90 P1: audio AI test cards — Silero VAD + AST AudioSet, recorded from the mic.
 *  Capture only runs while this tab is mounted (unmount stops the recorder). */
export function AiLabAudioTab(): JSX.Element {
  const { t } = useI18n()
  const [vadCard, setVadCard] = useState<CardState>({ kind: 'checking' })
  const [astCard, setAstCard] = useState<CardState>({ kind: 'checking' })
  const [vadInfer, setVadInfer] = useState<InferState>({ kind: 'idle' })
  const [astInfer, setAstInfer] = useState<InferState>({ kind: 'idle' })
  const [vadProb, setVadProb] = useState<number | null>(null)
  const [astTop, setAstTop] = useState<Array<{ index: number; score: number }> | null>(null)
  const recorderRef = useRef<AudioRecorderHandle | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.rgbbox.audioAiStatus()
      setVadCard(s.sileroCached ? { kind: 'ready' } : { kind: 'not-downloaded' })
      setAstCard(s.astCached ? { kind: 'ready' } : { kind: 'not-downloaded' })
    } catch {
      setVadCard({ kind: 'not-downloaded' })
      setAstCard({ kind: 'not-downloaded' })
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    return () => { void recorderRef.current?.stop() } // stop capture on unmount
  }, [refreshStatus])

  const download = (name: string) => {
    void window.rgbbox.modelDownload(name)
    if (name === 'silero_vad') setVadCard({ kind: 'downloading', percent: 0 })
    else setAstCard({ kind: 'downloading', percent: 0 })
    // the existing modelDownloadProgress events update the 3D view; here we
    // simply poll status until the file lands (test-lab simplicity, R90 P1)
    const poll = window.setInterval(() => {
      void window.rgbbox.audioAiStatus().then((s) => {
        const done = name === 'silero_vad' ? s.sileroCached : s.astCached
        if (done) {
          window.clearInterval(poll)
          if (name === 'silero_vad') setVadCard({ kind: 'ready' })
          else setAstCard({ kind: 'ready' })
        } else {
          const bump = (p: CardState): CardState =>
            p.kind === 'downloading' ? { kind: 'downloading', percent: Math.min(p.percent + 7, 95) } : p
          if (name === 'silero_vad') setVadCard(bump)
          else setAstCard(bump)
        }
      })
    }, 1500)
  }

  const runCard = async (kind: 'vad' | 'ast') => {
    const setInfer = kind === 'vad' ? setVadInfer : setAstInfer
    if (recorderRef.current) return
    setInfer({ kind: 'recording' })
    try {
      const handle = await startAudioRecorder(RECORD_SECONDS)
      recorderRef.current = handle
      const pcm = await handle.stop()
      recorderRef.current = null
      setInfer({ kind: 'running' })
      if (kind === 'vad') {
        const r = await window.rgbbox.audioAiRunVad(pcm)
        if (r.ok && typeof r.prob === 'number') {
          setVadProb(r.prob)
          setInfer({ kind: 'idle' })
        } else {
          if (r.hint === 'not-downloaded') setVadCard({ kind: 'not-downloaded' })
          setVadInfer({ kind: 'error', hint: r.hint ?? 'parse' })
        }
      } else {
        const r = await window.rgbbox.audioAiRunAst(pcm)
        if (r.ok && r.top) {
          setAstTop(r.top)
          setInfer({ kind: 'idle' })
        } else {
          if (r.hint === 'not-downloaded') setAstCard({ kind: 'not-downloaded' })
          setAstInfer({ kind: 'error', hint: r.hint ?? 'parse' })
        }
      }
    } catch {
      recorderRef.current = null
      setInfer({ kind: 'error', hint: 'parse' })
    }
  }

  const cardHeader = (titleKey: TranslationKey, card: CardState, infer: InferState, modelName: string, actionSuffix: string) => (
    <div className="ai-audio-card-head">
      <strong>{t(titleKey)}</strong>
      {card.kind === 'not-downloaded' && (
        <button type="button" data-action={`download-${modelName}`} onClick={() => download(modelName)}>
          {t('ai.lab.audio.download')}
        </button>
      )}
      {card.kind === 'downloading' && <span className="ai-lab-status">{t('ai.lab.audio.progress')} {card.percent}%</span>}
      {card.kind === 'ready' && (
        <button
          type="button"
          data-action={`record-${actionSuffix}`}
          disabled={infer.kind === 'recording' || infer.kind === 'running'}
          onClick={() => void runCard(actionSuffix as 'vad' | 'ast')}
        >
          {infer.kind === 'recording' ? t('ai.lab.audio.recording') : t('ai.lab.audio.record')}
        </button>
      )}
      {infer.kind === 'running' && <span className="ai-lab-status">…</span>}
      {infer.kind === 'error' && <span className="ai-hint-line">{t('ai.lab.audio.needModel')}</span>}
    </div>
  )

  return (
    <div className="ai-audio">
      <div className="ai-audio-card">
        {cardHeader('ai.lab.audio.title.vad', vadCard, vadInfer, 'silero_vad', 'vad')}
        <p className="ai-lab-desc">{t('ai.lab.audio.desc.vad')}</p>
        {vadProb !== null && (
          <div data-field="vad-result" className="ai-prob">
            <div className="ai-prob-bar">
              <span style={{ width: `${Math.round(vadProb * 100)}%` }} />
            </div>
            <span>
              {Math.round(vadProb * 100)}% ·{' '}
              {vadProb >= VAD_THRESHOLD ? t('ai.lab.audio.vad.speech') : t('ai.lab.audio.vad.quiet')}
            </span>
          </div>
        )}
      </div>

      <div className="ai-audio-card">
        {cardHeader('ai.lab.audio.title.ast', astCard, astInfer, 'ast_audioset', 'ast')}
        <p className="ai-lab-desc">{t('ai.lab.audio.desc.ast')}</p>
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
      </div>
    </div>
  )
}
