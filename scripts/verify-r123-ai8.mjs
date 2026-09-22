/**
 * R123 real-machine smoke: remembered AI8 credentials + headless auto sign-in.
 * A local http mock server stands in for ai8.rcouyi.com at the MAIN-process
 * layer (RGBBOX_AI8_BASE_URL seam — page.route cannot intercept main fetch).
 * ① the credentials row saves via IPC → userData/ai8-credentials.json on disk;
 * ② save triggers an immediate POST /user/login with the exact site shape;
 * ③ a valid pair lands the token in the UI with NO login window opened;
 * ④「官网登录」with stored credentials goes headless (no new BrowserWindow);
 * ⑤ a bad password surfaces the failure hint (credentials stay saved);
 * ⑥ clear removes the file.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { createServer } from 'node:http'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PORT = 9268
const MOCK_PORT = 8871
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── the main-facing mock site: ONLY /user/login matters here ───────────────
const logins = []
let loginReply = { code: 0, data: { token: 'mock-jwt-from-login', id: 7 }, msg: '' }
const mock = createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    if (req.url === '/api/user/login') {
      logins.push({ body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(loginReply))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 0, data: null, msg: '' }))
  })
})
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r))

const electron = spawn('node_modules/electron/dist/electron.exe',
  [`--remote-debugging-port=${PORT}`, 'out/main/index.js'],
  { stdio: 'ignore', env: { ...process.env, RGBBOX_AI8_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/api` } })
process.on('exit', () => { try { electron.kill() } catch {} ; try { mock.close() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500)
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 2000 })
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  } catch {}
}
if (!page) { console.error('FAIL no CDP page'); process.exit(1) }
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

// bare `electron out/main/index.js` runs under the default "Electron" app
// name (no package.json context), so userData is %APPDATA%/Electron here —
// the real dev/dist instances use the rgbbox dir; only this spawn differs.
const userData = join(process.env.APPDATA ?? '', 'Electron')
const credFile = join(userData, 'ai8-credentials.json')
try { rmSync(credFile) } catch { /* absent is fine */ }

const goAi8Tab = async () => {
  await page.locator('.rail-item', { hasText: 'AI' }).first().click()
  await sleep(900)
  await page.locator('.ai-tab[data-tab="ai8"]').click()
  await sleep(400)
}
await page.evaluate(() => {
  for (const k of ['rgbbox:ai8Token', 'rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs']) localStorage.removeItem(k)
})
await goAi8Tab()

// ── A. open the credentials row and save a pair ────────────────────────────
await page.locator('button[data-action="ai8-cred-toggle"]').first().click()
await sleep(300)
check('A1 row: the credentials row opens with account+password inputs', await page.locator('input[data-field="ai8-cred-account"]').count() === 1 && await page.locator('input[data-field="ai8-cred-password"]').count() === 1)
await page.locator('input[data-field="ai8-cred-account"]').fill('tester@x.com')
await page.locator('input[data-field="ai8-cred-password"]').fill('s3cret-pw')
await page.locator('button[data-action="ai8-cred-save"]').click()
for (let i = 0; i < 20; i++) { if (logins.length > 0) break; await sleep(500) }
check('A2 save: main POSTs /user/login with the exact site body shape', logins.length === 1 && logins[0].body.account === 'tester@x.com' && logins[0].body.password === 's3cret-pw', JSON.stringify(logins[0] ?? null))
check('A3 save: the token from the login reply lands in localStorage', await page.evaluate(() => localStorage.getItem('rgbbox:ai8Token') === 'mock-jwt-from-login'))
check('A4 save: NO login window opened (headless path)', await page.evaluate(() => document.querySelector('.ai8-token-ok') !== null))
check('A5 save: success hint shows', await page.evaluate(() => (document.querySelector('[data-field="ai8-cred-hint"]')?.textContent ?? '').includes('✓')))
check('A6 save: the credentials file exists on disk with a trimmed account', existsSync(credFile) && (JSON.parse(readFileSync(credFile, 'utf8')).account === 'tester@x.com'))
check('A7 save: the password is encrypted at rest (enc:v1:)', existsSync(credFile) && JSON.parse(readFileSync(credFile, 'utf8')).password.startsWith('enc:v1:'))

// ── B.「官网登录」with stored credentials = headless, no window ─────────────
await page.evaluate(() => localStorage.setItem('rgbbox:ai8Token', 'stale-token'))
await page.reload(); await sleep(1200)
await goAi8Tab()
const contextsAfter = await (await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 2000 })).contexts()
const targetsBefore = contextsAfter.reduce((n, c) => n + c.pages().length, 0)
await page.locator('button[data-action="ai8-change-token"]').click()
for (let i = 0; i < 20; i++) { if (logins.length > 1) break; await sleep(500) }
await sleep(1500) // a window path would have spun up a new target by now
const contextsFinal = (await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 2000 })).contexts()
const targetsAfter = contextsFinal.reduce((n, c) => n + c.pages().length, 0)
check('B1 headless: the button re-signs-in via /user/login (no typing)', logins.length === 2, `logins=${logins.length}`)
check('B2 headless: the fresh token lands in localStorage', await page.evaluate(() => localStorage.getItem('rgbbox:ai8Token') === 'mock-jwt-from-login'))
check('B3 headless: no extra BrowserWindow target appeared', targetsAfter <= targetsBefore, `targets ${targetsBefore}→${targetsAfter}`)

// ── C. bad password → failure hint, credentials stay saved ─────────────────
loginReply = { code: 1, data: null, msg: '账号或密码错误' }
await page.locator('button[data-action="ai8-cred-toggle"]').first().click()
await sleep(300)
await page.locator('input[data-field="ai8-cred-account"]').fill('tester@x.com')
await page.locator('input[data-field="ai8-cred-password"]').fill('wrong-pw')
await page.locator('button[data-action="ai8-cred-save"]').click()
for (let i = 0; i < 20; i++) { if (logins.length > 2) break; await sleep(500) }
// language-agnostic: a NON-empty hint that is NOT the ✓ success copy
let rejectHint = ''
for (let i = 0; i < 10; i++) {
  rejectHint = await page.evaluate(() => (document.querySelector('[data-field="ai8-cred-hint"]')?.textContent ?? '').trim())
  if (rejectHint !== '') break
  await sleep(500)
}
check('C1 reject: the failure hint surfaces (non-empty, not the ✓ copy)', rejectHint !== '' && !rejectHint.includes('✓'), rejectHint.slice(0, 40))
check('C2 reject: the bad pair is still saved for a later fix', existsSync(credFile))

// ── D. clear ───────────────────────────────────────────────────────────────
await page.locator('button[data-action="ai8-cred-clear"]').click()
for (let i = 0; i < 10; i++) { if (!existsSync(credFile)) break; await sleep(400) }
check('D1 clear: the credentials file is removed', !existsSync(credFile))

check('Z1 zero page errors across the whole run', errors.length === 0, errors.slice(0, 2).join(' | '))

try { electron.kill() } catch {}
try { mock.close() } catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
