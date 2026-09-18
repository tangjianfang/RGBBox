// R121: AI8 remembered credentials — the site's login window never restores
// its session on open (verified 2026-09-18: a still-valid 10-year token in
// the persist:ai8 partition still lands on the login form), so the app keeps
// the account+password itself and signs in via the site's own
// POST /user/login. The password is safeStorage-encrypted at rest
// (aiSecretCodec) and, after the initial save, never crosses IPC again —
// autoLogin runs entirely in main.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ai8Client, Ai8Error } from '../shared/ai8Client'
import { decodeApiKey, encodeApiKey, type SafeStorageCodec } from './aiSecretCodec'

export interface Ai8Credentials {
  account: string
  password: string
}

const FILE_NAME = 'ai8-credentials.json'

/** Read the encrypted credentials file; null when absent/unreadable/empty. */
export function loadAi8Credentials(dir: string, codec: SafeStorageCodec): Ai8Credentials | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, FILE_NAME), 'utf8')) as { account?: unknown; password?: unknown }
    const account = typeof raw.account === 'string' ? raw.account.trim() : ''
    const password = typeof raw.password === 'string' ? decodeApiKey(raw.password, codec) : ''
    return account !== '' && password !== '' ? { account, password } : null
  } catch {
    return null
  }
}

/** Persist credentials (password encrypted; plaintext fallback when
 *  safeStorage is unavailable, same policy as the AI apiKey at rest). */
export function saveAi8Credentials(dir: string, codec: SafeStorageCodec, cred: Ai8Credentials): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, FILE_NAME), JSON.stringify({ account: cred.account.trim(), password: encodeApiKey(cred.password, codec) }, null, 2))
}

/** Forget the stored credentials. */
export function clearAi8Credentials(dir: string): void {
  try {
    rmSync(join(dir, FILE_NAME))
  } catch {
    // absent is fine
  }
}

export type Ai8AutoLoginResult = { ok: true; token: string; account: string } | { ok: false; reason: string }

/** Sign in with the site's own protocol (R111: POST /user/login {account,
 *  password} → {token}). `baseUrl` is the e2e test seam (local mock server),
 *  exactly like ai8Provider's RGBBOX_AI8_BASE_URL. */
export async function ai8AutoLoginWith(cred: Ai8Credentials, baseUrl?: string): Promise<Ai8AutoLoginResult> {
  try {
    const client = new Ai8Client(baseUrl !== undefined && baseUrl !== '' ? { baseUrl } : {})
    const auth = await client.login(cred.account, cred.password)
    const token = typeof auth?.token === 'string' ? auth.token : ''
    if (token === '') return { ok: false, reason: 'no-token' }
    return { ok: true, token, account: cred.account }
  } catch (error) {
    return { ok: false, reason: error instanceof Ai8Error ? `code:${error.code}` : 'network' }
  }
}
