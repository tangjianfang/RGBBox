/**
 * R320 reproduction probe: which media URLs does the BUILT renderer's CSP
 * actually allow? Runs against out/ (yarn build first — the CSP meta is
 * injected by the prod-only plugin, dev has none).
 *
 * Cases (each on a detached <video> inside the real app page):
 *   media://local — app's own protocol (VideoStudio/AudioStudio playlists)
 *   blob:         — local file picker / MediaRecorder outputs
 *   http(s)://    — VideoStudio "网络流" direct URLs + AI8 remote videoUrl
 *   fetch http:// — hls.js segment/m3u8 path (connect-src)
 *
 * CSP rejections are pre-network: the local server never sees the request and
 * the element errors with "Media load rejected by URL safety check" (code 4).
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9320
const LOCAL_WEBM = `${homedir()}\\Videos\\rgbbox-recording-1789136600481.webm`

// 1. local HTTP sink — records every request CSP let through
const hits = []
const sink = createServer((req, res) => {
  hits.push(req.url)
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Access-Control-Allow-Origin': '*' })
  res.end()
})
await new Promise((r) => sink.listen(24320, '127.0.0.1', r))

if (!existsSync(LOCAL_WEBM)) {
  console.error(`SKIP local-file probe — ${LOCAL_WEBM} missing`)
  process.exit(1)
}

const electron = spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${PORT}`, '--ignore-certificate-errors', 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500)
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 2000 })
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  } catch {}
}
if (!page) { console.error('FAIL no CDP page'); process.exit(1) }

const cspMeta = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '(none)')
console.log(`CSP meta: ${cspMeta}\n`)

/** Probe one <video> src: resolve on first terminal event with what happened. */
const probeSrc = (src) => page.evaluate(async (url) => {
  return await new Promise((resolve) => {
    const v = document.createElement('video')
    const t = setTimeout(() => resolve({ event: 'timeout', code: 0, message: '' }), 8000)
    // snapshot v.error BEFORE the load() reset wipes it — that reset is what
    // hid the real MEDIA_ELEMENT_ERROR message in the first probe cut
    const finish = (event) => { clearTimeout(t); const e = { code: v.error?.code ?? 0, message: v.error?.message ?? '' }; v.removeAttribute('src'); v.load(); resolve({ event, ...e }) }
    v.addEventListener('loadedmetadata', () => finish('loadedmetadata'))
    v.addEventListener('error', () => finish('error'))
    v.preload = 'auto'
    v.src = url
  })
}, src)

const results = []
const report = (name, outcome, expect) => {
  const ok = expect(outcome)
  results.push(ok)
  const hit = hits.length > 0 ? ` [server saw: ${hits.join(',')}]` : ''
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}\n      ${JSON.stringify(outcome)}${hit}`)
  hits.length = 0
}

// media://local (allowlisted Videos root) — must reach the protocol handler
report('media://local loads (playlist path)', await probeSrc(`media://local?p=${encodeURIComponent(LOCAL_WEBM)}`),
  (o) => o.event === 'loadedmetadata')

// blob: — picker/recorder outputs
report('blob: scheme allowed', await probeSrc('blob:media-source/no-such'), (o) => o.event === 'error' && !/URL safety/.test(o.message))

// http direct stream URL (VideoStudio 网络流 direct branch)
report('http:// media allowed (stream box)', await probeSrc('http://127.0.0.1:24320/direct.mp4'),
  (o) => o.event === 'loadedmetadata' || hits.includes('/direct.mp4'))

// https direct stream URL / AI8 remote videoUrl — TLS aside, CSP decision is
// pre-network; if CSP blocks, the message says so explicitly.
report('https:// media allowed (AI8 videoUrl)', await probeSrc('https://127.0.0.1:24320/remote.mp4'),
  (o) => !/URL safety/.test(String(o.message)))

// hls.js path: fetch() an m3u8 — connect-src decides before TLS/network
report('fetch http:// allowed (hls.js segments)', await page.evaluate(async () => {
  try { await fetch('http://127.0.0.1:24320/probe.m3u8', { mode: 'cors' }); return 'fetched' } catch (e) { return String(e) }
}), (o) => o === 'fetched' || hits.includes('/probe.m3u8'))

console.log(results.every(Boolean) ? '\nALL PASS' : `\n${results.filter((r) => !r).length} FAILING`)
sink.close()
try { electron.kill() } catch {}
process.exit(results.every(Boolean) ? 0 : 1)
