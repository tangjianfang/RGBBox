import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ai8AutoLoginWith, clearAi8Credentials, loadAi8Credentials, saveAi8Credentials } from '../../src/main/ai8Credentials'

// injectable codec (same shape as the safeStorage one in main/index.ts)
const encCodec = {
  encrypt: (plain: string) => new TextEncoder().encode('E:' + plain),
  decrypt: (data: Uint8Array) => {
    const s = new TextDecoder().decode(data)
    return s.startsWith('E:') ? s.slice(2) : null
  },
}
// safeStorage-unavailable codec → plaintext fallback (aiSecretCodec policy)
const plainCodec = { encrypt: () => null, decrypt: () => null }

const dirs: string[] = []
const tmpDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'ai8cred-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length > 0) {
    try { rmSync(dirs.pop() as string, { recursive: true, force: true }) } catch { /* best effort */ }
  }
})

describe('main/ai8Credentials storage (R121.1)', () => {
  it('round-trips credentials through the encrypted codec', () => {
    const dir = tmpDir()
    saveAi8Credentials(dir, encCodec, { account: ' user@x.com ', password: 'p@ss' })
    expect(existsSync(join(dir, 'ai8-credentials.json'))).toBe(true)
    // stored account is trimmed; password is never plaintext
    const raw = JSON.parse(readFileSync(join(dir, 'ai8-credentials.json'), 'utf8')) as { account: string; password: string }
    expect(raw.account).toBe('user@x.com')
    expect(raw.password).not.toContain('p@ss')
    expect(loadAi8Credentials(dir, encCodec)).toEqual({ account: 'user@x.com', password: 'p@ss' })
  })

  it('falls back to plaintext when safeStorage is unavailable (still loadable)', () => {
    const dir = tmpDir()
    saveAi8Credentials(dir, plainCodec, { account: 'a', password: 'b' })
    expect(loadAi8Credentials(dir, plainCodec)).toEqual({ account: 'a', password: 'b' })
  })

  it('clear removes the file; missing/empty/corrupt files read as null', () => {
    const dir = tmpDir()
    expect(loadAi8Credentials(dir, encCodec)).toBeNull()
    saveAi8Credentials(dir, encCodec, { account: 'a', password: 'b' })
    clearAi8Credentials(dir)
    expect(loadAi8Credentials(dir, encCodec)).toBeNull()
  })
})

describe('main/ai8Credentials autoLogin (R121.1 — site protocol)', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })

  const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  it('POSTs {account,password} to /user/login and returns the token', async () => {
    const calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body ?? '{}')), headers: init?.headers as Record<string, string> })
      return jsonRes({ code: 0, data: { token: 'jwt-x', id: 1 }, msg: '' })
    }) as typeof fetch
    const out = await ai8AutoLoginWith({ account: 'acc', password: 'pwd' }, 'http://mock/api')
    expect(out).toEqual({ ok: true, token: 'jwt-x', account: 'acc' })
    expect(calls[0].url).toBe('http://mock/api/user/login')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ account: 'acc', password: 'pwd' })
    expect(calls[0].headers.Authorization).toBeUndefined() // login carries no token header
  })

  it('maps a business rejection to {ok:false, reason:"code:N"} and no-token to reason', async () => {
    globalThis.fetch = (async () => jsonRes({ code: 1, data: null, msg: '账号或密码错误' })) as typeof fetch
    expect(await ai8AutoLoginWith({ account: 'a', password: 'bad' }, 'http://mock/api')).toEqual({ ok: false, reason: 'code:1' })
    globalThis.fetch = (async () => jsonRes({ code: 0, data: { token: '' }, msg: '' })) as typeof fetch
    expect(await ai8AutoLoginWith({ account: 'a', password: 'b' }, 'http://mock/api')).toEqual({ ok: false, reason: 'no-token' })
  })
})
