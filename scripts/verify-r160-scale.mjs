/**
 * R160.6 ②③: font-scale tier validation — the Dynamic-Type-equivalent tiers
 * must resize the root, persist across reloads, and keep every view free of
 * horizontal overflow / rail-header overlap at every tier (85%…130%).
 *
 * Layout assertions follow the verify-r116/r117 pattern: computed styles +
 * rect containment (no pixels judged here — that stays with ui-snapshot).
 *
 * Usage: node scripts/verify-r160-scale.mjs   (run `yarn build` first)
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9299
const TIERS = [
  { id: 'xs', px: '13.6px' },
  { id: 'sm', px: '14.72px' },
  { id: 'md', px: '16px' },
  { id: 'lg', px: '18.4px' },
  { id: 'xl', px: '20.8px' },
]
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`FAIL  ${name}`) }
}

assertFreshOut()
launchElectron({ port: PORT })
const { browser, page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)

const rail = page.locator('.module-rail .rail-item')
for (const tier of TIERS) {
  await page.evaluate((id) => localStorage.setItem('rgbbox:uiFontScale', id), tier.id)
  await page.reload()
  await page.waitForSelector('.module-rail', { timeout: 15000 })
  await sleep(700)

  const rootPx = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  ok(`tier ${tier.id}: root font-size ${rootPx} (expected ${tier.px})`, rootPx === tier.px)

  for (let i = 0; i < VIEWS.length; i++) {
    try {
      await rail.nth(i).click()
      await sleep(650)
      const probe = await page.evaluate(() => {
        const se = document.scrollingElement ?? document.documentElement
        const railRect = document.querySelector('.module-rail')?.getBoundingClientRect()
        // Keep-alive views (video/audio) stay mounted but hidden — their
        // headers have zero rects. Judge the VISIBLE header only.
        const header = [...document.querySelectorAll('.workspace-header h2')]
          .map((el) => el.getBoundingClientRect())
          .find((r) => r.width > 1)
        return {
          overflowX: se.scrollWidth - se.clientWidth,
          railOk: railRect ? (railRect.left >= -0.5 && railRect.top >= -0.5 && railRect.right <= window.innerWidth + 0.5 && railRect.bottom <= window.innerHeight + 0.5) : false,
          noOverlap: railRect && header ? header.left >= railRect.right - 1 : true,
        }
      })
      const v = VIEWS[i]
      ok(`tier ${tier.id}/${v}: no horizontal overflow (+${probe.overflowX}px)`, probe.overflowX <= 0)
      if (!probe.railOk) { fail++; console.log(`FAIL  tier ${tier.id}/${v}: rail escapes the viewport`) } else pass++
      if (!probe.noOverlap) { fail++; console.log(`FAIL  tier ${tier.id}/${v}: view header overlaps the rail`) } else pass++
    } catch (err) {
      fail++
      console.log(`FAIL  tier ${tier.id}/${VIEWS[i]}: ${err.message.split('\n')[0]}`)
    }
  }
}

// Persistence: the tier survives a reload without touching storage again.
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(500)
const persisted = await page.evaluate(() => ({ px: getComputedStyle(document.documentElement).fontSize, stored: localStorage.getItem('rgbbox:uiFontScale') }))
ok(`tier persists across reload (${persisted.stored} → ${persisted.px})`, persisted.stored === 'xl' && persisted.px === '20.8px')

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
