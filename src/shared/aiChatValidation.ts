// R88: preload-side guard for aiChat payloads — pure, shared with unit tests.
import type { AiChatMessage } from './types'

const MAX_TURNS = 40
const MAX_CHARS = 32_000
const ROLES = new Set(['user', 'assistant', 'system'])

/** Returns the validated conversation, or null when the payload is invalid. */
export function validateChatMessages(v: unknown): AiChatMessage[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_TURNS) return null
  const out: AiChatMessage[] = []
  for (const item of v) {
    if (item === null || typeof item !== 'object') return null
    const { role, content } = item as { role?: unknown; content?: unknown }
    if (typeof role !== 'string' || !ROLES.has(role)) return null
    if (typeof content !== 'string' || content.length > MAX_CHARS) return null
    out.push({ role: role as AiChatMessage['role'], content })
  }
  return out
}
