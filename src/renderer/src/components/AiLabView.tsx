import { useEffect, useState, type JSX } from 'react'
import { Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { AI_PROVIDER_PRESETS, isKeylessLocal, matchProviderPreset } from '../../../shared/aiProviders'
import type { AiChatMessage, AiChatOutcome, AiErrorHint, AiProfile } from '../../../shared/types'

interface ChatTurn extends AiChatMessage {
  latencyMs?: number
  error?: AiErrorHint
}

type ConnState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number; model: string }
  | { kind: 'fail'; hint?: AiErrorHint }

type AiLabTab = 'config' | 'chat' | 'ocr'

interface EditMirror {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

/** Max turns sent to aiChat (preload caps at 40) with headroom for the new message. */
const REPLAY_WINDOW = 38
/** Per-message replay cap (preload caps content at 32k chars). */
const REPLAY_CHAR_CAP = 30_000

const EMPTY_MIRROR: EditMirror = { name: '', baseUrl: '', apiKey: '', model: '' }

function mirrorOf(p: AiProfile | null): EditMirror {
  return p ? { name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model } : { ...EMPTY_MIRROR }
}

/** R88/R89: AI Lab — tabbed (config / chat / ocr) with named model profiles.
 *  Self-manages the profile lifecycle (aiGetProfiles / aiSaveProfile / …);
 *  conversation and playground results are local state, wiped on unmount. */
export function AiLabView(): JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<AiLabTab>('config')
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [activeId, setActiveId] = useState('')
  const [editId, setEditId] = useState('')
  const [cfg, setCfg] = useState<EditMirror>({ ...EMPTY_MIRROR })
  const [loaded, setLoaded] = useState(false)
  const [unreadableIds, setUnreadableIds] = useState<string[]>([])
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' })
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [ocrInput, setOcrInput] = useState('')
  const [ocrResult, setOcrResult] = useState('')
  const [ocrHint, setOcrHint] = useState<AiErrorHint>()
  const [ocrBusy, setOcrBusy] = useState<'cleanup' | 'translate' | null>(null)

  useEffect(() => {
    window.rgbbox.aiGetProfiles().then((c) => {
      setProfiles(c.profiles)
      setActiveId(c.activeId)
      setEditId(c.activeId)
      setCfg(mirrorOf(c.profiles.find((p) => p.id === c.activeId) ?? null))
      setUnreadableIds(c.unreadableIds ?? [])
      setEncryptionAvailable(c.encryptionAvailable !== false)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null
  const provider = matchProviderPreset(cfg.baseUrl)
  const hintLine = (hint?: AiErrorHint): string => `${t('ai.lab.status.failed')} (${hint ?? 'unknown'})`
  const activeKeyless = activeProfile !== null && activeProfile.apiKey === '' && !isKeylessLocal(activeProfile.baseUrl)

  const upsertLocal = (saved: AiProfile) => {
    setProfiles((list) => {
      const idx = list.findIndex((p) => p.id === saved.id)
      if (idx >= 0) { const next = [...list]; next[idx] = saved; return next }
      return [...list, saved]
    })
  }

  /** Auto-save the edited profile (R89: 配置好之后自动保存); skips empty drafts. */
  const commitEdits = async (): Promise<AiProfile | null> => {
    if (!loaded) return null
    if (cfg.baseUrl.trim() === '' && cfg.model.trim() === '') return null
    const saved = await window.rgbbox.aiSaveProfile({ id: editId, ...cfg })
    upsertLocal(saved)
    if (saved.id !== editId) setEditId(saved.id)
    return saved
  }

  const selectProfile = async (id: string) => {
    if (id === editId) return
    await commitEdits()
    setEditId(id)
    setCfg(mirrorOf(profiles.find((p) => p.id === id) ?? null))
    setConn({ kind: 'idle' })
  }

  const newProfile = async () => {
    await commitEdits()
    const zhipu = AI_PROVIDER_PRESETS.find((p) => p.id === 'zhipu')!
    const created = await window.rgbbox.aiSaveProfile({
      id: '', name: '', baseUrl: zhipu.baseUrl, apiKey: '', model: zhipu.models[0],
    })
    upsertLocal(created)
    setEditId(created.id)
    setCfg(mirrorOf(created))
    setConn({ kind: 'idle' })
  }

  const deleteProfile = async () => {
    if (editId === '') return
    await window.rgbbox.aiDeleteProfile(editId)
    const fresh = await window.rgbbox.aiGetProfiles()
    setProfiles(fresh.profiles)
    setActiveId(fresh.activeId)
    setEditId(fresh.activeId)
    setCfg(mirrorOf(fresh.profiles.find((p) => p.id === fresh.activeId) ?? null))
    setUnreadableIds(fresh.unreadableIds ?? [])
    setConn({ kind: 'idle' })
  }

  const setActive = async () => {
    const saved = await commitEdits()
    const id = saved?.id ?? editId
    if (id === '') return
    await window.rgbbox.aiSetActiveProfile(id)
    setActiveId(id)
  }

  const switchTab = (next: AiLabTab) => {
    if (tab === 'config' && next !== 'config') void commitEdits()
    setTab(next)
  }

  const runTest = async () => {
    setConn({ kind: 'testing' })
    try {
      // R89: test the EDITED profile directly — no save, no active switch needed.
      const out = await window.rgbbox.aiTestConnection({
        baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
      })
      setConn(out.ok
        ? { kind: 'ok', latencyMs: out.latencyMs, model: cfg.model.trim() || 'glm-5.3-flash' }
        : { kind: 'fail', hint: out.hint })
    } catch {
      setConn({ kind: 'fail', hint: 'network' })
    }
  }

  const sendChat = async () => {
    const content = chatInput.trim()
    if (!content || chatBusy) return
    setChatInput('')
    setChatBusy(true)
    setChat((h) => [...h, { role: 'user', content }])
    try {
      // R88 review fix: replay only clean turns (error turns with empty content
      // get strict providers 400-ing), cap per-message length and window size
      // so the preload validator (≤40 turns, ≤32k chars) never rejects a send.
      const replayable = chat
        .filter((turn) => turn.error === undefined && turn.content.trim() !== '')
        .map(({ role, content: c }) => ({
          role,
          content: c.length > REPLAY_CHAR_CAP ? c.slice(0, REPLAY_CHAR_CAP) + '…' : c,
        }))
        .slice(-REPLAY_WINDOW)
      const history: AiChatMessage[] = [...replayable, { role: 'user', content }]
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
      const out: { ok: boolean; text: string; hint?: AiErrorHint } = mode === 'cleanup'
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

  const banner = (
    <div className="ai-active-banner">
      <span>{t('ai.lab.activeNow')}</span>
      <strong>{activeProfile?.name ?? '—'}</strong>
      <select
        data-field="active-profile"
        value={activeId}
        onChange={(e) => {
          void window.rgbbox.aiSetActiveProfile(e.target.value).then(() => setActiveId(e.target.value))
        }}
      >
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )

  return (
    <div className="ai-lab">
      <div className="ai-tabs" role="tablist" aria-label="AI Lab sections">
        {(['config', 'chat', 'ocr'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-tab={key}
            aria-selected={tab === key}
            className={`ai-tab${tab === key ? ' active' : ''}`}
            onClick={() => switchTab(key)}
          >
            {t(`ai.lab.tab.${key}` as const)}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="ai-config-panel">
          <div className="ai-profile-row">
            <select data-field="profile" value={editId} onChange={(e) => void selectProfile(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="icon-button" data-action="new-profile" onClick={newProfile}
              aria-label={t('ai.lab.profileNew')} title={t('ai.lab.profileNew')}>
              <Plus size={15} />
            </button>
            <button type="button" className="icon-button" data-action="delete-profile" onClick={deleteProfile}
              disabled={profiles.length === 0}
              aria-label={t('ai.lab.profileDelete')} title={t('ai.lab.profileDelete')}>
              <Trash2 size={15} />
            </button>
          </div>

          <div className="ai-conn">
            <span className={`ai-status dash-dot${conn.kind === 'ok' ? ' on' : ''}`}>
              {conn.kind === 'idle' && t('ai.lab.status.disconnected')}
              {conn.kind === 'testing' && '…'}
              {conn.kind === 'ok' && `${t('ai.lab.status.connected')} · ${conn.model} · ${conn.latencyMs} ms`}
              {conn.kind === 'fail' && hintLine(conn.hint)}
            </span>
            <button type="button" className="icon-button" data-action="test" onClick={runTest}
              disabled={conn.kind === 'testing' || !loaded}
              aria-label={t('ai.lab.test')} title={t('ai.lab.test')}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="ai-config">
            <label>
              <span>{t('ai.lab.name')}</span>
              <input data-field="name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
            </label>
            <label>
              <span>{t('ai.lab.provider')}</span>
              <select data-field="provider" value={provider.id}
                onChange={(e) => {
                  const preset = AI_PROVIDER_PRESETS.find((p) => p.id === e.target.value)
                  if (!preset) return
                  if (preset.id === 'custom') { setCfg({ ...cfg, baseUrl: '' }); return }
                  setCfg({ ...cfg, baseUrl: preset.baseUrl, model: preset.models[0] })
                }}>
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
                {provider.models.map((m) => <option key={m} value={m} />)}
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
                  onChange={(e) => { setCfg({ ...cfg, apiKey: e.target.value }); setUnreadableIds((ids) => ids.filter((i) => i !== editId)) }}
                />
                <button type="button" className="icon-button" data-action="toggle-key" onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}
                  title={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}>
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
            <p className="ai-privacy-note">{t(encryptionAvailable ? 'ai.privacyNote' : 'ai.privacyNotePlain')}</p>
            {unreadableIds.includes(editId) && <p className="ai-hint-line">{t('ai.lab.keyUnreadable')}</p>}
            <div className="ai-config-actions">
              <button type="button" data-action="save" onClick={() => void commitEdits()} disabled={!loaded}>{t('ai.lab.save')}</button>
              <button type="button" data-action="set-active" onClick={() => void setActive()} disabled={!loaded || editId === ''}>{t('ai.lab.setActive')}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'chat' && (
        <div className="ai-chat">
          {banner}
          {activeKeyless && <p className="ai-hint-line">{hintLine('nokey')}</p>}
          <div className="ai-chat-log">
            {chat.map((turn, i) => (
              <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
                <span className="ai-msg-role">{turn.role}</span>
                {turn.error !== undefined
                  ? <span className="ai-msg-error">{hintLine(turn.error)}</span>
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
              onKeyDown={(e) => {
                // IME composition guard (R88 review fix): Enter that confirms
                // a CJK composition must not send — same guard as AnnotateOverlay.
                const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
                if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) {
                  e.preventDefault()
                  void sendChat()
                }
              }}
            />
            <button type="button" data-action="send" onClick={sendChat} disabled={chatBusy || chatInput.trim() === ''}>{t('ai.lab.chat.send')}</button>
            <button type="button" data-action="clear-chat" onClick={() => setChat([])} disabled={chat.length === 0}>{t('ai.lab.chat.clear')}</button>
          </div>
        </div>
      )}

      {tab === 'ocr' && (
        <div className="ai-ocr">
          {banner}
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
      )}
    </div>
  )
}
