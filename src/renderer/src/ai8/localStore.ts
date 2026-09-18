// R113: local persistence for the AI8 workbench — session history (ChatGPT-
// style) + user preferences, both auto-saved on every change.

export interface Ai8Turn {
  role: 'user' | 'assistant'
  content: string
  error?: string
  /** R117.3: draw replies — returned image URLs (rendered as a grid). */
  images?: string[]
  /** R117.5: absolute local paths of cached artifacts (docs / images). */
  saved?: string[]
  /** R122.2: draw tasks — the server task id, persisted the moment the submit
   *  is accepted so polling can resume after a stop / restart. */
  taskId?: string
  /** R121: video replies — the playable video URL. */
  videoUrl?: string
}

export interface Ai8Session {
  id: string | number
  model: string
  title: string
  turns: Ai8Turn[]
  createdAt: number
  updatedAt: number
  /** R116.3: true once the AI-generated title attempt has run (one-shot guard;
   *  a failed attempt keeps the truncated fallback title). */
  titled?: boolean
  /** R117.4/R121: chat (default) vs draw vs video — draw renders image grids,
   *  video renders an inline player. */
  kind?: 'chat' | 'draw' | 'video'
}

/** R121: three workbench modes — chat / draw / video. */
export type Ai8Mode = 'chat' | 'draw' | 'video'

export interface Ai8Prefs {
  model: string
  thinking: boolean
  webSearch: boolean
  mode: Ai8Mode
  /** R117.3: the selected DRAW model (draw template namespace). */
  drawModel: string
  /** R121: selected video provider id + version value. */
  videoModel: string
  videoVersion: string
}

const SESSIONS_KEY = 'rgbbox:ai8Sessions'
const ACTIVE_KEY = 'rgbbox:ai8Active'
const PREFS_KEY = 'rgbbox:ai8Prefs'

export const DEFAULT_PREFS: Ai8Prefs = { model: '', thinking: false, webSearch: false, mode: 'chat', drawModel: '', videoModel: '', videoVersion: '' }

export function readSessions(): Ai8Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    const list = raw === null ? [] : JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function writeSessions(sessions: Ai8Session[]): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  } catch {
    return
  }
}

export function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

export function writeActiveId(id: string | number | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_KEY)
    else localStorage.setItem(ACTIVE_KEY, String(id))
  } catch {
    return
  }
}

export function readPrefs(): Ai8Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw === null) return { ...DEFAULT_PREFS }
    // R121 migration: the pre-video prefs stored `draw: boolean` — map it onto
    // the new `mode` field (and drop the legacy key) so nothing resets on the
    // first run after the upgrade.
    const { draw, ...parsed } = JSON.parse(raw) as Partial<Ai8Prefs> & { draw?: boolean }
    const mode: Ai8Mode = parsed.mode ?? (draw === true ? 'draw' : 'chat')
    return { ...DEFAULT_PREFS, ...parsed, mode }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writePrefs(prefs: Ai8Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    return
  }
}

// ── R117.8: sent-input history (Claude Code style ↑/↓ recall) ──────────────

const INPUT_HISTORY_KEY = 'rgbbox:ai8InputHistory'
const INPUT_HISTORY_CAP = 50
/** P2-9 review fix: per-entry cap — an imported 512KB prompt ×50 would blow
 *  past the localStorage quota and silently kill persistence. */
const INPUT_ENTRY_CAP = 4000

export function readInputHistory(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(INPUT_HISTORY_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function pushInputHistory(entry: string): string[] {
  let trimmed = entry.trim()
  if (trimmed === '') return readInputHistory()
  if (trimmed.length > INPUT_ENTRY_CAP) trimmed = trimmed.slice(0, INPUT_ENTRY_CAP) + '…'
  const next = [trimmed, ...readInputHistory().filter((x) => x !== trimmed)].slice(0, INPUT_HISTORY_CAP)
  try {
    localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(next))
  } catch {
    return next
  }
  return next
}

/** R113.1: group models per provider, newest `perProvider` entries each.
 *  The API order is NOT newest-first — rank by version tokens parsed from the
 *  label ("Gpt 5.4 Nano" → [5,4]); same version pushes nano/mini/lite last. */
export interface Ai8ProviderGroup {
  provider: string
  models: { label: string; value: string; integral?: string }[]
}

const SMALL_MODEL_HINTS = ['nano', 'mini', 'lite', 'small', 'tiny']

function versionTokens(label: string): number[] {
  const matches = label.toLowerCase().match(/\d+(?:\.\d+)+/g) ?? []
  const parsed = matches.map((m) => m.split('.').map(Number))
  parsed.sort((a, b) => {
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const d = (b[i] ?? 0) - (a[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })
  return parsed[0] ?? [0]
}

function cmpVersionDesc(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function groupModelsByProvider(models: { label: string; value: string; attr?: { providerKey?: string; integral?: string } }[], perProvider = 6): Ai8ProviderGroup[] {
  const order: string[] = []
  const byProvider = new Map<string, { label: string; value: string; integral?: string }[]>()
  for (const model of models) {
    const provider = model.attr?.providerKey || 'other'
    if (!byProvider.has(provider)) {
      byProvider.set(provider, [])
      order.push(provider)
    }
    byProvider.get(provider)?.push({ label: model.label, value: model.value, integral: model.attr?.integral })
  }
  return order.map((provider) => {
    const bucket = byProvider.get(provider) as Ai8ProviderGroup['models']
    bucket.sort((a, b) => {
      const v = cmpVersionDesc(versionTokens(a.label), versionTokens(b.label))
      if (v !== 0) return v
      const pa = SMALL_MODEL_HINTS.some((hint) => a.label.toLowerCase().includes(hint)) ? 1 : 0
      const pb = SMALL_MODEL_HINTS.some((hint) => b.label.toLowerCase().includes(hint)) ? 1 : 0
      return pa - pb
    })
    return { provider, models: bucket.slice(0, perProvider) }
  })
}

/** ChatGPT-style title: first user message, truncated. */
export function titleFromContent(content: string): string {
  const trimmed = content.replace(/\s+/g, ' ').trim()
  return trimmed.length <= 24 ? trimmed : trimmed.slice(0, 24) + '…'
}

/** R116.3: clean a model-generated title — take the first non-empty line, drop
 *  markdown headings /「标题：」prefixes / wrapping quotes / trailing punctuation,
 *  cap at 24 chars. Returns '' when nothing usable remains (caller keeps the
 *  truncated fallback). */
export function cleanGeneratedTitle(raw: string): string {
  const QUOTE_PAIRS: [string, string][] = [['「', '」'], ['『', '』'], ['“', '”'], ['"', '"'], ["'", "'"]]
  let line = raw.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
  line = line.replace(/^#+\s*/, '').replace(/^(标题|题目|title)\s*[:：]\s*/i, '').trim()
  for (let i = 0; i < 2; i++) {
    const pair = QUOTE_PAIRS.find(([open]) => line.startsWith(open))
    if (!pair) break
    const close = pair[1]
    if (!line.endsWith(close) || line.length <= 2) break
    line = line.slice(1, -1).trim()
  }
  line = line.replace(/[。．.!！?？，,;；~～\s]+$/, '').trim()
  return line.slice(0, 24)
}

// ── R115.2: curated recommendation groups (实现方案.md §一) — matched against
// live tmpl data by value substring; entries that no longer exist are hidden.

export interface CuratedGroup {
  id: string
  models: string[]  // value 子串（如 'gpt-6-astra-vip'）
}

export const CURATED_GROUPS: CuratedGroup[] = [
  { id: 'flagship', models: ['gpt-6-astra-vip', 'gpt-5.5-vip', 'claude-opus-5-vip', 'gemini-3.1-pro', 'grok-4.5', 'kimi-k3', 'glm-5.2', 'deepseek-v4-pro'] },
  { id: 'fast', models: ['gpt-5.4-mini', 'claude-sonnet-4-6-vip', 'gemini-3.7-flash', 'grok-4.3-fast', 'deepseek-v4-flash', 'kimi-k2-250905'] },
  { id: 'free', models: ['qwen3-max-preview', 'qwen3-vl-flash', 'gemma-4-31b-it', 'ERNIE-4.0-8K'] },
  { id: 'budget', models: ['ouyi_chat::ouyi-chat', 'gpt-5-nano', 'deepseek-v3.2'] },
]

/** Match curated substrings against live models; unmatched entries dropped. */
export function matchCurated(models: { label: string; value: string }[]): Record<string, { label: string; value: string }[]> {
  const out: Record<string, { label: string; value: string }[]> = {}
  for (const group of CURATED_GROUPS) {
    const hits: { label: string; value: string }[] = []
    for (const fragment of group.models) {
      const found = models.find((m) => m.value.toLowerCase().includes(fragment.toLowerCase()))
      if (found) hits.push(found)
    }
    if (hits.length > 0) out[group.id] = hits
  }
  return out
}
