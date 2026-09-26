import { useEffect, useRef, useState, type JSX } from 'react'
import { Eye, EyeOff, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { AI_PROVIDER_PRESETS, FALLBACK_MODEL, isKeylessLocal, matchProviderPreset } from '../../../shared/aiProviders'
import type { AiChatMessage, AiChatOutcome, AiErrorHint, AiProfile } from '../../../shared/types'
import { AiLabAudioTab } from './AiLabAudioTab'
import { AiLabAi8Tab } from './AiLabAi8Tab'
import { AiLabVisionTab } from './AiLabVisionTab'
import { AiLabSvgTab } from './AiLabSvgTab'
import { AiLabVoiceTab } from './AiLabVoiceTab'
import { AiLabAgentTab } from './AiLabAgentTab'

interface ChatTurn extends AiChatMessage {
  latencyMs?: number
  error?: AiErrorHint
}

type ConnState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; latencyMs: number; model: string }
  | { kind: 'fail'; hint?: AiErrorHint }

type AiLabTab = 'config' | 'chat' | 'ocr' | 'audio' | 'vision' | 'svg' | 'voice' | 'agent' | 'ai8'

/** R145: Bedrock form mirror — sessionToken is a plain string here (always
 *  controlled); it is dropped from the saved profile when empty. */
interface AwsMirror {
  region: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
}

interface EditMirror {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  aws?: AwsMirror
}

/** Max turns sent to aiChat (preload caps at 40) with headroom for the new message. */
const REPLAY_WINDOW = 38
/** Per-message replay cap (preload caps content at 32k chars). */
const REPLAY_CHAR_CAP = 30_000

const EMPTY_MIRROR: EditMirror = { name: '', baseUrl: '', apiKey: '', model: '' }

/** R145: common Bedrock regions (editable models list stays in aiProviders). */
const AWS_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1']

function mirrorOf(p: AiProfile | null): EditMirror {
  return p
    ? {
        name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model,
        ...(p.aws !== undefined
          ? { aws: { region: p.aws.region, accessKeyId: p.aws.accessKeyId, secretAccessKey: p.aws.secretAccessKey, sessionToken: p.aws.sessionToken ?? '' } }
          : {}),
      }
    : { ...EMPTY_MIRROR }
}

/** R88/R89: AI Lab — tabbed (config / chat / ocr) with named model profiles.
 *  Self-manages the profile lifecycle (aiGetProfiles / aiSaveProfile / …);
 *  conversation and playground results are local state, wiped on unmount. */
export function AiLabView(): JSX.Element {
  const { t } = useI18n()
  const [tab, setTab] = useState<AiLabTab>('config')
  // R175: first visit mounts; afterwards keep-alive via display:none wrappers
  const [agentVisited, setAgentVisited] = useState(false)
  const [voiceVisited, setVoiceVisited] = useState(false)
  useEffect(() => {
    if (tab === 'agent') setAgentVisited(true)
    if (tab === 'voice') setVoiceVisited(true)
  }, [tab])
  // R179: the coding agent is a rarely-used power tool — its tab chip stays
  // collapsed behind a toggle unless the user opted in (persisted).
  const [agentTabOpen, setAgentTabOpen] = useState(() => {
    try { return localStorage.getItem('rgbbox:aiLabAgentTabOpen') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('rgbbox:aiLabAgentTabOpen', agentTabOpen ? '1' : '0') } catch { /* best-effort */ }
    if (!agentTabOpen && tab === 'agent') switchTab('config')
  }, [agentTabOpen]) // eslint-disable-line react-hooks/exhaustive-deps -- switchTab is stable
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [activeId, setActiveId] = useState('')
  const [editId, setEditId] = useState('')
  const [cfg, setCfg] = useState<EditMirror>({ ...EMPTY_MIRROR })
  const [loaded, setLoaded] = useState(false)
  const [unreadableIds, setUnreadableIds] = useState<string[]>([])
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  const [showKey, setShowKey] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' })
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [ocrInput, setOcrInput] = useState('')
  const [ocrResult, setOcrResult] = useState('')
  const [ocrHint, setOcrHint] = useState<AiErrorHint>()
  const [ocrBusy, setOcrBusy] = useState<'cleanup' | 'translate' | null>(null)
  // R175: keep-alive for the agent & voice tabs — once visited they stay
  // mounted (display:none) so a running agent keeps streaming and transcripts
  // / drafts survive tab switches (Claude-style background run).
  // R175: keep-alive for the agent & voice tabs — once visited they stay
  // mounted (display:none) so a running agent keeps streaming and transcripts
  // / drafts survive tab switches (Claude-style background run).

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
  const isBedrockForm = provider.id === 'bedrock'
  const hintLine = (hint?: AiErrorHint): string => `${t('ai.lab.status.failed')} (${hint ?? 'unknown'})`
  const activeKeyless = activeProfile !== null && activeProfile.aws === undefined
    && activeProfile.apiKey === '' && !isKeylessLocal(activeProfile.baseUrl)
  /** R145: trimmed AWS payload for save/test — Bedrock forms only, empty
   *  sessionToken dropped, stale aws from a provider switch never leaks. */
  const awsPayload = isBedrockForm && cfg.aws !== undefined
    ? {
        region: cfg.aws.region,
        accessKeyId: cfg.aws.accessKeyId.trim(),
        secretAccessKey: cfg.aws.secretAccessKey.trim(),
        ...(cfg.aws.sessionToken.trim() !== '' ? { sessionToken: cfg.aws.sessionToken.trim() } : {}),
      }
    : undefined

  const upsertLocal = (saved: AiProfile) => {
    setProfiles((list) => {
      const idx = list.findIndex((p) => p.id === saved.id)
      if (idx >= 0) { const next = [...list]; next[idx] = saved; return next }
      return [...list, saved]
    })
  }

  /** Auto-save the edited profile (R89: 配置好之后自动保存); skips drafts whose
   *  baseUrl is still blank (R89 review fix — main would coerce '' to the zhipu
   *  default and silently rewrite a half-filled custom config). */
  const commitEdits = async (): Promise<AiProfile | null> => {
    if (!loaded) return null
    if (cfg.baseUrl.trim() === '') return null
    const saved = await window.rgbbox.aiSaveProfile({ id: editId, name: cfg.name, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, ...(awsPayload !== undefined ? { aws: awsPayload } : {}) })
    upsertLocal(saved)
    if (saved.id !== editId) setEditId(saved.id)
    // R89 review fix: sync the auto-generated name back into the form so the
    // input and the dropdown/banner cannot diverge for the same profile.
    setCfg((c) => (c.name.trim() === '' ? { ...c, name: saved.name } : c))
    return saved
  }

  // R89 review fix: the module rail unmounts this view on navigation — commit
  // pending edits on unmount so "自动保存" holds outside the component too.
  const commitRef = useRef(commitEdits)
  commitRef.current = commitEdits
  useEffect(() => () => { void commitRef.current() }, [])

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
    // R89 review fix: a draft without a baseUrl has nothing to test — main would
    // silently fall back to the ACTIVE profile and we would mislabel the result.
    if (cfg.baseUrl.trim() === '') return
    // R145: a Bedrock draft without a secret has nothing to sign with.
    if (isBedrockForm && (awsPayload === undefined || awsPayload.secretAccessKey === '')) return
    setConn({ kind: 'testing' })
    try {
      // R89: test the EDITED profile directly — no save, no active switch needed.
      const out = await window.rgbbox.aiTestConnection({
        baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model,
        ...(awsPayload !== undefined ? { aws: awsPayload } : {}),
      })
      setConn(out.ok
        ? { kind: 'ok', latencyMs: out.latencyMs, model: cfg.model.trim() || FALLBACK_MODEL }
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
    // R116.2: on the AI8 tab the workbench fills the viewport (its own inner
    // scroll + a pinned composer) instead of growing the whole page.
    <div className={tab === 'ai8' ? 'ai-lab ai-lab-flush' : 'ai-lab'}>
      <div className="ai-tabs" role="tablist" aria-label="AI Lab sections">
        {(['config', 'chat', 'ocr', 'audio', 'vision', 'svg', 'voice', ...(agentTabOpen ? (['agent'] as const) : []), 'ai8'] as const).map((key) => (
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
        <button
          type="button"
          className={`ai-tab ai-tab-toggle${agentTabOpen ? ' on' : ''}`}
          data-action="toggle-agent-tab"
          aria-pressed={agentTabOpen}
          title={t('ai.lab.toggleAgent' as Parameters<typeof t>[0])}
          onClick={() => setAgentTabOpen((v) => !v)}
        >
          🤖
        </button>
      </div>

      {tab === 'config' && (
        <div className="ai-config-panel">
          <div className="ai-profile-row">
            <select data-field="profile" value={editId} onChange={(e) => void selectProfile(e.target.value)}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="icon-button" data-action="new-profile"
              onClick={() => { setProfileBusy(true); void newProfile().finally(() => setProfileBusy(false)) }}
              disabled={profileBusy}
              aria-label={t('ai.lab.profileNew')} title={t('ai.lab.profileNew')}>
              <Plus size={15} />
            </button>
            <button type="button" className="icon-button" data-action="delete-profile"
              onClick={() => { setProfileBusy(true); void deleteProfile().finally(() => setProfileBusy(false)) }}
              disabled={profiles.length === 0 || profileBusy}
              aria-label={t('ai.lab.profileDelete')} title={t('ai.lab.profileDelete')}>
              <Trash2 size={15} />
            </button>
          </div>

          <div className="ai-conn">
            <span className={`ai-status dash-dot${conn.kind === 'ok' ? ' on' : ''}${conn.kind === 'fail' ? ' err' : ''}`}>
              {conn.kind === 'idle' && t('ai.lab.status.disconnected')}
              {conn.kind === 'testing' && '…'}
              {conn.kind === 'ok' && `${t('ai.lab.status.connected')} · ${conn.model} · ${conn.latencyMs} ms`}
              {conn.kind === 'fail' && hintLine(conn.hint)}
            </span>
            <button type="button" className="icon-button" data-action="test" onClick={runTest}
              disabled={conn.kind === 'testing' || !loaded || cfg.baseUrl.trim() === ''
                || (isBedrockForm && (awsPayload === undefined || awsPayload.secretAccessKey === ''))}
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
                  if (preset.id === 'bedrock') {
                    // R145: seed the AWS credential block (keeps previously
                    // entered values when re-selecting the provider)
                    setCfg({ ...cfg, baseUrl: preset.baseUrl, model: preset.models[0], aws: cfg.aws ?? { region: 'us-east-1', accessKeyId: '', secretAccessKey: '', sessionToken: '' } })
                    return
                  }
                  setCfg({ ...cfg, baseUrl: preset.baseUrl, model: preset.models[0], aws: undefined })
                }}>
                {AI_PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label || t('ai.lab.providerCustom')}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('ai.baseUrl')}</span>
              <input data-field="baseUrl" value={cfg.baseUrl} placeholder="https://…" readOnly={isBedrockForm} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} />
            </label>
            <label>
              <span>{t('ai.model')}</span>
              <input data-field="model" list="ai-model-options" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
              <datalist id="ai-model-options">
                {provider.models.map((m) => <option key={m} value={m} />)}
              </datalist>
            </label>
            {isBedrockForm ? (
              // R145: SigV4 credentials replace the Bearer key on Bedrock
              <>
                <label>
                  <span>{t('ai.lab.aws.region')}</span>
                  <select data-field="aws-region" value={cfg.aws?.region ?? 'us-east-1'}
                    onChange={(e) => setCfg({ ...cfg, aws: { ...(cfg.aws ?? { accessKeyId: '', secretAccessKey: '', sessionToken: '' }), region: e.target.value } })}>
                    {AWS_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t('ai.lab.aws.accessKeyId')}</span>
                  <input data-field="aws-ak" value={cfg.aws?.accessKeyId ?? ''} autoComplete="off" spellCheck={false}
                    onChange={(e) => setCfg({ ...cfg, aws: { ...(cfg.aws ?? { region: 'us-east-1', secretAccessKey: '', sessionToken: '' }), accessKeyId: e.target.value } })} />
                </label>
                <label>
                  <span>{t('ai.lab.aws.secretAccessKey')}</span>
                  <span className="ai-key-row">
                    <input
                      data-field="aws-sk"
                      type={showKey ? 'text' : 'password'}
                      value={cfg.aws?.secretAccessKey ?? ''}
                      autoComplete="new-password"
                      spellCheck={false}
                      onChange={(e) => { setCfg({ ...cfg, aws: { ...(cfg.aws ?? { region: 'us-east-1', accessKeyId: '', sessionToken: '' }), secretAccessKey: e.target.value } }); setUnreadableIds((ids) => ids.filter((i) => i !== editId)) }}
                    />
                    <button type="button" className="icon-button" data-action="toggle-key" onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}
                      title={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}>
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                </label>
                <label>
                  <span>{t('ai.lab.aws.sessionToken')}</span>
                  <input data-field="aws-sts" type={showKey ? 'text' : 'password'} value={cfg.aws?.sessionToken ?? ''}
                    autoComplete="new-password" spellCheck={false} placeholder={t('ai.lab.aws.sessionTokenHint')}
                    onChange={(e) => setCfg({ ...cfg, aws: { ...(cfg.aws ?? { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' }), sessionToken: e.target.value } })} />
                </label>
                <p className="ai-hint-line">{t('ai.lab.aws.hint')}</p>
              </>
            ) : (
              <label>
                <span>{t('ai.apiKey')}</span>
                <span className="ai-key-row">
                  <input
                    data-field="apiKey"
                    type={showKey ? 'text' : 'password'}
                    value={cfg.apiKey}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={provider.id === 'ai8' ? t('ai.lab.ai8KeyHint') : undefined}
                    onChange={(e) => { setCfg({ ...cfg, apiKey: e.target.value }); setUnreadableIds((ids) => ids.filter((i) => i !== editId)) }}
                  />
                  <button type="button" className="icon-button" data-action="toggle-key" onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}
                    title={showKey ? t('ai.lab.hideKey') : t('ai.lab.showKey')}>
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
            )}
            <p className="ai-privacy-note">{t(encryptionAvailable ? 'ai.privacyNote' : 'ai.privacyNotePlain')}</p>
            {unreadableIds.includes(editId) && <p className="ai-hint-line">{t('ai.lab.keyUnreadable')}</p>}
            <div className="ai-config-actions">
              {/* R150 (review I3): 保存 is the surface's single filled primary. */}
              <button type="button" className="btn-primary" data-action="save" onClick={() => void commitEdits()} disabled={!loaded}>{t('ai.lab.save')}</button>
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

      {tab === 'audio' && <AiLabAudioTab />}

      {tab === 'vision' && <AiLabVisionTab />}

      {/* R171: pure-SVG pelican-on-a-bicycle animation showcase */}
      {tab === 'svg' && <AiLabSvgTab />}

      {/* R173: VoiceScribe — offline dual-direction speech workstation (P1).
          R175: keep-alive — draft text survives tab switches. */}
      {voiceVisited && (
        <div style={{ display: tab === 'voice' ? undefined : 'none' }}>
          <AiLabVoiceTab />
        </div>
      )}

      {/* R172: coding-agent workbench (kernel engine + approval loop).
          R175: keep-alive — the agent keeps running and the transcript stays
          put while the user browses other tabs (Claude-style background run). */}
      {agentVisited && (
        <div style={{ display: tab === 'agent' ? undefined : 'none' }}>
          <AiLabAgentTab />
        </div>
      )}

      {tab === 'ai8' && <AiLabAi8Tab />}
    </div>
  )
}
