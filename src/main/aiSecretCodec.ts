// R88.4: at-rest protection for the AI api key (Electron safeStorage / DPAPI).
// Pure codec functions with an injected implementation so they are unit-testable.

export const ENC_PREFIX = 'enc:v1:'

export interface SafeStorageCodec {
  encrypt(plain: string): Uint8Array | null
  decrypt(data: Uint8Array): string | null
}

export function encodeApiKey(plain: string, codec: SafeStorageCodec): string {
  if (plain === '') return ''
  const enc = codec.encrypt(plain)
  if (!enc) return plain // safeStorage unavailable → plaintext fallback (+warn at call site)
  return ENC_PREFIX + Buffer.from(enc).toString('base64')
}

export function decodeApiKey(stored: string, codec: SafeStorageCodec): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored // legacy plaintext (migrated on next save)
  try {
    return codec.decrypt(new Uint8Array(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))) ?? ''
  } catch {
    return ''
  }
}
