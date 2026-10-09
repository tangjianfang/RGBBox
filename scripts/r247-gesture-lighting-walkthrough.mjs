/**
 * R247 walkthrough: real-app screenshots of the light-ring v2 states.
 *
 *   node scripts/r247-gesture-lighting-walkthrough.mjs
 *
 * Camera-free: the AI-Lab vision tab's __rgbboxVisionLab.startSynthetic() E2E
 * seam boots the SYNTHETIC host session; the assistant then rides it (the
 * host ignores a second init), so the domain hook gets REAL geom frames.
 * The discrete gestures ride the same window 'vision-input' bus the engine
 * uses. The synthetic demo hand pinches on its own ~4s cycle — the adjust
 * demo is armed right after a synthetic pinch UP so the 600ms hold gate
 * isn't cancelled by the demo hand's release.
 */
import { pathToFileURL } from 'node:url'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(tmpdir(), 'r247-shots')
mkdirSync(SHOTS, { recursive: true })

const { chromium } = await import(pathToFileURL(join(ROOT, 'scripts/lib/cdp.mjs')).href)

const PORT = 9317
const udd = join(tmpdir(), `rgbbox-r247-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const electron = spawn(join(ROOT, 'node_modules/electron/dist/electron.exe'),
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`, join(ROOT, 'out/main/index.js')],
  { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

const bus = (detail) => `window.dispatchEvent(new CustomEvent('vision-input', { detail: ${JSON.stringify(detail)} }))`

async function main() {
  let page = null
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
      page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
      if (!page) { await sleep(500); page = null }
    } catch { await sleep(500) }
  }
  if (!page) throw new Error('app never came up')
  await page.waitForSelector('.module-rail', { timeout: 15000 })
  console.log('app up')

  // 1. boot the SYNTHETIC vision host via the AI-Lab seam
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.module-rail .rail-item')]
    btns.find((b) => /AI/i.test(b.getAttribute('aria-label') || ''))?.click()
  })
  await sleep(900)
  await page.evaluate(() => {
    document.querySelector('[data-tab="vision"]')?.click()
  })
  await sleep(600)
  const synthOk = await page.evaluate(async () => {
    const w = window
    return typeof w.__rgbboxVisionLab?.startSynthetic === 'function' ? await w.__rgbboxVisionLab.startSynthetic() : false
  })
  console.log('synthetic host:', synthOk)
  if (!synthOk) throw new Error('synthetic seam unavailable (vision tab not mounted?)')

  // 2. enable the assistant WITHOUT leaving the AI Lab view — leaving would
  //    unmount the vision tab, whose hook owns the synthetic session (R228
  //    refcount); the assistant rides the live session (duplicate init →
  //    ready) and the synthetic hand auto-calibrates (~5-8s)
  await page.click('.vision-assistant-pill')
  let badge = false
  for (let i = 0; i < 60 && !badge; i++) {
    await sleep(500)
    badge = await page.evaluate(() => document.querySelector('.vision-assistant-badge') != null)
  }
  console.log('assistant badge:', badge)
  if (!badge) throw new Error('assistant never enabled')
  await sleep(8000) // settle toward ACTIVE
  // ACTIVE probe: the cursor only mounts once the hand is seen; while
  // calibrating, the wizard's pinch step cycles pinch every 1s and would
  // cancel any 600ms hold — the adjust demo MUST wait for active tracking.
  let tracking = false
  for (let i = 0; i < 60 && !tracking; i++) {
    await sleep(500)
    tracking = await page.evaluate(() => document.querySelector('.vision-cursor') != null)
  }
  console.log('cursor tracking (session ACTIVE):', tracking)
  const cur1 = await page.evaluate(() => document.querySelector('.vision-cursor')?.getAttribute('style') ?? null)
  await sleep(1200)
  const cur2 = await page.evaluate(() => document.querySelector('.vision-cursor')?.getAttribute('style') ?? null)
  console.log('palm sweep drift:', cur1 !== cur2 ? 'drifting' : 'STATIC')

  // 3. ADJUST DEMO — real gesture chain: chord `light` opens the ring,
  //    direction picks (up = slot 2 breathing, has baseBrightness), pinch
  //    down applies + holds ≥600ms → adjust; the synthetic palm sweep drives
  //    the percent live. Armed right after a synthetic pinch UP so the demo
  //    hand's own cycle cannot release the hold.
  await page.evaluate(bus({ kind: 'chord', name: 'light', down: true }))
  await sleep(400)
  let ringOpenNow = await page.evaluate(() => document.querySelector('.vision-radial.light') != null)
  if (!ringOpenNow) { // the demo hand can occasionally chord 'light' itself — retoggle
    await page.evaluate(bus({ kind: 'chord', name: 'light', down: true }))
    await sleep(400)
    ringOpenNow = await page.evaluate(() => document.querySelector('.vision-radial.light') != null)
  }
  console.log('light ring open:', ringOpenNow)
  await page.evaluate(bus({ kind: 'direction', key: 'ArrowUp', down: true, dir: 'up' }))
  await sleep(300)
  const sawPinchUp = await page.evaluate(() => new Promise((resolve) => {
    const t = setTimeout(() => { window.removeEventListener('vision-input', h); resolve(false) }, 6000)
    const h = (ev) => {
      const d = ev.detail || {}
      if (d.kind === 'pinch' && d.key === 'Space' && d.down === false) {
        clearTimeout(t); window.removeEventListener('vision-input', h); resolve(true)
      }
    }
    window.addEventListener('vision-input', h)
  }))
  console.log('demo-hand pinch release observed:', sawPinchUp)
  await page.evaluate(bus({ kind: 'pinch', key: 'Space', down: true })) // apply + HOLD
  await sleep(750) // >600ms gate → adjust mode
  let pct = null
  for (let i = 0; i < 8; i++) {
    pct = await page.evaluate(() => document.querySelector('.vision-light-adjust-num')?.textContent ?? null)
    if (pct != null) break
    await sleep(250)
  }
  console.log('adjust container:', await page.evaluate(() => document.querySelector('.vision-light-adjust') != null))
  console.log('applied toast:', await page.evaluate(() => document.body.textContent?.match(/已应用|Applied/)?.[0] ?? null))
  console.log('adjust ring percent:', pct)
  await sleep(1000)
  const pct2 = await page.evaluate(() => document.querySelector('.vision-light-adjust-num')?.textContent ?? null)
  console.log('percent 1s later (drifts with the synthetic sweep):', pct2)
  await page.screenshot({ path: join(SHOTS, 'r247-adjust.png') })
  await page.evaluate(bus({ kind: 'pinch', key: 'Space', down: false }))
  await sleep(300)
  console.log('adjust exits on pinch up:', await page.evaluate(() => document.querySelector('.vision-light-adjust') == null))

  // 4. FREEZE DEMO — offhand open-palm hold (the engine's pause trigger):
  //    freezes the light + vision stream; second palm resumes.
  await page.evaluate(bus({ kind: 'offhand', name: 'pause', key: null, down: true }))
  await sleep(400)
  console.log('frozen badge:', await page.evaluate(() => document.querySelector('.vision-light-frozen')?.textContent ?? null))
  await page.screenshot({ path: join(SHOTS, 'r247-frozen.png') })
  await sleep(900) // past the 800ms toggle cooldown
  await page.evaluate(bus({ kind: 'offhand', name: 'pause', key: null, down: true }))
  await sleep(300)
  console.log('resumed (badge gone):', await page.evaluate(() => document.querySelector('.vision-light-frozen') == null))

  console.log('SHOTS DIR:', SHOTS)
}

try {
  await main()
} finally {
  try { electron.kill() } catch {}
  await sleep(800)
  try { rmSync(udd, { recursive: true, force: true }) } catch {}
}
process.exit(process.exitCode ?? 0)
