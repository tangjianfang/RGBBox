/**
 * R91.2 live verification: keep-alive + MiniPlayerCard.
 * Play a movie → switch to the AI view → assert audio keeps playing, the mini
 * card renders non-black mirrored frames, drag/resize state, return + close.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9228', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
let dead = false
electron.on('exit', (c) => { dead = true; console.log('ELECTRON EXIT', c) })

const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }

try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9228'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))

  // enter video studio and switch to the player tab
  // (mode auto-restore is covered by the unit test — the spawned profile's
  // localStorage was last written by a pre-R91.1 build, so click explicitly)
  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(800)
  await page.locator('.video-mode-btn').nth(2).click()
  await sleep(600)

  // play the movie (playlist item click loads paused → click stage to play)
  await page.locator('text=[youxiu]泄露版.mp4').first().click({ timeout: 5000 })
  await sleep(4000)
  await page.locator('.video-player-wrap').click()
  await sleep(2500)
  const playing = await page.evaluate(() => {
    const v = document.querySelector('video.video-preview-rect')
    return v ? { t: v.currentTime, paused: v.paused } : null
  })
  ok('movie playing before switch', playing && !playing.paused && playing.t > 0.5)

  // ── switch away to the AI lab ──
  await page.locator('.rail-item', { hasText: 'AI' }).first().click()
  await sleep(1500)
  const hidden = await page.evaluate(() => {
    const anchor = document.querySelector('.video-view-anchor')
    const v = document.querySelector('video.video-preview-rect')
    const mini = document.querySelector('.mini-player')
    const canvas = document.querySelector('.mini-player-canvas')
    // sample the mirrored canvas for non-black pixels
    let variance = 0
    if (canvas && canvas.width) {
      const ctx = canvas.getContext('2d')
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0, sum2 = 0, n = 0
      for (let i = 0; i < d.length; i += 400) { sum += d[i]; sum2 += d[i] * d[i]; n++ }
      variance = sum2 / n - (sum / n) ** 2
    }
    return {
      anchorHidden: anchor ? getComputedStyle(anchor).display === 'none' : null,
      videoStillThere: !!v,
      videoTime: v ? v.currentTime : -1,
      videoPaused: v ? v.paused : null,
      miniCard: !!mini,
      canvasVariance: Math.round(variance),
    }
  })
  ok('view anchor display:none (keep-alive)', hidden.anchorHidden === true)
  ok('video element survived (no unmount)', hidden.videoStillThere)
  ok('audio keeps playing after switch', !hidden.videoPaused && hidden.videoTime > 1)
  ok('mini card surfaced', hidden.miniCard)
  ok('mini canvas renders real frames (non-black)', hidden.canvasVariance > 20)

  // mini card: pause via card button, then play again
  const cardBtns = page.locator('.mini-player-controls .mini-player-icon-btn')
  await cardBtns.first().click(); await sleep(600)
  const pausedViaCard = await page.evaluate(() => document.querySelector('video.video-preview-rect')?.paused)
  ok('card pause works', pausedViaCard === true)
  await cardBtns.first().click(); await sleep(600)

  // return to player via the card button
  await page.locator('.mini-player-header .mini-player-icon-btn').first().click()
  await sleep(1000)
  const returned = await page.evaluate(() => {
    const anchor = document.querySelector('.video-view-anchor')
    return {
      anchorVisible: anchor ? getComputedStyle(anchor).display !== 'none' : false,
      miniGone: !document.querySelector('.mini-player'),
      railActive: document.querySelectorAll('.rail-item')[2]?.classList.contains('active'),
    }
  })
  ok('return-to-player restores view, card retracts', returned.anchorVisible && returned.miniGone)

  // switch away again → card returns; close it
  await page.locator('.rail-item', { hasText: 'AI' }).first().click()
  await sleep(900)
  const reappeared = await page.evaluate(() => !!document.querySelector('.mini-player'))
  ok('card re-surfaces on next switch-away', reappeared)
  await page.locator('.mini-player-header .mini-player-icon-btn').nth(1).click()
  await sleep(700)
  const closed = await page.evaluate(() => ({
    cardGone: !document.querySelector('.mini-player'),
    paused: document.querySelector('video.video-preview-rect')?.paused,
  }))
  ok('card close pauses playback and retracts', closed.cardGone && closed.paused)

  ok('electron alive through the whole flow', !dead)
} finally {
  electron.kill()
}
