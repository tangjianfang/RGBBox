import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Download, FolderOpen, Mic, Play, Square, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import {
  applyLexicon, detectLang, formatBytes, loadLexicon, normalizeText, saveLexicon, splitSentences,
  type LexiconEntry,
} from '../domain/voiceScribe'
import type { TtsEngineStatus, TtsModelProgress } from '../../../shared/types'

/**
 * 声文 VoiceScribe — R173-S1 朗读器(P1 骨架)。
 * 引擎两档:系统 speechSynthesis(默认,零依赖)与 Kokoro 离线引擎(R173-S2,
 * 经 ttsSynthesize IPC;未就绪时禁用并提示)。词典钉音只作用于朗读文本。
 */
export function AiLabVoiceTab(): JSX.Element {
  const { t } = useI18n()
  // R175: the composition draft survives restarts (same contract as the
  // agent tab draft) — long textbook pastes never vanish on a crash.
  const [text, setText] = useState(() => {
    try { return localStorage.getItem('rgbbox:voiceDraft') ?? '' } catch { return '' }
  })
  const [rate, setRate] = useState(1)
  const [engine, setEngine] = useState<'system' | 'kokoro'>('system')
  const [ttsStatus, setTtsStatus] = useState<TtsEngineStatus | null>(null)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [lexicon, setLexicon] = useState<LexiconEntry[]>([])
  const [newWord, setNewWord] = useState('')
  const [newRespell, setNewRespell] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const kokoroUrlRef = useRef<string | null>(null)

  const [dlProgress, setDlProgress] = useState<Record<string, TtsModelProgress>>({})
  const [downloading, setDownloading] = useState(false)
  const [dlError, setDlError] = useState<string | null>(null)

  useEffect(() => {
    setLexicon(loadLexicon(localStorage))
    void window.rgbbox.ttsEngineStatus().then(setTtsStatus).catch(() => setTtsStatus(null))
  }, [])

  // R179: per-file download progress events → refresh status on completion
  useEffect(() => {
    const off = window.rgbbox.onTtsModelProgress((ev) => {
      setDlProgress((prev) => ({ ...prev, [ev.path]: ev }))
      if (ev.done && !ev.error) void window.rgbbox.ttsEngineStatus().then(setTtsStatus).catch(() => undefined)
    })
    return off
  }, [])

  const startDownload = async (): Promise<void> => {
    if (downloading) return
    setDownloading(true)
    setDlError(null)
    try {
      const out = await window.rgbbox.ttsModelDownload()
      if (!out.ok) setDlError(out.error ?? 'network')
      void window.rgbbox.ttsEngineStatus().then(setTtsStatus).catch(() => undefined)
    } finally {
      setDownloading(false)
    }
  }

  const modelReady = ttsStatus?.complete === true
  const modelTotal = ttsStatus?.files.reduce((a, f) => a + f.bytes, 0) ?? 0
  const modelDone = ttsStatus?.files.reduce((a, f) => a + (f.present ? f.bytes : 0), 0) ?? 0
    + Object.values(dlProgress).filter((e) => !e.done).reduce((a, e) => a + e.receivedBytes, 0)

  const sentences = useMemo(() => splitSentences(text), [text])
  const lang = useMemo(() => detectLang(text), [text])
  const speechTexts = useMemo(() => sentences.map((s) => applyLexicon(s, lexicon)), [sentences, lexicon])

  const stopAll = (): void => {
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (kokoroUrlRef.current) { URL.revokeObjectURL(kokoroUrlRef.current); kokoroUrlRef.current = null }
    setPlaying(false)
    setCurrentIdx(-1)
  }

  // 系统引擎:句级队列 + 高亮跟读
  const speakFrom = (startIdx: number): void => {
    if (typeof window.speechSynthesis === 'undefined') { setVoiceError('speech-unavailable'); return }
    window.speechSynthesis.cancel()
    setVoiceError(null)
    setPlaying(true)
    const queue = speechTexts.slice(startIdx)
    queue.forEach((sentence, i) => {
      const u = new SpeechSynthesisUtterance(sentence)
      u.lang = lang === 'zh' ? 'zh-CN' : 'en-US'
      u.rate = rate
      u.onstart = () => setCurrentIdx(startIdx + i)
      if (i === queue.length - 1) u.onend = () => { setPlaying(false); setCurrentIdx(-1) }
      window.speechSynthesis.speak(u)
    })
  }

  const kokoroSynth = async (): Promise<void> => {
    if (busy || sentences.length === 0) return
    setBusy(true)
    setVoiceError(null)
    try {
      const out = await window.rgbbox.ttsSynthesize(speechTexts, { speed: rate })
      if (!out.ok || !out.wav) { setVoiceError(out.error ?? 'synthesis'); return }
      if (kokoroUrlRef.current) URL.revokeObjectURL(kokoroUrlRef.current)
      kokoroUrlRef.current = URL.createObjectURL(new Blob([out.wav], { type: 'audio/wav' }))
      const el = audioRef.current
      if (el) {
        el.src = kokoroUrlRef.current
        void el.play()
        setPlaying(true)
      }
    } catch { setVoiceError('network') } finally { setBusy(false) }
  }

  const exportWav = async (): Promise<void> => {
    if (busy || sentences.length === 0) return
    setBusy(true)
    try {
      const out = await window.rgbbox.ttsExport(speechTexts, { speed: rate })
      if (!out.ok) setVoiceError(out.error ?? 'synthesis')
    } finally { setBusy(false) }
  }

  const addEntry = (): void => {
    const word = newWord.trim()
    const respell = newRespell.trim()
    if (word === '' || respell === '') return
    const next = [...lexicon.filter((e) => e.word !== word), { word, respell }]
    setLexicon(next)
    saveLexicon(next, localStorage)
    setNewWord('')
    setNewRespell('')
  }

  const removeEntry = (word: string): void => {
    const next = lexicon.filter((e) => e.word !== word)
    setLexicon(next)
    saveLexicon(next, localStorage)
  }

  const kokoroReady = ttsStatus?.kokoroInstalled === true && modelReady

  return (
    <div className="vs-tab">
      <div className="vs-main">
        <textarea
          className="vs-text"
          data-field="vs-text"
          value={text}
          placeholder={t('ai.voice.textPlaceholder')}
          onChange={(e) => {
            setText(e.target.value)
            try { localStorage.setItem('rgbbox:voiceDraft', e.target.value) } catch { /* best-effort */ }
          }}
        />
        <div className="vs-toolbar">
          <select data-field="vs-engine" value={engine} onChange={(e) => { stopAll(); setEngine(e.target.value as 'system' | 'kokoro') }} aria-label={t('ai.voice.engine')}>
            <option value="system">{t('ai.voice.engineSystem')}</option>
            <option value="kokoro" disabled={!kokoroReady}>{t('ai.voice.engineKokoro')}</option>
          </select>
          <label className="vs-rate">
            <span>{t('ai.voice.rate')}</span>
            <input data-field="vs-rate" type="range" min={0.5} max={2} step={0.05} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            <span>{rate.toFixed(2)}×</span>
          </label>
          {engine === 'system' ? (
            <>
              <button type="button" className="video-btn" data-action="vs-play" onClick={() => (playing ? stopAll() : speakFrom(0))} disabled={sentences.length === 0}>
                {playing ? <Square size={13} /> : <Play size={13} />}
              </button>
            </>
          ) : (
            <button type="button" className="video-btn" data-action="vs-kokoro" onClick={() => void kokoroSynth()} disabled={busy || sentences.length === 0 || !kokoroReady}>
              {busy ? '…' : <Play size={13} />}
            </button>
          )}
          <button type="button" className="video-btn" data-action="vs-stop" onClick={stopAll} disabled={!playing}>
            <Square size={13} />
          </button>
          <button type="button" className="video-btn" data-action="vs-export" onClick={() => void exportWav()} disabled={busy || sentences.length === 0 || !kokoroReady} title={kokoroReady ? '' : t('ai.voice.kokoroNeeded')}>
            <Download size={13} />
          </button>
          <span className="vs-count">{lang === 'zh' ? '中文' : 'EN'} · {sentences.length} {t('ai.voice.sentences')}</span>
        </div>
        {/* R179: 模型依赖栏——URL/流程/进度直显,下载与重试就地完成 */}
        <div className="vs-model-panel" data-field="vs-models">
          <div className="vs-model-head">
            <strong>{t('ai.voice.models')}</strong>
            {modelReady ? (
              <span className="vs-model-chip ok">✓ {t('ai.voice.modelReady')}</span>
            ) : (
              <button
                type="button"
                className="video-btn"
                data-action="vs-model-download"
                onClick={() => { void startDownload() }}
                disabled={downloading || ttsStatus?.kokoroInstalled !== true}
              >
                {downloading ? t('ai.voice.downloading') : t('ai.voice.download')}
              </button>
            )}
          </div>
          {ttsStatus?.kokoroInstalled !== true && <p className="ai-hint-line">{t('ai.voice.kokoroNeeded')}</p>}
          <div className="vs-model-bar">
            <div className="vs-model-bar-fill" style={{ width: `${modelTotal > 0 ? Math.min(100, Math.round((modelDone / modelTotal) * 100)) : 0}%` }} />
          </div>
          <span className="vs-model-count">{modelTotal > 0 ? `${Math.min(100, Math.round((modelDone / modelTotal) * 100))}% · ${(modelTotal / 1048576).toFixed(0)} MB` : ''}</span>
          <ul className="vs-model-list">
            {(ttsStatus?.files ?? []).map((f) => {
              const prog = dlProgress[f.path]
              const pct = prog ? Math.min(100, Math.round((prog.receivedBytes / Math.max(1, prog.totalBytes)) * 100)) : f.present ? 100 : 0
              const isDone = f.present || prog?.done === true
              const isDownloading = prog !== undefined && prog.done !== true
              // R183: the size column is a nowrap tail cluster pinned right —
              // the old inline spans overflowed the row and clipped ("/ 29…").
              const sizeText = isDone
                ? formatBytes(f.actualBytes ?? f.bytes)
                : `${formatBytes(isDownloading ? prog.receivedBytes : 0)} / ${formatBytes(prog?.totalBytes ?? f.bytes)}`
              return (
                <li key={f.path} className={isDone ? 'done-row' : ''} title={`https://hf-mirror.com/onnx-community/kokoro-82M-v1.0-ONNX/resolve/main/${f.path}`}>
                  <span className={isDone ? 'ok' : ''}>{isDone ? '✓' : isDownloading ? '⇣' : '·'}</span>
                  <code>{f.path}</code>
                  <span className="vs-model-meta">
                    {isDownloading && <span className="vs-model-inline-bar"><span className="vs-model-inline-bar-fill" style={{ width: `${pct}%` }} /></span>}
                    <span className="vs-model-size">{sizeText}</span>
                    {!f.present && isDownloading && <span className="vs-model-pct">{pct}%</span>}
                    {prog?.error && <span className="vs-model-err">{prog.error}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          {dlError && <p className="ai-hint-line">{t(`ai.voice.err.${dlError === 'already-downloading' ? 'downloading' : 'network'}` as Parameters<typeof t>[0])}</p>}
        </div>
        {voiceError && <p className="ai-hint-line">{t(`ai.voice.err.${voiceError}` as never)}</p>}
        <audio ref={audioRef} onEnded={() => { setPlaying(false); setCurrentIdx(-1) }} hidden />
      </div>

      <aside className="vs-side">
        <div className="vs-lexicon">
          <h4><Mic size={13} /> {t('ai.voice.lexicon')}</h4>
          <div className="vs-lexicon-add">
            <input data-field="vs-word" value={newWord} placeholder={t('ai.voice.word')} onChange={(e) => setNewWord(e.target.value)} />
            <input data-field="vs-respell" value={newRespell} placeholder={t('ai.voice.respell')} onChange={(e) => setNewRespell(e.target.value)} />
            <button type="button" className="video-btn" data-action="vs-add" onClick={addEntry} disabled={newWord.trim() === '' || newRespell.trim() === ''}>+</button>
          </div>
          {lexicon.length === 0 ? (
            <p className="ai-hint-line">{t('ai.voice.lexiconEmpty')}</p>
          ) : (
            <ul className="vs-lexicon-list">
              {lexicon.map((e) => (
                <li key={e.word}>
                  <span className="vs-word">{e.word}</span>
                  <span className="vs-arrow">→</span>
                  <span className="vs-respell">{e.respell}</span>
                  <button type="button" className="video-btn" data-action="vs-del" onClick={() => removeEntry(e.word)} aria-label={t('ai.voice.remove')}><Trash2 size={11} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {sentences.length > 0 && (
          <div className="vs-sentences">
            <h4><FolderOpen size={13} /> {t('ai.voice.preview')}</h4>
            <ol className="vs-sentence-list">
              {sentences.map((s, i) => {
                const display = normalizeText(s).slice(0, 120)
                return (
                  <li
                    key={i}
                    className={i === currentIdx ? 'current' : ''}
                    title={normalizeText(s)}
                    onClick={() => { if (engine === 'system') speakFrom(i) }}
                  >
                    <span className="vs-sentence-idx">{i + 1}</span>
                    <span className="vs-sentence-text" style={{ cursor: engine === 'system' ? 'pointer' : 'default' }}>{display}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </aside>
    </div>
  )
}
