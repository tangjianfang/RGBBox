/**
 * R91.3a live verification: Audio FX panel builds the WebAudio chain on a
 * media:// movie without killing playback (CORS-clean via crossOrigin fix) and
 * switches presets cleanly.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9229', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
let dead = false
electron.on('exit', (c) => { dead = true; console.log('ELECTRON EXIT', c) })
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }

try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9229'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(800)
  await page.locator('.video-mode-btn').nth(2).click()
  await sleep(600)
  await page.locator('text=[youxiu]泄露版.mp4').first().click({ timeout: 5000 })
  await sleep(4000)
  await page.locator('.video-player-wrap').click()
  await sleep(2000)

  const t0 = await page.evaluate(() => document.querySelector('video.video-preview-rect')?.currentTime ?? -1)
  ok('movie playing', t0 > 0.5)

  // open the Audio FX popover and engage 对白增强 (dialog)
  await page.locator('.video-transport button', { hasText: '音频处理' }).click()
  await sleep(500)
  ok('audio panel open', await page.evaluate(() => !!document.querySelector('.video-audio-panel')))
  await page.locator('.video-audio-presets button', { hasText: '对白增强' }).click()
  await sleep(1500)
  const afterDialog = await page.evaluate(() => {
    const pills = Array.from(document.querySelectorAll('.video-audio-presets .video-btn'))
    return {
      dialogActive: pills.find(b => b.textContent?.includes('对白增强'))?.classList.contains('active'),
      t: document.querySelector('video.video-preview-rect')?.currentTime ?? -1,
      paused: document.querySelector('video.video-preview-rect')?.paused,
    }
  })
  ok('dialog preset selected', afterDialog.dialogActive === true)
  ok('playback alive after WebAudio graph attach', !afterDialog.paused && afterDialog.t > t0)

  // night mode, then off (bypass)
  await page.locator('.video-audio-presets button', { hasText: '夜间模式' }).click()
  await sleep(800)
  await page.locator('.video-audio-presets button', { hasText: '关闭' }).click()
  await sleep(800)
  const offState = await page.evaluate(() => {
    const pills = Array.from(document.querySelectorAll('.video-audio-presets .video-btn'))
    return {
      offActive: pills.find(b => b.textContent?.trim() === '关闭')?.classList.contains('active'),
      t: document.querySelector('video.video-preview-rect')?.currentTime ?? -1,
      paused: document.querySelector('video.video-preview-rect')?.paused,
    }
  })
  ok('off (bypass) selectable', offState.offActive === true)
  ok('playback alive after bypass', !offState.paused && offState.t > afterDialog.t)

  // gain slider moves without errors
  await page.locator('.video-audio-gain input').fill('6')
  await sleep(400)
  ok('gain slider adjusts', await page.evaluate(() => document.querySelector('.video-audio-gain-val')?.textContent?.includes('+6')))
  ok('zero page errors', pageErrors.length === 0)
  if (pageErrors.length) console.log(pageErrors.join('\n'))
  ok('electron alive', !dead)
} finally {
  electron.kill()
}
