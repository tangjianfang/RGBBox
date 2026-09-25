import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Bot, CheckCheck, FolderOpen, History, Play, Send, ShieldCheck, Square, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { MarkdownView } from '../ai8/markdown'
import type { AgentApprovalRequest, AgentEvent, AgentMode, AgentSessionMeta, AiProfile } from '../../../shared/types'

/**
 * Agent 工作台 — R172-S2(独立 Tab,决策 ②)。
 * 内核引擎经 agentSend IPC;流式事件 onAgentEvent;审批条三档决策;
 * 会话 JSONL 恢复;ai8 档位显示「实验」徽标(决策 ④)。
 */
interface ToolCard { id: string; name: string; args: string; result: string; status: 'running' | 'done' | 'denied' | 'error' }
interface TranscriptItem { kind: 'user' | 'assistant' | 'tool' | 'approval'; text?: string; tool?: ToolCard; approval?: AgentApprovalRequest; resolved?: boolean }

export function AiLabAgentTab(): JSX.Element {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<AiProfile[]>([])
  const [profileId, setProfileId] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [mode, setMode] = useState<AgentMode>('standard')
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<AgentApprovalRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([])
  const sessionIdRef = useRef('')
  const logRef = useRef<HTMLDivElement | null>(null)

  const refreshSessions = useCallback(() => {
    void window.rgbbox.agentSessionsList().then(setSessions).catch(() => setSessions([]))
  }, [])

  useEffect(() => {
    void window.rgbbox.aiGetProfiles().then((c) => {
      setProfiles(c.profiles)
      setProfileId(c.activeId)
    }).catch(() => { /* offline */ })
    refreshSessions()
  }, [refreshSessions])

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

  const activeProfile = useMemo(() => profiles.find((p) => p.id === profileId) ?? null, [profiles, profileId])
  const isAi8 = activeProfile?.baseUrl.startsWith('ai8://') === true

  const send = useCallback(async (): Promise<void> => {
    const text = input.trim()
    if (text === '' || running || workspace === '') return
    setInput('')
    setError(null)
    setRunning(true)
    const out = await window.rgbbox.agentSend({ text, profileId, workspace, mode, sessionId: sessionIdRef.current })
    if (!out.ok && out.error && out.error !== 'error') setError(out.error)
    if (!out.ok && out.sessionId === '') setRunning(false)
  }, [input, running, workspace, profileId, mode])

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

        {error && <p className="ai-hint-line">{t(`ai.agent.err.${error}` as Parameters<typeof t>[0]) || error}</p>}

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
