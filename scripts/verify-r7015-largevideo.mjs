/**
 * R70.15 live verification: the media:// handler must stream a >2GiB file
 * without materializing it (the old whole-range fs.read aborted the process
 * via Node's int32 CHECK — exit 134).
 *
 * Spawns the built app with remote debugging, then in the renderer:
 *   1. fetch()es the crash file with an open-ended `Range: bytes=0-`, reads a
 *      few MB of the streamed body, cancels — exercises the exact fatal path.
 *   2. loads a <video> with the same URL, plays ~8s, reports decode state.
 * Fails if the electron process dies at any point.
 */
// playwright is installed globally (not a repo dependency)
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.cwd()
const filePath = 'C:\\Users\\tjf\\Downloads\\Telegram Desktop\\[youxiu]泄露版.mp4'

const electron = spawn('node_modules/electron/dist/electron.exe', ['--remote-debugging-port=9224', 'out/main/index.js'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let crashed = false
let stderrTail = ''
electron.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000) })
electron.on('exit', (code, sig) => { crashed = true; console.log(`ELECTRON EXIT code=${code} sig=${sig}`) })

try {
  // wait for CDP endpoint
  let browser
  for (let i = 0; i < 40; i++) {
    try { browser = await chromium.connectOverCDP('http://localhost:9224'); break } catch { await sleep(500) }
  }
  if (!browser) throw new Error('CDP endpoint never came up')
  const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
  if (!page) throw new Error('renderer page not found')
  console.log('connected to renderer:', page.url())

  // ── 1. open-ended Range fetch: the exact request that killed the app ──
  const fetchReport = await page.evaluate(async (fp) => {
    const url = `media://local?p=${encodeURIComponent(fp)}`
    const res = await fetch(url, { headers: { Range: 'bytes=0-' } })
    const reader = res.body.getReader()
    let received = 0
    while (received < 4 * 1024 * 1024) { // a few MB is plenty past the old crash point
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
    }
    await reader.cancel()
    return {
      status: res.status,
      contentLength: res.headers.get('content-length'),
      contentRange: res.headers.get('content-range'),
      contentType: res.headers.get('content-type'),
      received,
    }
  }, filePath)
  console.log('range fetch:', JSON.stringify(fetchReport))
  if (crashed) throw new Error('process died during range fetch')

  // ── 2. <video> playback survival ──
  const videoReport = await page.evaluate(async (fp) => {
    const url = `media://local?p=${encodeURIComponent(fp)}`
    const v = document.createElement('video')
    v.src = url
    v.muted = true
    v.style.position = 'fixed'
    v.style.right = '8px'
    v.style.bottom = '8px'
    v.style.width = '320px'
    document.body.appendChild(v)
    const errInfo = await new Promise((resolve) => {
      v.addEventListener('error', () => resolve({ errored: true, code: v.error?.code, msg: v.error?.message }), { once: true })
      setTimeout(() => resolve({ errored: false }), 8000)
    })
    try { await v.play() } catch (e) { /* decode may legitimately fail */ }
    return {
      ...errInfo,
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      duration: v.duration,
      currentTime: v.currentTime,
      buffered: v.buffered.length ? `${v.buffered.start(0)}-${v.buffered.end(0)}` : 'none',
    }
  }, filePath)
  console.log('video:', JSON.stringify(videoReport))
  await sleep(1500)
  if (crashed) throw new Error('process died during video playback')

  // ── 3. seek into the far half (2GiB+ offset range request) ──
  const seekReport = await page.evaluate(async (fp) => {
    const v = document.querySelector('video')
    if (!v || v.error) return { skipped: true }
    v.currentTime = 4000 // ~64 min in — moov/mdat offsets deep into the file
    await new Promise((r) => setTimeout(r, 4000))
    return { currentTime: v.currentTime, paused: v.paused, readyState: v.readyState }
  }, filePath)
  console.log('seek:', JSON.stringify(seekReport))
  if (crashed) throw new Error('process died during deep seek')

  console.log('\nRESULT: PASS — app survived the 3.78GiB file (fetch + playback + seek)')
} finally {
  electron.kill()
}
if (crashed) {
  console.log('--- stderr tail ---\n' + stderrTail)
  process.exit(1)
}
