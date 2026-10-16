/**
 * R303 真机走查 — 仪表盘舞台条重塑：
 *   ① 新布局截图（AI 目视：焦点/层级/主题一致性）
 *   ② 舞台条活性：canvas 2 帧 1s 帧差（运行中 >0%；暂停定格 → 帧差 0%）
 *   ③ 引擎开关点击链路（不 crash）
 */
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r303-dashboard/after')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r303-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9810 + (Date.now() % 80)
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
await sleep(1000)

await page.locator('.module-rail .rail-item').nth(0).click()
await page.waitForSelector('.dash-stage', { timeout: 15000 })
await sleep(1200) // 舞台条起帧

// ① 全视图截图
await page.screenshot({ path: join(OUT, 'dashboard-new.png') })

// ② 舞台条活性：运行中 2 帧 1s 帧差
const strip = page.locator('canvas.dash-stage-strip')
await strip.screenshot({ path: join(OUT, 'strip-running-0.png') }).catch(() => {})
await sleep(1000)
await strip.screenshot({ path: join(OUT, 'strip-running-1.png') }).catch(() => {})

// ③ 暂停 → 定格（帧差≈0）→ 截图 → 再启动
await page.locator('.dash-stage-toggle').click()
await sleep(600)
await strip.screenshot({ path: join(OUT, 'strip-paused-0.png') }).catch(() => {})
await sleep(1000)
await strip.screenshot({ path: join(OUT, 'strip-paused-1.png') }).catch(() => {})
await page.locator('.dash-stage-toggle').click()
await sleep(400)

function readPngSafe(f) {
  const raw = readFileSync(f)
  const end = raw.lastIndexOf(Buffer.from('IEND'))
  return PNG.sync.read(end >= 0 ? raw.subarray(0, Math.min(raw.length, end + 8)) : raw)
}
function frameDiff(a, b) {
  try {
    const pa = readPngSafe(a), pb = readPngSafe(b)
    if (pa.data.length !== pb.data.length) return -1
    let d = 0, n = 0
    for (let i = 0; i < pa.data.length; i += 4) {
      if (Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]) > 12) d++
      n++
    }
    return d / n
  } catch (e) { console.error('frameDiff error:', e instanceof Error ? e.message : e); return -1 }
}

try { electron.kill() } catch {}
await sleep(800)

const runDiff = frameDiff(join(OUT, 'strip-running-0.png'), join(OUT, 'strip-running-1.png'))
const pausedDiff = frameDiff(join(OUT, 'strip-paused-0.png'), join(OUT, 'strip-paused-1.png'))
console.log(`舞台条运行中 1s 帧差: ${(runDiff * 100).toFixed(1)}%  (活性证据,期望 >0)`)
console.log(`舞台条暂停后 1s 帧差: ${(pausedDiff * 100).toFixed(1)}%  (定格证据,期望 ≈0)`)
if (runDiff <= 0) { console.error('FAIL: 运行中舞台条无活性'); process.exit(1) }
if (pausedDiff > 0.02) { console.error('FAIL: 暂停后舞台条仍在动'); process.exit(1) }
console.log('WALKTHROUGH PASS — 舞台条活/停两态 + 开关链路')

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
