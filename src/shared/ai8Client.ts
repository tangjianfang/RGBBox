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

// ── R120: draw template parsing — the live /draw/template moved its model
// list from a flat top-level `models[]` into `cms[].models[]` (grouped per
// provider), and `meta` is now null. Pure function so tests can pin both the
// live shape and the legacy flat one (kept for the e2e mock).

export interface Ai8DrawModel {
  label: string
  value: string
}

export interface Ai8DrawModelGroup {
  provider: string
  models: Ai8DrawModel[]
}

export interface Ai8DrawTemplateParsed {
  groups: Ai8DrawModelGroup[]
  /** First concrete model of the first group — mirrors the site's
   * firstModel (its `_csp_` platform entry resolves to the platform's first
   * concrete model on selection). */
  defaultModel: string
}

export function parseDrawTemplate(raw: unknown): Ai8DrawTemplateParsed {
  const tmpl = (raw ?? {}) as {
    models?: { label?: string; value?: string }[]
    meta?: { defInput?: { model?: string } } | null
    cms?: { name?: string; platform?: string; models?: { label?: string; value?: string }[] }[]
  }
  const pick = (m: { label?: string; value?: string }): Ai8DrawModel | null =>
    typeof m.value === 'string' && m.value !== '' ? { label: typeof m.label === 'string' && m.label !== '' ? m.label : m.value, value: m.value } : null
  // live shape: cms[].models[] grouped per provider (即梦/千问…)
  const groups: Ai8DrawModelGroup[] = []
  for (const provider of tmpl.cms ?? []) {
    const models = (provider.models ?? []).map(pick).filter((m): m is Ai8DrawModel => m !== null)
    if (models.length === 0) continue
    const name = typeof provider.name === 'string' && provider.name !== '' ? provider.name : provider.platform ?? ''
    groups.push({ provider: name, models })
  }
  if (groups.length > 0) return { groups, defaultModel: groups[0].models[0].value }
  // legacy flat shape (R117.3 era + e2e mock): models[] + meta.defInput.model
  const flat = (tmpl.models ?? []).map(pick).filter((m): m is Ai8DrawModel => m !== null)
  return { groups: flat.length > 0 ? [{ provider: '', models: flat }] : [], defaultModel: tmpl.meta?.defInput?.model ?? (flat[0]?.value ?? '') }
}

// ── R121: video generation protocol. The site's video board is in beta (its
// own notice caps generation at 3/day). /video/template needs the token and
// only tells WHICH providers are live (`state[].id`); the per-provider version
// lists are hardcoded in the site's frontend chunks — mirrored here from the
// production bundles (video-*.js + the 9 provider chunks, 2026-09-17).

export interface Ai8VideoVersion {
  label: string
  value: string
}

export interface Ai8VideoProvider {
  id: string
  label: string
  versions: Ai8VideoVersion[]
}

export const AI8_VIDEO_PROVIDERS: Ai8VideoProvider[] = [
  {
    id: 'seedance',
    label: '即梦 Seedance',
    versions: [
      { label: '2.0', value: '2.0' },
      { label: '2.0 关键帧', value: '2.0-kf' },
      { label: '2.0 Fast', value: '2.0-fast' },
      { label: '2.0 Fast 关键帧', value: '2.0-fast-kf' },
      { label: '2.0 Mini', value: '2.0-mini' },
      { label: '1.5 Pro', value: '1.5-pro' },
      { label: '1.5 Pro 关键帧', value: '1.5-pro-kf' },
      { label: '1.0 Pro', value: 'pro' },
      { label: '1.0 Pro Fast', value: 'pro-fast' },
      { label: 'Lite 文生视频', value: 'lite-t2v' },
      { label: 'Lite 图生视频', value: 'lite-i2v' },
    ],
  },
  { id: 'sora', label: 'Sora', versions: [{ label: 'v2 Pro', value: 'v2-pro' }, { label: 'v2', value: 'v2' }] },
  {
    id: 'kling',
    label: '可灵 Kling',
    versions: [
      { label: 'V3 Turbo', value: 'v3-turbo' },
      { label: 'V3', value: 'v3' },
      { label: 'V3 Omni', value: 'v3-omni' },
      { label: 'O1', value: 'video-o1' },
      { label: '2.6', value: 'v2-6' },
      { label: '2.5 Turbo', value: 'v2-5-turbo' },
    ],
  },
  { id: 'cogvideox', label: 'CogVideoX', versions: [{ label: 'V3', value: '3' }, { label: 'V2', value: '2' }, { label: 'V1', value: '1' }] },
  {
    id: 'veo',
    label: 'Veo',
    versions: [
      { label: 'Veo 3.1', value: 'veo3.1' },
      { label: 'Veo 3.1 Fast', value: 'veo3.1-fast' },
      { label: 'Veo 3.1 Lite', value: 'veo3.1-lite' },
    ],
  },
  {
    id: 'vidu',
    label: 'Vidu',
    versions: [
      { label: 'Q3', value: 'q3' },
      { label: 'Q3 Pro', value: 'q3pro' },
      { label: 'Q3 Turbo', value: 'q3turbo' },
      { label: 'Q3 Pro Fast（图生）', value: 'q3profast' },
      { label: 'Q2', value: 'q2' },
      { label: 'Q1', value: 'q1' },
      { label: 'Q3 Pro 关键帧', value: 'q3pro-kf' },
      { label: 'Q3 Turbo 关键帧', value: 'q3turbo-kf' },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax 海螺',
    versions: [
      { label: 'MiniMax H3', value: 'h3' },
      { label: 'Hailuo 2.3', value: 'hailuo2.3' },
      { label: 'Hailuo 2.3 Fast（仅图生）', value: 'hailuo2.3-fast' },
      { label: 'Hailuo 02', value: 'hailuo02' },
    ],
  },
  { id: 'wan', label: '万相 Wan', versions: [{ label: 'Wan 2.7', value: 'wan2.7' }, { label: 'Wan 2.6', value: 'wan2.6' }, { label: 'Wan 2.6 Fast', value: 'wan2.6-fast' }] },
  { id: 'xai', label: 'Grok Imagine', versions: [{ label: 'Grok Imagine', value: 'grok-imagine-video' }] },
]

export interface Ai8VideoTemplateParsed {
  providers: Ai8VideoProvider[]
  /** Beta notice from the template (HTML stripped); '' when absent. */
  notice: string
}

/** Filter the hardcoded catalog by the live template: `state[].id` keeps only
 *  enabled providers (anonymous/failed → full catalog as a usable fallback);
 *  a state entry carrying a `versions` map further filters its version list.
 *  `notice` (html) → plain text. */
export function parseVideoTemplate(raw: unknown): Ai8VideoTemplateParsed {
  const tmpl = (raw ?? {}) as { state?: unknown; notice?: unknown }
  let enabled: { id?: unknown; versions?: Record<string, unknown> }[] = []
  if (Array.isArray(tmpl.state)) enabled = tmpl.state.filter((e): e is { id?: unknown; versions?: Record<string, unknown> } => typeof e === 'object' && e !== null)
  const ids = new Set(enabled.map((e) => e.id).filter((id): id is string => typeof id === 'string' && id !== ''))
  const byId = new Map(enabled.map((e) => [e.id, e]))
  const providers = (ids.size > 0 ? AI8_VIDEO_PROVIDERS.filter((p) => ids.has(p.id)) : AI8_VIDEO_PROVIDERS.slice()).map((p) => {
    const versions = byId.get(p.id)?.versions
    if (versions === undefined || versions === null || typeof versions !== 'object' || Array.isArray(versions)) return p
    const keep = new Set(Object.keys(versions))
    const filtered = p.versions.filter((v) => keep.has(v.value))
    return filtered.length > 0 ? { ...p, versions: filtered } : p
  })
  const notice = typeof tmpl.notice === 'string' ? tmpl.notice.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : ''
  return { providers, notice }
}

/** R121: the exact POST /video body the site's frontend sends —
 *  {model: <provider id>, action: 'all', isPublic, prompt, params:{version}}
 *  (bundle: `e.prompt=…; delete i.prompt; e.params=i`). */
export function buildVideoBody({ model, version, prompt }: { model: string; version: string; prompt: string }): Record<string, unknown> {
  return { model, action: 'all', isPublic: false, prompt, params: { version } }
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

/** R116.1 (round 2): the /chat/completions body, byte-for-byte the fields the
 *  live site's own frontend sends (verified against the production bundle).
 *  NO `model` here — the server routes by the session's stored model and its
 *  strict decoder 400s on unknown fields (an extra `model` key surfaces as a
 *  silent SSE-swallowed「请求失败 (network)」). Model belongs to the SESSION:
 *  set it at createSession / updateSession time. */
export function buildChatBody(sessionId: string | number, text: string, opts: Ai8ChatOptions = {}): Record<string, unknown> {
  return {
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
    // typed explicitly: the node tsconfig types res.json() as unknown (the
    // web one says any) — this file compiles under BOTH now (R118 shared move)
    const body = (await res.json().catch(() => ({}))) as { code?: number; data?: T; msg?: string }
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

  /** R117.3: the site's own draw flow — GET /draw/template is public. */
  async getDrawTemplate<T>(): Promise<T> {
    const res = await fetch(this.baseUrl + '/draw/template', {
      headers: { 'X-APP-VERSION': AI8_APP_VERSION, 'X-Locale': 'zh-CN' },
    })
    return this.unwrap<T>(res)
  }

  /** R117.3: submit a draw task — the exact body shape the live site sends
   *  (verified against draw-HaYo0BLq.js): {model, action, prompt, public, fast}. */
  draw<T>(body: { model: string; prompt: string; action?: string; public?: boolean; fast?: boolean }): Promise<T> {
    return this.post<T>('/draw', { action: 'IMAGINE', public: false, fast: false, ...body })
  }

  /** R117.3: poll a draw task — the site ends polling on `data.end` or a
   *  non-empty `data.list[].url`. */
  drawStatus<T>(taskId: string | number): Promise<T> {
    return this.get<T>(`/draw/status/${taskId}`)
  }

  /** R121: video board — /video/template needs the token (anonymous returns
   *  empty state/subs); the notice board + live provider ids come from here. */
  getVideoTemplate<T>(): Promise<T> {
    return this.get<T>('/video/template')
  }

  /** R121: submit a video task (site body: buildVideoBody). */
  videoSubmit<T>(body: { model: string; version: string; prompt: string }): Promise<T> {
    return this.post<T>('/video', buildVideoBody(body))
  }

  /** R121: poll a video task — converges on `data.end`; the playable file is
   *  `data.videoUrl` (records also carry `url`). */
  videoStatus<T>(taskId: string | number): Promise<T> {
    return this.get<T>(`/video/${taskId}`)
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

  /** R116.3 (round 2): the site's NATIVE title endpoint — the server derives
   *  the title from the session content itself (POST /chat/generate-title/{id}
   *  → { name }), exactly what the web app calls after the first exchange. */
  generateTitle<T = { name?: string }>(sessionId: string | number): Promise<T> {
    return this.post<T>(`/chat/generate-title/${sessionId}`)
  }

  deleteSession(sessionId: string | number): Promise<unknown> {
    return fetch(this.baseUrl + `/chat/session/${sessionId}`, { method: 'DELETE', headers: this.headers() }).then((res) => this.unwrap<unknown>(res))
  }

  listRecords<T>(sessionId: string | number, page = 1): Promise<T> {
    return this.get<T>(`/chat/record/${sessionId}`, { page })
  }

  /** SSE chat. Yields meta/delta/extra/error/done events; abort via opts.signal. */
  async *chat(sessionId: string | number, text: string, opts: Ai8ChatOptions = {}): AsyncGenerator<Ai8SseEvent> {
    const body = buildChatBody(sessionId, text, opts)
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
