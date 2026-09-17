// R110: ai8.rcouyi.com API client — TS port of the reference ai8-client.mjs.
// The site sends `Access-Control-Allow-Origin: *`, so the renderer fetches it
// directly; no main-process relay and no electron/ipcRenderer contact (R5.1).
// Protocol notes (from the reference README): Authorization carries the raw
// token with NO `Bearer ` prefix; responses wrap as {code, data, msg} with
// code=0 ok, code=2 login expired, code=-2 not activated.

export const AI8_BASE = 'https://ai8.rcouyi.com/api'
export const AI8_APP_VERSION = '3.4.0'

export class Ai8Error extends Error {
  code: number
  data: unknown

  constructor(code: number, msg?: string, data?: unknown) {
    super(msg || `AI8 API error code=${code}`)
    this.name = 'Ai8Error'
    this.code = code
    this.data = data
  }
}

export interface Ai8Model {
  label: string
  value: string
  attr?: {
    integral?: string
    modelType?: string
    providerKey?: string
    capabilities?: { thinking?: boolean; imageInput?: boolean; stream?: boolean }
  }
}

export interface Ai8ChatTemplate {
  defModel?: string
  models: Ai8Model[]
  webSearchOpen?: boolean
}

export type Ai8SseEvent =
  | { type: 'meta'; taskId: string }
  | { type: 'delta'; text: string }
  | { type: 'extra'; data: unknown }
  | { type: 'error'; message: string }
  | { type: 'done'; full: string }

export interface Ai8ChatOptions {
  thinking?: boolean
  webSearch?: boolean
  systemPrompt?: string
  reasoningEffort?: '' | 'low' | 'medium' | 'high'
  signal?: AbortSignal
  files?: { name: string; url: string }[]
}

const TOKEN_KEY = 'rgbbox:ai8Token'

export function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeStoredToken(token: string): void {
  try {
    if (token === '') localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    return
  }
}

/** Parse one SSE `data:` payload the way the ai8 endpoint emits them. */
export function parseAi8SseLine(payload: string, full: string): { event: Ai8SseEvent; full: string; stop: boolean } {
  const trimmed = payload.trim()
  if (trimmed === '[DONE]') return { event: { type: 'done', full }, full, stop: true }
  let ev: { code?: number; data?: unknown; err?: string; msg?: string }
  try {
    ev = JSON.parse(trimmed) as typeof ev
  } catch {
    return { event: { type: 'done', full }, full, stop: false }
  }
  if (ev.code === 0) {
    if (typeof ev.data === 'string') return { event: { type: 'delta', text: ev.data }, full: full + ev.data, stop: false }
    if (ev.data && typeof ev.data === 'object') return { event: { type: 'extra', data: ev.data }, full, stop: false }
    return { event: { type: 'done', full }, full, stop: false }
  }
  return { event: { type: 'error', message: ev.err || ev.msg || JSON.stringify(ev) }, full, stop: true }
}

export class Ai8Client {
  token: string
  baseUrl: string
  onTokenExpired?: (msg: string) => void

  constructor({ token = '', baseUrl = AI8_BASE, onTokenExpired }: { token?: string; baseUrl?: string; onTokenExpired?: (msg: string) => void } = {}) {
    this.token = token
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.onTokenExpired = onTokenExpired
  }

  setToken(token: string): void {
    this.token = token
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.token) throw new Ai8Error(-1, 'missing token')
    return {
      Authorization: this.token,
      'X-APP-VERSION': AI8_APP_VERSION,
      'X-Locale': 'zh-CN',
      ...extra,
    }
  }

  private async unwrap<T>(res: Response): Promise<T> {
    const body = await res.json().catch(() => ({}) as { code?: number; data?: T; msg?: string })
    if (body.code === 0) return body.data as T
    if (body.code === 2) {
      this.onTokenExpired?.(body.msg ?? '')
      throw new Ai8Error(2, body.msg || 'login expired')
    }
    throw new Ai8Error(body.code ?? -2, body.msg, body.data)
  }

  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : ''
    const res = await fetch(this.baseUrl + path + qs, { headers: this.headers() })
    return this.unwrap<T>(res)
  }

  private async post<T>(path: string, data?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data ?? {}),
    })
    return this.unwrap<T>(res)
  }

  /** Account+password login; `.token` on the returned auth object is the header token. */
  async login(account: string, password: string): Promise<{ token?: string } & Record<string, unknown>> {
    const res = await fetch(this.baseUrl + '/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-APP-VERSION': AI8_APP_VERSION, 'X-Locale': 'zh-CN' },
      body: JSON.stringify({ account, password }),
    })
    const auth = await this.unwrap<{ token?: string } & Record<string, unknown>>(res)
    this.token = auth?.token ?? ''
    return auth
  }

  getUserInfo<T>(): Promise<T> {
    return this.get<T>('/user/info')
  }

  getBalance<T>(): Promise<T> {
    return this.get<T>('/user/frequency/balance')
  }

  /** Public endpoint — works without a token. */
  async getChatTemplate(): Promise<Ai8ChatTemplate> {
    const res = await fetch(this.baseUrl + '/chat/tmpl', {
      headers: { 'X-APP-VERSION': AI8_APP_VERSION, 'X-Locale': 'zh-CN' },
    })
    return this.unwrap<Ai8ChatTemplate>(res)
  }

  async getModels(modelType = 'chat'): Promise<Ai8Model[]> {
    const tmpl = await this.getChatTemplate()
    const models = tmpl?.models ?? []
    return modelType ? models.filter((m) => m.attr?.modelType === modelType) : models
  }

  listSessions<T>(page = 1, search = ''): Promise<T> {
    return this.get<T>('/chat/session', { page, ...(search ? { search } : {}) })
  }

  createSession<T>({ model, name, prompt, contextCount, temperature, maxToken }: { model?: string; name?: string; prompt?: string; contextCount?: number; temperature?: number; maxToken?: number } = {}): Promise<T> {
    return this.post<T>('/chat/session', {
      ...(model ? { model } : {}),
      ...(name ? { name } : {}),
      ...(prompt !== undefined ? { prompt } : {}),
      ...(contextCount !== undefined ? { contextCount } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxToken !== undefined ? { maxToken } : {}),
    })
  }

  updateSession<T>(sessionId: string | number, patch: Record<string, unknown>): Promise<T> {
    return fetch(this.baseUrl + `/chat/session/${sessionId}`, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch ?? {}),
    }).then((res) => this.unwrap<T>(res))
  }

  deleteSession(sessionId: string | number): Promise<unknown> {
    return fetch(this.baseUrl + `/chat/session/${sessionId}`, { method: 'DELETE', headers: this.headers() }).then((res) => this.unwrap<unknown>(res))
  }

  listRecords<T>(sessionId: string | number, page = 1): Promise<T> {
    return this.get<T>(`/chat/record/${sessionId}`, { page })
  }

  /** SSE chat. Yields meta/delta/extra/error/done events; abort via opts.signal. */
  async *chat(sessionId: string | number, text: string, opts: Ai8ChatOptions = {}): AsyncGenerator<Ai8SseEvent> {
    const body = {
      text,
      sessionId,
      files: opts.files ?? [],
      thinking: !!opts.thinking,
      webSearch: !!opts.webSearch,
      nativeTools: [],
      nativeToolOptions: {},
      reasoningEffort: opts.reasoningEffort ?? '',
      ...(opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {}),
    }
    const res = await fetch(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    const taskId = res.headers.get('X-Chat-Task-Id')
    if (taskId) yield { type: 'meta', taskId }
    const ctype = res.headers.get('content-type') ?? ''
    if (ctype.includes('application/json')) {
      const data = await this.unwrap<unknown>(res)
      const full = typeof data === 'string' ? data : JSON.stringify(data)
      yield { type: 'delta', text: full }
      yield { type: 'done', full }
      return
    }
    let full = ''
    for await (const payload of sseLines(res)) {
      const parsed = parseAi8SseLine(payload, full)
      full = parsed.full
      yield parsed.event
      if (parsed.stop) return
    }
    yield { type: 'done', full }
  }
}

/** Split a fetch Response body into SSE `data:` payloads. */
async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx).replace(/\r$/, '')
      buf = buf.slice(idx + 1)
      if (line.startsWith('data:')) yield line.slice(5).replace(/^ /, '')
    }
  }
}
