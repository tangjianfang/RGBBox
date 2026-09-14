/**
 * R94 live verification (two phases):
 *   Phase A — play a movie once (new build persists rgbbox:videoLastItem),
 *             check zoom-bar auto-hide / reappear while playing.
 *   Phase B — restart the app: fresh boot must land in the player with the
 *             last movie auto-loaded (paused) + resume prompt, zero clicks.
 */
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }

async function boot(port) {
  const electron = spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${port}`, 'out/main/index.js'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP(`http://localhost:${port}`); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  return { electron, page, errs }
}

// ── Phase A ──
{
  const { electron, page, errs } = await boot(9234)
  await sleep(2500)
  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(800)
  await page.locator('.video-mode-btn').nth(2).click()
  await sleep(600)
  await page.locator('text=[youxiu]泄露版.mp4').first().click({ timeout: 5000 })
  await sleep(3500)
  const lastItem = await page.evaluate(() => localStorage.getItem('rgbbox:videoLastItem'))
  ok(`phase A: lastItem persisted (${lastItem})`, !!lastItem)

  await page.locator('.video-player-wrap').click()
  await sleep(500)
  const barVisible = () => page.evaluate(() => {
    const bar = document.querySelector('.video-zoom-bar')
    return !!bar && bar.getBoundingClientRect().height > 0
  })
  ok('zoom bar visible on activity', await barVisible())
  await page.mouse.move(30, 500)
  await sleep(3800)
  ok('zoom bar hidden after 3.8s idle', !(await barVisible()))
  await page.mouse.move(700, 400)
  await sleep(400)
  ok('zoom bar back on mouse move', await barVisible())

  // push progress past the 30s resume threshold and flush to disk (pause
  // triggers the onPause persist) so phase B can assert the resume prompt
  await page.evaluate(() => { const v = document.querySelector('video.video-preview-rect'); if (v) v.currentTime = 60 })
  await sleep(1800)
  await page.evaluate(() => document.querySelector('video.video-preview-rect')?.pause())
  await sleep(800)
  ok('phase A: zero page errors', errs.length === 0)
  electron.kill()
  await sleep(1200)
}

// ── Phase B: fresh boot, zero interaction ──
{
  const { electron, page, errs } = await boot(9235)
  await sleep(4000)
  const restored = await page.evaluate(() => {
    const v = document.querySelector('video.video-preview-rect')
    return {
      playerTabActive: document.querySelectorAll('.video-mode-btn')[2]?.classList.contains('active'),
      src: v?.getAttribute('src')?.slice(0, 40) ?? null,
      resumeBar: !!document.querySelector('.video-resume-bar'),
      crossOrigin: v?.getAttribute('crossorigin'),
    }
  })
  ok('phase B: player tab restored', restored.playerTabActive === true)
  ok(`last movie auto-loaded (src=${restored.src})`, !!restored.src)
  ok('resume prompt offered', restored.resumeBar)
  ok('crossOrigin intact', restored.crossOrigin === 'anonymous')
  ok('phase B: zero page errors', errs.length === 0)
  if (errs.length) console.log(errs.join('\n'))
  electron.kill()
}
