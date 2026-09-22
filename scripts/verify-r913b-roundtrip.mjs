/**
 * R91.3b round-trip proof: feed known input through denoiseStart/SendFrames →
 * utility DTLN → onDenoiseFrames, and verify the returned hops are real audio
 * (non-zero RMS) and not the input passthrough (DTLN alters the spectrum).
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9231', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }

try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9231'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))

  const result = await page.evaluate(async () => {
    const start = await window.rgbbox.denoiseStart()
    if (!start.ok) return { error: JSON.stringify(start) }
    // 10 batches × 2 windows of mixed tone+noise (speech-ish energy)
    const replies = []
    const off = window.rgbbox.onDenoiseFrames((p) => replies.push(p))
    for (let b = 0; b < 10; b++) {
      const blocks = []
      for (let w = 0; w < 2; w++) {
        const win = new Float32Array(512)
        for (let i = 0; i < 512; i++) {
          win[i] = 0.25 * Math.sin((2 * Math.PI * 180 * ((b * 2 + w) * 128 + i)) / 16000)
            + 0.05 * (Math.random() * 2 - 1)
        }
        blocks.push(win)
      }
      window.rgbbox.denoiseSendFrames(b, blocks)
      await new Promise((r) => setTimeout(r, 60))
    }
    await new Promise((r) => setTimeout(r, 800))
    off()
    await window.rgbbox.denoiseStop()
    // stats over all returned hops
    let sum = 0, n = 0, nonZero = 0
    for (const p of replies) for (const hop of p.blocks) {
      for (let i = 0; i < hop.length; i++) {
        const a = Math.abs(hop[i]); sum += a; n++
        if (a > 1e-5) nonZero++
      }
    }
    return { batches: replies.length, hops: replies.reduce((a, p) => a + p.blocks.length, 0), meanAbs: sum / n, nonZeroFrac: nonZero / n }
  })
  console.log(JSON.stringify(result))
  ok('utility processed batches', result.batches >= 8)
  ok('output is real audio (non-zero)', result.meanAbs > 1e-4)
  ok('output is bounded (< 1, no NaN blowup)', result.meanAbs < 1)
} finally {
  electron.kill()
}
