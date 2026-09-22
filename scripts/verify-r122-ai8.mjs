/**
 * R122 real-machine smoke (no real network): draw recovery batch —
 * ① cms-shaped /draw/template parses into the model picker (R120's parser);
 * ② the ONE-running-task limit rejection adopts the running task and receives
 *    its result (R122.3); ③ a freed slot resubmits once (R122.3);
 * ④ a「没有可用的渠道」rejection surfaces as-is — NO adoption (R122.1);
 * ⑤ restart recovery resumes a pending draw session (R122.5);
 * ⑥ the manual「查询最新绘画结果」button adopts the latest task (R122.4).
 * ALL ai8.rcouyi.com traffic is mocked via page.route — zero credits.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9267
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── captured mock traffic (assertions read these) ──────────────────────────
const drawPosts = []        // POST /draw bodies
let drawListCalls = 0       // GET /draw (task list) calls
const statusCalls = []      // polled task ids
// the mock site's controllable state
const site = {
  failDrawSubmit: null,     // null | 'limit' | 'channel'
  emptyRecords: false,
  records: [{ taskId: 'srv-9', prompt: '旧的进行中任务', startDate: 1760000001000, endDate: null }],
}

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data, msg: '' }) })
const fail = (msg) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 1, data: null, msg }) })
const LIMIT_MSG = '您当前进行中的绘图任务数量已达到上限1个，请稍后再试'
const CHANNEL_MSG = '没有可用的渠道，请联系管理检查本模块的渠道管理是否已配置或启用对应模型所属渠道'
const IMG = 'https://ai8.rcouyi.com/mock-draw/r120.png'

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

// mock the whole ai8 site — the CMS-shaped template the server serves today
await page.route('**/ai8.rcouyi.com/**', async (route) => {
  const req = route.request()
  const path = new URL(req.url()).pathname
  const method = req.method()
  if (path === '/api/chat/tmpl') {
    return route.fulfill(ok({ models: [] }))
  }
  if (path === '/api/draw/template') {
    return route.fulfill(ok({
      models: [],
      meta: {},
      billing: { 'gpt-image-2': { mode: 'fixed', ready: true } },
      cms: [
        { name: '即梦', platform: 'jimeng', models: [{ label: '4.5', value: 'doubao-seedream-4-5' }] },
        { name: '千问', platform: 'qwen', models: [{ label: 'max', value: 'qwen-image-max' }, { label: 'turbo', value: 'z-image-turbo' }] },
      ],
    }))
  }
  if (path === '/api/draw' && method === 'GET') {
    drawListCalls += 1
    return route.fulfill(ok(site.emptyRecords ? { records: [] } : { records: site.records }))
  }
  if (path === '/api/draw' && method === 'POST') {
    drawPosts.push(JSON.parse(req.postData() || '{}'))
    if (site.failDrawSubmit === 'limit') return route.fulfill(fail(LIMIT_MSG))
    if (site.failDrawSubmit === 'channel') return route.fulfill(fail(CHANNEL_MSG))
    return route.fulfill(ok({ id: `fresh-${drawPosts.length}` }))
  }
  const statusMatch = path.match(/^\/api\/draw\/status\/(.+)$/)
  if (statusMatch) {
    statusCalls.push(statusMatch[1])
    return route.fulfill(ok({ end: true, list: [{ url: IMG }] }))
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
const openAi8 = async () => {
  await page.evaluate(() => {
    for (const k of ['rgbbox:ai8Sessions', 'rgbbox:ai8Active', 'rgbbox:ai8Prefs']) localStorage.removeItem(k)
    localStorage.setItem('rgbbox:ai8Token', 'mock-token-for-r120')
  })
  await goAi8Tab()
}
const injectSession = async (session) => {
  await page.evaluate((s) => {
    localStorage.setItem('rgbbox:ai8Sessions', JSON.stringify([s]))
    localStorage.setItem('rgbbox:ai8Active', String(s.id))
  }, session)
}
const awaitGrid = async (name, timeoutMs = 12000) => {
  for (let i = 0; i < Math.ceil(timeoutMs / 500); i++) {
    if (await page.locator('.ai8-draw-grid img').count() > 0) return true
    await sleep(500)
  }
  return false
}

// ── K. cms template parsing (R120 parser + R122 guard) ────────────────────
await openAi8()
for (let i = 0; i < 10; i++) { if (await page.locator('select[data-field="ai8-draw-model"] option').count() > 1) break; await sleep(500) }
await page.locator('button[data-action="ai8-mode-draw"]').click()
await sleep(400)
const pickerInfo = await page.locator('select[data-field="ai8-draw-model"]').evaluate((el) => ({
  groups: [...el.querySelectorAll('optgroup')].map((g) => ({ label: g.label, options: [...g.querySelectorAll('option')].map((o) => o.textContent) })),
  flat: [...el.options].map((o) => o.textContent),
}))
const allText = pickerInfo.groups.map((g) => `${g.label}:${g.options.join(',')}`).join('|') + '|' + pickerInfo.flat.join('|')
check('K1 cms: draw picker lists cms models under provider groups', allText.includes('即梦') && allText.includes('4.5') && allText.includes('千问') && allText.includes('max'), allText)
check('K2 cms: default model auto-picks the first cms entry', await page.evaluate(() => (JSON.parse(localStorage.getItem('rgbbox:ai8Prefs') || '{}').drawModel ?? '') === 'doubao-seedream-4-5'))

// ── L. limit rejection adopts the running task (R120.3) ────────────────────
site.failDrawSubmit = 'limit'
const ta = page.locator('textarea[data-field="ai8-input"]')
await ta.fill('画出三体宏大的太空战争')
await page.locator('button[data-action="ai8-send"]').click()
for (let i = 0; i < 20; i++) { if (await page.locator('.ai8-log .ai-msg-assistant .md-p').count() > 0) break; await sleep(400) }
// the takeover copy flips to the image within the same breath — assert the
// OUTCOME instead: the dead-end limit msg must never reach the user
check('L1 adopt: the limit rejection never surfaces to the user', await page.evaluate(() => !(document.querySelector('.ai8-log')?.textContent ?? '').includes('上限')))
for (let i = 0; i < 4; i++) { if (drawListCalls > 0) break; await sleep(500) }
check('L2 adopt: the task list GET /draw is consulted', drawListCalls >= 1, `drawListCalls=${drawListCalls}`)
for (let i = 0; i < 10; i++) { if (statusCalls.length > 0) break; await sleep(500) } // the status call trails the list call
check('L3 adopt: the running task srv-9 is polled/received', statusCalls.includes('srv-9'), `statusCalls=[${statusCalls.join(',')}]`)
check('L4 adopt: the adopted result renders as the image grid', await awaitGrid('L4'))
check('L5 adopt: taskId persisted on the session turn', await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('rgbbox:ai8Sessions') || '[]')
  return list.some((s) => s.kind === 'draw' && s.turns.some((x) => x.taskId === 'srv-9' && (x.images ?? []).length > 0))
}))

// ── M. freed-slot resubmit (R120.3) ────────────────────────────────────────
site.failDrawSubmit = 'limit'
site.emptyRecords = true
drawListCalls = 0
await page.locator('button[data-action="ai8-new-chat"]').click()
await ta.fill('第二次提交')
await page.locator('button[data-action="ai8-send"]').click()
let resubmitShown = false
for (let i = 0; i < 30; i++) {
  resubmitShown = await page.evaluate(() => [...document.querySelectorAll('.ai8-log .ai-msg-assistant')].some((el) => (el.textContent ?? '').includes('正在重新提交')))
  if (resubmitShown) break
  await sleep(400)
}
site.failDrawSubmit = null // the retry 4s later lands on a freed server
for (let i = 0; i < 30; i++) { if (drawPosts.length >= 2) break; await sleep(500) } // the retry fires 4s in
check('M1 resubmit: the freed-slot copy shows and the submit is retried', drawPosts.length === 2 && resubmitShown, `drawPosts=${drawPosts.length} resubmitShown=${resubmitShown}`)
check('M2 resubmit: the retried task completes into the grid', await awaitGrid('M2', 15000))
site.emptyRecords = false

// ── N. channel outage surfaces as-is — NO adoption (R120.0) ────────────────
site.failDrawSubmit = 'channel'
drawListCalls = 0
statusCalls.length = 0
await page.locator('button[data-action="ai8-new-chat"]').click()
await ta.fill('渠道故障时提交')
await page.locator('button[data-action="ai8-send"]').click()
for (let i = 0; i < 16; i++) { if (await page.locator('.ai8-log .ai-msg-error').count() > 0) break; await sleep(500) }
check('N1 channel: the outage msg surfaces verbatim', await page.evaluate(() => (document.querySelector('.ai8-log .ai-msg-error')?.textContent ?? '').includes('没有可用的渠道')))
check('N2 channel: no adoption — GET /draw never called', drawListCalls === 0, `drawListCalls=${drawListCalls}`)

// ── P. restart recovery resumes a pending draw session (R120.5) ────────────
site.failDrawSubmit = null
await injectSession({ id: 'draw-legacy', kind: 'draw', model: 'doubao-seedream-4-5', title: '重启前没画完的', turns: [{ role: 'user', content: '重启前的任务' }, { role: 'assistant', content: '绘画任务已提交，生成中…', taskId: 'srv-9' }], createdAt: 1, updatedAt: 2 })
drawListCalls = 0
await page.reload(); await sleep(1200)
await goAi8Tab()
check('P1 resume: entering the tab auto-adopts the pending task', await awaitGrid('P1'), '')
check('P2 resume: the adopted images land in the SAME session', await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('rgbbox:ai8Sessions') || '[]')
  const s = list.find((x) => String(x.id) === 'draw-legacy')
  return !!s && (s.turns[1]?.images ?? []).length > 0
}))

// ── Q. manual「查询最新绘画结果」button (R120.4) ────────────────────────────
await injectSession({ id: 'draw-stopped', kind: 'draw', model: 'doubao-seedream-4-5', title: '被停止的任务', turns: [{ role: 'user', content: '停止的任务' }, { role: 'assistant', content: '', error: 'stopped', taskId: 'srv-9' }], createdAt: 1, updatedAt: 2 })
await page.reload(); await sleep(1200)
await goAi8Tab()
const latestBtn = page.locator('button[data-action="ai8-draw-latest"]')
check('Q1 manual: the fetch-latest button renders on the stopped error turn', await latestBtn.count() === 1)
await latestBtn.click()
check('Q2 manual: clicking adopts the latest task into the grid', await awaitGrid('Q2'))

check('Z1 zero page errors across the whole run', errors.length === 0, errors.slice(0, 2).join(' | '))

// ── restore the user's real localStorage and shut down ────────────────────
await page.evaluate((kv) => { for (const [k, v] of Object.entries(kv)) { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } }, snapshot)
try { electron.kill() } catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
