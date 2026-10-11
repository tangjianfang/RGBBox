/**
 * R286 诊断探针 — 为何同一 analyser 上 timeData 活而 freqData 全零。
 * 在页面包 AnalyserNode.prototype 两个 getter,记录每实例的真实读数。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const udd = join(tmpdir(), `rgbbox-probe-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const START = Date.now(); const electron = launchElectron({ port: 9410 + (Date.now() % 80), userDataDir: udd, entry: join(ROOT, 'out/main/index.js') })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP('http://localhost:' + (9410 + (START % 80)))
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(800)

// 先装探针(在开任何音频之前)
await page.evaluate(() => {
  const proto = AnalyserNode.prototype
  const origF = proto.getByteFrequencyData
  const origT = proto.getFloatTimeDomainData
  window.__probe = { instances: [] }
  const idxOf = (node) => {
    let i = window.__probe.instances.findIndex((x) => x.node === node)
    if (i < 0) {
      i = window.__probe.instances.length
      window.__probe.instances.push({
        node, fftSize: node.fftSize, binCount: node.frequencyBinCount,
        minDb: node.minDecibels, maxDb: node.maxDecibels, smoothing: node.smoothingTimeConstant,
        ctxState: node.context.state, sampleRate: node.context.sampleRate,
        freqCalls: 0, freqMaxSum: 0, freqNonZeroBins: 0,
        timeCalls: 0, timeMaxAbs: 0,
      })
    }
    return i
  }
  proto.getByteFrequencyData = function (arr) {
    origF.call(this, arr)
    const s = window.__probe.instances[idxOf(this)]
    s.freqCalls++
    let sum = 0, nz = 0
    for (let k = 0; k < arr.length; k++) { sum += arr[k]; if (arr[k] > 8) nz++ }
    if (sum > s.freqMaxSum) { s.freqMaxSum = sum; s.freqNonZeroBins = nz }
    // 末帧快照 + 前 64 bin 原值(与 canvas 读数同刻对照)
    s.lastSum = sum
    s.lastFirst64 = Array.from(arr.slice(0, 64))
    // 500ms 采样时间线:max bin / 非零 bin 数
    s.tl = s.tl || []
    const now = performance.now()
    if (!s.tl.length || now - s.tl[s.tl.length - 1].t > 480) {
      let mx = 0
      for (let k = 0; k < arr.length; k++) mx = Math.max(mx, arr[k])
      s.tl.push({ t: Math.round(now), maxBin: mx, nz })
    }
  }
  proto.getFloatTimeDomainData = function (arr) {
    origT.call(this, arr)
    const s = window.__probe.instances[idxOf(this)]
    s.timeCalls++
    let mx = 0
    for (let k = 0; k < arr.length; k++) mx = Math.max(mx, Math.abs(arr[k]))
    s.timeMaxAbs = Math.max(s.timeMaxAbs, mx)
  }
})
console.log('probe installed')
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

// 音频工作站 → 生成器抽屉 → loop+预览
await page.locator('.module-rail .rail-item').nth(4).click()
await sleep(1200)
await page.locator('.audio-top-drawers .audio-btn').nth(1).click()
await sleep(600)
await page.locator('.audio-gen-actions .audio-btn-sm').first().evaluate((el) => el.click())
await sleep(200)
await page.locator('.audio-gen-actions .audio-btn-primary').first().evaluate((el) => el.click())

for (let i = 0; i < 24; i++) {
  if ((await page.locator('.audio-viz-empty').count()) === 0) break
  await sleep(500)
}
await page.locator('.audio-drawer-header .audio-btn-icon').first().evaluate((el) => el.click())
await sleep(4000) // 让曲子跑几秒

// 直接读 .audio-visualizers 内所有 canvas 的真实像素(绕过截图链路)
// 先包 fill/fillRect 统计 1s 的绘制指令(disp 层终极证据)
const drawStats = await page.evaluate(async () => {
  const proto = CanvasRenderingContext2D.prototype
  const origFill = proto.fill
  const origFillRect = proto.fillRect
  const st = { fill: 0, fillRect: 0, rectSamples: [], pathSamples: [] }
  const now = performance.now()
  proto.fill = function (...a) {
    st.fill++
    if (st.pathSamples.length < 12 && this.canvas.className.includes('spectrum')) {
      const m = this.getTransform()
      st.pathSamples.push({ tx: +m.e.toFixed(1), ty: +m.f.toFixed(1), sx: +m.a.toFixed(2) })
    }
    return origFill.apply(this, a)
  }
  proto.fillRect = function (x, y, w, h) {
    st.fillRect++
    if (st.rectSamples.length < 24 && this.canvas.className.includes('spectrum')) {
      st.rectSamples.push([+x.toFixed(1), +y.toFixed(1), +w.toFixed(1), +h.toFixed(1)])
    }
    return origFillRect.call(this, x, y, w, h)
  }
  await new Promise((r) => setTimeout(r, 1000))
  proto.fill = origFill
  proto.fillRect = origFillRect
  return st
})
console.log('DRAW 1s:', JSON.stringify(drawStats))

const canvases = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.audio-visualizers canvas')).map((c) => {
    const ctx = c.getContext('2d')
    let lit = 0, total = 0, maxL = 0
    if (ctx && c.width > 0 && c.height > 0) {
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      for (let i = 0; i < d.length; i += 4) {
        const l = d[i] + d[i + 1] + d[i + 2]
        if (l > 40) lit++
        if (l > maxL) maxL = l
        total++
      }
    }
    return {
      cls: c.className, w: c.width, h: c.height,
      clientW: c.clientWidth, clientH: c.clientHeight,
      visible: !!(c.offsetParent || c.getClientRects().length),
      litPct: +(lit / Math.max(1, total) * 100).toFixed(1), maxL,
    }
  })
})
console.log('ASSETS:', await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes('index-')).join(',')))
console.log('CANVASES:', JSON.stringify(canvases, null, 2))
console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 10) : 'none')

const probe = await page.evaluate(() => {
  const { instances } = window.__probe
  return instances.map((s) => ({
    fftSize: s.fftSize, binCount: s.binCount, minDb: s.minDb, maxDb: s.maxDb, smoothing: s.smoothing,
    ctxState: s.ctxState, sampleRate: s.sampleRate,
    freqCalls: s.freqCalls, freqMaxSum: s.freqMaxSum, freqNonZeroBins: s.freqNonZeroBins,
    lastSum: s.lastSum, lastFirst64: s.lastFirst64, tl: s.tl,
    timeCalls: s.timeCalls, timeMaxAbs: +s.timeMaxAbs.toFixed(4),
  }))
})
console.log(JSON.stringify(probe, null, 2))

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
