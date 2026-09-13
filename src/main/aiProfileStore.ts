// R89.3: pure helpers for the AI multi-profile store. No Electron imports —
// unit-testable in node. Handlers in index.ts own persistence + encryption.

import { matchProviderPreset } from '../shared/aiProviders'
import type { AiProfile } from '../shared/types'

/** Raw shape of the `ai` object in system.json (legacy + new fields). */
export interface AiStoreShape {
  profiles?: unknown
  activeProfileId?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  model?: unknown
}

function isValidProfile(v: unknown): v is AiProfile {
  if (v === null || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return typeof p.id === 'string' && p.id !== ''
    && typeof p.name === 'string'
    && typeof p.baseUrl === 'string' && p.baseUrl !== ''
    && typeof p.apiKey === 'string'
    && typeof p.model === 'string'
}

/** Auto name "Provider · model" (R89.3: 配置好之后自动命名). */
export function autoProfileName(baseUrl: string, model: string): string {
  const preset = matchProviderPreset(baseUrl)
  const provider = preset.id === 'custom' ? 'Custom' : preset.label
  return `${provider} · ${model || 'default'}`
}

/** Normalize ANY stored ai object (legacy single config or profiles array)
 *  into { profiles, activeId }. Legacy configs migrate to one p_legacy entry. */
export function normalizeAiStore(ai: AiStoreShape | undefined | null): { profiles: AiProfile[]; activeId: string } {
  if (ai && Array.isArray(ai.profiles)) {
    const profiles = (ai.profiles as unknown[]).filter(isValidProfile)
    if (profiles.length > 0) {
      const wanted = typeof ai.activeProfileId === 'string' ? ai.activeProfileId : ''
      const activeId = profiles.some((p) => p.id === wanted) ? wanted : profiles[0].id
      return { profiles, activeId }
    }
  }
  // legacy single-config → one profile (migrated on the next write)
  if (ai && typeof ai.baseUrl === 'string' && ai.baseUrl !== '') {
    const legacy: AiProfile = {
      id: 'p_legacy',
      name: autoProfileName(ai.baseUrl, typeof ai.model === 'string' ? ai.model : ''),
      baseUrl: ai.baseUrl,
      apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : '',
      model: typeof ai.model === 'string' ? ai.model : '',
    }
    return { profiles: [legacy], activeId: 'p_legacy' }
  }
  return { profiles: [], activeId: '' }
}

/** Legacy-field mirror of the active profile (keeps old readers working).
 *  Always returns all three keys — empty strings when there is no active profile. */
export function mirrorLegacy(active: AiProfile | null): { baseUrl: string; apiKey: string; model: string } {
  if (active === null) return { baseUrl: '', apiKey: '', model: '' }
  return { baseUrl: active.baseUrl, apiKey: active.apiKey, model: active.model }
}

/** R89 review fix: when persisting, RESTORE the original stored ciphertext for
 *  profiles whose key failed to decode on this machine (and was not re-entered)
 *  — otherwise an unrelated write would wipe a key that is only unreadable
 *  here (e.g. created under another Windows account) exactly as if the user
 *  had cleared it. */
export function mergePreservedKeys(
  profiles: AiProfile[],
  raw: AiProfile[],
  unreadableIds: string[]
): AiProfile[] {
  if (unreadableIds.length === 0) return profiles
  const rawById = new Map(raw.map((p) => [p.id, p]))
  return profiles.map((p) => {
    if (!unreadableIds.includes(p.id) || p.apiKey !== '') return p
    const original = rawById.get(p.id)
    return original ? { ...p, apiKey: original.apiKey } : p
  })
}