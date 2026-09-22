/**
 * R92 Phase-3 minimal hypothesis test: PLAYING video (real frames) ± crossOrigin.
 * Expect: plain → SecurityError (taint); anonymous → PNG export OK (ACAO:* on media://).
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const filePath = 'C:\\Users\\tjf\\Downloads\\Telegram Desktop\\[youxiu]泄露版.mp4'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9227', 'out/main/index.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
try {
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9227'); break } catch { await sleep(500) }
  }
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))

  const result = await page.evaluate(async (fp) => {
    const url = `media://local?p=${encodeURIComponent(fp)}`
    const probe = async (crossOrigin) => {
      const v = document.createElement('video')
      if (crossOrigin) v.crossOrigin = crossOrigin
      v.muted = true
      v.src = url
      await new Promise((res, rej) => {
        v.addEventListener('loadeddata', res, { once: true })
        v.addEventListener('error', () => rej(new Error('load error ' + (v.error?.code ?? '?'))), { once: true })
        setTimeout(() => rej(new Error('timeout')), 20000)
      })
      await v.play()
      // wait until real frames advance past the black start
      for (let i = 0; i < 60 && v.currentTime < 0.6; i++) await new Promise(r => setTimeout(r, 200))
      const c = document.createElement('canvas')
      c.width = v.videoWidth
      c.height = v.videoHeight
      c.getContext('2d').drawImage(v, 0, 0)
      try {
        const d = c.toDataURL('image/png')
        return { crossOrigin: crossOrigin ?? null, t: v.currentTime, ok: true, dataLen: d.length }
      } catch (e) {
        return { crossOrigin: crossOrigin ?? null, t: v.currentTime, ok: false, err: String(e).slice(0, 110) }
      }
    }
    return {
      plain: await probe(null).catch(e => ({ fatal: String(e) })),
      anon: await probe('anonymous').catch(e => ({ fatal: String(e) })),
    }
  }, filePath)
  console.log(JSON.stringify(result, null, 2))
} finally {
  electron.kill()
}
