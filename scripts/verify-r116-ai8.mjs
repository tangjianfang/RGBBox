/**
 * R116 real-machine smoke (no real network): the chat request body carries
 * `model` (the「模型 是必填项」bug fix), ChatGPT-style message dressing, flush
 * layout, and AI title generation end-to-end. ALL ai8.rcouyi.com traffic is
 * mocked via page.route — zero credits, zero token needed.
 */
import { chromium } from 'file:///C:/Users/admin/AppData/Local/Temp/pw-cdp/node_modules/playwright-core/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9266
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── captured mock traffic (assertions read these) ──────────────────────────
const chatBodies = []      // POST /chat/completions bodies
const titlePuts = []       // PUT /chat/session/:id bodies
let sessionSeq = 4241      // first createSession → 4242 (main), 5555 next (title)

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data, msg: '' }) })
const sse = (chunks) => ({
  status: 200,
  headers: { 'content-type': 'text/event-stream' },
  body: chunks.map((t) => `data: ${JSON.stringify({ code: 0, data: t })}\n\n`).join('') + 'data: [DONE]\n\n',
})

const electron = spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${PORT}`, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

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

// mock the whole ai8 site
await page.route('**/ai8.rcouyi.com/**', async (route) => {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const method = req.method()
  if (path === '/api/chat/tmpl') {
    return route.fulfill(ok({ models: [
      { label: 'Gpt 5.4', value: 'openai_chat::gpt-5.4', attr: { modelType: 'chat', providerKey: 'openai_chat' } },
      { label: 'Kimi K3', value: 'moonshot_chat::kimi-k3', attr: { modelType: 'chat', providerKey: 'moonshot_chat' } },
    ] }))
  }
  if (path === '/api/chat/session' && method === 'POST') {
    sessionSeq += path ? (sessionSeq === 4241 ? 1 : 1113) : 0 // 4242 then 5555
    return route.fulfill(ok({ id: sessionSeq }))
  }
  if (path === '/api/chat/completions' && method === 'POST') {
    const body = JSON.parse(req.postData() || '{}')
    chatBodies.push(body)
    // main session replies about lights; the title session emits a quoted title
    return route.fulfill(String(body.sessionId) === '4242' ? sse(['好的，我们来优化 RGB 灯效。']) : sse(['「RGB 灯效调优」']))
  }
  if (/^\/api\/chat\/session\/\d+$/.test(path) && method === 'PUT') {
    titlePuts.push(JSON.parse(req.postData() || '{}'))
    return route.fulfill(ok(null))
  }
  if (/^\/api\/chat\/session\/\d+$/.test(path) && method === 'DELETE') return route.fulfill(ok(null))
  return route.fulfill(ok({}))
})

// snapshot the real ai8 localStorage keys; restore on exit (keep the user's data clean)
const AI8_KEYS = ['rgbbox:ai8Token', 'rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs']
const snapshot = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), AI8_KEYS)
process.on('exit', () => { try { page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } }, snapshot).catch(() => {}) } catch {} })

const goAi8Tab = async () => {
  await page.locator('.rail-item', { hasText: 'AI' }).first().click()
  await sleep(900)
  await page.locator('.ai-tab[data-tab="ai8"]').click()
  await sleep(400)
}

const openAi8 = async () => {
  // hard-reset the ai8 keys first — stale sessions from earlier runs would
  // hijack the send() flow into the "existing session" path
  await page.evaluate(() => {
    for (const k of ['rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs']) localStorage.removeItem(k)
    localStorage.setItem('rgbbox:ai8Token', 'mock-token-for-r116')
  })
  await goAi8Tab()
}

// ── A. flush layout ────────────────────────────────────────────────────────
await openAi8()
check('A1 layout: .ai-lab gets ai-lab-flush on the ai8 tab', await page.evaluate(() => document.querySelector('.ai-lab')?.classList.contains('ai-lab-flush') === true))
check('A2 layout: outer .ai-lab stops scrolling (overflow hidden)', await page.evaluate(() => getComputedStyle(document.querySelector('.ai-lab')).overflow === 'hidden'))
check('A3 layout: .ai8-log scrolls internally', await page.evaluate(() => getComputedStyle(document.querySelector('.ai8-log')).overflowY === 'auto'))

// ── B. send guard without a model ─────────────────────────────────────────
await page.evaluate(() => localStorage.removeItem('rgbbox:ai8Prefs'))
await page.reload(); await sleep(1200)
await openAi8()
for (let i = 0; i < 10; i++) { if (await page.locator('select[data-field="ai8-model"] option').count() > 1) break; await sleep(500) }
await page.locator('textarea[data-field="ai8-input"]').fill('hello')
const sendBtn = page.locator('button[data-action="ai8-send"]')
check('B1 guard: send disabled while model empty', await sendBtn.isDisabled())
check('B2 guard: disabled reason tooltip', (await sendBtn.getAttribute('title')) === '请先选择模型', await sendBtn.getAttribute('title') ?? '')

// ── C. pick a model → send → chat body carries model (the R116.1 fix) ─────
await page.selectOption('select[data-field="ai8-model"]', 'openai_chat::gpt-5.4')
check('C1 guard: send enabled once a model is picked', !(await sendBtn.isDisabled()))
await sendBtn.click()
for (let i = 0; i < 20; i++) { const txt = await page.evaluate(() => document.querySelector('.ai8-log .ai-msg-assistant .md-p')?.textContent ?? ''); if (txt !== '') break; await sleep(500) }
const firstChat = chatBodies[0]
check('C2 fix: /chat/completions body carries model', firstChat?.model === 'openai_chat::gpt-5.4', `model=${firstChat?.model ?? '—'}`)
check('C3 fix: streamed reply renders', await page.evaluate(() => (document.querySelector('.ai8-log .ai-msg-assistant .md-p')?.textContent ?? '').includes('RGB 灯效')))

// ── D. AI title generation (mocked end-to-end) ────────────────────────────
let sidebarTitle = ''
for (let i = 0; i < 20; i++) {
  await sleep(500)
  sidebarTitle = await page.evaluate(() => document.querySelector('.ai8-sessions .ai8-session strong')?.textContent ?? '')
  if (sidebarTitle === 'RGB 灯效调优') break
}
check('D1 title: sidebar shows the AI-generated title', sidebarTitle === 'RGB 灯效调优', `title=${sidebarTitle}`)
check('D2 title: updateSession synced name= to the server', titlePuts.some((p) => p.name === 'RGB 灯效调优'), JSON.stringify(titlePuts))
const mainId = String(chatBodies[0]?.sessionId)
const titleChat = chatBodies.slice(1).find((b) => String(b.sessionId) !== mainId)
check('D3 title: generation ran in the throwaway session with the current model', chatBodies.length >= 2 && titleChat?.model === 'openai_chat::gpt-5.4' && /不超过16个字/.test(titleChat?.text ?? ''), `chats=${chatBodies.length} main=${mainId} titleSession=${titleChat?.sessionId} model=${titleChat?.model}`)

// ── E. message dressing (computed styles) ─────────────────────────────────
check('E1 style: user bubble uses the accent tint', await page.evaluate(() => getComputedStyle(document.querySelector('.ai8-log .ai-msg-user')).backgroundColor === 'rgba(70, 198, 168, 0.13)'))
check('E2 style: user bubble is right-aligned', await page.evaluate(() => {
  const user = document.querySelector('.ai8-log .ai-msg-user').getBoundingClientRect()
  const log = document.querySelector('.ai8-log').getBoundingClientRect()
  return log.right - user.right < 48
}))
check('E3 style: assistant message has no block background', await page.evaluate(() => getComputedStyle(document.querySelector('.ai8-log .ai-msg-assistant')).backgroundColor === 'rgba(0, 0, 0, 0)'))
check('E4 style: assistant badge shows the model label', await page.evaluate(() => (document.querySelector('.ai8-log .ai-msg-assistant .ai-msg-role')?.textContent ?? '') === 'Gpt 5.4'))
check('E5 style: message body is 13px', await page.evaluate(() => getComputedStyle(document.querySelector('.ai8-log .ai-msg')).fontSize === '13px'))
await page.screenshot({ path: 'docs/screenshots/r116-ai8-workbench.png' })

// ── F. error turn dressing + autoscroll on history reload ─────────────────
await page.evaluate(() => {
  const turns = [{ role: 'user', content: '第一条' }]
  for (let i = 0; i < 18; i++) turns.push({ role: 'assistant', content: `回复 ${i}` }, { role: 'user', content: `追问 ${i}` })
  turns.push({ role: 'assistant', content: '', error: 'quota' })
  localStorage.setItem('rgbbox:ai8Sessions', JSON.stringify([{ id: 777, model: 'openai_chat::gpt-5.4', title: '长会话', turns, createdAt: 1, updatedAt: 2 }]))
  localStorage.setItem('rgbbox:ai8Active', '777')
})
await page.reload(); await sleep(1200)
await goAi8Tab()
check('F1 error: error turn renders as the red alert strip', await page.evaluate(() => {
  const el = document.querySelector('.ai8-log .ai-msg-error')
  return !!el && getComputedStyle(el).color === 'rgb(248, 113, 113)' && getComputedStyle(el).fontSize === '12px'
}))
check('F2 autoscroll: long history lands scrolled to the bottom', await page.evaluate(() => { const log = document.querySelector('.ai8-log'); return log.scrollTop > 0 && log.scrollTop + log.clientHeight >= log.scrollHeight - 8 }))
check('F3 zero page errors across the whole run', errors.length === 0, errors.slice(0, 2).join(' | '))

// ── restore the user's real localStorage and shut down ────────────────────
await page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } }, snapshot)
try { electron.kill() } catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
