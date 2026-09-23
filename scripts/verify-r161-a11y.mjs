/**
 * R161.5: accessibility semantic-surface acceptance —
 *   1. Tab traversal: keyboard focus moves through the rail and into view
 *      content (no focus dead-ends);
 *   2. transport icon-only buttons all carry aria-label (title alone is not
 *      exposed to screen readers), mode toggles carry aria-pressed, sliders
 *      carry aria-label (+valuetext where meaningful);
 *   3. R157.8 §7.4 debt: all 55 effect cards render localized zh text
 *      (previous round spot-checked the first card only).
 *
 * Human NVDA/Narrator walkthrough stays outside the automation boundary
 * (R161 declaration) — this script is the code-level face of A3.
 *
 * Usage: node scripts/verify-r161-a11y.mjs   (run `yarn build` first)
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9300
let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`FAIL  ${name}`) }
}

assertFreshOut()
launchElectron({ port: PORT })
const { browser, page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
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
const rail = page.locator('.module-rail .rail-item')

// ── 1. Tab traversal on the dashboard (default view) ────────────────────────
const focusTrail = []
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { tag: 'body' }
    return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), label: el.getAttribute('aria-label') ?? '' }
  })
  focusTrail.push(info)
}
const railFocuses = focusTrail.filter((f) => f.cls.includes('rail-item')).length
const uniqueTargets = new Set(focusTrail.map((f) => `${f.tag}.${f.cls}`)).size
ok(`Tab traversal: rail items receive focus (${railFocuses} hits)`, railFocuses >= 1)
ok(`Tab traversal: focus advances (${uniqueTargets} distinct targets over 14 presses)`, uniqueTargets >= 3)
await page.keyboard.press('Shift+Tab')
const backInfo = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? 'body')
ok('Shift+Tab walks focus back', backInfo !== 'body')

// ── 2. Audio transport semantics ────────────────────────────────────────────
await rail.nth(4).click() // audio
await sleep(1000)
const audioSem = await page.evaluate(() => {
  // Accessible name = aria-label OR text content — text buttons are fine;
  // only icon-only buttons without either are real violations.
  const nameOf = (el) => ((el.getAttribute('aria-label') ?? '').trim() || (el.textContent ?? '').trim())
  const iconBtns = [...document.querySelectorAll('.audio-btn-icon, .audio-btn-sm')]
  const missingLabel = iconBtns.filter((b) => !nameOf(b)).map((b) => b.title || b.className)
  const pressedToggles = [...document.querySelectorAll('.audio-btn-sm[aria-pressed], .audio-btn-icon[aria-pressed]')].length
  const sliders = [...document.querySelectorAll('.audio-transport-bar input[type="range"]')]
  const sliderMissing = sliders.filter((s) => !(s.getAttribute('aria-label') ?? '').trim()).length
  return { iconCount: iconBtns.length, missingLabel, pressedToggles, sliderCount: sliders.length, sliderMissing }
})
ok(`audio transport: ${audioSem.iconCount} transport buttons all expose an accessible name`, audioSem.iconCount > 0 && audioSem.missingLabel.length === 0)
if (audioSem.missingLabel.length) console.log('     missing names:', audioSem.missingLabel.slice(0, 6))
ok('audio transport: loop/shuffle/lyrics expose aria-pressed', audioSem.pressedToggles >= 3)
ok(`audio transport: ${audioSem.sliderCount} transport sliders all carry aria-label`, audioSem.sliderCount >= 3 && audioSem.sliderMissing === 0)

// ── 3. Video view icon buttons (camera pane is the default; the player
//      transport renders only with loaded media — its source carries the same
//      title↔aria-label pattern, asserted on the always-present set here). ──
await rail.nth(3).click() // video
await sleep(1000)
const videoSem = await page.evaluate(() => {
  const nameOf = (el) => ((el.getAttribute('aria-label') ?? '').trim() || (el.textContent ?? '').trim())
  const iconBtns = [...document.querySelectorAll('.video-btn-icon, .video-player-btn')]
  const missing = iconBtns.filter((b) => !nameOf(b)).map((b) => b.title || b.className)
  return { count: iconBtns.length, missing }
})
ok(`video view: ${videoSem.count} icon-only buttons all expose an accessible name`, videoSem.count > 0 && videoSem.missing.length === 0)
if (videoSem.missing.length) console.log('     missing names:', videoSem.missing.slice(0, 6))

// ── 4. All 55 effect cards render localized zh (R157.8 §7.4 debt) ──────────
// Cards live under category tabs — walk every tab and collect all labels.
await rail.nth(2).click() // effects
await sleep(800)
const tabs = await page.locator('.effects-category-tab').count()
const allLabels = []
for (let i = 0; i < Math.max(1, tabs); i++) {
  const clicked = await page.locator('.effects-category-tab').nth(i).click().then(() => true, () => false)
  if (clicked) await sleep(500)
  const labels = await page.evaluate(() => [...document.querySelectorAll('.effect-card-info strong')].map((el) => el.textContent ?? ''))
  allLabels.push(...labels)
}
const cards = [...new Set(allLabels)]
const cjk = (s) => /[一-鿿]/.test(s)
const nonZh = cards.filter((label) => !cjk(label))
ok(`effects: all ${cards.length} card labels localized zh`, cards.length >= 55 && nonZh.length === 0)
if (nonZh.length) console.log('     non-zh labels:', nonZh.slice(0, 6))

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
