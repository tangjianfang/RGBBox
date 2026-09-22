/**
 * R92 Phase-1 live repro: drive the REAL 拍照 / 局部截图 buttons while a movie
 * plays in player mode; collect page errors + resulting capture cache.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const filePath = 'C:\\Users\\tjf\\Downloads\\Telegram Desktop\\[youxiu]泄露版.mp4'
// The unpackaged spawn uses userData = Roaming/Electron
const cfgDir = join(process.env.APPDATA, 'Electron', 'config')
mkdirSync(cfgDir, { recursive: true })
writeFileSync(join(cfgDir, 'video-playlist.json'), JSON.stringify([
  { id: 'repro-1', name: '[youxiu]泄露版.mp4', path: filePath, group: 'Default' },
], null, 2))

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9226', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
})
let dead = false
electron.on('exit', (c) => { dead = true; console.log('ELECTRON EXIT', c) })

const pageErrors = []
const consoleErrors = []
try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9226'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  // enter video studio via rail
  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(600)
  // switch to player mode (3rd mode button)
  await page.locator('.video-mode-btn').nth(2).click()
  await sleep(600)
  // click the playlist item
  const item = page.locator('text=[youxiu]泄露版.mp4').first()
  await item.click({ timeout: 5000 })
  await sleep(6000)
  const playing = await page.evaluate(() => {
    const v = document.querySelector('video.video-preview-rect')
    return v ? { videoWidth: v.videoWidth, currentTime: v.currentTime, paused: v.paused, src: v.currentSrc.slice(0, 60) } : null
  })
  console.log('player state:', JSON.stringify(playing))

  // ── 拍照 ──
  const before = await page.evaluate(() => window.rgbbox.capturesList().then(l => l.length).catch(() => -1))
  await page.locator('.video-transport button', { hasText: '拍照' }).click()
  await sleep(2500)
  const afterPhoto = await page.evaluate(() => window.rgbbox.capturesList().then(l => l.length).catch(() => -1))
  console.log(`photo: captures ${before} -> ${afterPhoto}`)

  // ── 局部截图 ──
  await page.locator('.video-transport button', { hasText: '局部截图' }).click()
  await sleep(800)
  const snipShown = await page.evaluate(() => !!document.querySelector('.video-snip-freeze') || !!document.querySelector('.snip-layer, .video-snip'))
  console.log('snip overlay shown:', snipShown)
  // drag a selection in the middle of the stage, then confirm with Enter
  const box = await page.locator('.video-player-wrap').boundingBox()
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    // probe: is the snip SVG actually sized and on top at the drag point?
    const svgProbe = await page.evaluate(({ px, py }) => {
      const svg = document.querySelector('.video-snip-svg')
      return {
        hasSvg: !!svg,
        attrW: svg?.getAttribute('width'), attrH: svg?.getAttribute('height'),
        rect: svg ? JSON.parse(JSON.stringify(svg.getBoundingClientRect())) : null,
        topAtPoint: document.elementFromPoint(px, py)?.outerHTML?.slice(0, 120),
      }
    }, { px: cx, py: cy })
    console.log('svg probe:', JSON.stringify(svgProbe))
    await page.mouse.move(cx - 200, cy - 100)
    await page.mouse.down()
    await page.mouse.move(cx + 200, cy + 100, { steps: 8 })
    await page.mouse.up()
    await sleep(400)
    // probe: did the drag register a selection rect in the snip SVG?
    const selProbe = await page.evaluate(() => {
      const svg = document.querySelector('.video-snip-svg')
      const rects = svg ? Array.from(svg.querySelectorAll('rect')).map(r => ({ x: r.getAttribute('x'), w: r.getAttribute('width') })) : null
      return { rects }
    })
    console.log('selection probe:', JSON.stringify(selProbe))
    await page.keyboard.press('Enter')
    await sleep(2000)
    const stillFrozen = await page.evaluate(() => !!document.querySelector('.video-snip-freeze'))
    console.log('after Enter, freeze still shown:', stillFrozen)
    if (stillFrozen) {
      // fallback: double-click inside the selection to confirm
      await page.mouse.dblclick(cx, cy)
      await sleep(2000)
      console.log('after dblclick, freeze still shown:', await page.evaluate(() => !!document.querySelector('.video-snip-freeze')))
    }
  }
  const afterSnip = await page.evaluate(() => window.rgbbox.capturesList().then(l => l.length).catch(() => -1))
  const annotator = await page.evaluate(() => !!document.querySelector('.annotate-overlay, [class*="annotate"]'))
  console.log(`snip: captures ${afterPhoto} -> ${afterSnip}, annotator open: ${annotator}`)

  console.log('\npageErrors:', JSON.stringify(pageErrors, null, 2))
  console.log('consoleErrors:', JSON.stringify(consoleErrors.slice(0, 10), null, 2))
  if (dead) throw new Error('electron died during repro')
} finally {
  electron.kill()
}
