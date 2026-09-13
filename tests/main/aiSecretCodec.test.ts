import { describe, it, expect } from 'vitest'
import { encodeApiKey, decodeApiKey, ENC_PREFIX, type SafeStorageCodec } from '../../src/main/aiSecretCodec'

// deterministic fake codec: xor each char code
const fake: SafeStorageCodec = {
  encrypt: (s) => (s === '' ? null : Uint8Array.from(s, (c) => c.charCodeAt(0) ^ 0x5a)),
  decrypt: (b) => String.fromCharCode(...Array.from(b, (x) => x ^ 0x5a)),
}

describe('aiSecretCodec (R88.4)', () => {
  it('roundtrips with enc:v1: prefix', () => {
    const stored = encodeApiKey('sk-secret', fake)
    expect(stored.startsWith(ENC_PREFIX)).toBe(true)
    expect(decodeApiKey(stored, fake)).toBe('sk-secret')
  })
  it('legacy plaintext passes through decode unchanged', () => {
    expect(decodeApiKey('legacy-plain', fake)).toBe('legacy-plain')
  })
  it('empty key stays empty; codec unavailable → plaintext fallback', () => {
    expect(encodeApiKey('', fake)).toBe('')
    const offline: SafeStorageCodec = { encrypt: () => null, decrypt: () => null }
    expect(encodeApiKey('k', offline)).toBe('k')
  })
  it('corrupt ciphertext decodes to empty string, never throws', () => {
    expect(decodeApiKey(ENC_PREFIX + '!!!', fake)).toBe('')
  })
})
