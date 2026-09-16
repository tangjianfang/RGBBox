import { useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import { Ai8Client, Ai8Error, readStoredToken, writeStoredToken, type Ai8Model } from '../ai8/client'

interface Ai8Turn {
  role: 'user' | 'assistant'
  content: string
  error?: string
}

/** R110: AI8 tab — direct renderer fetch to ai8.rcouyi.com (site CORS is `*`).
 *  Token comes from the site's localStorage (manual paste per the reference
 *  README §二); v1 keeps it in localStorage with a privacy note. Conversation
 *  state is local-only, wiped on unmount like the other lab tabs. */
export function AiLabAi8Tab(): JSX.Element {
  const { t } = useI18n()
  const [token, setToken] = useState(() => readStoredToken())
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenRow, setShowTokenRow] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginAccount, setLoginAccount] = useState('')
  const [models, setModels] = useState<Ai8Model[]>([])
  const [modelsError, setModelsError] = useState('')
  const [modelValue, setModelValue] = useState('')
  // R111 fix: the ai8 Go backend requires a NUMERIC sessionId — stringifying it
  // makes /chat/completions 400 ("cannot unmarshal string into ... int64").
  const [sessionId, setSessionId] = useState<string | number | null>(null)
  const [turns, setTurns] = useState<Ai8Turn[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // R110.2: the model template is a PUBLIC endpoint — load it with no token so
  // the tab is browsable before any credentials are pasted.
  useEffect(() => {
    const client = new Ai8Client({ token: '' })
    client.getChatTemplate()
      .then((tmpl) => {
        const chatModels = (tmpl.models ?? []).filter((m) => m.attr?.modelType === 'chat')
        setModels(chatModels)
        setModelValue((current) => current || tmpl.defModel || chatModels[0]?.value || '')
      })
      .catch(() => setModelsError('network'))
  }, [])

  const client = () => new Ai8Client({ token, onTokenExpired: () => setShowTokenRow(true) })

  /** R111: open the official site in a child window; main captures the token
   *  from the site's localStorage once the user signs in. */
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
      // window failed to open — fall back to the manual paste row
      setShowTokenRow(true)
    } finally {
      setLoginBusy(false)
    }
  }

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
    setSessionId(null)
    setShowTokenRow(false)
  }

  const newSession = async () => {
    if (!token || !modelValue) return
    try {
      const created = await client().createSession<{ id: string | number }>({ model: modelValue })
      const raw = created.id
      setSessionId(typeof raw === 'number' ? raw : Number.isFinite(Number(raw)) ? Number(raw) : raw)
      setTurns([])
    } catch (error) {
      const code = error instanceof Ai8Error ? error.code : 0
      setTurns((list) => [...list, { role: 'assistant', content: '', error: code === 2 ? 'expired' : 'network' }])
    }
  }

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
    if (sessionId === null) {
      await newSession()
      return
    }
    setInput('')
    setTurns((list) => [...list, { role: 'user', content }, { role: 'assistant', content: '' }])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const ev of client().chat(sessionId, content, { thinking, webSearch, signal: controller.signal })) {
        if (ev.type === 'delta') {
          setTurns((list) => {
            const next = [...list]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + ev.text }
            return next
          })
        } else if (ev.type === 'error') {
          setTurns((list) => {
            const next = [...list]
            next[next.length - 1] = { role: 'assistant', content: '', error: ev.message }
            return next
          })
          break
        }
      }
    } catch (error) {
      const code = error instanceof Ai8Error ? error.code : 0
      const hint = code === 2 ? 'expired' : code === -1 ? 'nokey' : 'network'
      setTurns((list) => {
        const next = [...list]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.content === '') next[next.length - 1] = { role: 'assistant', content: '', error: hint }
        return next
      })
    } finally {
      // R111 fix: a stream that ends without any delta (e.g. an error response
      // wrapped in an SSE content-type) must not stay silently empty.
      abortRef.current = null
      setStreaming(false)
      setTurns((list) => {
        const last = list[list.length - 1]
        if (last?.role === 'assistant' && last.content === '' && last.error === undefined) {
          const next = [...list]
          next[next.length - 1] = { role: 'assistant', content: '', error: 'network' }
          return next
        }
        return list
      })
    }
  }

  const selectedModel = models.find((m) => m.value === modelValue)

  return (
    <div className="ai-ai8">
      {token === '' ? (
        <div className="ai-ai8-login" data-field="ai8-login">
          <p className="ai-ai8-login-title">{t('ai.ai8.loginTitle')}</p>
          <p className="ai-ai8-login-desc">{t('ai.ai8.loginDesc')}</p>
          <button type="button" data-action="ai8-open-login" onClick={() => void openOfficialLogin()} disabled={loginBusy}>
            {loginBusy ? t('ai.ai8.loginWaiting') : t('ai.ai8.loginButton')}
          </button>
          <button type="button" className="linklike" data-action="ai8-show-paste" onClick={() => setShowTokenRow(true)}>
            {t('ai.ai8.tokenManual')}
          </button>
        </div>
      ) : (
        <div className="ai-ai8-tokenrow">
          <span className="ai-status on">{t('ai.ai8.tokenOk')}{loginAccount !== '' ? ` · ${loginAccount}` : ''}</span>
          <button type="button" data-action="ai8-change-token" onClick={() => void openOfficialLogin()}>{t('ai.ai8.tokenChange')}</button>
          <button type="button" data-action="ai8-clear-token" onClick={clearToken}>{t('ai.ai8.tokenClear')}</button>
        </div>
      )}
      {token !== '' && showTokenRow ? (
        <div className="ai-ai8-tokenrow">
          <input
            data-field="ai8-token"
            type="password"
            value={tokenDraft}
            placeholder={t('ai.ai8.tokenPlaceholder')}
            onChange={(e) => setTokenDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveToken() }}
          />
          <button type="button" data-action="ai8-save-token" onClick={saveToken} disabled={tokenDraft.trim() === ''}>
            {t('ai.ai8.tokenSave')}
          </button>
        </div>
      ) : null}
      <p className="ai-privacy-note">{t('ai.ai8.privacyNote')}</p>

      <div className="ai-ai8-row">
        <select data-field="ai8-model" value={modelValue} onChange={(e) => setModelValue(e.target.value)}>
          {models.length === 0 && <option value="">{modelsError !== '' ? t('ai.ai8.modelsError') : t('ai.ai8.modelsLoading')}</option>}
          {models.map((m) => (
            <option key={m.value} value={m.value}>{m.label}{m.attr?.integral ? ` · ${m.attr.integral}` : ''}</option>
          ))}
        </select>
        <button type="button" data-action="ai8-new-session" onClick={() => void newSession()} disabled={token === '' || modelValue === ''}>
          {sessionId === null ? t('ai.ai8.newSession') : t('ai.ai8.resetSession')}
        </button>
      </div>

      <div className="ai-ai8-toggles">
        <label>
          <input type="checkbox" checked={thinking} onChange={(e) => setThinking(e.target.checked)} />
          {t('ai.ai8.thinking')}
        </label>
        <label>
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
          {t('ai.ai8.webSearch')}
        </label>
        {selectedModel?.attr?.integral ? <span className="ai-ai8-integral">{selectedModel.attr.integral}</span> : null}
      </div>

      <div className="ai-chat-log" data-field="ai8-log">
        {turns.length === 0 && <p className="ai-hint-line">{sessionId === null ? t('ai.ai8.hintNoSession') : t('ai.ai8.hintReady')}</p>}
        {turns.map((turn, i) => (
          <div key={i} className={`ai-msg ai-msg-${turn.role}`}>
            <span className="ai-msg-role">{turn.role}</span>
            {turn.error !== undefined
              ? <span className="ai-msg-error">{turn.error === 'expired' || turn.error === 'nokey' ? t('ai.ai8.errToken') : `${t('ai.ai8.errNetwork')} (${turn.error})`}</span>
              : <span className="ai-msg-text">{turn.content}</span>}
          </div>
        ))}
      </div>

      <div className="ai-chat-input-row">
        <textarea
          data-field="ai8-input"
          value={input}
          placeholder={sessionId === null ? t('ai.ai8.needSession') : t('ai.lab.chat.placeholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean }
            if (e.key === 'Enter' && !e.shiftKey && !native.isComposing) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {streaming
          ? <button type="button" data-action="ai8-stop" onClick={stopStreaming}>{t('ai.ai8.stop')}</button>
          : <button type="button" data-action="ai8-send" onClick={() => void send()} disabled={input.trim() === ''}>{t('ai.lab.chat.send')}</button>}
      </div>
    </div>
  )
}
