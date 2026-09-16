// R113: local persistence for the AI8 workbench — session history (ChatGPT-
// style) + user preferences, both auto-saved on every change.

export interface Ai8Turn {
  role: 'user' | 'assistant'
  content: string
  error?: string
}

export interface Ai8Session {
  id: string | number
  model: string
  title: string
  turns: Ai8Turn[]
  createdAt: number
  updatedAt: number
}

export interface Ai8Prefs {
  model: string
  thinking: boolean
  webSearch: boolean
  draw: boolean
}

const SESSIONS_KEY = 'rgbbox:ai8Sessions'
const ACTIVE_KEY = 'rgbbox:ai8Active'
const PREFS_KEY = 'rgbbox:ai8Prefs'

export const DEFAULT_PREFS: Ai8Prefs = { model: '', thinking: false, webSearch: false, draw: false }

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
    return raw === null ? { ...DEFAULT_PREFS } : { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Ai8Prefs>) }
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

/** R113.1: group models per provider, newest `perProvider` entries each. */
export interface Ai8ProviderGroup {
  provider: string
  models: { label: string; value: string; integral?: string }[]
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
    const bucket = byProvider.get(provider) as { label: string; value: string; integral?: string }[]
    if (bucket.length < perProvider) bucket.push({ label: model.label, value: model.value, integral: model.attr?.integral })
  }
  return order.map((provider) => ({ provider, models: byProvider.get(provider) as Ai8ProviderGroup['models'] }))
}

/** ChatGPT-style title: first user message, truncated. */
export function titleFromContent(content: string): string {
  const trimmed = content.replace(/\s+/g, ' ').trim()
  return trimmed.length <= 24 ? trimmed : trimmed.slice(0, 24) + '…'
}
