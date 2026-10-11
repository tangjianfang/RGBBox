/**
 * R286 真机走查 — 音频 7 可视化逐模式截图(AI 审美复核素材)。
 * 尝试循环预览音色驱动(桌面回环通则活体跳动);无论音频是否闭环,
 * 每模式截 2 帧记录帧间差异(动感证据)。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r286-audio-viz')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r286-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9334
const electron = launchElectron({ port: PORT, userDataDir: udd, entry: join(ROOT, 'out/main/index.js') })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(800)

// 音频工作站
await page.locator('.module-rail .rail-item').nth(4).click()
await sleep(1200)

// 开循环预览——生成器区按钮(:2871 .audio-gen-actions .audio-btn-primary)。
// 预览合成音经 eq 链→analyser→destination,无需麦克风;首版脚本误点场景卡
// 按钮导致 previewPlaying 恒 false,7 张截图全是「播放音频后」占位卡。
await page.locator('.audio-top-drawers .audio-btn').nth(1).click() // 生成器抽屉
await sleep(600)
// 抽屉内容可能溢出面板边界(backdrop 拦截 hit-test),用 JS 直点;
// 抽屉按钮那一下已是可信手势,AudioContext 解锁不受影响
await page.locator('.audio-gen-actions .audio-btn-sm').first().evaluate((el) => el.click()) // loop ON
await sleep(200)
await page.locator('.audio-gen-actions .audio-btn-primary').first().evaluate((el) => el.click())
let playing = false
for (let i = 0; i < 30 && !playing; i++) {
  playing = (await page.locator('.audio-viz-empty').count()) === 0
  if (!playing) await sleep(500)
}
if (!playing) { console.error('FAIL: 占位未消失——预览未驱动可视化'); process.exit(1) }
console.log('preview driving visualizers (placeholder gone)')
// 关抽屉——backdrop 盖全页,不关会拦掉后续模式按钮点击
await page.locator('.audio-drawer-header .audio-btn-icon').first().evaluate((el) => el.click())
await sleep(400)

const MODES = ['spectrum', 'oscilloscope', 'spectrogram', 'vuMeter', 'circular', 'waveRing', 'waveform']
if (await page.locator('.audio-viz-mode-btn').count() !== MODES.length) {
  console.error('FAIL: 模式按钮数 ≠ 7'); process.exit(1)
}
// 钢琴曲有强弱乐句——顺序 2 帧会随机命中弱奏段(spectrum 落在起奏前/弱段时
// 全空)。每模式滑窗 6 帧取「最亮帧 + 相邻帧最大差」,对乐句时刻鲁棒。
const { PNG } = await import('pngjs')
const { readFileSync, writeFileSync } = await import('node:fs')
const stats = {}
for (const mode of MODES) {
  await page.locator('.audio-viz-mode-btn').nth(MODES.indexOf(mode)).click()
  await sleep(1200)
  const frames = []
  for (let k = 0; k < 6; k++) {
    const f = join(OUT, `${mode}-${k}.png`)
    // waveform 模式下频谱 canvas 加 .audio-canvas-hidden——必须选可见那张
    const canvas = page.locator('.audio-visualizers canvas:not(.audio-canvas-hidden)').first()
    await canvas.screenshot({ path: f }).catch(async () => { await page.screenshot({ path: f }) })
    frames.push(f)
    if (k < 5) await sleep(400)
  }
  // 像素统计:相邻帧最大差(动感) + 最亮帧(内容代表帧)
  let maxDiff = 0, bestK = 0, bestBright = -1
  for (let k = 0; k < frames.length; k++) {
    const p = PNG.sync.read(readFileSync(frames[k]))
    let bright = 0, n = 0
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i] + p.data[i+1] + p.data[i+2] > 180) bright++
      n++
    }
    if (bright / n > bestBright) { bestBright = bright / n; bestK = k }
    if (k > 0) {
      const a = PNG.sync.read(readFileSync(frames[k - 1]))
      let d = 0
      for (let i = 0; i < p.data.length; i += 4) {
        if (Math.abs(a.data[i] - p.data[i]) + Math.abs(a.data[i+1] - p.data[i+1]) + Math.abs(a.data[i+2] - p.data[i+2]) > 40) d++
      }
      maxDiff = Math.max(maxDiff, d / n)
    }
  }
  // 代表帧重命名为 -best.png(AI 审美复核素材)
  const best = PNG.sync.read(readFileSync(join(OUT, `${mode}-${bestK}.png`)))
  writeFileSync(join(OUT, `${mode}-best.png`), PNG.sync.write(best))
  stats[mode] = { maxDiffPct: +(maxDiff * 100).toFixed(1), bestBrightPct: +(bestBright * 100).toFixed(1), bestK }
  console.log(`${mode}: 相邻帧最大差 ${stats[mode].maxDiffPct}% | 代表帧亮像素 ${stats[mode].bestBrightPct}% (#${bestK})`)
}
try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
