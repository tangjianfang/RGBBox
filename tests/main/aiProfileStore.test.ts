import { describe, it, expect } from 'vitest'
import { autoProfileName, normalizeAiStore, mirrorLegacy, mergePreservedKeys } from '../../src/main/aiProfileStore'

describe('autoProfileName (R89.3)', () => {
  it('names as "Provider · model"; custom falls back', () => {
    expect(autoProfileName('https://open.bigmodel.cn/api/paas/v4', 'glm-5.3-flash')).toBe('智谱 GLM · glm-5.3-flash')
    expect(autoProfileName('https://api.deepseek.com', 'deepseek-v4-pro')).toBe('DeepSeek · deepseek-v4-pro')
    expect(autoProfileName('https://who.knows/v1', 'm1')).toBe('Custom · m1')
    expect(autoProfileName('https://who.knows/v1', '')).toBe('Custom · default')
  })
})

describe('normalizeAiStore (R89.3 migration)', () => {
  it('valid profiles pass through; bogus activeId falls back to first', () => {
    const out = normalizeAiStore({
      profiles: [
        { id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: 'k1', model: 'm1' },
        { id: 'p2', name: 'B', baseUrl: 'https://b/v1', apiKey: '', model: 'm2' },
      ],
      activeProfileId: 'missing',
    })
    expect(out.activeId).toBe('p1')
    expect(out.profiles.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
  it('invalid profile entries are filtered', () => {
    const out = normalizeAiStore({
      profiles: [
        { id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: '', model: 'm1' },
        { id: '', name: 'bad', baseUrl: '', apiKey: '', model: '' },
        { id: 'p3', name: 'C', baseUrl: 'https://c/v1', apiKey: '', model: 'm3' },
      ] as never,
      activeProfileId: 'p3',
    })
    expect(out.profiles.map((p) => p.id)).toEqual(['p1', 'p3'])
    expect(out.activeId).toBe('p3')
  })
  it('legacy single config migrates to one p_legacy profile', () => {
    const out = normalizeAiStore({ baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'enc:v1:x', model: 'glm-5.3' })
    expect(out.profiles).toHaveLength(1)
    expect(out.profiles[0].id).toBe('p_legacy')
    expect(out.profiles[0].model).toBe('glm-5.3')
    expect(out.activeId).toBe('p_legacy')
  })
  it('empty store → empty profiles', () => {
    expect(normalizeAiStore(undefined)).toEqual({ profiles: [], activeId: '' })
    expect(normalizeAiStore({})).toEqual({ profiles: [], activeId: '' })
  })
})

describe('mirrorLegacy (R89.3)', () => {
  it('projects the active profile onto the legacy fields (all keys always present)', () => {
    expect(mirrorLegacy({ id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' }))
      .toEqual({ baseUrl: 'https://a/v1', apiKey: 'k', model: 'm' })
    expect(mirrorLegacy(null)).toEqual({ baseUrl: '', apiKey: '', model: '' })
  })
})

describe('mergePreservedKeys (R89 review fix)', () => {
  const raw = [
    { id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: 'enc:v1:XXX', model: 'm1' },
    { id: 'p2', name: 'B', baseUrl: 'https://b/v1', apiKey: 'enc:v1:YYY', model: 'm2' },
  ]
  it('restores ciphertext for unreadable profiles the user did not re-enter', () => {
    const decoded = [
      { id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: '', model: 'm1' },
      { id: 'p2', name: 'B', baseUrl: 'https://b/v1', apiKey: '', model: 'm2' },
    ]
    const merged = mergePreservedKeys(decoded, raw, ['p1'])
    expect(merged[0].apiKey).toBe('enc:v1:XXX') // preserved
    expect(merged[1].apiKey).toBe('')           // readable → stays decoded
  })
  it('a re-entered key wins over the stale ciphertext', () => {
    const reentered = [{ id: 'p1', name: 'A', baseUrl: 'https://a/v1', apiKey: 'sk-new', model: 'm1' }]
    expect(mergePreservedKeys(reentered, raw, ['p1'])[0].apiKey).toBe('sk-new')
  })
  it('no unreadable ids → untouched', () => {
    const decoded = [{ id: 'p2', name: 'B', baseUrl: 'https://b/v1', apiKey: 'plain', model: 'm2' }]
    expect(mergePreservedKeys(decoded, raw, [])).toBe(decoded)
  })
})

// ── R145: AWS credentials in the profile store ─────────────────────────────
import { sanitizeAws, decodeProfileSecrets, encodeProfileSecrets } from '../../src/main/aiProfileStore'

describe('sanitizeAws (R145)', () => {
  it('keeps a valid block, drops an empty sessionToken', () => {
    expect(sanitizeAws({ region: 'us-west-2', accessKeyId: 'AKID', secretAccessKey: 'SK', sessionToken: '' }))
      .toEqual({ region: 'us-west-2', accessKeyId: 'AKID', secretAccessKey: 'SK' })
    expect(sanitizeAws({ region: 'us-west-2', accessKeyId: 'AKID', secretAccessKey: 'SK', sessionToken: 'STS' })?.sessionToken).toBe('STS')
  })
  it('rejects non-string members and non-objects', () => {
    expect(sanitizeAws({ region: 1, accessKeyId: 'a', secretAccessKey: 's' })).toBeUndefined()
    expect(sanitizeAws(null)).toBeUndefined()
    expect(sanitizeAws('x')).toBeUndefined()
  })
})

describe('normalizeAiStore with aws (R145)', () => {
  it('carries sanitized aws blocks; malformed aws is stripped', () => {
    const out = normalizeAiStore({
      profiles: [
        { id: 'p1', name: 'A', baseUrl: 'bedrock://openai', apiKey: '', model: 'm', aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'enc:v1:x' } },
        { id: 'p2', name: 'B', baseUrl: 'bedrock://openai', apiKey: '', model: 'm', aws: { region: 'us-east-1' } },
      ],
      activeProfileId: 'p1',
    } as never)
    expect(out.profiles[0].aws).toEqual({ region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'enc:v1:x' })
    expect(out.profiles[1].aws).toBeUndefined()
  })
  it('autoProfileName labels bedrock', () => {
    expect(autoProfileName('bedrock://openai', 'us.anthropic.claude-sonnet-4-5')).toBe('AWS Bedrock · us.anthropic.claude-sonnet-4-5')
  })
})

describe('profile secret round-trips (R145)', () => {
  const codec = {
    encrypt: (s: string) => new TextEncoder().encode('E:' + s),
    decrypt: (d: Uint8Array) => { const s = new TextDecoder().decode(d); return s.startsWith('E:') ? s.slice(2) : null },
  }
  const brokenCodec = { encrypt: () => null, decrypt: () => null as string | null }

  it('encodes and decodes apiKey + AWS SK/STS symmetrically', () => {
    const p = { id: 'p1', name: 'A', baseUrl: 'bedrock://openai', apiKey: '', model: 'm',
      aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'SECRET', sessionToken: 'STS' } }
    const enc = encodeProfileSecrets(p, codec)
    expect(enc.aws!.secretAccessKey.startsWith('enc:v1:')).toBe(true)
    expect(enc.aws!.sessionToken!.startsWith('enc:v1:')).toBe(true)
    expect(enc.aws!.accessKeyId).toBe('AK') // NOT a secret — stays plain
    const { profile, unreadable } = decodeProfileSecrets(enc, codec)
    expect(profile.aws).toEqual(p.aws)
    expect(unreadable).toBe(false)
  })
  it('flags unreadable ciphertext (entered under another account)', () => {
    const p = { id: 'p1', name: 'A', baseUrl: 'bedrock://openai', apiKey: '', model: 'm',
      aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'enc:v1:Z2FyYmFnZQ==' } }
    const { profile, unreadable } = decodeProfileSecrets(p, brokenCodec)
    expect(unreadable).toBe(true)
    expect(profile.aws!.secretAccessKey).toBe('')
  })
})

describe('mergePreservedKeys with aws (R145)', () => {
  const base = { id: 'p1', name: 'A', baseUrl: 'bedrock://openai', apiKey: '', model: 'm' }
  const raw = [{ ...base, aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'enc:v1:OLD' } }]
  it('restores the original aws ciphertext when the secret was not re-entered', () => {
    const merged = mergePreservedKeys([{ ...base, aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: '' } }], raw, ['p1'])
    expect(merged[0].aws!.secretAccessKey).toBe('enc:v1:OLD')
  })
  it('keeps a freshly entered secret', () => {
    const merged = mergePreservedKeys([{ ...base, aws: { region: 'us-east-1', accessKeyId: 'AK', secretAccessKey: 'NEW' } }], raw, ['p1'])
    expect(merged[0].aws!.secretAccessKey).toBe('NEW')
  })
})
