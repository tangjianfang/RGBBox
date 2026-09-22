/**
 * R94 diagnostics: zoom bar auto-hide + maximize self-fit + aspect ratio.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9233', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9233'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))

  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(800)
  await page.locator('.video-mode-btn').nth(2).click()
  await sleep(600)
  await page.locator('text=[youxiu]泄露版.mp4').first().click({ timeout: 5000 })
  await sleep(3500)

  const probe = (label) => page.evaluate((l) => {
    const wrap = document.querySelector('.video-player-wrap')
    const v = document.querySelector('video.video-preview-rect')
    const bar = document.querySelector('.video-zoom-bar')
    const pct = document.querySelector('.video-zoom-pct')?.textContent
    const stage = document.querySelector('.video-stage')
    const wr = wrap?.getBoundingClientRect()
    const vr = v?.getBoundingClientRect()
    return {
      label: l,
      wrap: wr ? { w: Math.round(wr.width), h: Math.round(wr.height) } : null,
      video: vr ? { w: Math.round(vr.width), h: Math.round(vr.height) } : null,
      videoAspect: vr ? +(vr.width / vr.height).toFixed(3) : null,
      expectedAspect: v && v.videoWidth ? +(v.videoWidth / v.videoHeight).toFixed(3) : null,
      zoomBarVisible: bar ? getComputedStyle(bar).display !== 'none' && getComputedStyle(bar).visibility !== 'hidden' && bar.getBoundingClientRect().height > 0 : false,
      pct,
      stageH: stage ? Math.round(stage.getBoundingClientRect().height) : null,
    }
  }, label)

  console.log(JSON.stringify(await probe('initial')))
  console.log('video inline size:', await page.evaluate(() => {
    const v = document.querySelector('video.video-preview-rect')
    return v ? { w: v.style.width, h: v.style.height, cw: v.clientWidth, ch: v.clientHeight } : null
  }))

  // ── auto-hide: idle 3.5s with playback, then check zoom bar + controls ──
  await page.locator('.video-player-wrap').click()
  await sleep(400)
  // move mouse AWAY (over the rail) so hover doesn't keep controls up
  await page.mouse.move(20, 400)
  await sleep(3800)
  const idle = await page.evaluate(() => {
    const bar = document.querySelector('.video-zoom-bar')
    const controls = document.querySelector('.video-player-controls, .video-controls-overlay, [class*="player-controls"]')
    return {
      zoomBarVisible: !!bar && bar.getBoundingClientRect().height > 0,
      controlsVisible: controls ? controls.getBoundingClientRect().height > 0 : 'not-found',
    }
  })
  console.log('idle 3.8s →', JSON.stringify(idle))

  // mouse move → controls should return (does the app re-show on mousemove?)
  await page.mouse.move(600, 400)
  await sleep(400)
  const moved = await page.evaluate(() => {
    const bar = document.querySelector('.video-zoom-bar')
    return { zoomBarVisible: !!bar && bar.getBoundingClientRect().height > 0 }
  })
  console.log('after mouse move →', JSON.stringify(moved))

  // ── maximize ──
  const cdp = await page.context().newCDPSession(page)
  const { windowId } = await cdp.send('Browser.getWindowForTarget')
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } })
  await sleep(1200)
  console.log(JSON.stringify(await probe('maximized')))
} finally {
  electron.kill()
}
