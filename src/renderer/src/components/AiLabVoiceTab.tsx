import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Download, FolderOpen, Mic, Play, Square, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import {
  applyLexicon, detectLang, loadLexicon, normalizeText, saveLexicon, splitSentences,
  type LexiconEntry,
} from '../domain/voiceScribe'
import type { TtsEngineStatus } from '../../../shared/types'

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

  useEffect(() => {
    setLexicon(loadLexicon(localStorage))
    void window.rgbbox.ttsEngineStatus().then(setTtsStatus).catch(() => setTtsStatus(null))
  }, [])

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

  const kokoroReady = ttsStatus?.kokoroInstalled === true

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
        {engine === 'kokoro' && kokoroReady && ttsStatus?.modelHint === 'first-synthesis-downloads' && (
          <p className="ai-hint-line">{t('ai.voice.kokoroDownloadHint')}</p>
        )}
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
              {sentences.map((s, i) => (
                <li
                  key={i}
                  className={i === currentIdx ? 'current' : ''}
                  onClick={() => { if (engine === 'system') speakFrom(i) }}
                >
                  {normalizeText(s).slice(0, 120)}
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </div>
  )
}
