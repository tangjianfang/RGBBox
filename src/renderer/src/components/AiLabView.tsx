import { useEffect, useState, type JSX } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { AI_PROVIDER_PRESETS, matchProviderPreset } from '../../../shared/aiProviders'
import type { AiChatMessage, AiChatOutcome } from '../../../shared/types'

type AiOutcome = { ok: boolean; text: string; hint?: 'nokey' | 'auth' | 'http' | 'parse' | 'network' }

interface AiLabConfig {
  baseUrl: string
  apiKey: string
  model: string
}

interface ChatTurn extends AiChatMessage {
  latencyMs?: number
  error?: string
}

type ConnState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number; model: string }
  | { kind: 'fail'; hint?: AiOutcome['hint'] }

/** R88: AI Lab — provider presets, connection test, chat playground, OCR tryout.
 *  Self-manages the config lifecycle (aiGetSettings/aiSetSettings); conversation
 *  and playground results are local state, wiped on unmount (not persisted). */
export function AiLabView(): JSX.Element {
  const { t } = useI18n()
  const [cfg, setCfg] = useState<AiLabConfig>({ baseUrl: '', apiKey: '', model: '' })
  const [loaded, setLoaded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' })
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [ocrInput, setOcrInput] = useState('')
  const [ocrResult, setOcrResult] = useState('')
  const [ocrHint, setOcrHint] = useState<AiOutcome['hint']>()
  const [ocrBusy, setOcrBusy] = useState<'cleanup' | 'translate' | null>(null)

  useEffect(() => {
    window.rgbbox.aiGetSettings().then((c) => {
      setCfg({ baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.model })
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const provider = matchProviderPreset(cfg.baseUrl)
  const modelOptions = provider.models
  const hintLine = (hint?: AiOutcome['hint']): string =>
    `${t('ai.lab.status.failed')} (${hint ?? 'unknown'})`

  const runTest = async () => {
    setConn({ kind: 'testing' })
    try {
      const out = await window.rgbbox.aiTestConnection()
      setConn(out.ok
        ? { kind: 'ok', latencyMs: out.latencyMs, model: cfg.model }
        : { kind: 'fail', hint: out.hint })
    } catch {
      setConn({ kind: 'fail', hint: 'network' })
    }
  }

  const save = async () => {
    const saved = await window.rgbbox.aiSetSettings(cfg)
    setCfg({ baseUrl: saved.baseUrl, apiKey: saved.apiKey, model: saved.model })
    void runTest()
  }

  const resetDefaults = () => {
    const zhipu = AI_PROVIDER_PRESETS.find((p) => p.id === 'zhipu')!
    setCfg({ baseUrl: zhipu.baseUrl, apiKey: '', model: zhipu.models[0] })
    setConn({ kind: 'idle' })
  }

  const onProviderChange = (id: string) => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === id)
    if (!preset) return
    if (preset.id === 'custom') {
      setCfg({ ...cfg, baseUrl: '' })
      return
    }
    setCfg({ ...cfg, baseUrl: preset.baseUrl, model: preset.models[0] })
  }

  const sendChat = async () => {
    const content = chatInput.trim()
    if (!content || chatBusy) return
    setChatInput('')
    setChatBusy(true)
    setChat((h) => [...h, { role: 'user', content }])
    try {
      const history: AiChatMessage[] = [
        ...chat.map(({ role, content: c }) => ({ role, content: c })),
        { role: 'user', content },
      ]
      const out: AiChatOutcome = await window.rgbbox.aiChat(history)
      if (out.ok) {
        setChat((h) => [...h, { role: 'assistant', content: out.text, latencyMs: out.latencyMs }])
      } else {
        setChat((h) => [...h, { role: 'assistant', content: '', error: out.hint ?? 'network' }])
      }
    } catch {
      setChat((h) => [...h, { role: 'assistant', content: '', error: 'network' }])
    } finally {
      setChatBusy(false)
    }
  }

  const runOcr = async (mode: 'cleanup' | 'translate') => {
    const text = ocrInput.trim()
    if (!text || ocrBusy) return
    setOcrBusy(mode)
    setOcrResult('')
    setOcrHint(undefined)
    try {
      const out: AiOutcome = mode === 'cleanup'
        ? await window.rgbbox.aiCleanupText(text)
        : await window.rgbbox.aiTranslateText(text)
      if (out.ok) setOcrResult(out.text)
      else setOcrHint(out.hint)
    } catch {
      setOcrHint('network')
    } finally {
      setOcrBusy(null)
    }
  }

  return (
    <div className="ai-lab">
      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('ai.lab.group.connection')}</summary>
        <div className="ai-conn">
          <span className={`ai-status dash-dot${conn.kind === 'ok' ? ' on' : ''}`}>
            {conn.kind === 'idle' && t('ai.lab.status.disconnected')}
            {conn.kind === 'testing' && '…'}
            {conn.kind === 'ok' && `${t('ai.lab.status.connected')} · ${conn.model} · ${conn.latencyMs} ms`}
            {conn.kind === 'fail' && hintLine(conn.hint)}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={runTest}
            disabled={conn.kind === 'testing' || !loaded}
            aria-label={t('ai.lab.test')}
            title={t('ai.lab.test')}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </details>

      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('ai.lab.group.config')}</summary>
        <div className="ai-config">
          <label>
            <span>{t('ai.lab.provider')}</span>
            <select data-field="provider" value={provider.id} onChange={(e) => onProviderChange(e.target.value)}>
              {AI_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label || t('ai.lab.providerCustom')}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('ai.baseUrl')}</span>
            <input data-field="baseUrl" value={cfg.baseUrl} placeholder="https://…" onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
          </label>
          <label>
            <span>{t('ai.model')}</span>
            <input data-field="model" list="ai-model-options" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
            <datalist id="ai-model-options">
              {modelOptions.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
          <label>
            <span>{t('ai.apiKey')}</span>
            <span className="ai-key-row">
              <input
                data-field="apiKey"
                type={showKey ? 'text' : 'password'}
                value={cfg.apiKey}
                autoComplete="new-password"
                spellCheck={false}
                onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
              />
              <button
                type="button"
                className="icon-button"
                data-action="toggle-key"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}
                title={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
          <p className="ai-privacy-note">{t('ai.privacyNote')}</p>
          <div className="ai-config-actions">
            <button type="button" data-action="reset" onClick={resetDefaults}>{t('ai.lab.reset')}</button>
            <button type="button" data-action="save" onClick={save} disabled={!loaded}>{t('ai.lab.save')}</button>
          </div>
        </div>
      </details>

      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('ai.lab.group.chat')}</summary>
        <div className="ai-chat">
          {cfg.apiKey === '' && <p className="ai-hint-line">{hintLine('nokey')}</p>}
          <div className="ai-chat-log">
            {chat.map((turn, i) => (
              <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
                <span className="ai-msg-role">{turn.role}</span>
                {turn.error !== undefined
                  ? <span className="ai-msg-error">{hintLine(turn.error as AiOutcome['hint'])}</span>
                  : <span className="ai-msg-text">{turn.content}{turn.latencyMs !== undefined ? ` (${turn.latencyMs} ms)` : ''}</span>}
              </div>
            ))}
          </div>
          <div className="ai-chat-input-row">
            <textarea
              data-field="chat-input"
              value={chatInput}
              placeholder={t('ai.lab.chat.placeholder')}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat() } }}
            />
            <button type="button" data-action="send" onClick={sendChat} disabled={chatBusy || chatInput.trim() === ''}>{t('ai.lab.chat.send')}</button>
            <button type="button" data-action="clear-chat" onClick={() => setChat([])} disabled={chat.length === 0}>{t('ai.lab.chat.clear')}</button>
          </div>
        </div>
      </details>

      <details open className="dash-group">
        <summary><span className="dash-group-arrow" aria-hidden="true">▼</span> {t('ai.lab.group.ocr')}</summary>
        <div className="ai-ocr">
          <textarea
            data-field="ocr-input"
            value={ocrInput}
            placeholder={t('ai.lab.ocr.input')}
            onChange={(e) => setOcrInput(e.target.value)}
          />
          <div className="ai-ocr-actions">
            <button type="button" data-action="ocr-cleanup" onClick={() => runOcr('cleanup')} disabled={ocrBusy !== null || ocrInput.trim() === ''}>
              {t('ai.lab.ocr.cleanup')}
            </button>
            <button type="button" data-action="ocr-translate" onClick={() => runOcr('translate')} disabled={ocrBusy !== null || ocrInput.trim() === ''}>
              {t('ai.lab.ocr.translate')}
            </button>
          </div>
          {ocrHint !== undefined && <p className="ai-hint-line">{hintLine(ocrHint)}</p>}
          <textarea className="ai-ocr-result" data-field="ocr-result" value={ocrResult} placeholder={t('ai.lab.ocr.result')} readOnly />
        </div>
      </details>
    </div>
  )
}
