import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { MarkdownView, ThinkPanel, copyRichText, markdownToHtml, splitThinkBlocks, stripThink } from '../ai8/markdown'
import { Ai8Client, Ai8Error, readStoredToken, writeStoredToken, type Ai8Model } from '../../../shared/ai8Client'
import { cleanGeneratedTitle, groupModelsByProvider, matchCurated, pushInputHistory, readActiveId, readInputHistory, readPrefs, readSessions, titleFromContent, writeActiveId, writePrefs, writeSessions, type Ai8Prefs, type Ai8Session, type Ai8Turn } from '../ai8/localStore'

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

/** R117.3: fetch a generated image and cache it on disk via ai8SaveArtifact —
 *  returns the absolute path (or null when anything fails; best-effort only,
 *  bounded by a 20s timeout so a stalled CDN can't hang the flow). */
async function cacheRemoteImage(url: string, baseName: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const timeout = AbortSignal.timeout(20_000)
    const composed = signal !== undefined ? AbortSignal.any([signal, timeout]) : timeout
    const blob = await fetch(url, { signal: composed }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.blob()
    })
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const ext = url.match(/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? 'png'
    return await window.rgbbox.ai8SaveArtifact(`${baseName}.${ext === 'jpeg' ? 'jpg' : ext}`, dataUrl)
  } catch {
    return null
  }
}

/** R117.5: fenced-code language → artifact file extension. */
const CODE_ARTIFACT_EXT: Record<string, string> = {
  html: '.html', md: '.md', markdown: '.md', json: '.json', svg: '.svg', xml: '.xml',
  css: '.css', js: '.js', javascript: '.js', mjs: '.mjs', ts: '.ts', typescript: '.ts',
  tsx: '.tsx', jsx: '.jsx', py: '.py', python: '.py', java: '.java', c: '.c', cpp: '.cpp',
  'c++': '.cpp', cs: '.cs', go: '.go', rs: '.rs', rust: '.rs', rb: '.rb', ruby: '.rb',
  php: '.php', sql: '.sql', sh: '.sh', bash: '.sh', shell: '.sh', ps1: '.ps1',
  yaml: '.yaml', yml: '.yml', toml: '.toml', ini: '.ini', env: '.env', txt: '.txt',
}

/** R116 (round 4): one-click copy that yields a structured document — both
 *  formats go on the clipboard: text/plain (clean markdown, think chains
 *  stripped) and text/html (semantic tags with light inline styles, so Word /
 *  mail / docs keep headings, lists and code blocks on paste). The write goes
 *  through the preload's native clipboard IPC (navigator.clipboard silently
 *  fails in Electron — R76 lesson). */
function MessageCopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    const md = stripThink(text).trim()
    void copyRichText(md, markdownToHtml(md)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button type="button" className="md-copy ai8-msg-copy" data-action="ai8-copy-msg" onClick={copy} aria-label={label} title={label}>
      {copied ? '✓' : '⧉'}
    </button>
  )
}

/** R117.7/P2-8: module-level template caches — remounting the tab (every page
 *  switch) must not refetch; one fetch per app session is enough. */
let chatTmplCache: Ai8Model[] | null = null
let drawTmplCache: { label: string; value: string }[] | null = null
let drawTmplDefault = ''

export function AiLabAi8Tab(): JSX.Element {
  const { t } = useI18n()
  const [token, setToken] = useState(() => readStoredToken())
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenRow, setShowTokenRow] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginAccount, setLoginAccount] = useState('')
  const [models, setModels] = useState<Ai8Model[]>(chatTmplCache ?? [])
  const [modelsError, setModelsError] = useState('')
  const [drawModels, setDrawModels] = useState<{ label: string; value: string }[]>(drawTmplCache ?? [])
  const [prefs, setPrefs] = useState<Ai8Prefs>(() => readPrefs())
  const [sessions, setSessions] = useState<Ai8Session[]>(() => readSessions())
  const [activeId, setActiveId] = useState<string | number | null>(() => readActiveId())
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null)
  // R117.9: transient hint for rejected text imports (oversize / unreadable)
  const [importHint, setImportHint] = useState('')
  // R117.1: per-session streaming — several sessions can stream concurrently
  const [streamingIds, setStreamingIds] = useState<string[]>([])
  const abortMap = useRef<Map<string, AbortController>>(new Map())
  // R117.8: ↑/↓ input history navigation (Claude Code style)
  const histIdx = useRef(-1)
  const histDraft = useRef('')

  const patchPrefs = useCallback((patch: Partial<Ai8Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      writePrefs(next)
      return next
    })
  }, [])

  // R113/R117.7: the model template is PUBLIC and cached at module level —
  // switching pages and back must render instantly (no refetch).
  useEffect(() => {
    if (chatTmplCache !== null) return
    const client = new Ai8Client({ token: '' })
    client.getChatTemplate()
      .then((tmpl) => {
        chatTmplCache = (tmpl.models ?? []).filter((m) => m.attr?.modelType === 'chat')
        setModels(chatTmplCache)
      })
      .catch(() => setModelsError('network'))
  }, [])

  // R117.3/P2-8: the draw template is public too; cached at module level like
  // the chat template — one fetch per app session.
  useEffect(() => {
    if (drawTmplCache !== null) return
    new Ai8Client({ token: '' }).getDrawTemplate<{ models?: { label?: string; value?: string; attr?: { modelType?: string } }[]; meta?: { defInput?: { model?: string } } }>()
      .then((tmpl) => {
        drawTmplCache = (tmpl.models ?? [])
          .filter((m): m is { label: string; value: string } => typeof m.value === 'string' && m.label !== undefined)
        drawTmplDefault = tmpl.meta?.defInput?.model ?? ''
        setDrawModels(drawTmplCache)
        if (drawTmplDefault !== '' && prefs.drawModel === '') patchPrefs({ drawModel: drawTmplDefault })
      })
      .catch(() => undefined)
  }, [prefs.drawModel])

  const client = () => new Ai8Client({ token, onTokenExpired: () => setShowTokenRow(true) })

  const activeSession = useMemo(() => sessions.find((s) => String(s.id) === String(activeId)) ?? null, [sessions, activeId])
  const groups = useMemo(() => groupModelsByProvider(models), [models])
  const curated = useMemo(() => matchCurated(models), [models])

  /** R118.3: keep any ai8://chat profile's apiKey in sync with the live
   *  token, so the underlying abilities (OCR/translate/AI Lab chat) pick it
   *  up immediately after a (re)login. */
  const syncTokenToProfiles = useCallback(async (tk: string) => {
    if (tk === '') return
    try {
      const { profiles } = await window.rgbbox.aiGetProfiles()
      const target = profiles.find((p) => p.baseUrl.trim() === 'ai8://chat')
      if (target !== undefined && target.apiKey !== tk) await window.rgbbox.aiSaveProfile({ ...target, apiKey: tk })
    } catch {
      // best-effort — the config tab stays manually editable
    }
  }, [])

  const saveToken = () => {
    const trimmed = tokenDraft.trim()
    setToken(trimmed)
    writeStoredToken(trimmed)
    setTokenDraft('')
    if (trimmed !== '') setShowTokenRow(false)
    void syncTokenToProfiles(trimmed)
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
        void syncTokenToProfiles(out.token)
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
      const next = list.filter((s) => String(s.id) !== String(id))
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
      const idx = list.findIndex((s) => String(s.id) === String(session.id))
      const next = idx >= 0 ? list.map((s) => (String(s.id) === String(session.id) ? session : s)) : [session, ...list]
      writeSessions(next)
      return next
    })
    setActiveId(session.id)
    writeActiveId(session.id)
  }, [])

  const appendTurn = useCallback((sessionId: string | number, turn: Ai8Turn, patch?: Partial<Ai8Session>) => {
    setSessions((list) => {
      const next = list.map((s) => {
        if (String(s.id) !== String(sessionId)) return s
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
        if (String(s.id) !== String(sessionId)) return s
        const turns = [...s.turns]
        const last = turns[turns.length - 1]
        if (last?.role === 'assistant') turns[turns.length - 1] = { ...last, ...patch }
        return { ...s, turns, updatedAt: Date.now() }
      })
      writeSessions(next)
      return next
    })
  }, [])

  /** R116.3 (round 2): the site's NATIVE generate-title endpoint — the server
   *  derives the title from the session content itself, so no throwaway
   *  session and no prompt pollution. One-shot via `titled`; failure silently
   *  keeps the truncated fallback. Local draw drafts have no server session
   *  and keep their prompt-derived title. */
  const refreshTitle = useCallback(async (sessionId: string | number) => {
    setSessions((list) => {
      const next = list.map((s) => (String(s.id) === String(sessionId) ? { ...s, titled: true } : s))
      writeSessions(next)
      return next
    })
    try {
      const out = await client().generateTitle(sessionId)
      const title = cleanGeneratedTitle(String(out?.name ?? ''))
      if (title === '') return
      setSessions((list) => {
        const next = list.map((s) => (String(s.id) === String(sessionId) ? { ...s, title } : s))
        writeSessions(next)
        return next
      })
    } catch {
      // silent — the truncated fallback title stays
    }
  }, [token])

  // R117.1: streaming bookkeeping is keyed by session id — concurrent chats
  // each get their own abort controller and stop button.
  const markStreaming = (id: string | number, on: boolean) => {
    setStreamingIds((ids) => (on ? (ids.includes(String(id)) ? ids : [...ids, String(id)]) : ids.filter((x) => x !== String(id))))
  }

  const stopStreaming = (id: string | number) => {
    abortMap.current.get(String(id))?.abort()
    abortMap.current.delete(String(id))
    markStreaming(id, false)
  }

  const send = async () => {
    const content = input.trim()
    // R117.1: only the ACTIVE session's stream blocks this composer — other
    // sessions may stream concurrently.
    if (!content || (activeId !== null && streamingIds.includes(String(activeId)))) return
    if (!token) {
      void openOfficialLogin()
      return
    }
    // R116.1: a session without a model is rejected by the server
    // (「模型 是必填项」) — the send button is already disabled for this case;
    // this guard covers the Enter path. Draw tasks use the draw model space.
    if (!prefs.draw && prefs.model === '') return
    if (prefs.draw && prefs.drawModel === '' && drawModels.length > 0) return
    // R115.1: image attachment rides along as files:[{name,url}] — data URL
    // form; server rejection surfaces as a normal error turn (probe pending).
    const files = attachment ? [{ name: attachment.name, url: attachment.dataUrl }] : []
    const attach = attachment
    setAttachment(null)
    pushInputHistory(content)
    histIdx.current = -1
    // R117.3 draw mode: the site's own protocol — POST /draw
    // {model, action:'IMAGINE', prompt, public, fast} → poll /draw/status/{id}
    // until `end` or a non-empty list[].url; images render as a preview grid
    // and auto-cache to disk via ai8SaveArtifact.
    if (prefs.draw) {
      const drawModel = prefs.drawModel || drawModels[0]?.value || ''
      setInput('')
      const draftId = `draw-${Date.now()}`
      setSessions((list) => {
        const next = [{ id: draftId, kind: 'draw' as const, model: drawModel, title: titleFromContent(content), turns: [{ role: 'user', content }, { role: 'assistant', content: t('ai.ai8.drawPending') }], createdAt: Date.now(), updatedAt: Date.now() } as Ai8Session, ...list]
        writeSessions(next)
        return next
      })
      setActiveId(draftId)
      writeActiveId(draftId)
      markStreaming(draftId, true)
      // R117.1: the stop button must also abort draw polling
      const drawAbort = new AbortController()
      abortMap.current.set(String(draftId), drawAbort)
      try {
        const created = await client().draw<{ id?: string | number }>({ model: drawModel, prompt: content })
        const taskId = created?.id
        if (taskId === undefined || taskId === null) {
          patchLastAssistant(draftId, { error: 'draw task id missing' })
          return
        }
        for (let poll = 0; poll < 60; poll++) {
          await new Promise((resolve) => setTimeout(resolve, 2500))
          if (drawAbort.signal.aborted) {
            // P2-2 review fix: a stopped draw must not stay「绘画中…」forever
            patchLastAssistant(draftId, { error: 'stopped' })
            return
          }
          const status = await client().drawStatus<{ end?: boolean; list?: { url?: string }[] }>(taskId)
          const urls = (status?.list ?? []).map((item) => item.url).filter((u): u is string => typeof u === 'string' && u !== '')
          if (urls.length > 0 || status?.end === true) {
            if (urls.length === 0) {
              patchLastAssistant(draftId, { error: 'draw empty' })
              return
            }
            patchLastAssistant(draftId, { content: urls.join('\n'), images: urls })
            // R117.3 review fix: the turn is DONE here — clear the streaming
            // flag before the (optional, best-effort) local caching runs, and
            // cache fire-and-forget with a timeout so a stalled CDN cannot
            // keep the Stop button alive for minutes.
            markStreaming(draftId, false)
            void (async () => {
              const base = cleanGeneratedTitle(content) || 'ai8-draw'
              const saved: string[] = []
              for (const url of urls) {
                const path = await cacheRemoteImage(url, `${base}-${saved.length + 1}`, drawAbort.signal)
                if (path) saved.push(path)
              }
              if (saved.length > 0) patchLastAssistant(draftId, { saved })
            })()
            return
          }
        }
        patchLastAssistant(draftId, { error: 'draw timeout' })
      } catch (error) {
        patchLastAssistant(draftId, { error: error instanceof Ai8Error ? error.message : 'network' })
      } finally {
        abortMap.current.delete(String(draftId))
        markStreaming(draftId, false)
      }
      return
    }
    // R116.3: track the first completed exchange locally — no state-read race
    const sessionBefore = activeSession
    const isFirstExchange = sessionBefore === null || !sessionBefore.turns.some((x) => x.role === 'user')
    let hadError = false
    let replyText = ''
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
    // R116.1 (round 2): the server routes a chat by the SESSION's stored
    // model. A session whose model diverges from the picker (stale sessions
    // created before the model guard, or a mid-conversation switch) must be
    // patched first, or the server rejects with「模型 是必填项」.
    if (sessionBefore !== null && sessionBefore.model !== prefs.model) {
      try {
        await client().updateSession(sessionId, { model: prefs.model, name: sessionBefore.title })
        setSessions((list) => {
          const next = list.map((s) => (String(s.id) === String(sessionId) ? { ...s, model: prefs.model } : s))
          writeSessions(next)
          return next
        })
      } catch {
        // best-effort: the send itself will surface any server rejection
      }
    }
    appendTurn(sessionId, { role: 'user', content: attach ? `${content}\n[🖼 ${attach.name}]` : content })
    appendTurn(sessionId, { role: 'assistant', content: '' })
    markStreaming(sessionId, true)
    const controller = new AbortController()
    abortMap.current.set(String(sessionId), controller)
    try {
      for await (const ev of client().chat(sessionId, content, { thinking: prefs.thinking, webSearch: prefs.webSearch, signal: controller.signal, files })) {
        if (ev.type === 'delta') {
          replyText += ev.text
          setSessions((list) => {
            const next = list.map((s) => {
              if (String(s.id) !== String(sessionId)) return s
              const turns = [...s.turns]
              const last = turns[turns.length - 1]
              if (last?.role === 'assistant') turns[turns.length - 1] = { ...last, content: last.content + ev.text }
              return { ...s, turns }
            })
            writeSessions(next)
            return next
          })
        } else if (ev.type === 'error') {
          hadError = true
          patchLastAssistant(sessionId, { error: ev.message })
          break
        }
      }
    } catch (error) {
      hadError = true
      const code = error instanceof Ai8Error ? error.code : 0
      const hint = code === 2 ? 'expired' : code === -1 ? 'nokey' : 'network'
      patchLastAssistant(sessionId, { error: hint })
    } finally {
      abortMap.current.delete(String(sessionId))
      markStreaming(sessionId, false)
      // empty-reply guard: a stream that ended without any delta must not stay
      // silently blank
      setSessions((list) => {
        const next = list.map((s) => {
          if (String(s.id) !== String(sessionId)) return s
          const turns = [...s.turns]
          const last = turns[turns.length - 1]
          if (last?.role === 'assistant' && last.content === '' && last.error === undefined) turns[turns.length - 1] = { ...last, error: 'network' }
          return { ...s, turns }
        })
        writeSessions(next)
        return next
      })
      // R116.3: after the FIRST completed exchange, replace the truncated
      // fallback title via the site's native generate-title endpoint
      if (isFirstExchange && !hadError && replyText.trim() !== '') {
        void refreshTitle(sessionId)
      }
    }
  }

  const turns = activeSession?.turns ?? []

  // R116.2: keep the newest message in view while streaming (ChatGPT-style
  // inner scroll instead of growing the whole page)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  // R116.2: assistant messages carry a small model badge instead of the raw
  // 'assistant' role label
  const activeModelLabel = models.find((m) => m.value === activeSession?.model)?.label ?? 'AI'
  // R117.2: sidebar entries lead with the model short name; draw sessions use
  // the draw model namespace (R117.3)
  const labelOf = (model: string) => models.find((m) => m.value === model)?.label ?? drawModels.find((m) => m.value === model)?.label ?? ''
  // R117.1: the composer reflects the ACTIVE session only
  const activeStreaming = activeId !== null && streamingIds.includes(String(activeId))

  /** R117.5: persist a fenced code block as a local file (userData/
   *  ai8-artifacts) — returns the path for the "open folder" shortcut. */
  const saveCodeArtifact = useCallback(async (lang: string, body: string): Promise<string | null> => {
    const ext = CODE_ARTIFACT_EXT[lang.toLowerCase()] ?? (lang === '' ? '.txt' : `.${lang.toLowerCase().replace(/[^a-z0-9]/g, '') || 'txt'}`)
    try {
      return await window.rgbbox.ai8SaveArtifact(`ai8-snippet${ext}`, body)
    } catch {
      return null
    }
  }, [])

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
              <strong>
                <span className="ai8-session-kind">{s.kind === 'draw' ? '🎨' : '💬'}</span>
                {labelOf(s.model) !== '' ? <span className="ai8-session-model">{labelOf(s.model)}</span> : null}
                <span className="ai8-session-title">{s.title || t('ai.ai8.untitled')}</span>
              </strong>
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
          {prefs.draw ? (
            // R117.3: draw mode swaps the picker to the draw-model namespace
            <select
              className="ai8-select"
              data-field="ai8-draw-model"
              value={prefs.drawModel}
              onChange={(e) => patchPrefs({ drawModel: e.target.value })}
            >
              <option value="">{drawModels.length === 0 ? t('ai.ai8.modelsLoading') : t('ai.ai8.pickModel')}</option>
              {drawModels.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          ) : (
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
          )}
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

        <div className="ai8-log" data-field="ai8-log" ref={logRef}>
          {turns.length === 0 && (
            <div className="ai8-placeholder">
              <p>{activeSession ? t('ai.ai8.hintReady') : t('ai.ai8.hintNew')}</p>
              <small>{prefs.draw ? t('ai.ai8.drawHint') : t('ai.ai8.contextHint')}</small>
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
              {turn.role === 'assistant' && turn.error === undefined && turn.content !== '' ? (
                <MessageCopyButton text={turn.content} label={t('ai.ai8.copy')} />
              ) : null}
              {turn.error !== undefined
                ? <span className="ai-msg-error">{turn.error === 'expired' || turn.error === 'nokey' ? t('ai.ai8.errToken') : `${t('ai.ai8.errNetwork')} (${turn.error})`}</span>
                : turn.role === 'assistant' && (turn.images !== undefined || (activeSession?.kind === 'draw' && /^https?:\/\/\S+$/.test(turn.content.trim())))
                  ? (
                    // R117.3: draw replies render as an image grid + cached-file
                    // shortcuts (legacy turns kept plain-URL content)
                    <div className="ai8-draw-grid" data-field="ai8-draw-grid">
                      {(turn.images ?? turn.content.trim().split(/\s+/)).map((url) => (
                        <img key={url} src={url} alt={t('ai.ai8.drawImage')} loading="lazy" onClick={() => { if (/^https?:\/\//.test(url)) window.open(url, '_blank') }} />
                      ))}
                      {turn.saved !== undefined && turn.saved.length > 0 ? (
                        <button
                          type="button"
                          className="ai8-btn ai8-draw-open"
                          data-action="ai8-open-draw-folder"
                          onClick={() => { void window.rgbbox.ai8ShowItemInFolder(turn.saved![0]) }}
                        >
                          📂 {t('ai.ai8.openFolder')}
                        </button>
                      ) : null}
                    </div>
                  )
                  : turn.role === 'assistant'
                    ? (
                      <>
                        <span className="ai-msg-role">{activeModelLabel}</span>
                        {splitThinkBlocks(turn.content).map((seg, j) => (
                          seg.kind === 'think'
                            ? <ThinkPanel key={j} body={seg.body} closed={seg.closed} thinkingLabel={t('ai.ai8.thinkingNow')} thoughtLabel={t('ai.ai8.thought')} />
                            : seg.body.trim() === ''
                              ? null
                              : <MarkdownView key={j} text={seg.body} copyLabel={t('ai.ai8.copy')} copiedLabel={t('ai.ai8.copied')} onSaveCode={saveCodeArtifact} saveFileLabel={t('ai.ai8.saveFile')} openFolderLabel={t('ai.ai8.openFolder')} />
                        ))}
                      </>
                    )
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

        {importHint !== '' ? <p className="ai8-import-hint">{importHint}</p> : null}
        <div className="ai8-input-row">
          <label className="ai8-attach-btn" title={t('ai.ai8.attach')} aria-label={t('ai.ai8.attach')}>
            📎
            <input
              type="file"
              accept={prefs.draw ? '.txt,.md,.markdown,.json,.log,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py' : 'image/*,.txt,.md,.markdown,.json,.log,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py'}
              data-field="ai8-file"
              style={{ display: 'none' }}
              onChange={(e) => {
                // R117.9: images ride along as attachments; text files import
                // their content straight into the composer (no giant paste).
                // Draw mode has no files field in its protocol — text only.
                const file = e.target.files?.[0]
                if (file) {
                  if (file.type.startsWith('image/') && !prefs.draw) {
                    void readImageFile(file).then(setAttachment).catch(() => undefined)
                  } else if (file.size > 512 * 1024) {
                    setImportHint(t('ai.ai8.fileTooLarge'))
                    window.setTimeout(() => setImportHint(''), 2600)
                  } else {
                    void file.text().then((text) => {
                      setInput((prev) => (prev.trim() === '' ? '' : prev + '\n\n') + `【${file.name}】\n${text}`)
                    }).catch(() => undefined)
                  }
                }
                e.target.value = ''
              }}
            />
          </label>
          <textarea
            data-field="ai8-input"
            value={input}
            placeholder={token === '' ? t('ai.ai8.needLogin') : prefs.draw ? t('ai.ai8.drawPlaceholder') : t('ai.lab.chat.placeholder')}
            onChange={(e) => {
              // R117.8 review fix: editing exits history-recall mode — ↓ must
              // not restore the pre-recall draft over the user's edit
              histIdx.current = -1
              setInput(e.target.value)
            }}
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
              // R117.8: Claude-Code-style ↑/↓ recall of recently sent prompts
              // (only while the caret sits at the very start, so multiline
              // editing keeps its arrow keys; IME never intercepted)
              if (e.key === 'ArrowUp' && !native.isComposing && e.currentTarget.selectionStart === 0) {
                const hist = readInputHistory()
                if (hist.length > 0 && (input === '' || histIdx.current >= 0)) {
                  if (histIdx.current === -1) histDraft.current = input
                  histIdx.current = Math.min(histIdx.current + 1, hist.length - 1)
                  setInput(hist[histIdx.current])
                  e.preventDefault()
                }
              } else if (e.key === 'ArrowDown' && !native.isComposing && histIdx.current >= 0) {
                const hist = readInputHistory()
                histIdx.current -= 1
                setInput(histIdx.current === -1 ? histDraft.current : hist[histIdx.current])
                e.preventDefault()
              }
              if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) {
                e.preventDefault()
                void send()
              }
            }}
          />
          {activeStreaming && activeId !== null
            ? <button type="button" className="ai8-btn" data-action="ai8-stop" onClick={() => stopStreaming(activeId)}>{t('ai.ai8.stop')}</button>
            : <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-send" onClick={() => void send()} disabled={input.trim() === '' || (!prefs.draw && prefs.model === '') || (prefs.draw && drawModels.length > 0 && prefs.drawModel === '')} title={!prefs.draw && prefs.model === '' ? t('ai.ai8.needModel') : prefs.draw && drawModels.length > 0 && prefs.drawModel === '' ? t('ai.ai8.needModel') : undefined}>{t('ai.lab.chat.send')}</button>}
        </div>
      </section>
    </div>
  )
}
