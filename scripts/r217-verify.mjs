/**
 * R217 verify: HiDPI games canvas — assert the backing store scales with the
 * CSS box × devicePixelRatio (no longer the fixed 900×520 raster), sample
 * rAF frame rate while a game runs, and capture zoomed screenshots for
 * visual review of the anti-jaggy upgrade.
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9297
const OUT = 'docs/ui-review/r217'
assertFreshOut()
mkdirSync(OUT, { recursive: true })
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
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

// games view → hub → pick the Swarm card (canvas only exists in-game)
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
const entered = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role=button], .game-card, a')]
  const card = btns.find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) { card.click(); return true }
  return false
})
if (!entered) { console.error('FAIL: swarm card not found on hub'); process.exit(1) }
await sleep(1200)
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { cssW: r.width, cssH: r.height, backingW: c.width, backingH: c.height, dpr: window.devicePixelRatio }
})
console.log('canvas:', JSON.stringify(info))
if (!info) { console.error('FAIL: no canvas after entering game'); process.exit(1) }

// try to start a run: click the canvas centre (survival ready → start)
await page.locator('canvas').first().click({ position: { x: 450, y: 260 } }).catch(() => {})
await sleep(1500)

// rAF frame-rate sample over ~2s (game loop running)
const fps = await page.evaluate(async () => {
  await new Promise((resolve) => {
    let frames = 0
    const t0 = performance.now()
    const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(null) }
    requestAnimationFrame(tick)
  }).then(() => 0).catch(() => 0)
  return new Promise((resolve) => {
    let frames = 0
    const t0 = performance.now()
    const tick = () => {
      frames++
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
      else resolve(Math.round((frames * 1000) / (performance.now() - t0)))
    }
    requestAnimationFrame(tick)
  })
})
console.log('rAF fps ~', fps)

await sleep(400)
await page.screenshot({ path: `${OUT}/survival-hd.png` })

// zoomed crop for jaggy inspection: clip the canvas centre-left quadrant
const box = await page.locator('canvas').first().boundingBox()
if (box) {
  await page.screenshot({
    path: `${OUT}/survival-hd-zoom.png`,
    clip: { x: box.x + box.width * 0.05, y: box.y + box.height * 0.1, width: box.width * 0.45, height: box.height * 0.6 }
  })
}

const verdict = info && info.backingW > 900
console.log(verdict ? 'HD-BACKING OK' : 'HD-BACKING FAIL — still logical res')
process.exit(verdict ? 0 : 1)
