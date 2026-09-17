import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { MarkdownView } from '../ai8/markdown'
import { Ai8Client, Ai8Error, readStoredToken, writeStoredToken, type Ai8Model } from '../ai8/client'
import { groupModelsByProvider, matchCurated, readActiveId, readPrefs, readSessions, titleFromContent, writeActiveId, writePrefs, writeSessions, type Ai8Prefs, type Ai8Session, type Ai8Turn } from '../ai8/localStore'

/** R113: AI8 workbench — two-pane layout (session sidebar + chat), multiple
 *  concurrent sessions, ChatGPT-style local history, auto-saved prefs, draw
 *  mode entry. All renderer-direct fetch (site CORS is `*`). */

/** R115.1: read an image File into {name, dataUrl} for the attachment chip. */
async function readImageFile(file: File): Promise<{ name: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { name: file.name || 'clipboard.png', dataUrl }
}

export function AiLabAi8Tab(): JSX.Element {
  const { t } = useI18n()
  const [token, setToken] = useState(() => readStoredToken())
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenRow, setShowTokenRow] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginAccount, setLoginAccount] = useState('')
  const [models, setModels] = useState<Ai8Model[]>([])
  const [modelsError, setModelsError] = useState('')
  const [prefs, setPrefs] = useState<Ai8Prefs>(() => readPrefs())
  const [sessions, setSessions] = useState<Ai8Session[]>(() => readSessions())
  const [activeId, setActiveId] = useState<string | number | null>(() => readActiveId())
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const patchPrefs = useCallback((patch: Partial<Ai8Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      writePrefs(next)
      return next
    })
  }, [])

  // R113: the model template is PUBLIC — browseable without a token.
  useEffect(() => {
    const client = new Ai8Client({ token: '' })
    client.getChatTemplate()
      .then((tmpl) => setModels((tmpl.models ?? []).filter((m) => m.attr?.modelType === 'chat')))
      .catch(() => setModelsError('network'))
  }, [])

  const client = () => new Ai8Client({ token, onTokenExpired: () => setShowTokenRow(true) })

  const activeSession = useMemo(() => sessions.find((s) => String(s.id) === String(activeId)) ?? null, [sessions, activeId])
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const curated = useMemo(() => matchCurated(models), [models])

  const saveToken = () => {
    const trimmed = tokenDraft.trim()
    setToken(trimmed)
    writeStoredToken(trimmed)
    setTokenDraft('')
    if (trimmed !== '') setShowTokenRow(false)
  }

  const clearToken = () => {
    setToken('')
    writeStoredToken('')
    setActiveId(null)
    writeActiveId(null)
    setShowTokenRow(false)
  }

  const openOfficialLogin = async () => {
    if (loginBusy) return
    setLoginBusy(true)
    try {
      const out = await window.rgbbox.ai8OpenLogin()
      if (out.ok && out.token) {
        setToken(out.token)
        writeStoredToken(out.token)
        setLoginAccount(out.account ?? '')
        setShowTokenRow(false)
      }
    } catch {
      setShowTokenRow(true)
    } finally {
      setLoginBusy(false)
    }
  }

  /** R113.2: "new chat" only resets the composer — the server session is
   *  created lazily on the first message of the fresh draft. */
  const startNewChat = useCallback(() => {
    setActiveId(null)
    writeActiveId(null)
  }, [])

  const deleteSession = useCallback((id: string | number) => {
    setSessions((list) => {
      const next = list.filter((s) => s.id !== id)
      writeSessions(next)
      return next
    })
    if (String(activeId) === String(id)) {
      setActiveId(null)
      writeActiveId(null)
    }
    void client().deleteSession(id).catch(() => undefined)
  }, [activeId])

  const upsertSession = useCallback((session: Ai8Session) => {
    setSessions((list) => {
      const idx = list.findIndex((s) => s.id === session.id)
      const next = idx >= 0 ? list.map((s) => (s.id === session.id ? session : s)) : [session, ...list]
      writeSessions(next)
      return next
    })
    setActiveId(session.id)
    writeActiveId(session.id)
  }, [])

  const appendTurn = useCallback((sessionId: string | number, turn: Ai8Turn, patch?: Partial<Ai8Session>) => {
    setSessions((list) => {
      const next = list.map((s) => {
        if (s.id !== sessionId) return s
        const merged: Ai8Session = { ...s, ...patch, turns: [...s.turns, turn], updatedAt: Date.now() }
        if (turn.role === 'user' && !s.turns.some((x) => x.role === 'user')) merged.title = titleFromContent(turn.content)
        return merged
      })
      writeSessions(next)
      return next
    })
  }, [])

  const patchLastAssistant = useCallback((sessionId: string | number, patch: Partial<Ai8Turn>) => {
    setSessions((list) => {
      const next = list.map((s) => {
        if (s.id !== sessionId) return s
        const turns = [...s.turns]
        const last = turns[turns.length - 1]
        if (last?.role === 'assistant') turns[turns.length - 1] = { ...last, ...patch }
        return { ...s, turns, updatedAt: Date.now() }
      })
      writeSessions(next)
      return next
    })
  }, [])

  const stopStreaming = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }

  const send = async () => {
    const content = input.trim()
    if (!content || streaming) return
    if (!token) {
      void openOfficialLogin()
      return
    }
    // R115.1: image attachment rides along as files:[{name,url}] — data URL
    // form; server rejection surfaces as a normal error turn (probe pending).
    const files = attachment ? [{ name: attachment.name, url: attachment.dataUrl }] : []
    const attach = attachment
    setAttachment(null)
    // R113.4 draw mode: POST /draw task then poll /draw/status/{id}. The site's
    // parameter shape is not yet reverse-engineered (experimental) — server
    // errors surface verbatim in the log.
    if (prefs.draw) {
      setInput('')
      const draftId = `draw-${Date.now()}`
      setSessions((list) => {
        const next = [{ id: draftId, model: prefs.model, title: titleFromContent(content), turns: [{ role: 'user', content }, { role: 'assistant', content: t('ai.ai8.drawPending') }], createdAt: Date.now(), updatedAt: Date.now() } as Ai8Session, ...list]
        writeSessions(next)
        return next
      })
      setActiveId(draftId)
      writeActiveId(draftId)
      setStreaming(true)
      try {
        const created = await fetch('https://ai8.rcouyi.com/api/draw', {
          method: 'POST',
          headers: { Authorization: token, 'X-APP-VERSION': '3.4.0', 'X-Locale': 'zh-CN', 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: content }),
        }).then((r) => r.json().catch(() => ({ code: -1, msg: `HTTP ${r.status}` })))
        if (created.code !== 0) {
          patchLastAssistant(draftId, { error: created.msg || 'draw rejected' })
          return
        }
        const taskId = (created.data as { id?: string | number } | null)?.id
        if (taskId === undefined) {
          patchLastAssistant(draftId, { error: 'draw task id missing' })
          return
        }
        for (let poll = 0; poll < 36; poll++) {
          await new Promise((resolve) => setTimeout(resolve, 2500))
          const status = await fetch(`https://ai8.rcouyi.com/api/draw/status/${taskId}`, { headers: { Authorization: token, 'X-APP-VERSION': '3.4.0', 'X-Locale': 'zh-CN' } })
            .then((r) => r.json().catch(() => ({ code: -1 })))
          if (status.code !== 0) {
            patchLastAssistant(draftId, { error: status.msg || 'draw status error' })
            return
          }
          const list = (status.data as { list?: { url?: string; status?: number }[] } | null)?.list ?? []
          const urls = list.map((item) => item.url).filter((u): u is string => typeof u === 'string' && u !== '')
          if (urls.length > 0) {
            patchLastAssistant(draftId, { content: urls.join('\n') })
            return
          }
        }
        patchLastAssistant(draftId, { error: 'draw timeout' })
      } catch {
        patchLastAssistant(draftId, { error: 'network' })
      } finally {
        setStreaming(false)
      }
      return
    }
    let sessionId = activeId
    let title = ''
    if (sessionId === null) {
      try {
        const created = await client().createSession<{ id: string | number }>({ model: prefs.model })
        const raw = created.id
        sessionId = typeof raw === 'number' ? raw : Number.isFinite(Number(raw)) ? Number(raw) : raw
        title = titleFromContent(content)
        upsertSession({ id: sessionId, model: prefs.model, title, turns: [], createdAt: Date.now(), updatedAt: Date.now() })
      } catch (error) {
        const code = error instanceof Ai8Error ? error.code : 0
        setSessions((list) => [...list, { id: `err-${Date.now()}`, model: prefs.model, title: titleFromContent(content), turns: [{ role: 'assistant', content: '', error: code === 2 ? 'expired' : 'network' }], createdAt: Date.now(), updatedAt: Date.now() }])
        return
      }
    }
    setInput('')
    appendTurn(sessionId, { role: 'user', content: attach ? `${content}\n[🖼 ${attach.name}]` : content })
    appendTurn(sessionId, { role: 'assistant', content: '' })
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const ev of client().chat(sessionId, content, { thinking: prefs.thinking, webSearch: prefs.webSearch, signal: controller.signal, files })) {
        if (ev.type === 'delta') {
          setSessions((list) => {
            const next = list.map((s) => {
              if (s.id !== sessionId) return s
              const turns = [...s.turns]
              const last = turns[turns.length - 1]
              if (last?.role === 'assistant') turns[turns.length - 1] = { ...last, content: last.content + ev.text }
              return { ...s, turns }
            })
            writeSessions(next)
            return next
          })
        } else if (ev.type === 'error') {
          patchLastAssistant(sessionId, { error: ev.message })
          break
        }
      }
    } catch (error) {
      const code = error instanceof Ai8Error ? error.code : 0
      const hint = code === 2 ? 'expired' : code === -1 ? 'nokey' : 'network'
      patchLastAssistant(sessionId, { error: hint })
    } finally {
      abortRef.current = null
      setStreaming(false)
      // empty-reply guard: a stream that ended without any delta must not stay
      // silently blank
      setSessions((list) => {
        const next = list.map((s) => {
          if (s.id !== sessionId) return s
          const turns = [...s.turns]
          const last = turns[turns.length - 1]
          if (last?.role === 'assistant' && last.content === '' && last.error === undefined) turns[turns.length - 1] = { ...last, error: 'network' }
          return { ...s, turns }
        })
        writeSessions(next)
        return next
      })
    }
  }

  const turns = activeSession?.turns ?? []

  return (
    <div className="ai8" data-field="ai8-root">
      <aside className="ai8-side">
        <div className="ai8-side-head">
          <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-new-chat" onClick={startNewChat}>
            <Plus size={14} /> {t('ai.ai8.newChat')}
          </button>
        </div>
        <div className="ai8-sessions" data-field="ai8-sessions">
          {sessions.length === 0 && <p className="ai8-empty">{t('ai.ai8.noSessions')}</p>}
          {[...sessions].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => (
            <div key={s.id} className={`ai8-session${String(s.id) === String(activeId) ? ' active' : ''}`} onClick={() => { setActiveId(s.id); writeActiveId(s.id) }}>
              <strong>{s.title || t('ai.ai8.untitled')}</strong>
              <small>{new Date(s.updatedAt).toLocaleString()}</small>
              <button
                type="button"
                className="ai8-session-del"
                aria-label={t('ai.ai8.deleteSession')}
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <div className="ai8-side-foot">
          {token === '' ? (
            <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-open-login" onClick={() => void openOfficialLogin()} disabled={loginBusy}>
              {loginBusy ? t('ai.ai8.loginWaiting') : t('ai.ai8.loginButton')}
            </button>
          ) : (
            <>
              <span className="ai8-token-ok">{t('ai.ai8.tokenOk')}{loginAccount !== '' ? ` · ${loginAccount}` : ''}</span>
              <div className="ai8-token-actions">
                <button type="button" className="ai8-btn" data-action="ai8-change-token" onClick={() => void openOfficialLogin()}>{t('ai.ai8.tokenChange')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-clear-token" onClick={clearToken}>{t('ai.ai8.tokenClear')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-show-paste" onClick={() => setShowTokenRow((v) => !v)}>{t('ai.ai8.tokenManual')}</button>
              </div>
            </>
          )}
          {showTokenRow ? (
            <div className="ai8-paste-row">
              <input
                data-field="ai8-token"
                type="password"
                value={tokenDraft}
                placeholder={t('ai.ai8.tokenPlaceholder')}
                onChange={(e) => setTokenDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveToken() }}
              />
              <button type="button" className="ai8-btn" data-action="ai8-save-token" onClick={saveToken} disabled={tokenDraft.trim() === ''}>{t('ai.ai8.tokenSave')}</button>
            </div>
          ) : null}
          <p className="ai8-privacy">{t('ai.ai8.privacyNote')}</p>
        </div>
      </aside>

      <section className="ai8-main">
        <div className="ai8-controls">
          <select
            className="ai8-select"
            data-field="ai8-model"
            value={prefs.model}
            onChange={(e) => patchPrefs({ model: e.target.value })}
          >
            <option value="">{models.length === 0 ? (modelsError !== '' ? t('ai.ai8.modelsError') : t('ai.ai8.modelsLoading')) : t('ai.ai8.pickModel')}</option>
            {(['flagship', 'fast', 'free', 'budget'] as const).map((groupId) => (
              curated[groupId] ? (
                <optgroup key={groupId} label={t(`ai.ai8.curated.${groupId}`)} className="ai8-curated">
                  {curated[groupId].map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ) : null
            ))}
            {groups.map((group) => (
              <optgroup key={group.provider} label={group.provider}>
                {group.models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}{m.integral ? ` · ${m.integral}` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <label className="ai8-check">
            <input type="checkbox" checked={prefs.draw} onChange={(e) => patchPrefs({ draw: e.target.checked })} />
            {t('ai.ai8.drawMode')}
          </label>
          <label className="ai8-check">
            <input type="checkbox" checked={prefs.thinking} onChange={(e) => patchPrefs({ thinking: e.target.checked })} />
            {t('ai.ai8.thinking')}
          </label>
          <label className="ai8-check">
            <input type="checkbox" checked={prefs.webSearch} onChange={(e) => patchPrefs({ webSearch: e.target.checked })} />
            {t('ai.ai8.webSearch')}
          </label>
        </div>

        <div className="ai8-log" data-field="ai8-log">
          {turns.length === 0 && (
            <div className="ai8-placeholder">
              <p>{activeSession ? t('ai.ai8.hintReady') : t('ai.ai8.hintNew')}</p>
              <small>{prefs.draw ? t('ai.ai8.drawHint') : t('ai.ai8.contextHint')}</small>
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
              {turn.role === 'assistant' && turn.error === undefined && turn.content !== '' ? (
                <button
                  type="button"
                  className="md-copy ai8-msg-copy"
                  data-action="ai8-copy-msg"
                  onClick={() => { void navigator.clipboard.writeText(turn.content).catch(() => undefined) }}
                  aria-label={t('ai.ai8.copy')}
                  title={t('ai.ai8.copy')}
                >
                  ⧉
                </button>
              ) : null}
              <span className="ai-msg-role">{turn.role}</span>
              {turn.error !== undefined
                ? <span className="ai-msg-error">{turn.error === 'expired' || turn.error === 'nokey' ? t('ai.ai8.errToken') : `${t('ai.ai8.errNetwork')} (${turn.error})`}</span>
                : turn.role === 'assistant'
                  ? <MarkdownView text={turn.content} copyLabel={t('ai.ai8.copy')} copiedLabel={t('ai.ai8.copied')} />
                  : <span className="ai-msg-text">{turn.content}</span>}
            </div>
          ))}
        </div>

        {attachment ? (
          <div className="ai8-attach" data-field="ai8-attach">
            <img src={attachment.dataUrl} alt={attachment.name} />
            <span className="ai8-attach-name">{attachment.name}</span>
            <button type="button" data-action="ai8-remove-attach" onClick={() => setAttachment(null)} aria-label={t('ai.ai8.removeAttach')}>✕</button>
          </div>
        ) : null}

        <div className="ai8-input-row">
          <label className="ai8-attach-btn" title={t('ai.ai8.attach')} aria-label={t('ai.ai8.attach')}>
            📎
            <input
              type="file"
              accept="image/*"
              data-field="ai8-file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readImageFile(file).then(setAttachment).catch(() => undefined)
                e.target.value = ''
              }}
            />
          </label>
          <textarea
            data-field="ai8-input"
            value={input}
            placeholder={token === '' ? t('ai.ai8.needLogin') : prefs.draw ? t('ai.ai8.drawPlaceholder') : t('ai.lab.chat.placeholder')}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              // R115.1: pasted screenshots (clipboard image) become the attachment
              const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
              const file = item?.getAsFile()
              if (file) {
                e.preventDefault()
                void readImageFile(file).then(setAttachment).catch(() => undefined)
              }
            }}
            onKeyDown={(e) => {
              const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
              if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
          />
          {streaming
            ? <button type="button" className="ai8-btn" data-action="ai8-stop" onClick={stopStreaming}>{t('ai.ai8.stop')}</button>
            : <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-send" onClick={() => void send()} disabled={input.trim() === ''}>{t('ai.lab.chat.send')}</button>}
        </div>
      </section>
    </div>
  )
}
