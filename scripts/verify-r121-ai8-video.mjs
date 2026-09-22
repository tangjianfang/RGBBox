/**
 * R121 real-machine smoke (no real network): AI8 video generation end-to-end
 * against a mocked ai8.rcouyi.com — mode segment (chat/draw/video), provider +
 * version pickers narrowed by the authed /video/template, POST /video body
 * byte-for-byte the live-site protocol, 5s status polling until `end`+videoUrl,
 * inline <video> player + open-original button, stop aborts polling, 🎬 badge.
 * Video polling is 5s/tick in the app; the mock answers after the FIRST tick so
 * the whole flow completes in seconds.
 */
// R152: playwright-core is a repo devDependency now (the candidate list above
// used to probe other machines' %TEMP%/profile installs and died elsewhere).
import { chromium } from 'playwright-core'

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9267
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const videoBodies = []   // POST /video bodies
let videoStatusCalls = 0
let videoTemplateCalls = 0

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data, msg: '' }) })

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

// mock the whole ai8 site — the authed video template narrows the catalog to
// kling(+2 versions)/sora; POST returns task id; status flips to end+videoUrl
// after the first poll tick
await page.route('**/ai8.rcouyi.com/**', async (route) => {
  const req = route.request()
  const path = new URL(req.url()).pathname
  const method = req.method()
  if (path === '/api/chat/tmpl') {
    return route.fulfill(ok({ models: [{ label: 'Gpt 5.4', value: 'openai_chat::gpt-5.4', attr: { modelType: 'chat', providerKey: 'openai_chat' } }] }))
  }
  if (path === '/api/draw/template') {
    return route.fulfill(ok({ meta: null, cms: [{ name: '即梦', platform: 'jimeng', models: [{ label: '5.0', value: 'doubao-seedream-5-0' }] }] }))
  }
  if (path === '/api/video/template') {
    videoTemplateCalls += 1
    return route.fulfill(ok({
      notice: '<p>视频板块正在内测，<span style="color: rgb(225, 60, 57);">每日 3 次</span>。</p>',
      state: [{ id: 'kling', versions: { v3: true, 'v3-turbo': true } }, { id: 'sora' }],
      subs: {},
    }))
  }
  if (path === '/api/video' && method === 'POST') {
    videoBodies.push(JSON.parse(req.postData() || '{}'))
    return route.fulfill(ok({ id: 'vid-task-9' }))
  }
  if (path === '/api/video/vid-task-9') {
    videoStatusCalls += 1
    return route.fulfill(ok({ id: 'vid-task-9', end: true, videoUrl: 'https://ai8.rcouyi.com/mock-video/1.mp4', url: 'https://ai8.rcouyi.com/mock-video/1.mp4' }))
  }
  return route.fulfill(ok({}))
})

// snapshot the real ai8 localStorage keys; restore on exit (keep the user's data clean)
const AI8_KEYS = ['rgbbox:ai8Token', 'rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs', 'rgbbox:ai8InputHistory']
const snapshot = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])), AI8_KEYS)

const goAi8Tab = async () => {
  await page.locator('.rail-item', { hasText: 'AI' }).first().click()
  await sleep(900)
  await page.locator('.ai-tab[data-tab="ai8"]').click()
  await sleep(400)
}

// hard-reset ai8 state, log in with a mock token (the video template needs auth)
await page.evaluate(() => {
  for (const k of ['rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs']) localStorage.removeItem(k)
  localStorage.setItem('rgbbox:ai8Token', 'mock-token-for-r121')
})
await goAi8Tab()

// ── V1. mode segment: chat default, three buttons, video switch ─────────────
check('V1 mode: three-way segment renders with 对话 active by default', await page.evaluate(() => {
  const seg = document.querySelector('[data-field="ai8-mode"]')
  if (!seg) return false
  const active = seg.querySelector('.ai8-mode-btn.active')
  const labels = [...seg.querySelectorAll('.ai8-mode-btn')].map((b) => b.getAttribute('data-action'))
  return (active?.getAttribute('data-action')) === 'ai8-mode-chat' && labels.join(',') === 'ai8-mode-chat,ai8-mode-draw,ai8-mode-video'
}))

await page.locator('button[data-action="ai8-mode-video"]').click()
await sleep(600)
check('V2 mode: video mode shows provider + version pickers', (await page.locator('select[data-field="ai8-video-model"]').count()) === 1 && (await page.locator('select[data-field="ai8-video-version"]').count()) === 1)
check('V3 template: provider list narrowed by the authed /video/template', (await page.locator('select[data-field="ai8-video-model"] option').allTextContents()).join('|').includes('可灵') && videoTemplateCalls >= 1, `tmpl=${videoTemplateCalls}`)
check('V4 template: version list filtered to the state-enabled two', (await page.locator('select[data-field="ai8-video-version"] option').count()) === 2)
check('V5 notice: beta notice (html stripped) renders under the controls', await page.evaluate(() => {
  const el = document.querySelector('[data-field="ai8-video-notice"]')
  return !!el && (el.textContent ?? '').includes('每日 3 次') && !(el.textContent ?? '').includes('<')
}))

// ── V2. submit → poll → inline player ───────────────────────────────────────
await page.selectOption('select[data-field="ai8-video-model"]', 'kling')
await sleep(300)
await page.selectOption('select[data-field="ai8-video-version"]', 'v3')
await page.locator('textarea[data-field="ai8-input"]').fill('一只猫追着激光点跑，赛博朋克霓虹')
const sendBtn = page.locator('button[data-action="ai8-send"]')
check('V6 guard: send enabled with provider+version picked', !(await sendBtn.isDisabled()))
await sendBtn.click()
// the app polls every 5s; the mock answers `end` on the first status call
await sleep(7000)
const body = videoBodies[0]
check('V7 protocol: POST /video body matches the live-site shape byte-for-byte', body !== undefined && JSON.stringify(body) === JSON.stringify({ model: 'kling', action: 'all', isPublic: false, prompt: '一只猫追着激光点跑，赛博朋克霓虹', params: { version: 'v3' } }), JSON.stringify(body ?? null))
check('V8 poll: status endpoint polled until end', videoStatusCalls >= 1, `calls=${videoStatusCalls}`)
check('V9 render: inline <video> player with the returned videoUrl', await page.evaluate(() => {
  const el = document.querySelector('[data-field="ai8-video-result"] video')
  return !!el && (el.getAttribute('src') ?? '').endsWith('/mock-video/1.mp4')
}))
check('V10 render: open-original button present', (await page.locator('button[data-action="ai8-open-video"]').count()) === 1)
check('V11 badge: sidebar shows the 🎬 video kind + provider label', await page.evaluate(() => {
  const strong = [...document.querySelectorAll('.ai8-sessions .ai8-session strong')].find((el) => (el.textContent ?? '').includes('一只猫追着激光点跑'))
  return !!strong && (strong.querySelector('.ai8-session-kind')?.textContent ?? '') === '🎬' && (strong.textContent ?? '').includes('可灵')
}))
await page.screenshot({ path: 'docs/screenshots/r121-ai8-video.png' })

// ── V3. stop button aborts polling (fresh task that never ends) ─────────────
let stopTaskId = ''
await page.route('**/ai8.rcouyi.com/api/video', async (route) => {
  const req = route.request()
  if (req.method() === 'POST') {
    const parsed = JSON.parse(req.postData() || '{}')
    if (parsed.prompt === '永不完成的任务') {
      stopTaskId = 'vid-task-stuck'
      return route.fulfill(ok({ id: stopTaskId }))
    }
    videoBodies.push(parsed)
    return route.fulfill(ok({ id: 'vid-task-9b' }))
  }
  return route.fulfill(ok({}))
})
await page.route('**/ai8.rcouyi.com/api/video/vid-task-stuck', async (route) => route.fulfill(ok({ id: 'vid-task-stuck', end: false })))
await page.locator('textarea[data-field="ai8-input"]').fill('永不完成的任务')
await page.locator('button[data-action="ai8-send"]').click()
await sleep(400)
for (let i = 0; i < 10; i++) { if (await page.locator('button[data-action="ai8-stop"]').count() > 0) break; await sleep(400) }
check('V12 stop: streaming state shows the stop button while polling', (await page.locator('button[data-action="ai8-stop"]').count()) === 1)
await page.locator('button[data-action="ai8-stop"]').click()
// the abort flag lands immediately, but the error turn is written when the
// in-flight 5s poll tick wakes — wait up to 8s for it
let stopped = false
for (let i = 0; i < 16; i++) {
  stopped = await page.evaluate(() => [...document.querySelectorAll('.ai8-log .ai-msg-error')].some((el) => (el.textContent ?? '').includes('stopped')))
  if (stopped) break
  await sleep(500)
}
check('V13 stop: aborted polling surfaces the stopped error', stopped)
check('V14 zero page errors across the whole run', errors.length === 0, errors.slice(0, 2).join(' | '))

// restore the user's real ai8 localStorage
await page.evaluate(({ keys, snap }) => { for (const k of keys) { const v = snap[k]; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } }, { keys: AI8_KEYS, snap: snapshot })
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
process.exit(failed.length > 0 ? 1 : 0)
