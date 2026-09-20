/**
 * R144 packaged-app verification: the AI Lab vision capability bench.
 *
 *  1. the AI lab offers a sixth tab (体感) and the bench mounts with the
 *     24-capability catalog across 7 groups + the explore panel
 *  2. the synthetic pipeline starts through the real UI wiring (hidden host
 *     window + media:// models from the file:// page) → bench is "running"
 *  3. bus events light rows with counters in the REAL DOM: pinch held/up,
 *     double-pinch combo, chord command, chord char + note, face, offhand,
 *     hands, direction note
 *  4. reset clears the counters; switching tabs unmounts the bench cleanly
 *  5. zero page errors throughout
 *
 * Usage: node scripts/verify-r144-vision-lab.mjs
 * (build first: yarn build — this drives out/ with the dev electron binary)
 */
import { chromium } from 'file:///C:/Users/admin/AppData/Local/Temp/pw-cdp/node_modules/playwright-core/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9272
const OUT = 'docs/screenshots'
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

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
if (!page) { console.error('FAIL  no CDP page'); process.exit(1) }
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

// ── 1. navigate to the AI lab and open the vision tab ─────────────────────
await page.locator('.rail-item').filter({ hasText: 'AI' }).first().click()
await sleep(700)
const tabCount = await page.locator('.ai-tab').count()
check('AI lab offers six tabs', tabCount === 6, `got ${tabCount}`)
await page.locator('.ai-tab[data-tab="vision"]').click()
await sleep(400)

const bench = await page.evaluate(() => ({
  lab: !!document.querySelector('.ai-vision-lab'),
  caps: document.querySelectorAll('tr[data-cap]').length,
  groups: document.querySelectorAll('tr.cap-group').length,
  explore: !!document.querySelector('.vision-explore'),
  pad: !!document.querySelector('.vision-pad'),
  startBtn: !!document.querySelector('[data-action="vision-start"]'),
}))
check('bench mounted (.ai-vision-lab)', bench.lab)
check('24 capability rows', bench.caps === 24, `got ${bench.caps}`)
check('7 group headers', bench.groups === 7, `got ${bench.groups}`)
check('explore panel present', bench.explore)
check('start button present while off', bench.startBtn)
check('VisionPad not mounted while off', !bench.pad)

// ── 2. synthetic pipeline through the real wiring (hidden host + media://) ─
const started = await page.evaluate(() => window.__rgbboxVisionLab?.startSynthetic() ?? Promise.resolve(false))
check('startSynthetic() resolved (host window + media:// models)', started === true)
let running = false
for (let i = 0; i < 30 && !running; i++) {
  await sleep(700)
  running = await page.evaluate(() => document.querySelector('.ai-vision-lab')?.getAttribute('data-running') === '1')
}
check('calibration wizard completed → running (synthetic hand)', running)
await page.screenshot({ path: `${OUT}/r144-vision-lab.png`, fullPage: false }).catch(() => {})
check('VisionPad mounted with the session', !!(await page.evaluate(() => document.querySelector('.vision-pad'))))

// ── 3. bus events light rows in the real DOM ───────────────────────────────
const fire = (detail) => page.evaluate((d) => {
  window.dispatchEvent(new CustomEvent('vision-input', { detail: d }))
}, detail)
const count = async (id) => page.locator(`tr[data-cap="${id}"] .cap-count`).textContent().catch(() => null)

await fire({ kind: 'pinch', key: 'Space', down: true })
check('pinch down → held badge', !!(await page.locator('tr[data-cap="pinch"] .cap-held').count()))
await fire({ kind: 'pinch', key: 'Space', down: false })
await fire({ kind: 'pinch', key: 'Space', down: true })
await fire({ kind: 'pinch', key: 'Space', down: false })
check('pinch counted ×2', (await count('pinch')) === '×2')
check('double-pinch combo ×1', (await count('doublePinch')) === '×1')
check('pinch released → held badge gone', !(await page.locator('tr[data-cap="pinch"] .cap-held').count()))

await fire({ kind: 'chord', name: 'select', down: true })
check('chord select ×1', (await count('chord-select')) === '×1')
await fire({ kind: 'chord', name: 'char:e', down: true })
check('chord char lands on text row ×1', (await count('chordText')) === '×1')
check('chord char note shows the character', (await page.locator('tr[data-cap="chordText"] .cap-note').textContent()) === 'e')

await fire({ kind: 'face', name: 'jawOpen', key: 'KeyE', down: true })
await fire({ kind: 'face', name: 'calibrated', key: null, down: true })
check('face jawOpen ×1', (await count('jawOpen')) === '×1')
check('face neutral calibration ×1', (await count('faceNeutral')) === '×1')

await fire({ kind: 'offhand', name: 'pinch', key: 'KeyF', down: true })
await fire({ kind: 'hands', name: 'apart', key: null, down: true })
check('off-hand pinch ×1', (await count('offPinch')) === '×1')
check('hands apart ×1', (await count('gapApart')) === '×1')

await fire({ kind: 'direction', key: 'ArrowUp', dir: 'up-right', down: true })
check('direction row records the sector note', (await page.locator('tr[data-cap="dir8"] .cap-note').textContent()) === 'up-right')

// ── 4. reset + quick params + tab-switch unmount ───────────────────────────
// NOTE: the synthetic hand keeps producing REAL events (~4s pinch period),
// so the reset assertion must read the DOM right after the click, before the
// next synthetic event can legitimately re-light a row.
await page.locator('[data-action="vision-reset"]').click()
const badgesAfterReset = await page.evaluate(() => document.querySelectorAll('tr[data-cap] .cap-count').length)
check('reset clears counters', badgesAfterReset === 0, `${badgesAfterReset} badges remain`)
await page.locator('select[data-param="sensitivity"]').selectOption('sport').catch(() => {})
check('quick params interactive (no crash)', errors.length === 0)

await page.locator('.ai-tab[data-tab="config"]').click()
await sleep(600)
check('leaving the tab unmounts the bench', !(await page.evaluate(() => document.querySelector('.ai-vision-lab'))))
await sleep(400)
check('zero page errors', errors.length === 0, errors[0] ?? '')

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} PASS`)
process.exit(failed ? 1 : 0)
