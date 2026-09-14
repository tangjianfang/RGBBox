/**
 * R94 repro: deleting captures from the filmstrip one by one — expected crash
 * point: deleting the LAST entry blanks the whole UI (React render error).
 */
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9232', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
const pageErrors = []
let dead = false
electron.on('exit', (c) => { dead = true; console.log('ELECTRON EXIT', c) })

try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9232'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(1000)

  const count0 = await page.evaluate(() => document.querySelectorAll('.capture-thumb, [class*="filmstrip"] img, [class*="capture"] li, [class*="capture"] > *').length)
  console.log('initial capture-ish nodes:', count0)
  const uiOk = () => page.evaluate(() => !!document.querySelector('.module-rail') && document.body.children.length > 0)

  let round = 0
  while (round < 20) {
    round++
    const before = await page.evaluate(() => window.rgbbox.capturesList().then((l) => l.length).catch(() => -1))
    // hover a thumbnail to surface its delete button, click delete
    const thumb = page.locator('.video-filmstrip-item').first()
    if ((await thumb.count()) === 0) { console.log(`round ${round}: no thumb element visible`); break }
    await thumb.hover().catch(() => {})
    await sleep(200)
    const del = page.locator('.video-filmstrip-del').first()
    if ((await del.count()) === 0) {
      // dump filmstrip HTML classes to find the real delete affordance
      const info = await page.evaluate(() => {
        const el = document.querySelector('.video-filmstrip-wrap')
        return el ? el.outerHTML.slice(0, 600) : 'no .video-filmstrip-wrap'
      })
      console.log('filmstrip HTML head:', info)
      break
    }
    // the delete affordance is hover-revealed (CSS opacity) — dispatch the
    // click directly so Playwright's visibility gate doesn't fight the CSS
    await page.evaluate(() => document.querySelector('.video-filmstrip-del').click())
    await sleep(900)
    const after = await page.evaluate(() => window.rgbbox.capturesList().then((l) => l.length).catch(() => -1))
    const ok = await uiOk()
    console.log(`round ${round}: captures ${before} -> ${after}, ui intact: ${ok}`)
    if (!ok) { console.log('*** UI BLANKED ***'); break }
    if (after <= 0) { console.log('list emptied, ui still intact'); break }
  }
  console.log('pageErrors:', pageErrors.length ? pageErrors.join('\n---\n') : '(none)')
  if (dead) console.log('electron died')
} finally {
  electron.kill()
}
