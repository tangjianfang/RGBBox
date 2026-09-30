/**
 * R216.3 evidence pass: AI-review screenshots for the E-batch closure
 * (≈45 legacy 🔄 clauses from 2026-06/07 whose only open item was "user
 * visual acceptance"). Captures the 9 views + games ready state + live
 * diagnostics metrics so a reviewer agent can eyeball them in one place.
 *
 * Port 9291 — ui-snapshot.mjs owns 9281; never collide with it.
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9291
const OUT = 'docs/ui-review/r216'
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

assertFreshOut()
mkdirSync(OUT, { recursive: true })
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// Clean boot (same rationale as ui-snapshot: persisted rgbbox:* keys shift layouts).
await page.evaluate(() => {
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('rgbbox:') || k.startsWith('rgbbox-'))) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)

const report = { views: {}, gamesReady: null, diagnosticsText: null }

for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  try {
    await page.locator('.module-rail .rail-item').nth(i).click()
    await sleep(650)
    await page.screenshot({ path: `${OUT}/${view}.png` })
    if (view === 'diagnostics') {
      report.diagnosticsText = (await page.locator('.diagnostics-view, main, body').first().innerText().catch(() => '')).slice(0, 4000)
    }
    if (view === 'games') {
      // R213 five-part extension: ready-state must expose the 4P config row
      // (player count selector + input config panel entry).
      report.gamesReady = await page.evaluate(() => {
        const txt = document.body.innerText
        return {
          hasPlayerCount: /4P|四人|4 人|players?/i.test(txt),
          hasScenePicker: /场景|scene/i.test(txt),
          hasInputConfig: /按键|输入配置|input/i.test(txt),
          hasAvatar: /头像|avatar/i.test(txt)
        }
      })
    }
    report.views[view] = 'ok'
    console.log(`SHOT  ${view}`)
  } catch (err) {
    report.views[view] = `FAIL ${err.message.split('\n')[0]}`
    console.error(`FAIL  ${view}: ${err.message.split('\n')[0]}`)
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(`\nreport → ${OUT}/report.json`)
console.log('gamesReady:', JSON.stringify(report.gamesReady))
process.exit(0)
