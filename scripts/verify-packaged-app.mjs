/**
 * R95 packaged-app verification: launch release/win-unpacked/RGBBox.exe with
 * CDP, run the DTLN denoise round-trip — proves the PRUNED onnxruntime-node
 * native binding loads and infers inside the packaged app. Plus a UI smoke.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('release/win-unpacked/RGBBox.exe', ['--remote-debugging-port=9240'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }
let dead = false
electron.on('exit', (c) => { dead = true; console.log('APP EXIT', c) })

try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9240'); break } catch { await sleep(500) }
  }
  if (!browser) throw new Error('CDP never came up')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  ok('packaged app booted, renderer attached', !!page)

  // UI smoke: rail renders, video studio reachable
  await page.locator('.rail-item', { hasText: '视频' }).first().click()
  await sleep(1200)
  ok('video studio renders', await page.evaluate(() => !!document.querySelector('.video-mode-bar')))

  // DTLN round-trip through the PACKAGED app's utility process
  const result = await page.evaluate(async () => {
    const start = await window.rgbbox.denoiseStart()
    if (!start.ok) return { error: JSON.stringify(start) }
    const replies = []
    const off = window.rgbbox.onDenoiseFrames((p) => replies.push(p))
    for (let b = 0; b < 6; b++) {
      const blocks = []
      for (let w = 0; w < 2; w++) {
        const win = new Float32Array(512)
        for (let i = 0; i < 512; i++) win[i] = 0.2 * Math.sin((2 * Math.PI * 200 * i) / 16000)
        blocks.push(win)
      }
      window.rgbbox.denoiseSendFrames(b, blocks)
      await new Promise((r) => setTimeout(r, 60))
    }
    await new Promise((r) => setTimeout(r, 600))
    off()
    await window.rgbbox.denoiseStop()
    let sum = 0, n = 0
    for (const p of replies) for (const hop of p.blocks) for (let i = 0; i < hop.length; i++) sum += Math.abs(hop[i]), n++
    return { batches: replies.length, meanAbs: n ? sum / n : 0 }
  })
  console.log(JSON.stringify(result))
  ok('packaged ort loads + utility infers', result.batches >= 4 && result.meanAbs > 1e-4)
  ok('app alive through verification', !dead)
} finally {
  electron.kill()
}
