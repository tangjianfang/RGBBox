import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { MarkdownView, ThinkPanel, copyRichText, markdownToHtml, splitThinkBlocks, stripThink } from '../ai8/markdown'
import { AI8_VIDEO_PROVIDERS, Ai8Client, Ai8Error, isDrawDone, isDrawLimitError, parseDrawImages, parseDrawTemplate, parseVideoTemplate, readStoredToken, writeStoredToken, type Ai8DrawModelGroup, type Ai8Model, type Ai8VideoProvider } from '../../../shared/ai8Client'
import { cleanGeneratedTitle, groupModelsByProvider, matchCurated, pushInputHistory, readActiveId, readInputHistory, readPrefs, readSessions, titleFromContent, writeActiveId, writePrefs, writeSessions, type Ai8Prefs, type Ai8Session, type Ai8Turn } from '../ai8/localStore'
import { extractPromptFromMd, naturalCompare } from '../ai8/mdPrompt'

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

/** R126: seconds/ms → fixed mm:ss for the batch timers. */
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** R127: serve a local artifact path through the R70 media:// scheme — the
 *  path rides as a query param to dodge Windows drive-letter mangling. */
function mediaLocalSrc(path: string): string {
  return `media://local?p=${encodeURIComponent(path)}`
}

/** R126: live ticking timer for the turn being generated (mounts per active
 *  turn only — settled turns render the persisted `elapsed` instead). */
function ElapsedSince({ start }: { start: number }): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="ai8-turn-timer" data-field="ai8-batch-timer">⏱ {fmtElapsed(now - start)}</span>
}

/** R126: batch draw — save a generated image into the MD source folder via
 *  the main-side validated IPC (folder must be this session's pick). */
async function saveUrlToFolder(folder: string, fileName: string, url: string, signal?: AbortSignal): Promise<string | null> {
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
    return await window.rgbbox.ai8SaveImageToFolder(folder, fileName, dataUrl)
  } catch {
    return null
  }
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
 *  switch) must not refetch; one fetch per app session is enough. R120: the
 *  draw cache holds the parsed group structure; a FAILED fetch is not cached
 *  (so re-entering the tab retries) and surfaces an error placeholder.
 *  R121: the video template needs the token and is fetched once per session. */
let chatTmplCache: Ai8Model[] | null = null
let drawTmplCache: Ai8DrawModelGroup[] | null = null
let drawTmplDefault = ''
let videoTmplCache: { providers: Ai8VideoProvider[]; notice: string } | null = null

export function AiLabAi8Tab(): JSX.Element {
  const { t } = useI18n()
  const [token, setToken] = useState(() => readStoredToken())
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenRow, setShowTokenRow] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginAccount, setLoginAccount] = useState('')
  // R123.3: remembered-credentials manager (account+password → safeStorage in
  // main; "官网登录" then signs in headlessly via POST /user/login)
  const [credOpen, setCredOpen] = useState(false)
  const [credAccount, setCredAccount] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [credHint, setCredHint] = useState('')
  const credTimer = useRef(0)
  const showCredHint = (text: string) => {
    setCredHint(text)
    window.clearTimeout(credTimer.current)
    credTimer.current = window.setTimeout(() => setCredHint(''), 3200)
  }
  const [models, setModels] = useState<Ai8Model[]>(chatTmplCache ?? [])
  const [modelsError, setModelsError] = useState('')
  const [drawGroups, setDrawGroups] = useState<Ai8DrawModelGroup[]>(drawTmplCache ?? [])
  const [drawModelsError, setDrawModelsError] = useState('')
  // R121: video provider catalog — the full hardcoded mirror is the base; the
  //  authed template narrows it to the live providers when available.
  const [videoProviders, setVideoProviders] = useState<Ai8VideoProvider[]>(videoTmplCache?.providers ?? AI8_VIDEO_PROVIDERS)
  const [videoNotice, setVideoNotice] = useState(videoTmplCache?.notice ?? '')
  const [prefs, setPrefs] = useState<Ai8Prefs>(() => readPrefs())
  const [sessions, setSessions] = useState<Ai8Session[]>(() => readSessions())
  const [activeId, setActiveId] = useState<string | number | null>(() => readActiveId())
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; dataUrl: string } | null>(null)
  // R117.9: transient hint for rejected text imports (oversize / unreadable)
  const [importHint, setImportHint] = useState('')
  // R117.1: per-session streaming — several sessions can stream concurrently
  const [streamingIds, setStreamingIds] = useState<string[]>([])
  // R126: one folder batch at a time (the server caps running tasks at ONE)
  const [batchBusy, setBatchBusy] = useState(false)
  // R129.1: the account's remaining credits (积分) — null while unknown
  const [balance, setBalance] = useState<number | null>(null)
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

  // R120: the draw template is public; parse the live cms-grouped shape (the
  // flat `models[]` era is gone — that misread is what kept the picker at
  // 「模型加载中…」forever). Cached at module level on SUCCESS only.
  useEffect(() => {
    if (drawTmplCache !== null) return
    new Ai8Client({ token: '' }).getDrawTemplate<unknown>()
      .then((tmpl) => {
        const parsed = parseDrawTemplate(tmpl)
        if (parsed.groups.length === 0) {
          setDrawModelsError('network')
          return
        }
        drawTmplCache = parsed.groups
        drawTmplDefault = parsed.defaultModel
        setDrawGroups(parsed.groups)
        if (drawTmplDefault !== '' && prefs.drawModel === '') patchPrefs({ drawModel: drawTmplDefault })
      })
      .catch(() => setDrawModelsError('network'))
  }, [prefs.drawModel])

  // R121: video template (auth) — one fetch per app session; failures fall
  //  back to the hardcoded catalog silently (video still works, just shows
  //  every provider). The notice (beta 3/day) is surfaced under the picker.
  useEffect(() => {
    if (videoTmplCache !== null || token === '') return
    client().getVideoTemplate<unknown>()
      .then((tmpl) => {
        videoTmplCache = parseVideoTemplate(tmpl)
        setVideoProviders(videoTmplCache.providers)
        setVideoNotice(videoTmplCache.notice)
      })
      .catch(() => undefined)
  }, [token])

  // R121: keep the video picker coherent — first provider when unset/removed
  //  by the template, and a version that belongs to the selected provider.
  useEffect(() => {
    if (prefs.mode !== 'video') return
    const provider = videoProviders.find((p) => p.id === prefs.videoModel)
    if (provider === undefined) {
      const first = videoProviders[0]
      if (first !== undefined) patchPrefs({ videoModel: first.id, videoVersion: first.versions[0]?.value ?? '' })
    } else if (!provider.versions.some((v) => v.value === prefs.videoVersion)) {
      patchPrefs({ videoVersion: provider.versions[0]?.value ?? '' })
    }
  }, [prefs.mode, prefs.videoModel, prefs.videoVersion, videoProviders])

  const client = () => new Ai8Client({ token, onTokenExpired: () => setShowTokenRow(true) })

  /** R129.1: silent balance refresh — /user/frequency/balance → the
   *  `remaining` field (site header shows the same number). Failure just
   *  clears the badge; never disturbs the flow. */
  const refreshBalance = useCallback(() => {
    if (token === '') {
      setBalance(null)
      return
    }
    client()
      .getBalance<{ remaining?: unknown }>()
      .then((out) => setBalance(typeof out?.remaining === 'number' ? out.remaining : null))
      .catch(() => setBalance(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  useEffect(() => {
    refreshBalance()
  }, [refreshBalance])

  /** R120: flat view over the grouped draw list — send guards and labelOf
   *  don't care about providers, the picker renders the groups. */
  const drawModels = useMemo(() => drawGroups.flatMap((g) => g.models), [drawGroups])

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
      // R123.2: remembered credentials first — a direct main-side
      // POST /user/login, zero window, zero typing. The site's own login
      // window never restores its session, so this is the fast path.
      try {
        const auto = await window.rgbbox.ai8AutoLogin()
        if (auto.ok && auto.token) {
          setToken(auto.token)
          writeStoredToken(auto.token)
          setLoginAccount(auto.account ?? '')
          setShowTokenRow(false)
          void syncTokenToProfiles(auto.token)
          return
        }
      } catch {
        // no stored credentials / IPC hiccup → the window flow below
      }
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

  /** R123.3: store the credentials, then immediately verify them with a
   *  headless sign-in — a valid pair lands the token right away; an invalid
   *  one stays saved (usable after fixing the password) with a hint. */
  const saveCredentials = async () => {
    const account = credAccount.trim()
    if (account === '' || credPassword === '') return
    try {
      await window.rgbbox.ai8SaveCredentials(account, credPassword)
      const auto = await window.rgbbox.ai8AutoLogin()
      if (auto.ok && auto.token) {
        setToken(auto.token)
        writeStoredToken(auto.token)
        setLoginAccount(account)
        setShowTokenRow(false)
        setCredPassword('')
        void syncTokenToProfiles(auto.token)
        showCredHint(t('ai.ai8.credOk'))
      } else {
        showCredHint(t('ai.ai8.credFail'))
      }
    } catch {
      showCredHint(t('ai.ai8.credFail'))
    }
  }

  const clearCredentials = async () => {
    try {
      await window.rgbbox.ai8ClearCredentials()
      showCredHint(t('ai.ai8.credCleared'))
    } catch {
      showCredHint(t('ai.ai8.credFail'))
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

  /** R122: shared draw polling core — submit, limit-error adoption and
   *  restart recovery all land here. `urls` pre-set = the task already
   *  finished on the server (receive-only, skip polling). R125: poll window
   *  108×2.5s≈270s (slow 4K models); on timeout the stuck task is DELETED
   *  server-side (it holds the account's ONE running slot) and `resubmit`,
   *  when provided by a fresh submit, fires exactly once. R126: returns the
   *  delivered image URLs (null on any failure/stop) so the batch queue can
   *  decide to advance. */
  const runDrawTask = async (sessionId: string | number, taskId: string, abort: AbortController, baseName: string, urls?: string[], resubmit?: () => Promise<string[] | null>): Promise<string[] | null> => {
    // R122.2: persist the id FIRST — everything after this is resumable
    patchLastAssistant(sessionId, { taskId, error: undefined })
    let finalUrls = urls
    if (finalUrls === undefined) {
      for (let poll = 0; poll < 108; poll++) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        if (abort.signal.aborted) {
          // P2-2 review fix: a stopped draw must not stay「绘画中…」forever
          patchLastAssistant(sessionId, { error: 'stopped' })
          return null
        }
        const status = await client().drawStatus<unknown>(taskId)
        // R124: live shape is outImages[]/imgUrl (list[].url is the legacy
        // branch); `end` is truthy-checked like the site's own poll loop.
        const got = parseDrawImages(status)
        if (got.length > 0 || isDrawDone(status)) {
          if (got.length === 0) {
            patchLastAssistant(sessionId, { error: 'draw empty' })
            return null
          }
          finalUrls = got
          break
        }
      }
      if (finalUrls === undefined) {
        // R125.3: stuck task — clear the server slot (best-effort), then
        // retry once for a fresh submit or report for adoption/recovery.
        await client().drawDelete(taskId).catch(() => undefined)
        if (resubmit !== undefined && !abort.signal.aborted) {
          patchLastAssistant(sessionId, { content: t('ai.ai8.drawResubmit'), error: undefined })
          return await resubmit()
        }
        patchLastAssistant(sessionId, { error: 'draw stuck cleared' })
        return null
      }
    }
    const done = finalUrls
    patchLastAssistant(sessionId, { content: done.join('\n'), images: done })
    // R117.3 review fix: the turn is DONE here — clear the streaming flag
    // before the (optional, best-effort) local caching runs, and cache
    // fire-and-forget with a timeout so a stalled CDN cannot keep the Stop
    // button alive for minutes.
    markStreaming(sessionId, false)
    // R129.1: a delivered image consumed credits — refresh the badge
    refreshBalance()
    void (async () => {
      const saved: string[] = []
      for (const url of done) {
        const path = await cacheRemoteImage(url, `${baseName}-${saved.length + 1}`, abort.signal)
        if (path) saved.push(path)
      }
      if (saved.length > 0) patchLastAssistant(sessionId, { saved })
    })()
    return done
  }

  /** R122.3: locate the server's LATEST draw task via GET /draw — prefers a
   *  locally persisted taskId, then the RUNNING record (the server caps
   *  running tasks at ONE per account), then the newest by startDate.
   *  Returns the resolved status so callers can receive finished results
   *  without re-polling. */
  const findLatestDrawTask = async (preferTaskId?: string): Promise<{ taskId: string; end: boolean; urls: string[] } | null> => {
    type DrawRec = { taskId?: string | number; startDate?: number | string; endDate?: number | string }
    const page = await client().drawRecords<{ records?: DrawRec[] }>(1, 6)
    const records = (page?.records ?? []).filter((r) => r.taskId !== undefined && r.taskId !== null && String(r.taskId) !== '')
    if (records.length === 0) return null
    const num = (v: number | string | undefined): number => {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    // a record without endDate is still running; ties broken by startDate
    const running = records
      .filter((r) => r.endDate === undefined || r.endDate === null || r.endDate === '' || num(r.endDate) === 0)
      .sort((a, b) => num(b.startDate) - num(a.startDate))
    const pool = running.length > 0 ? running : [...records].sort((a, b) => num(b.startDate) - num(a.startDate))
    const prefer = preferTaskId !== undefined && preferTaskId !== '' ? records.find((r) => String(r.taskId) === preferTaskId) : undefined
    const pick = prefer ?? pool[0]
    const taskId = String(pick.taskId)
    const status = await client().drawStatus<unknown>(taskId)
    // R124: same live-shape extraction as the poller (outImages/imgUrl, then
    // legacy list[].url); truthy end so a finished record receives instantly.
    const urls = parseDrawImages(status)
    return { taskId, end: isDrawDone(status), urls }
  }

  /** R122.3/R122.4: bind the server's latest draw task onto a session — the
   *  manual「查询最新绘画结果」button and restart recovery both go through
   *  here (the limit-error takeover lives inline in send()). */
  const adoptDrawTask = async (sessionId: string | number, preferTaskId?: string) => {
    if (token === '') return
    markStreaming(sessionId, true)
    const abort = new AbortController()
    abortMap.current.set(String(sessionId), abort)
    try {
      const session = sessions.find((s) => String(s.id) === String(sessionId))
      const firstUser = session?.turns.find((x) => x.role === 'user')?.content ?? ''
      const base = cleanGeneratedTitle(firstUser) || 'ai8-draw'
      patchLastAssistant(sessionId, { content: t('ai.ai8.drawTakeover'), error: undefined })
      const found = await findLatestDrawTask(preferTaskId)
      if (found === null) {
        patchLastAssistant(sessionId, { error: 'draw no task' })
        return
      }
      await runDrawTask(sessionId, found.taskId, abort, base, found.end ? found.urls : undefined)
    } catch (error) {
      patchLastAssistant(sessionId, { error: error instanceof Ai8Error ? error.message : 'network' })
    } finally {
      abortMap.current.delete(String(sessionId))
      markStreaming(sessionId, false)
    }
  }

  /** R126: patch the batch bookkeeping on a session (progress/counters). */
  const patchBatch = useCallback((id: string | number, patch: (b: NonNullable<Ai8Session['batch']>) => Ai8Session['batch']) => {
    setSessions((list) => {
      const next = list.map((s) => (String(s.id) !== String(id) ? s : { ...s, batch: patch(s.batch ?? { folder: '', total: 0, done: 0, failed: 0 }) }))
      writeSessions(next)
      return next
    })
  }, [])

  /** R126: folder-batch draw — one session for the whole folder, one turn
   *  pair per MD file, strictly sequential (the server allows ONE running
   *  task per account anyway). Prompt = the file's first fenced block
   *  (fallback: stripped plain text); a file with nothing usable is recorded
   *  failed and skipped. Per-file live timer (timerStart→elapsed) and a
   *  batch total; images are written back into the source folder via the
   *  main-validated IPC. Stop aborts between files and inside polling. */
  const runBatchDraw = async () => {
    if (batchBusy) return
    if (!token) {
      void openOfficialLogin()
      return
    }
    const drawModel0 = prefs.drawModel || drawModels[0]?.value || ''
    if (drawModel0 === '') return
    const picked = await window.rgbbox.ai8PickMdFolder()
    if (picked.folder === '') return
    const files = [...picked.files].sort((a, b) => naturalCompare(a.name, b.name))
    const folderName = picked.folder.split(/[\\/]/).filter(Boolean).pop() ?? picked.folder
    const batchId = `draw-${Date.now()}`
    const startedAt = Date.now()
    // R125.1/R128: family-aware request body (cms → args.area; platform →
    // model:<platform> + args.version; mj/niji → bare)
    const drawDef = drawModels.find((m) => m.value === drawModel0)
    const drawPostModel = drawDef?.platform ?? drawModel0
    const drawArea = drawDef?.platform === undefined ? drawDef?.area : undefined
    const drawVersion = drawDef?.platform !== undefined && drawDef.platform !== 'mj' && drawDef.platform !== 'niji' ? drawModel0 : undefined
    setBatchBusy(true)
    setSessions((list) => {
      const next = [{ id: batchId, kind: 'draw' as const, model: drawModel0, title: `${t('ai.ai8.batchTitle')} · ${folderName}`, turns: [], createdAt: startedAt, updatedAt: startedAt, batch: { folder: picked.folder, total: files.length, done: 0, failed: 0, startedAt } } as Ai8Session, ...list]
      writeSessions(next)
      return next
    })
    setActiveId(batchId)
    writeActiveId(batchId)
    markStreaming(batchId, true)
    const abort = new AbortController()
    abortMap.current.set(String(batchId), abort)
    let okCount = 0
    let failCount = 0
    /** stamp the final per-file elapsed onto the turn currently settling */
    const settle = (startMs: number, patch: Partial<Ai8Turn>) => {
      patchLastAssistant(batchId, { ...patch, timerStart: undefined, elapsed: Math.max(0, Math.round((Date.now() - startMs) / 1000)) })
    }
    try {
      if (files.length === 0) {
        appendTurn(batchId, { role: 'assistant', content: t('ai.ai8.batchNoFiles') })
      }
      for (const f of files) {
        if (abort.signal.aborted) break
        const baseName = f.name.replace(/\.md$/i, '')
        const prompt = extractPromptFromMd(f.content)
        appendTurn(batchId, { role: 'user', content: prompt === '' ? f.name : `${f.name}\n${prompt}`, file: f.name })
        const startMs = Date.now()
        if (prompt === '') {
          appendTurn(batchId, { role: 'assistant', content: '', error: 'md empty prompt', file: f.name, elapsed: 0 })
          failCount += 1
          patchBatch(batchId, (b) => ({ ...b, done: b.done + 1, failed: b.failed + 1 }))
          continue
        }
        appendTurn(batchId, { role: 'assistant', content: t('ai.ai8.drawPending'), file: f.name, timerStart: startMs })
        let urls: string[] | null = null
        try {
          const created = await client().draw<{ id?: string | number; taskId?: string | number }>({ model: drawPostModel, prompt, area: drawArea, version: drawVersion })
          const taskId = String(created?.taskId ?? created?.id ?? '')
          if (taskId === '') {
            settle(startMs, { error: 'draw task id missing' })
          } else {
            urls = await runDrawTask(batchId, taskId, abort, baseName)
          }
        } catch (error) {
          settle(startMs, { error: error instanceof Ai8Error ? error.message : 'network' })
        }
        if (urls !== null) {
          okCount += 1
          patchBatch(batchId, (b) => ({ ...b, done: b.done + 1 }))
          settle(startMs, {})
          urls.forEach((url, i) => {
            void saveUrlToFolder(picked.folder, `${baseName}-${i + 1}`, url, abort.signal)
          })
        } else {
          failCount += 1
          patchBatch(batchId, (b) => ({ ...b, done: b.done + 1, failed: b.failed + 1 }))
        }
      }
    } finally {
      abortMap.current.delete(String(batchId))
      markStreaming(batchId, false)
      setBatchBusy(false)
    }
    const stopped = abort.signal.aborted
    appendTurn(batchId, { role: 'assistant', content: `${stopped ? t('ai.ai8.batchStopped') : t('ai.ai8.batchDone')} — ${t('ai.ai8.batchOk')} ${okCount} / ${t('ai.ai8.batchFail')} ${failCount} · ⏱ ${fmtElapsed(Date.now() - startedAt)}` })
    patchBatch(batchId, (b) => ({ ...b, finished: true }))
  }

  // R122.5: restart recovery — a draw session left on the pending placeholder
  // (stop / quit / crash while the server task kept running) resumes polling
  // once a token exists. One attempt per session per mount; a session already
  // streaming is skipped (its own poll loop owns it). R126: batch sessions are
  // excluded — their last turn is a summary, never a resumable placeholder.
  const resumedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (token === '') return
    for (const s of sessions) {
      if (s.kind !== 'draw' || s.batch !== undefined) continue
      const last = s.turns[s.turns.length - 1]
      if (last === undefined || last.role !== 'assistant' || last.images !== undefined || last.error !== undefined) continue
      // the placeholder is the only non-URL, non-empty assistant content a
      // draw session can hold at this point
      if (last.content.trim() === '' || /^https?:\/\//.test(last.content.trim())) continue
      const key = String(s.id)
      if (resumedRef.current.has(key) || streamingIds.includes(key)) continue
      resumedRef.current.add(key)
      void adoptDrawTask(s.id, last.taskId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sessions])

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
    // this guard covers the Enter path. Draw/video tasks use their own model
    // namespaces (R117.3 / R121).
    if (prefs.mode === 'chat' && prefs.model === '') return
    // R122.0: an EMPTY drawModel must always be blocked — the old
    // `drawModels.length > 0` carve-out let an empty model slip through while
    // the cms-shaped template parsed to zero entries (「没有可用的渠道」).
    if (prefs.mode === 'draw' && prefs.drawModel === '') return
    if (prefs.mode === 'video' && (videoProviders.length === 0 || prefs.videoModel === '' || prefs.videoVersion === '')) return
    // R115.1: image attachment rides along as files:[{name,url}] — data URL
    // form; server rejection surfaces as a normal error turn (probe pending).
    const files = attachment ? [{ name: attachment.name, url: attachment.dataUrl }] : []
    const attach = attachment
    setAttachment(null)
    pushInputHistory(content)
    histIdx.current = -1
    // R121 video mode: the site's protocol — POST /video {model, action:'all',
    // isPublic:false, prompt, params:{version}} → poll GET /video/{id} until
    // `end`; the playable file is `videoUrl`. Video is far slower than draw —
    // poll every 5s for up to 10 minutes. No local caching (large files).
    if (prefs.mode === 'video') {
      const provider = videoProviders.find((p) => p.id === prefs.videoModel) ?? videoProviders[0]
      const version = prefs.videoVersion || provider?.versions[0]?.value || ''
      setInput('')
      const draftId = `video-${Date.now()}`
      setSessions((list) => {
        const next = [{ id: draftId, kind: 'video' as const, model: provider?.id ?? '', title: titleFromContent(content), turns: [{ role: 'user', content }, { role: 'assistant', content: t('ai.ai8.videoPending') }], createdAt: Date.now(), updatedAt: Date.now() } as Ai8Session, ...list]
        writeSessions(next)
        return next
      })
      setActiveId(draftId)
      writeActiveId(draftId)
      markStreaming(draftId, true)
      const videoAbort = new AbortController()
      abortMap.current.set(String(draftId), videoAbort)
      try {
        const created = await client().videoSubmit({ model: provider?.id ?? '', version, prompt: content })
        const taskId = (created as { id?: string | number } | null)?.id
        if (taskId === undefined || taskId === null) {
          patchLastAssistant(draftId, { error: 'video task id missing' })
          return
        }
        for (let poll = 0; poll < 120; poll++) {
          await new Promise((resolve) => setTimeout(resolve, 5000))
          if (videoAbort.signal.aborted) {
            patchLastAssistant(draftId, { error: 'stopped' })
            return
          }
          const status = await client().videoStatus<{ end?: boolean; videoUrl?: string; url?: string }>(taskId)
          const videoUrl = typeof status?.videoUrl === 'string' && status.videoUrl !== '' ? status.videoUrl : typeof status?.url === 'string' ? status.url : ''
          if (videoUrl !== '' || status?.end === true) {
            if (videoUrl === '') {
              patchLastAssistant(draftId, { error: 'video empty' })
              return
            }
            patchLastAssistant(draftId, { content: videoUrl, videoUrl })
            return
          }
        }
        patchLastAssistant(draftId, { error: 'video timeout' })
      } catch (error) {
        patchLastAssistant(draftId, { error: error instanceof Ai8Error ? error.message : 'network' })
      } finally {
        abortMap.current.delete(String(draftId))
        markStreaming(draftId, false)
      }
      return
    }
    // R117.3 draw mode: the site's own protocol — POST /draw
    // {model, action:'IMAGINE', prompt, public, fast, args:{area}} → poll
    // /draw/status/{id} until `end` or images (outImages/imgUrl, R124);
    // images render as a preview grid and auto-cache to disk.
    if (prefs.mode === 'draw') {
      const drawModel = prefs.drawModel || drawModels[0]?.value || ''
      // R125.1/R128: request-body shape by family — cms models carry the
      // template's default resolution as args:{area}; state-platform models
      // (OpenAI/Google/MJ…) POST model:<platform> with the picked version in
      // args:{version} (mj/niji: no args, params live in the prompt).
      const drawDef = drawModels.find((m) => m.value === drawModel)
      const drawPostModel = drawDef?.platform ?? drawModel
      const drawArea = drawDef?.platform === undefined ? drawDef?.area : undefined
      const drawVersion = drawDef?.platform !== undefined && drawDef.platform !== 'mj' && drawDef.platform !== 'niji' ? drawModel : undefined
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
      const base = cleanGeneratedTitle(content) || 'ai8-draw'
      // R125.3: one retry after a stuck task was cleared (no further nesting)
      const submitAndPoll = async (): Promise<string[] | null> => {
        const created = await client().draw<{ id?: string | number; taskId?: string | number }>({ model: drawPostModel, prompt: content, area: drawArea, version: drawVersion })
        const taskId = String(created?.taskId ?? created?.id ?? '')
        if (taskId === '') {
          patchLastAssistant(draftId, { error: 'draw task id missing' })
          return null
        }
        return await runDrawTask(draftId, taskId, drawAbort, base)
      }
      try {
        let created: { id?: string | number; taskId?: string | number } | undefined
        try {
          created = await client().draw<{ id?: string | number; taskId?: string | number }>({ model: drawPostModel, prompt: content, area: drawArea, version: drawVersion })
        } catch (error) {
          // R122.3: limit rejection — adopt the running task instead of a
          // dead-end error (it may have been submitted from the web app too)
          if (!isDrawLimitError(error)) throw error
          patchLastAssistant(draftId, { content: t('ai.ai8.drawTakeover') })
          const found = await findLatestDrawTask()
          if (found !== null) {
            await runDrawTask(draftId, found.taskId, drawAbort, base, found.end ? found.urls : undefined)
            return
          }
          // no running task left (the server freed it between reject and
          // list) — resubmit once after a short wait
          patchLastAssistant(draftId, { content: t('ai.ai8.drawResubmit') })
          await new Promise((resolve) => setTimeout(resolve, 4000))
          if (drawAbort.signal.aborted) {
            patchLastAssistant(draftId, { error: 'stopped' })
            return
          }
          created = await client().draw<{ id?: string | number; taskId?: string | number }>({ model: drawPostModel, prompt: content, area: drawArea, version: drawVersion })
        }
        const taskId = String(created?.taskId ?? created?.id ?? '')
        if (taskId === '') {
          patchLastAssistant(draftId, { error: 'draw task id missing' })
          return
        }
        await runDrawTask(draftId, taskId, drawAbort, base, undefined, submitAndPoll)
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
  // R117.2: sidebar entries lead with the model short name; draw/video
  // sessions use their own model namespaces (R117.3 / R121)
  const labelOf = (model: string) => models.find((m) => m.value === model)?.label ?? drawModels.find((m) => m.value === model)?.label ?? videoProviders.find((p) => p.id === model)?.label ?? ''
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
                <span className="ai8-session-kind">{s.kind === 'draw' ? '🎨' : s.kind === 'video' ? '🎬' : '💬'}</span>
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
            <>
              <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-open-login" onClick={() => void openOfficialLogin()} disabled={loginBusy}>
                {loginBusy ? t('ai.ai8.loginWaiting') : t('ai.ai8.loginButton')}
              </button>
              <div className="ai8-token-actions">
                <button type="button" className="ai8-btn" data-action="ai8-cred-toggle" onClick={() => { setCredOpen((v) => !v); setCredHint('') }}>{t('ai.ai8.credManage')}</button>
              </div>
            </>
          ) : (
            <>
              <span className="ai8-token-ok">{t('ai.ai8.tokenOk')}{loginAccount !== '' ? ` · ${loginAccount}` : ''}</span>
              {balance !== null ? (
                <button type="button" className="ai8-balance" data-field="ai8-balance" data-action="ai8-refresh-balance" onClick={refreshBalance} title={t('ai.ai8.balanceHint')}>⚡ {balance}</button>
              ) : null}
              <div className="ai8-token-actions">
                <button type="button" className="ai8-btn" data-action="ai8-change-token" onClick={() => void openOfficialLogin()}>{t('ai.ai8.tokenChange')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-clear-token" onClick={clearToken}>{t('ai.ai8.tokenClear')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-show-paste" onClick={() => setShowTokenRow((v) => !v)}>{t('ai.ai8.tokenManual')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-cred-toggle" onClick={() => { setCredOpen((v) => !v); setCredHint('') }}>{t('ai.ai8.credManage')}</button>
              </div>
            </>
          )}
          {credOpen ? (
            <div className="ai8-cred-block" data-field="ai8-cred-row">
              <input
                data-field="ai8-cred-account"
                type="text"
                autoComplete="username"
                spellCheck={false}
                value={credAccount}
                placeholder={t('ai.ai8.credAccount')}
                onChange={(e) => setCredAccount(e.target.value)}
              />
              <input
                data-field="ai8-cred-password"
                type="password"
                autoComplete="current-password"
                value={credPassword}
                placeholder={t('ai.ai8.credPassword')}
                onChange={(e) => setCredPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveCredentials() }}
              />
              <div className="ai8-cred-actions">
                <button type="button" className="ai8-btn" data-action="ai8-cred-save" onClick={() => void saveCredentials()} disabled={credAccount.trim() === '' || credPassword === ''}>{t('ai.ai8.credSave')}</button>
                <button type="button" className="ai8-btn" data-action="ai8-cred-clear" onClick={() => void clearCredentials()}>{t('ai.ai8.credClear')}</button>
              </div>
            </div>
          ) : null}
          {credHint !== '' ? <p className="ai8-import-hint" data-field="ai8-cred-hint">{credHint}</p> : null}
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
          {prefs.mode === 'draw' ? (
            // R117.3: draw mode swaps the picker to the draw-model namespace
            <select
              className="ai8-select"
              data-field="ai8-draw-model"
              value={prefs.drawModel}
              onChange={(e) => patchPrefs({ drawModel: e.target.value })}
            >
              <option value="">{drawModels.length === 0 ? (drawModelsError !== '' ? t('ai.ai8.modelsError') : t('ai.ai8.modelsLoading')) : t('ai.ai8.pickModel')}</option>
              {drawGroups.map((group, gi) =>
                group.provider !== '' ? (
                  <optgroup key={`${group.provider}-${gi}`} label={group.provider}>
                    {group.models.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                ) : (
                  group.models.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))
                ),
              )}
            </select>
          ) : prefs.mode === 'video' ? (
            // R121: video mode — provider + version pickers (catalog narrowed
            // by the authed template when available)
            <>
              <select
                className="ai8-select"
                data-field="ai8-video-model"
                value={prefs.videoModel}
                onChange={(e) => patchPrefs({ videoModel: e.target.value })}
              >
                {videoProviders.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <select
                className="ai8-select"
                data-field="ai8-video-version"
                value={prefs.videoVersion}
                onChange={(e) => patchPrefs({ videoVersion: e.target.value })}
              >
                {(videoProviders.find((p) => p.id === prefs.videoModel)?.versions ?? []).map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </>
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
          {prefs.mode === 'draw' ? (
            // R126: folder-batch draw — pick a folder of scene MDs and run
            // them sequentially into the current draw model
            <button type="button" className="ai8-btn" data-action="ai8-batch-draw" onClick={() => { void runBatchDraw() }} disabled={batchBusy || token === ''}>
              📁 {batchBusy ? t('ai.ai8.batchRunning') : t('ai.ai8.batchBtn')}
            </button>
          ) : null}
          {/* R121: three workbench modes replace the draw checkbox */}
          <div className="ai8-mode-seg" data-field="ai8-mode">
            {(['chat', 'draw', 'video'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`ai8-mode-btn${prefs.mode === m ? ' active' : ''}`}
                data-action={`ai8-mode-${m}`}
                onClick={() => patchPrefs({ mode: m })}
              >
                {t(`ai.ai8.mode.${m}`)}
              </button>
            ))}
          </div>
          {prefs.mode === 'chat' ? (
            <>
              <label className="ai8-check">
                <input type="checkbox" checked={prefs.thinking} onChange={(e) => patchPrefs({ thinking: e.target.checked })} />
                {t('ai.ai8.thinking')}
              </label>
              <label className="ai8-check">
                <input type="checkbox" checked={prefs.webSearch} onChange={(e) => patchPrefs({ webSearch: e.target.checked })} />
                {t('ai.ai8.webSearch')}
              </label>
            </>
          ) : null}
        </div>
        {prefs.mode === 'video' && videoNotice !== '' ? <p className="ai8-video-notice" data-field="ai8-video-notice">{videoNotice}</p> : null}

        <div className="ai8-log" data-field="ai8-log" ref={logRef}>
          {activeSession?.batch !== undefined ? (
            // R126: batch progress strip — counter + failures + live total
            <div className="ai8-batch-strip" data-field="ai8-batch-strip">
              📁 {activeSession.batch.done}/{activeSession.batch.total} · {t('ai.ai8.batchFail')} {activeSession.batch.failed}
              {activeSession.batch.startedAt !== undefined && activeSession.batch.finished !== true ? <ElapsedSince start={activeSession.batch.startedAt} /> : null}
            </div>
          ) : null}
          {turns.length === 0 && (
            <div className="ai8-placeholder">
              <p>{activeSession ? t('ai.ai8.hintReady') : t('ai.ai8.hintNew')}</p>
              <small>{prefs.mode === 'draw' ? t('ai.ai8.drawHint') : prefs.mode === 'video' ? t('ai.ai8.videoHint') : t('ai.ai8.contextHint')}</small>
            </div>
          )}
          {turns.map((turn, i) => (
            <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
              {turn.file !== undefined ? <span className="ai8-turn-file" data-field="ai8-turn-file">📄 {turn.file}</span> : null}
              {turn.timerStart !== undefined ? (
                <ElapsedSince start={turn.timerStart} />
              ) : turn.elapsed !== undefined && turn.file !== undefined ? (
                <span className="ai8-turn-timer">⏱ {fmtElapsed(turn.elapsed * 1000)}</span>
              ) : null}
              {turn.role === 'assistant' && turn.error === undefined && turn.content !== '' ? (
                <MessageCopyButton text={turn.content} label={t('ai.ai8.copy')} />
              ) : null}
              {turn.error !== undefined
                ? <span className="ai-msg-error">{turn.error === 'expired' || turn.error === 'nokey' ? t('ai.ai8.errToken') : `${t('ai.ai8.errNetwork')} (${turn.error})`}</span>
                : turn.role === 'assistant' && turn.videoUrl !== undefined
                  ? (
                    // R121: video replies render an inline player + a raw-file
                    // link (no local caching — video files are large)
                    <div className="ai8-video-result" data-field="ai8-video-result">
                      <video className="ai8-video-player" src={turn.videoUrl} controls preload="metadata" />
                      <button
                        type="button"
                        className="ai8-btn ai8-draw-open"
                        data-action="ai8-open-video"
                        onClick={() => { if (/^https?:\/\//.test(turn.videoUrl ?? '')) window.open(turn.videoUrl, '_blank') }}
                      >
                        🎬 {t('ai.ai8.videoOpen')}
                      </button>
                    </div>
                  )
                  : turn.role === 'assistant' && (turn.images !== undefined || (activeSession?.kind === 'draw' && /^https?:\/\/\S+$/.test(turn.content.trim())))
                  ? (
                    // R117.3: draw replies render as an image grid + cached-file
                    // shortcuts (legacy turns kept plain-URL content).
                    // R127: thumbnails prefer the LOCAL artifact (media://,
                    // saved[] order matches images[]) — the remote URL stays
                    // as the no-artifact fallback and the click-through.
                    <div className="ai8-draw-grid" data-field="ai8-draw-grid">
                      {(turn.images ?? turn.content.trim().split(/\s+/)).map((url, imgIdx) => {
                        const local = turn.saved?.[imgIdx]
                        return (
                          <img
                            key={url}
                            src={local !== undefined ? mediaLocalSrc(local) : url}
                            alt={t('ai.ai8.drawImage')}
                            loading="lazy"
                            onClick={() => { if (/^https?:\/\//.test(url)) window.open(url, '_blank') }}
                          />
                        )
                      })}
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
              {/* R122.4: manual recovery entry — error turns (limit/timeout/
                  stopped/channel) and stale pending turns offer「查询最新绘画
                  结果」to adopt the server's latest task and receive its
                  result; hidden while this session is already polling.
                  R126: batch sessions are excluded (their turns are per-file
                  records, not adoptable single tasks). */}
              {turn.role === 'assistant' && activeSession?.kind === 'draw' && activeSession?.batch === undefined && turn.images === undefined && turn.videoUrl === undefined && !activeStreaming ? (
                <button
                  type="button"
                  className="ai8-btn ai8-draw-latest"
                  data-action="ai8-draw-latest"
                  onClick={() => { if (activeSession !== null) void adoptDrawTask(activeSession.id) }}
                >
                  ↻ {t('ai.ai8.drawLatest')}
                </button>
              ) : null}
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
              accept={prefs.mode !== 'chat' ? '.txt,.md,.markdown,.json,.log,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py' : 'image/*,.txt,.md,.markdown,.json,.log,.csv,.xml,.yaml,.yml,.html,.js,.ts,.py'}
              data-field="ai8-file"
              style={{ display: 'none' }}
              onChange={(e) => {
                // R117.9: images ride along as attachments; text files import
                // their content straight into the composer (no giant paste).
                // Draw mode has no files field in its protocol — text only.
                const file = e.target.files?.[0]
                if (file) {
                  if (file.type.startsWith('image/') && prefs.mode === 'chat') {
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
            placeholder={token === '' ? t('ai.ai8.needLogin') : prefs.mode === 'draw' ? t('ai.ai8.drawPlaceholder') : prefs.mode === 'video' ? t('ai.ai8.videoPlaceholder') : t('ai.lab.chat.placeholder')}
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
            : <button type="button" className="ai8-btn ai8-btn-primary" data-action="ai8-send" onClick={() => void send()} disabled={input.trim() === '' || (prefs.mode === 'chat' && prefs.model === '') || (prefs.mode === 'draw' && prefs.drawModel === '') || (prefs.mode === 'video' && (videoProviders.length === 0 || prefs.videoModel === '' || prefs.videoVersion === ''))} title={(prefs.mode === 'chat' && prefs.model === '') || (prefs.mode === 'draw' && prefs.drawModel === '') || (prefs.mode === 'video' && (videoProviders.length === 0 || prefs.videoModel === '' || prefs.videoVersion === '')) ? t('ai.ai8.needModel') : undefined}>{t('ai.lab.chat.send')}</button>}
        </div>
      </section>
    </div>
  )
}
