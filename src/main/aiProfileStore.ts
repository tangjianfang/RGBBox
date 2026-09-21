// R89.3: pure helpers for the AI multi-profile store. No Electron imports —
// unit-testable in node. Handlers in index.ts own persistence + encryption.

import { matchProviderPreset } from '../shared/aiProviders'
import type { AiProfile, AwsProfileCreds } from '../shared/types'
import { decodeApiKey, encodeApiKey, type SafeStorageCodec } from './aiSecretCodec'

/** Raw shape of the `ai` object in system.json (legacy + new fields). */
export interface AiStoreShape {
  profiles?: unknown
  activeProfileId?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  model?: unknown
}

/** R145: keep an `aws` block only when its required members are strings. */
export function sanitizeAws(v: unknown): AwsProfileCreds | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const a = v as Record<string, unknown>
  if (typeof a.region !== 'string' || typeof a.accessKeyId !== 'string' || typeof a.secretAccessKey !== 'string') return undefined
  return {
    region: a.region,
    accessKeyId: a.accessKeyId,
    secretAccessKey: a.secretAccessKey,
    ...(typeof a.sessionToken === 'string' && a.sessionToken !== '' ? { sessionToken: a.sessionToken } : {}),
  }
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
    const valid = (ai.profiles as unknown[]).filter(isValidProfile)
    const profiles = valid.map((p) => {
      const aws = sanitizeAws((p as unknown as Record<string, unknown>).aws)
      return aws === undefined ? { ...p, aws: undefined } : { ...p, aws }
    })
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
    if (!unreadableIds.includes(p.id)) return p
    // "re-entered" covers both secret kinds: a fresh Bearer key OR a fresh
    // AWS secret (R145) means the user replaced the unreadable one.
    if (p.apiKey !== '' || (p.aws !== undefined && p.aws.secretAccessKey !== '')) return p
    const original = rawById.get(p.id)
    if (!original) return p
    // R145: restore the ORIGINAL ciphertexts (apiKey + aws block) so an
    // unrelated write cannot wipe keys that are merely unreadable here.
    return {
      ...p,
      apiKey: original.apiKey,
      ...(p.aws !== undefined && original.aws !== undefined ? { aws: original.aws } : {}),
    }
  })
}

// ── R145: secret codec round-trips (apiKey + AWS SK/STS, same enc:v1:) ────

/** Decrypt every secret of one profile in place-clone. `unreadable` is true
 *  when any stored ciphertext failed to decode (entered elsewhere / another
 *  Windows account) — the profile must be flagged, not wiped. */
export function decodeProfileSecrets(p: AiProfile, codec: SafeStorageCodec): { profile: AiProfile; unreadable: boolean } {
  const apiKey = decodeApiKey(p.apiKey, codec)
  let aws = p.aws
  let awsBroken = false
  if (p.aws) {
    const secretAccessKey = decodeApiKey(p.aws.secretAccessKey, codec)
    const sessionToken = p.aws.sessionToken !== undefined ? decodeApiKey(p.aws.sessionToken, codec) : undefined
    awsBroken = (p.aws.secretAccessKey.startsWith('enc:v1:') && secretAccessKey === '')
      || (p.aws.sessionToken !== undefined && p.aws.sessionToken.startsWith('enc:v1:') && sessionToken === '')
    aws = { ...p.aws, secretAccessKey, ...(sessionToken !== undefined ? { sessionToken } : {}) }
  }
  const unreadable = (p.apiKey.startsWith('enc:v1:') && apiKey === '') || awsBroken
  return { profile: { ...p, apiKey, ...(aws !== undefined ? { aws } : {}) }, unreadable }
}

/** Encrypt every secret of one profile in place-clone. */
export function encodeProfileSecrets(p: AiProfile, codec: SafeStorageCodec): AiProfile {
  let aws = p.aws
  if (aws) {
    const secretAccessKey = encodeApiKey(aws.secretAccessKey, codec)
    const sessionToken = aws.sessionToken !== undefined ? encodeApiKey(aws.sessionToken, codec) : undefined
    aws = { ...aws, secretAccessKey, ...(sessionToken !== undefined ? { sessionToken } : {}) }
  }
  return { ...p, apiKey: encodeApiKey(p.apiKey, codec), ...(aws !== undefined ? { aws } : {}) }
}