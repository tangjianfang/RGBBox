/**
 * R148 S0: visual baseline snapshots — boots the built app (out/) under CDP,
 * walks the 9 reachable views via the module rail and captures full-window
 * screenshots into docs/ui-baseline/. Re-run after UI changes and eyeball
 * (or byte-compare) the diff; a future step can wire pixelmatch for a hard
 * gate once the baseline is trusted.
 *
 * Usage: node scripts/ui-snapshot.mjs          (yarn build first)
 */
import { chromium } from 'file:///C:/Users/admin/AppData/Local/Temp/pw-cdp/node_modules/playwright-core/index.mjs'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9281
const OUT = 'docs/ui-baseline'
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

mkdirSync(OUT, { recursive: true })
const electron = spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${PORT}`, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

let browser
for (let i = 0; i < 40; i++) {
  try { browser = await chromium.connectOverCDP(`http://localhost:${PORT}`); break } catch { await sleep(500) }
}
if (!browser) { console.error('CDP never came up'); process.exit(1) }

const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
if (!page) { console.error('renderer page not found'); process.exit(1) }

// Stable-ish viewport for comparable shots.
 await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// localStorage view persistence → reset to a clean dashboard boot.
await page.evaluate(() => localStorage.removeItem('rgbbox:view')).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700) // boot fan-out + dashboard settle

// Rail order at runtime = ['dashboard', ...CARD_VIEWS] which matches VIEWS
// exactly (model3d filtered out by the compile-time flag). The aria-labels
// are translated text, so index-based clicking is the stable handle.
let ok = 0
for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  try {
    await page.locator('.module-rail .rail-item').nth(i).click()
    await sleep(650) // lazy chunk fetch + first paint
    await page.screenshot({ path: `${OUT}/${view}.png` })
    ok++
    console.log(`SHOT  ${view}`)
  } catch (err) {
    console.error(`FAIL  ${view}: ${err.message.split('\n')[0]}`)
  }
}

console.log(`${ok}/${VIEWS.length} views captured into ${OUT}/`)
process.exit(ok === VIEWS.length ? 0 : 1)
