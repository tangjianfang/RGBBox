/**
 * R225: effects-library preview pill walkthrough — on the REAL app, with real
 * pointer moves:
 *   1. hover a card → pill appears (fixed overlay, bottom center);
 *   2. stability: pill existence + bbox sampled repeatedly — zero flicker
 *      (the pre-R225 in-flow pill oscillated mount/unmount forever);
 *   3. retention: pointer travels from the card to the pill's 应用 button,
 *      pill survives (grace + self-retention) and clicking it COMMITS the
 *      effect (applied toast shows).
 *
 * Port 9298. Cleans rgbbox:* keys before kill.
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9298
const OUT = 'docs/ui-review/r225'

assertFreshOut()
mkdirSync(OUT, { recursive: true })
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(600)

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// effects = 3rd rail item (dashboard, workspace, effects, …)
await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
await sleep(400)

const card = page.locator('.effect-card:not(.selected)').first()
await card.hover()
await sleep(600) // > 300ms debounce

// ── 1. pill exists, fixed overlay ──────────────────────────────────────────
const pillInfo = await page.evaluate(() => {
  const pill = document.querySelector('.fx-preview-pill')
  if (!pill) return null
  const s = getComputedStyle(pill)
  const r = pill.getBoundingClientRect()
  return { position: s.position, text: pill.textContent?.slice(0, 40) ?? '', box: [r.x, r.y, r.width, r.height].map(Math.round) }
})
check('pill appears after hover', pillInfo !== null)
if (pillInfo) {
  check('pill is position:fixed (overlay, zero reflow)', pillInfo.position === 'fixed', `position=${pillInfo.position}`)
  check('pill sits at the bottom band', pillInfo.box[1] > 600, `y=${pillInfo.box[1]}`)
}

// ── 2. flicker stability: 6 samples, 200ms apart ───────────────────────────
const samples = []
for (let i = 0; i < 6; i++) {
  await sleep(200)
  samples.push(await page.evaluate(() => {
    const pill = document.querySelector('.fx-preview-pill')
    if (!pill) return null
    const r = pill.getBoundingClientRect()
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}`
  }))
}
const stable = samples.every((s) => s !== null && s === samples[0])
check('pill stable across 1.2s sampling (no flicker)', stable, samples.join(' | '))

// ── 3. retention + apply via the pill button ───────────────────────────────
await page.screenshot({ path: `${OUT}/pill-hovered.png` })
const btn = page.locator('.fx-preview-pill button')
await btn.hover()               // travel: card → pill (grace must hold it)
await sleep(150)
const retained = await page.evaluate(() => document.querySelector('.fx-preview-pill') !== null)
check('pill retained while pointer is on it (button reachable)', retained)
await btn.click()
await sleep(400)
const after = await page.evaluate(() => ({
  pill: document.querySelector('.fx-preview-pill') !== null,
  toast: document.querySelector('.fx-applied-toast') !== null,
  toastText: document.querySelector('.fx-applied-toast')?.textContent?.slice(0, 40) ?? '',
}))
check('apply click commits (toast shows)', after.toast, `toast="${after.toastText}"`)
check('pill dismissed after apply', !after.pill)
await page.screenshot({ path: `${OUT}/applied-toast.png` })

// restore clean state
await page.evaluate(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith('rgbbox:')) localStorage.removeItem(k)
  }
}).catch(() => {})
console.log(failures === 0 ? '\nR225 walkthrough: ALL PASS' : `\nR225 walkthrough: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
