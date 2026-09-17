/**
 * R118 real-machine smoke (no real network): the AI8 provider round-trip —
 * pick「欧亿 AI8」in the config tab, paste a token, activate the profile, then
 * the OCR tab's TRANSLATE must go through the ai8 site protocol (tool session
 * with contextCount:0 + SSE chat with systemPrompt/text, NO OpenAI-style
 * model/messages body). ALL ai8.rcouyi.com traffic mocked via page.route.
 */
import { chromium } from 'file:///C:/Users/admin/AppData/Local/Temp/pw-cdp/node_modules/playwright-core/index.mjs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9268
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const chatBodies = []
const sessionBodies = []
let sessionSeq = 0

// ── local mock ai8 server: the OCR/translate pipeline runs in MAIN, whose
// fetch page.route cannot intercept — RGBBOX_AI8_BASE_URL points it here ────
const MOCK_PORT = 9269
const mockServer = (() => {
  const handlers = {
    'POST /api/chat/session': (body) => { sessionBodies.push(JSON.parse(body || '{}')); sessionSeq += 1; return JSON.stringify({ code: 0, data: { id: 5000 + sessionSeq }, msg: '' }) },
    'POST /api/chat/completions': (body) => { chatBodies.push(JSON.parse(body || '{}')); return `data: ${JSON.stringify({ code: 0, data: 'Translated reply.' })}\n\ndata: [DONE]\n\n` },
  }
  return createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const key = `${req.method} ${req.url}`
      const out = handlers[key]
      if (out === undefined) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ code: 0, data: {}, msg: '' })); return }
      const isSse = key.endsWith('completions')
      res.writeHead(200, { 'content-type': isSse ? 'text/event-stream' : 'application/json' })
      res.end(out(body))
    })
  })
})()

const electron = await new Promise((resolve) => {
  mockServer.listen(MOCK_PORT, '127.0.0.1', () => {
    resolve(spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${PORT}`, 'out/main/index.js'], {
      stdio: 'ignore',
      env: { ...process.env, RGBBOX_AI8_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/api` },
    }))
  })
})
process.on('exit', () => { try { electron.kill() } catch {}; try { mockServer.close() } catch {} })

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

await page.route('**/ai8.rcouyi.com/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  const method = route.request().method()
  if (path === '/api/chat/session' && method === 'POST') {
    sessionBodies.push(JSON.parse(route.request().postData() || '{}'))
    sessionSeq += 1
    return route.fulfill(ok({ id: 5000 + sessionSeq }))
  }
  if (path === '/api/chat/completions' && method === 'POST') {
    chatBodies.push(JSON.parse(route.request().postData() || '{}'))
    return route.fulfill(sse('Translated reply.'))
  }
  return route.fulfill(ok({}))
})

await page.locator('.rail-item', { hasText: 'AI' }).first().click()
await sleep(900)

// ── config tab: create an AI8 profile, paste token, activate ───────────────
await page.locator('button[data-action="new-profile"]').click()
await sleep(400)
await page.selectOption('select[data-field="provider"]', 'ai8')
await page.locator('input[data-field="apiKey"]').fill('mock-ai8-token-r118')
await page.locator('input[data-field="model"]').fill('openai_chat::gpt-5.4')
await page.locator('button[data-action="save"]').click()
await sleep(500)
await page.locator('button[data-action="set-active"]').click()
await sleep(600)
const profiles = await page.evaluate(() => window.rgbbox.aiGetProfiles())
const active = profiles.profiles.find((p) => p.id === profiles.activeId)
check('A1 profile: ai8 profile created and activated', active?.baseUrl === 'ai8://chat' && active?.model === 'openai_chat::gpt-5.4', `active=${active?.baseUrl ?? '—'} model=${active?.model ?? '—'}`)

// ── OCR tab: translate must go through the ai8 protocol ────────────────────
await page.locator('.ai-tab[data-tab="ocr"]').click()
await sleep(300)
await page.locator('textarea[data-field="ocr-input"]').fill('这是一段需要翻译的灯效描述文字。')
await page.locator('button[data-action="ocr-translate"]').click()
for (let i = 0; i < 20; i++) { if (chatBodies.length > 0) break; await sleep(500) }
const create = sessionBodies[0]
const chat = chatBodies[0]
check('B1 protocol: tool session created with contextCount 0 and the picked model', create !== undefined && create.model === 'openai_chat::gpt-5.4' && create.contextCount === 0, JSON.stringify(create ?? null))
check('B2 protocol: chat body is the site shape (no model/messages, systemPrompt + text)', chat !== undefined && !('model' in chat) && chat.messages === undefined && typeof chat.systemPrompt === 'string' && /翻译/.test(chat.systemPrompt) && chat.text.includes('灯效描述'), `keys=[${Object.keys(chat ?? {}).join(',')}]`)
for (let i = 0; i < 20; i++) { const v = await page.locator('textarea[data-field="ocr-result"]').inputValue(); if (v !== '') break; await sleep(500) }
check('B3 result: translated text lands in the OCR result box', (await page.locator('textarea[data-field="ocr-result"]').inputValue()) === 'Translated reply.')
check('B4 session reuse: one tool session serves the call', sessionBodies.length === 1, `sessions=${sessionBodies.length}`)
check('B5 zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

// ── cleanup: delete the test profile, restore the previous active ──────────
await page.locator('.ai-tab[data-tab="config"]').click()
await sleep(300)
await page.locator('button[data-action="delete-profile"]').click()
await sleep(600)
try { electron.kill() } catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
