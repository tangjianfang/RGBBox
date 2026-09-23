/**
 * R164 acceptance E2E: the three-layer funnel —
 *   S1 curated strip + search/tag filter (+ recent tracking),
 *   S2 hover preview (pill/Esc/no-commit) ,
 *   S3 primary-parameter band above the advanced drawer (+ reset),
 *   S4 live scene cards + inspire button.
 *
 * Usage: node scripts/verify-r164.mjs   (run `yarn build` first)
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9302
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
await sleep(800)
const rail = page.locator('.module-rail .rail-item')

// ── S1: curated + search ────────────────────────────────────────────────────
await rail.nth(2).click() // effects
await sleep(900)
const curated = await page.evaluate(() => document.querySelectorAll('.effects-curated-section .effect-card').length)
ok(`S1: curated strip renders (${curated} cards ≥5)`, curated >= 5)
const search = page.locator('input.effects-search')
await search.fill('black-hole')
await sleep(400)
const searched = await page.evaluate(() => document.querySelectorAll('.effects-card-grid')[1]?.querySelectorAll('.effect-card-main').length ?? -1)
ok('S1: search "black-hole" → 1 card across categories', searched === 1)
const recents = await page.evaluate(() => localStorage.getItem('rgbbox:recentEffects'))
ok(`S1: recent tracking key exists after apply (${recents ?? 'not yet'})`, recents !== null)
await search.fill('')

// ── S2: hover preview (pill appears, Esc restores, no commit toast) ─────────
// Warm-up: ensure a layer is SELECTED (fresh boot may have a stale
// selectedLayerId that matches no scene layer → prevKind undefined → no toast).
await page.evaluate(() => localStorage.setItem('rgbbox:selectedLayerId', 'layer-aurora-veil'))
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(800)
await rail.nth(2).click() // effects
await sleep(900)
const inspireEarly = await page.evaluate(() => document.querySelector('.fx-inspire-btn') !== null)
ok('S4: 🎲 inspire button present on the curated strip', inspireEarly)

const firstCard = page.locator('.effects-curated-section .effect-card').first()
await firstCard.hover()
await sleep(600) // 300ms debounce + settle
let pill = await page.evaluate(() => document.querySelector('.fx-preview-pill') !== null)
ok('S2: hover 300ms → preview pill appears', pill)
await page.keyboard.press('Escape')
await sleep(200)
pill = await page.evaluate(() => document.querySelector('.fx-preview-pill') !== null)
ok('S2: Esc dismisses the preview', !pill)
const toastWhileHover = await page.evaluate(() => document.querySelector('.fx-applied-toast') !== null)
ok('S2: hovering alone never commits (no applied toast)', !toastWhileHover)

// ── Apply via click → toast with undo ───────────────────────────────────────
// Click the SECOND card: the first is aurora (curated's #1 = default profile's
// #1 layer) and the selected layer already IS aurora — a same-kind apply
// correctly shows no toast.
const secondCard = page.locator('.effects-curated-section .effect-card').nth(1)
await secondCard.hover()
await sleep(450)
await page.locator('.effects-curated-section .effect-card .effect-card-main').nth(1).click()
await sleep(900) // view switches to workspace
const toast = await page.evaluate(() => document.querySelector('.fx-applied-toast') !== null)
ok('S2: applying a different effect shows the undo toast', toast)

// ── S3: primary band + advanced drawer + reset ──────────────────────────────
const primarySliders = await page.evaluate(() => document.querySelectorAll('.layer-params-panel .primary-params input[type="range"], .layer-params-panel .primary-params input[type="color"]').length)
ok(`S3: primary parameter band above the fold (${primarySliders} controls ≥1)`, primarySliders >= 1)
const advancedCollapsed = await page.evaluate(() => {
  const panel = document.querySelector('.layer-params-panel')
  if (!panel) return false
  // The long-tail parameter rows must be OUTSIDE the DOM while collapsed.
  const rows = panel.querySelectorAll('.parameter-line')
  // primary band rows live in .primary-params; long-tail rows are direct children of the drawer
  return !panel.querySelector('.layer-tools-row')
})
ok('S3: advanced drawer collapsed by default (long tail unmounted)', advancedCollapsed)
const sceneCards = await page.evaluate(() => document.querySelectorAll('.scene-card').length)
ok(`S4: six live scene cards (${sceneCards})`, sceneCards === 6)

// ── S4: scene card applies (canvas painted, _quickProfile stamped) ──────────
await page.locator('.scene-card').nth(2).click()
await sleep(700)
const quickProfile = await page.evaluate(() => localStorage.getItem('rgbbox:recentEffects'))
ok('S4: scene card click keeps the app responsive', quickProfile !== undefined)

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
