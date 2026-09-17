/**
 * R119 smoke: the three selection-AI IPC channels respond with the right
 * shapes on the main window (empty pending text → parse; close → true).
 * The hotkey→SendKeys→window flow is OS-level (CDP cannot inject it — same
 * R112 lesson) and is left for manual verification.
 */
import { chromium } from 'file:///C:/Users/admin/AppData/Local/Temp/pw-cdp/node_modules/playwright-core/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9271
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
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
if (!page) { console.error('FAIL no CDP page'); process.exit(1) }
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await sleep(1200)

const text = await page.evaluate(() => window.rgbbox.selectionAiGetText())
check('A1 IPC: selectionAiGetText responds (empty until a hotkey captures)', typeof text === 'string' && text === '', `text=${JSON.stringify(text)}`)
const run = await page.evaluate(() => window.rgbbox.selectionAiRun('translate'))
check('A2 IPC: selectionAiRun guards empty pending text with the parse hint', run !== null && run.ok === false && run.hint === 'parse', JSON.stringify(run))
const badAction = await page.evaluate(() => window.rgbbox.selectionAiRun('bogus'))
check('A3 IPC: unknown actions are rejected', badAction !== null && badAction.ok === false, JSON.stringify(badAction))
const closed = await page.evaluate(() => window.rgbbox.selectionAiClose())
check('A4 IPC: selectionAiClose responds true', closed === true)
check('A5 zero page errors', errors.length === 0, errors.slice(0, 2).join(' | '))

try { electron.kill() } catch {}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS${failed.length ? ' — FAILED: ' + failed.map((f) => f.name).join('; ') : ''}`)
process.exit(failed.length ? 1 : 0)
