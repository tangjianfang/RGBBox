import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Bot, CheckCheck, FolderOpen, History, Play, Send, ShieldCheck, Square, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { MarkdownView } from '../ai8/markdown'
import { groupModelsByProvider, matchCurated } from '../ai8/localStore'
import { Ai8Client, readStoredToken, type Ai8Model } from '../../../shared/ai8Client'
import type { AgentApprovalRequest, AgentEvent, AgentMode, AgentSessionMeta, AiProfile } from '../../../shared/types'

/**
 * Agent 工作台 — R172-S2(独立 Tab,决策 ②)。
 * 内核引擎经 agentSend IPC;流式事件 onAgentEvent;审批条三档决策;
 * 会话 JSONL 恢复;ai8 档位显示「实验」徽标(决策 ④)。
 * R174.6: AI8 支持——无 ai8 档案但有存储 token 时自动补建;选中 AI8 档时
 * 显示站点模型下拉(模板是公开接口,分组复用 AI8 页逻辑),经 modelOverride 下发。
 */
interface ToolCard { id: string; name: string; args: string; result: string; status: 'running' | 'done' | 'denied' | 'error' }
interface TranscriptItem { kind: 'user' | 'assistant' | 'tool' | 'approval'; text?: string; tool?: ToolCard; approval?: AgentApprovalRequest; resolved?: boolean }

/** AI8 聊天模型模板(公开、无需 token)——成功后模块级缓存,切页秒开。 */
let ai8ModelCache: Ai8Model[] | null = null

// R174.9: workbench prefs persist across restarts (profile/workspace/mode/
// last ai8 model + site-discontinued models marked locally).
const PREFS_KEY = 'rgbbox:agentPrefs'
interface AgentPrefs {
  profileId?: string
  workspace?: string
  mode?: AgentMode
  ai8Model?: string
  disabledModels?: string[]
}
function loadPrefs(): AgentPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? (JSON.parse(raw) as AgentPrefs) : {}
  } catch {
    return {}
  }
}
function savePrefs(p: AgentPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* best-effort */ }
}

export function AiLabAgentTab(): JSX.Element {
  const { t } = useI18n()
  const prefs = useMemo(() => loadPrefs(), [])
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [profileId, setProfileId] = useState('')
  const [workspace, setWorkspace] = useState(prefs.workspace ?? '')
  const [mode, setMode] = useState<AgentMode>(prefs.mode ?? 'standard')
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<AgentApprovalRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([])
  const [ai8Models, setAi8Models] = useState<Ai8Model[]>(ai8ModelCache ?? [])
  const [ai8ModelError, setAi8ModelError] = useState(false)
  const [ai8ModelValue, setAi8ModelValue] = useState(prefs.ai8Model ?? '')
  const [disabledModels, setDisabledModels] = useState<string[]>(prefs.disabledModels ?? [])
  const sessionIdRef = useRef('')
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    savePrefs({ profileId: profileId || undefined, workspace: workspace || undefined, mode, ai8Model: ai8ModelValue || undefined, disabledModels })
  }, [profileId, workspace, mode, ai8ModelValue, disabledModels])

  const refreshSessions = useCallback(() => {
    void window.rgbbox.agentSessionsList().then(setSessions).catch(() => setSessions([]))
  }, [])

  // R174.9: profiles may refetch — the prefs restore is a ONE-TIME init and
  // must never clobber a selection the user made in this session.
  const profileInitRef = useRef(false)
  useEffect(() => {
    if (profileInitRef.current) return
    void window.rgbbox.aiGetProfiles().then(async (c) => {
      profileInitRef.current = true
      let list = c.profiles
      // R174.6: AI8 页登录过的 token 一直没落到档案(syncTokenToProfiles 只更新
      // 不创建)——Agent 侧补齐:无 ai8 档案 + 有存储 token → 自动建一个。
      const hasAi8 = list.some((p) => p.baseUrl.trim() === 'ai8://chat')
      const stored = readStoredToken()
      if (!hasAi8 && stored !== '') {
        try {
          const created = await window.rgbbox.aiSaveProfile({ id: '', name: 'AI8', baseUrl: 'ai8://chat', apiKey: stored, model: 'openai_chat::gpt-5.4' })
          list = [...list, created]
        } catch { /* manual profile creation stays available */ }
      }
      setProfiles(list)
      // R174.9: restore the LAST-USED profile when it still exists.
      setProfileId(prefs.profileId && list.some((p) => p.id === prefs.profileId) ? prefs.profileId : c.activeId)
    }).catch(() => { /* offline */ })
    refreshSessions()
  }, [refreshSessions, prefs.profileId])

  const activeProfile = useMemo(() => profiles.find((p) => p.id === profileId) ?? null, [profiles, profileId])
  const isAi8 = activeProfile?.baseUrl.startsWith('ai8://') === true

  // R174.6: AI8 模型下拉的数据源(公开模板,与 AI8 页同一缓存策略)
  useEffect(() => {
    if (!isAi8 || ai8ModelCache !== null) return
    let cancelled = false
    new Ai8Client({ token: '' }).getChatTemplate()
      .then((tmpl) => {
        if (cancelled) return
        ai8ModelCache = (tmpl.models ?? []).filter((m) => m.attr?.modelType === 'chat')
        setAi8Models(ai8ModelCache)
      })
      .catch(() => { if (!cancelled) setAi8ModelError(true) })
    return () => { cancelled = true }
  }, [isAi8])

  const ai8Groups = useMemo(() => groupModelsByProvider(ai8Models), [ai8Models])
  // R174.11: mirror the AI8 page picker — curated groups (flagship/fast/free/budget)
  // on top + integral cost suffix, so both lists read the same.
  const ai8Curated = useMemo(() => matchCurated(ai8Models), [ai8Models])
  const effectiveAi8Model = ai8ModelValue !== '' ? ai8ModelValue : (activeProfile?.model ?? '')

  useEffect(() => {
    const off = window.rgbbox.onAgentEvent((ev: AgentEvent) => {
      setItems((prev) => {
        const next = [...prev]
        switch (ev.kind) {
          case 'user': next.push({ kind: 'user', text: ev.text }); break
          case 'text': next.push({ kind: 'assistant', text: ev.text }); break
          case 'tool-start': next.push({ kind: 'tool', tool: ev.call }); break
          case 'tool-result': {
            const idx = [...next].reverse().findIndex((it) => it.kind === 'tool' && it.tool?.id === ev.call.id)
            if (idx >= 0) next[next.length - 1 - idx] = { kind: 'tool', tool: ev.call }
            else next.push({ kind: 'tool', tool: ev.call })
            break
          }
          case 'approval': next.push({ kind: 'approval', approval: ev.approval, resolved: false }); setPendingApproval(ev.approval); break
          case 'done':
            if (ev.reason === 'error') setError(ev.error ?? 'error')
            if (ev.reason === 'max-turns') setError('max-turns')
            break
          default: break
        }
        return next
      })
      if (ev.kind === 'session-meta') sessionIdRef.current = ev.sessionId
      if (ev.kind === 'done') {
        setRunning(false)
        setPendingApproval(null)
        setItems((prev) => prev.map((it) => (it.kind === 'approval' && !it.resolved ? { ...it, resolved: true } : it)))
        refreshSessions()
      }
    })
    return off
  }, [refreshSessions])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [items])

  const send = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (text === '' || running || workspace === '') return
    setInput('')
    setError(null)
    setRunning(true)
    // R174.6: AI8 档附带当前选择的站点模型
    const modelOverride = isAi8 && effectiveAi8Model !== '' ? effectiveAi8Model : undefined
    const out = await window.rgbbox.agentSend({ text, profileId, workspace, mode, sessionId: sessionIdRef.current, modelOverride })
    if (!out.ok && out.error && out.error !== 'error') {
      setError(out.error)
      // R174.9: the site discontinues models while still listing them in the
      // public template ("当前对话选择的模型已停用") — mark locally so the
      // picker disables it and the user stops stepping on the same rake.
      if (modelOverride !== undefined && /停用|discontinued|deactivated/i.test(out.error)) {
        setDisabledModels((list) => (list.includes(modelOverride) ? list : [...list, modelOverride]))
      }
    }
    if (!out.ok && out.sessionId === '') setRunning(false)
  }, [input, running, workspace, profileId, mode, isAi8, effectiveAi8Model])

  const respond = (decision: 'once' | 'always' | 'deny'): void => {
    if (!pendingApproval) return
    void window.rgbbox.agentApprovalRespond(pendingApproval.id, decision)
    setPendingApproval(null)
    setItems((prev) => prev.map((it) => (it.kind === 'approval' && it.approval?.id === pendingApproval.id ? { ...it, resolved: true } : it)))
  }

  const loadSession = (id: string): void => {
    sessionIdRef.current = id
    setItems([])
    setError(null)
    void window.rgbbox.agentSessionLoad(id).then((events) => {
      const restored: TranscriptItem[] = []
      let lastTool: ToolCard | null = null
      // R174.9: continue with the model + workspace this session last used.
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const ev = events[i]
        if (ev.kind === 'session-meta') {
          if (ev.workspace) setWorkspace(ev.workspace)
          if (isAi8 && ev.model !== '') setAi8ModelValue(ev.model)
          break
        }
      }
      for (const ev of events) {
        if (ev.kind === 'user') restored.push({ kind: 'user', text: ev.text })
        if (ev.kind === 'text') restored.push({ kind: 'assistant', text: ev.text })
        if (ev.kind === 'tool-start') { lastTool = { ...ev.call }; restored.push({ kind: 'tool', tool: lastTool }) }
        if (ev.kind === 'tool-result') {
          const idx = [...restored].reverse().findIndex((it) => it.kind === 'tool' && it.tool?.id === ev.call.id)
          if (idx >= 0) restored[restored.length - 1 - idx] = { kind: 'tool', tool: ev.call }
          lastTool = null
        }
      }
      setItems(restored)
    }).catch(() => { /* empty */ })
  }

  return (
    <div className="agent-tab">
      <aside className="agent-side">
        <h4><Bot size={13} /> {t('ai.agent.title')}</h4>
        <label className="agent-field">
          <span>{t('ai.agent.profile')}</span>
          <select data-field="agent-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.baseUrl.startsWith('ai8://') ? ` · ${t('ai.agent.experimental')}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="agent-field">
          <span>{t('ai.agent.workspace')}</span>
          <div className="agent-ws-row">
            <input data-field="agent-workspace" value={workspace} readOnly placeholder={t('ai.agent.pickFirst')} />
            <button
              type="button"
              className="video-btn"
              data-action="agent-pick"
              onClick={() => { void window.rgbbox.agentPickWorkspace().then((p) => { if (p) setWorkspace(p) }) }}
              aria-label={t('ai.agent.pickWorkspace')}
            ><FolderOpen size={13} /></button>
          </div>
        </label>
        <label className="agent-field">
          <span><ShieldCheck size={12} /> {t('ai.agent.mode')}</span>
          <select data-field="agent-mode" value={mode} onChange={(e) => setMode(e.target.value as AgentMode)}>
            <option value="plan">{t('ai.agent.modePlan')}</option>
            <option value="standard">{t('ai.agent.modeStandard')}</option>
            <option value="trust">{t('ai.agent.modeTrust')}</option>
          </select>
        </label>
        {isAi8 && <p className="ai-hint-line">{t('ai.agent.ai8Experimental')}</p>}
        {isAi8 && (
          <label className="agent-field">
            <span>{t('ai.agent.ai8Model')}</span>
            <select
              data-field="agent-ai8-model"
              value={effectiveAi8Model}
              onChange={(e) => setAi8ModelValue(e.target.value)}
              disabled={ai8Groups.length === 0}
            >
              {ai8Groups.length === 0 && <option value="">{ai8ModelError ? t('ai.agent.ai8ModelsError') : t('ai.agent.ai8ModelsLoading')}</option>}
              {(['flagship', 'fast', 'free', 'budget'] as const).map((groupId) => (
                ai8Curated[groupId] ? (
                  <optgroup key={groupId} label={t(`ai.ai8.curated.${groupId}` as Parameters<typeof t>[0])}>
                    {ai8Curated[groupId].map((m) => (
                      <option key={m.value} value={m.value} disabled={disabledModels.includes(m.value)}>
                        {m.label}{disabledModels.includes(m.value) ? `（${t('ai.agent.modelDiscontinued')}）` : ''}
                      </option>
                    ))}
                  </optgroup>
                ) : null
              ))}
              {ai8Groups.map((g) => (
                <optgroup key={g.provider} label={g.provider}>
                  {g.models.map((m) => {
                    const integral = ai8Models.find((mm) => mm.value === m.value)?.attr?.integral
                    return (
                      <option key={m.value} value={m.value} disabled={disabledModels.includes(m.value)}>
                        {m.label}{integral ? ` · ${integral}` : ''}{disabledModels.includes(m.value) ? `（${t('ai.agent.modelDiscontinued')}）` : ''}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <div className="agent-sessions">
          <h5><History size={12} /> {t('ai.agent.sessions')}</h5>
          {sessions.length === 0 ? <p className="ai-hint-line">{t('ai.agent.noSessions')}</p> : (
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <button type="button" data-action="agent-load" onClick={() => loadSession(s.id)} title={s.title}>{s.title}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="agent-main">
        <div className="agent-log" ref={logRef}>
          {items.length === 0 && <p className="ai-hint-line">{t('ai.agent.empty')}</p>}
          {items.map((it, i) => {
            if (it.kind === 'user') return <div key={i} className="agent-msg agent-msg-user">{it.text}</div>
            if (it.kind === 'assistant') {
              // R172-S2 fix: assistant replies carry markdown (code blocks,
              // lists, headings) — render them instead of dumping raw text.
              return (
                <div key={i} className="agent-msg agent-msg-assistant">
                  <MarkdownView text={it.text ?? ''} copyLabel={t('ai.agent.copy')} copiedLabel={t('ai.agent.copied')} />
                </div>
              )
            }
            if (it.kind === 'approval' && it.approval) {
              return (
                <div key={i} className={`agent-approval${it.resolved ? ' resolved' : ''}`}>
                  <strong>⚠ {it.approval.summary}</strong>
                  {it.approval.before !== undefined && <pre className="agent-diff before">{it.approval.before}</pre>}
                  {it.approval.after !== undefined && <pre className="agent-diff after">{it.approval.after}</pre>}
                </div>
              )
            }
            if (it.tool) {
              return (
                <div key={i} className={`agent-tool status-${it.tool.status}`}>
                  <span className="agent-tool-name">{it.tool.name}</span>
                  <pre className="agent-tool-args">{it.tool.args}</pre>
                  {it.tool.result !== '' && <pre className="agent-tool-result">{it.tool.result.slice(0, 2000)}</pre>}
                </div>
              )
            }
            return null
          })}
        </div>

        {pendingApproval && (
          <div className="agent-approval-bar" role="alert">
            <span>{t('ai.agent.approvePrompt')}: <strong>{pendingApproval.summary}</strong></span>
            <button type="button" className="video-btn" data-action="agent-allow" onClick={() => respond('once')}><CheckCheck size={12} /> {t('ai.agent.allowOnce')}</button>
            <button type="button" className="video-btn" data-action="agent-always" onClick={() => respond('always')}>{t('ai.agent.allowAlways')}</button>
            <button type="button" className="video-btn" data-action="agent-deny" onClick={() => respond('deny')}><X size={12} /> {t('ai.agent.deny')}</button>
          </div>
        )}

        {error && (() => {
          // R174.9: known keys translate; raw kernel messages (e.g. "ai8:
          // network — 当前对话选择的模型已停用…") print as-is.
          const key = `ai.agent.err.${error}` as Parameters<typeof t>[0]
          const label = t(key)
          return <p className="ai-hint-line">{label === key ? error : label}</p>
        })()}

        <div className="agent-input-row">
          <textarea
            data-field="agent-input"
            value={input}
            placeholder={workspace === '' ? t('ai.agent.pickFirst') : t('ai.agent.placeholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
              if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) { e.preventDefault(); void send() }
            }}
          />
          {running ? (
            <button type="button" className="video-btn" data-action="agent-stop" onClick={() => void window.rgbbox.agentCancel()} aria-label={t('ai.agent.stop')}><Square size={14} /></button>
          ) : (
            <button type="button" className="video-btn" data-action="agent-send" onClick={() => void send()} disabled={input.trim() === '' || workspace === ''} aria-label={t('ai.agent.send')}><Send size={14} /></button>
          )}
          {running && <Play size={12} className="agent-spinner" />}
        </div>
      </div>
    </div>
  )
}
