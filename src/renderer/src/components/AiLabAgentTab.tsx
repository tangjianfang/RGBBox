import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Bot, CheckCheck, FolderOpen, History, Play, Send, ShieldCheck, Square, TriangleAlert, X } from 'lucide-react'
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
interface ToolCard { id: string; name: string; args: string; result: string; status: 'running' | 'done' | 'denied' | 'error'; startedAt?: number; endedAt?: number }
interface TranscriptItem { kind: 'user' | 'assistant' | 'assistant-streaming' | 'tool' | 'approval'; text?: string; tool?: ToolCard; approval?: AgentApprovalRequest; resolved?: boolean }

/** R184: tool results beyond this many lines render folded by default. */
const TOOL_FOLD_LINES = 12
/** R184: hard char cap on the rendered excerpt (main process caps raw at 64KB). */
const TOOL_RESULT_CHAR_CAP = 4000

function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** R184: a tool call as a card — name + status glyph + duration header, args,
 *  result folded past TOOL_FOLD_LINES with an explicit expand/collapse toggle. */
function AgentToolCard({ tool, t }: { tool: ToolCard; t: ReturnType<typeof useI18n>['t'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const resultLines = useMemo(() => tool.result.split('\n'), [tool.result])
  const foldable = resultLines.length > TOOL_FOLD_LINES
  const shown = foldable && !expanded ? resultLines.slice(0, TOOL_FOLD_LINES).join('\n') : tool.result
  const truncated = tool.result.length > TOOL_RESULT_CHAR_CAP
  const excerpt = shown.slice(0, TOOL_RESULT_CHAR_CAP)
  const duration = tool.startedAt !== undefined && tool.endedAt !== undefined ? tool.endedAt - tool.startedAt : null
  const glyph = tool.status === 'done' ? '✓' : tool.status === 'error' ? '✕' : tool.status === 'denied' ? '⚠' : '●'
  return (
    <div className={`agent-tool status-${tool.status}${expanded ? ' expanded' : ''}`}>
      <div className="agent-tool-head">
        <span className={`agent-tool-glyph ${tool.status}`} aria-hidden="true">{glyph}</span>
        <span className="agent-tool-name">{tool.name}</span>
        {duration !== null && <span className="agent-tool-duration">{formatDuration(duration)}</span>}
      </div>
      <pre className="agent-tool-args">{tool.args}</pre>
      {tool.result !== '' && (
        <>
          <pre className="agent-tool-result">{excerpt}</pre>
          <div className="agent-tool-foot">
            {foldable && (
              <button type="button" className="agent-tool-fold" onClick={() => setExpanded((v) => !v)}>
                {expanded ? t('ai.agent.collapse') : t('ai.agent.expandLines').replace('{n}', String(resultLines.length))}
              </button>
            )}
            {truncated && <span className="agent-tool-truncated">{t('ai.agent.truncated')}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// R175: prompt history cache — ↑ recalls the previous prompt, ↓ forward again
// (cursor-at-edge semantics, like Claude Code); persisted across restarts.
const HISTORY_KEY = 'rgbbox:agentInputHistory'
const HISTORY_CAP = 30
function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function saveHistory(list: string[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_CAP))) } catch { /* best-effort */ }
}

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
  agentDraft?: string
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
  const [input, setInput] = useState(prefs.agentDraft ?? '')
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<AgentApprovalRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([])
  const [ai8Models, setAi8Models] = useState<Ai8Model[]>(ai8ModelCache ?? [])
  const [ai8ModelError, setAi8ModelError] = useState(false)
  const [ai8ModelValue, setAi8ModelValue] = useState(prefs.ai8Model ?? '')
  const [inputHistory, setInputHistory] = useState<string[]>(loadHistory)
  const historyIdxRef = useRef<number | null>(null)
  const draftRef = useRef(prefs.agentDraft ?? '')
  const [disabledModels, setDisabledModels] = useState<string[]>(prefs.disabledModels ?? [])
  const [activeSessionId, setActiveSessionId] = useState('')
  const sessionIdRef = useRef('')
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    savePrefs({ profileId: profileId || undefined, workspace: workspace || undefined, mode, ai8Model: ai8ModelValue || undefined, disabledModels, agentDraft: input || undefined })
  }, [profileId, workspace, mode, ai8ModelValue, disabledModels, input])

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
          case 'text-delta': {
            // R175: Claude-style token streaming — append to the open bubble
            const last = next[next.length - 1]
            if (last && last.kind === 'assistant-streaming') last.text = (last.text ?? '') + ev.text
            else next.push({ kind: 'assistant-streaming', text: ev.text })
            break
          }
          case 'text': {
            const last = next[next.length - 1]
            if (last && last.kind === 'assistant-streaming') { last.text = ev.text; last.kind = 'assistant' }
            else next.push({ kind: 'assistant', text: ev.text })
            break
          }
          case 'tool-start': {
            const last = next[next.length - 1]
            if (last && last.kind === 'assistant-streaming') last.kind = 'assistant'
            // R184: arrival timing feeds the duration badge (restore path uses ts)
            next.push({ kind: 'tool', tool: { ...ev.call, startedAt: Date.now() } })
            break
          }
          case 'tool-result': {
            const idx = [...next].reverse().findIndex((it) => it.kind === 'tool' && it.tool?.id === ev.call.id)
            const prior = idx >= 0 ? next[next.length - 1 - idx].tool : undefined
            const tool: ToolCard = { ...ev.call, startedAt: prior?.startedAt, endedAt: Date.now() }
            if (idx >= 0) next[next.length - 1 - idx] = { kind: 'tool', tool }
            else next.push({ kind: 'tool', tool })
            break
          }
          case 'approval': next.push({ kind: 'approval', approval: ev.approval, resolved: false }); setPendingApproval(ev.approval); break
          case 'done':
            if (ev.reason === 'error') setError(ev.error ?? 'error')
            if (ev.reason === 'max-turns') setError('max-turns')
            // R184: any run end (incl. error/cancelled) closes the streaming
            // bubble — the caret must not blink on a dead run.
            for (const it of next) if (it.kind === 'assistant-streaming') it.kind = 'assistant'
            break
          default: break
        }
        return next
      })
      if (ev.kind === 'session-meta') { sessionIdRef.current = ev.sessionId; setActiveSessionId(ev.sessionId) }
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
    // R175: prompt history cache (newest first)
    if (text !== (inputHistory[0] ?? '')) {
      const next = [text, ...inputHistory].slice(0, HISTORY_CAP)
      setInputHistory(next)
      saveHistory(next)
    }
    historyIdxRef.current = null
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
  }, [input, running, workspace, profileId, mode, isAi8, effectiveAi8Model, inputHistory])

  const respond = (decision: 'once' | 'always' | 'deny'): void => {
    if (!pendingApproval) return
    void window.rgbbox.agentApprovalRespond(pendingApproval.id, decision)
    setPendingApproval(null)
    setItems((prev) => prev.map((it) => (it.kind === 'approval' && it.approval?.id === pendingApproval.id ? { ...it, resolved: true } : it)))
  }

  const loadSession = (id: string): void => {
    sessionIdRef.current = id
    setActiveSessionId(id)
    setItems([])
    setError(null)
    void window.rgbbox.agentSessionLoad(id).then((events) => {
      const restored: TranscriptItem[] = []
      let lastTool: ToolCard | null = null
      // R183: a restored session must also carry its END state — a run that
      // died on `error`/`max-turns` looked identical to a healthy one before.
      let restoredError: string | null = null
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
        if (ev.kind === 'approval') restored.push({ kind: 'approval', approval: ev.approval, resolved: true })
        if (ev.kind === 'tool-start') { lastTool = { ...ev.call, startedAt: ev.ts }; restored.push({ kind: 'tool', tool: lastTool }) }
        if (ev.kind === 'tool-result') {
          const idx = [...restored].reverse().findIndex((it) => it.kind === 'tool' && it.tool?.id === ev.call.id)
          const tool: ToolCard = { ...ev.call, startedAt: idx >= 0 ? restored[restored.length - 1 - idx].tool?.startedAt : ev.ts, endedAt: ev.ts }
          if (idx >= 0) restored[restored.length - 1 - idx] = { kind: 'tool', tool }
          lastTool = null
        }
        if (ev.kind === 'done' && ev.reason === 'error') restoredError = ev.error ?? 'error'
        if (ev.kind === 'done' && ev.reason === 'max-turns') restoredError = 'max-turns'
      }
      setItems(restored)
      if (restoredError !== null) setError(restoredError)
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
                  <button
                    type="button"
                    data-action="agent-load"
                    className={s.id === activeSessionId ? 'active' : ''}
                    aria-current={s.id === activeSessionId ? 'true' : undefined}
                    onClick={() => loadSession(s.id)}
                    title={s.title}
                  >{s.title}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="agent-main">
        <div className="agent-log" ref={logRef}>
          {items.length === 0 && (
            <div className="agent-empty" data-field="agent-empty">
              <Bot size={34} className="agent-empty-icon" />
              <h3>{t('ai.agent.emptyTitle')}</h3>
              <p>{t('ai.agent.empty')}</p>
              <ol className="agent-empty-steps">
                <li>{t('ai.agent.step1')}</li>
                <li>{t('ai.agent.step2')}</li>
                <li>{t('ai.agent.step3')}</li>
              </ol>
            </div>
          )}
          {items.map((it, i) => {
            if (it.kind === 'user') return <div key={i} className="agent-msg agent-msg-user">{it.text}</div>
            if (it.kind === 'assistant-streaming') {
              return (
                <div key={i} className="agent-msg agent-msg-assistant agent-streaming">
                  <MarkdownView text={it.text ?? ''} copyLabel={t('ai.agent.copy')} copiedLabel={t('ai.agent.copied')} />
                </div>
              )
            }
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
              // R184: unified diff palette — before = removal (red), after = addition (green)
              return (
                <div key={i} className={`agent-approval${it.resolved ? ' resolved' : ''}`}>
                  <strong>⚠ {it.approval.summary}</strong>
                  {it.approval.before !== undefined && (
                    <div className="agent-diff-block">
                      <span className="agent-diff-label before">− {t('ai.agent.diffBefore')}</span>
                      <pre className="agent-diff before">{it.approval.before}</pre>
                    </div>
                  )}
                  {it.approval.after !== undefined && (
                    <div className="agent-diff-block">
                      <span className="agent-diff-label after">+ {t('ai.agent.diffAfter')}</span>
                      <pre className="agent-diff after">{it.approval.after}</pre>
                    </div>
                  )}
                </div>
              )
            }
            if (it.tool) return <AgentToolCard key={i} tool={it.tool} t={t} />
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
          // R183: elevated to an error banner — a bare hint line made a failed
          // run look identical to a completed one.
          const key = `ai.agent.err.${error}` as Parameters<typeof t>[0]
          const label = t(key)
          return (
            <div className="agent-error-banner" role="alert">
              <TriangleAlert size={14} />
              <span><strong>{t('ai.agent.runFailed')}</strong>{` · ${label === key ? error : label}`}</span>
            </div>
          )
        })()}

        <div className="agent-input-row">
          <textarea
            data-field="agent-input"
            value={input}
            placeholder={workspace === '' ? t('ai.agent.pickFirst') : t('ai.agent.placeholder')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
              if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) { e.preventDefault(); void send(); return }
              // R175: ↑/↓ at the text edges walk the prompt history
              if (e.key === 'ArrowUp' && inputHistory.length > 0 && (e.target as HTMLTextAreaElement).selectionStart === 0) {
                e.preventDefault()
                if (historyIdxRef.current === null) { draftRef.current = input; historyIdxRef.current = 0 }
                else if (historyIdxRef.current < inputHistory.length - 1) historyIdxRef.current += 1
                setInput(inputHistory[historyIdxRef.current])
                return
              }
              if (e.key === 'ArrowDown' && historyIdxRef.current !== null) {
                if ((e.target as HTMLTextAreaElement).selectionStart >= input.length) {
                  e.preventDefault()
                  if (historyIdxRef.current <= 0) { historyIdxRef.current = null; setInput(draftRef.current) }
                  else { historyIdxRef.current -= 1; setInput(inputHistory[historyIdxRef.current]) }
                }
              }
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
