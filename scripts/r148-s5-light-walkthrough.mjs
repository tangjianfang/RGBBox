/**
 * R148 S5: light-theme walkthrough — switch the theme to light via the real
 * persistence key (rgbbox:theme=light → main.tsx bootTheme applies it
 * pre-paint after reload), walk the 9 rail views, screenshot each into
 * docs/ui-review/r148-s5-light/ for eyeball review.
 *
 * Port 9295 (staggered from ui-snapshot's 9281). Cleans the theme key at the
 * end (before kill — localStorage writes after kill are silently dropped).
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9295
const OUT = 'docs/ui-review/r148-s5-light'
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

assertFreshOut()
mkdirSync(OUT, { recursive: true })
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// Clean rgbbox:* state, then persist LIGHT and reload — bootTheme() in
// main.tsx reads the key before first paint.
await page.evaluate(() => {
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('rgbbox:') || k.startsWith('rgbbox-'))) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
  localStorage.setItem('rgbbox:theme', 'light')
}).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)

const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
console.log(`data-theme on <html>: ${applied ?? '(absent — dark)'}`)
if (applied !== 'light') {
  console.error('theme not applied — aborting')
  process.exit(1)
}

let ok = 0
for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  try {
    await page.locator('.module-rail .rail-item').nth(i).click()
    await sleep(650)
    await page.screenshot({ path: `${OUT}/${view}.png` })
    ok++
    console.log(`SHOT  ${view} → ${OUT}/`)
  } catch (err) {
    console.error(`FAIL  ${view}: ${err.message.split('\n')[0]}`)
  }
}
console.log(`${ok}/${VIEWS.length} light views captured`)

// Also capture the settings view (theme selector lives there) — settings is
// not on the rail; reach it via the topbar ⚙ if present, else skip.
try {
  const gear = page.locator('.topbar .icon-button, .topbar-menu summary').last()
  await gear.click({ timeout: 2000 }).catch(() => {})
  await sleep(500)
  await page.screenshot({ path: `${OUT}/settings.png` })
  console.log('SHOT  settings → (topbar menu)')
} catch {
  console.log('settings entry not found on topbar — skipped')
}

// Restore clean state BEFORE kill (late writes are dropped silently).
await page.evaluate(() => localStorage.removeItem('rgbbox:theme')).catch(() => {})
process.exit(ok === VIEWS.length ? 0 : 1)
