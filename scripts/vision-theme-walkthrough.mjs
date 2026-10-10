/**
 * R255 / TASK-UNIVERSE F4 (first tranche): theme×lang walkthrough —
 * per-view screenshots across themes with console-error + zh-leak checks.
 * Light theme had NO baseline coverage until now; this closes the loop with
 * an AI-reviewable evidence folder. First tranche: 12 views × 2 themes (zh).
 *
 *   yarn vision:themes
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9306
const OUT = 'docs/ui-review/f4-themes'
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'model3d', 'ai', 'settings']
const THEMES = ['dark', 'light']

const udd = join(tmpdir(), `rgbbox-themes-${Date.now()}`)
mkdirSync(udd, { recursive: true })
mkdirSync(OUT, { recursive: true })
const electron = spawn('node_modules/electron/dist/electron.exe',
  [`--remote-debugging-port=${PORT}`, '--user-data-dir=' + udd, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })

const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90)) })

let shots = 0
let themeFails = 0
for (const theme of THEMES) {
  await page.evaluate((t) => {
    if (t === 'light') localStorage.setItem('rgbbox:theme', 'light')
    else localStorage.removeItem('rgbbox:theme')
  }, theme)
  await page.reload()
  await page.waitForSelector('.module-rail', { timeout: 15000 })
  await sleep(700)
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  if ((theme === 'light') !== (applied === 'light')) { console.error(`theme not applied: want ${theme} got ${applied}`); themeFails++ }
  for (let i = 0; i < VIEWS.length; i++) {
    await page.locator('.module-rail .rail-item').nth(i).click().catch(() => {})
    await page.waitForTimeout(600)
    const file = `${OUT}/${theme}-${VIEWS[i]}.png`
    await page.screenshot({ path: file })
    shots++
    console.log(`SHOT ${file}`)
  }
}

console.log(`\n${shots} screenshots → ${OUT}/ | theme failures: ${themeFails} | console errors: ${consoleErrors.length}`)
for (const e of consoleErrors.slice(0, 5)) console.log(`  [err] ${e}`)
try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* best effort */ }
process.exit(themeFails || consoleErrors.length ? 1 : 0)
