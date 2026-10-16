/**
 * R301 真机走查 — 效果库卡片渲染资源预算 A/B 证据：
 *   --phase before | after（before=HEAD 旧 fillRect 路径，after=R301 预算路径）
 * 采集：
 *   ① 原型级 canvas 调用计数（fillRect / putImageData 6s 窗口速率）
 *   ② 渲染进程 JS CPU（CDP Performance ScriptDuration/TaskDuration 差分）
 *   ③ 截图（全视图 + CPU 卡/GL 卡各 2 帧 1s 帧差=动画存活证据）
 * 用法：先 `yarn build`，再 `node scripts/r301-effects-budget-walkthrough.mjs --phase after`
 */
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const PHASE = process.argv.includes('--phase') ? process.argv[process.argv.indexOf('--phase') + 1] : 'after'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r301-effects-budget', PHASE)
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r301-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9510 + (Date.now() % 80)
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

// ── ① 原型级 canvas 调用计数（进入效果库前先挂表） ──────────────────────
await page.evaluate(() => {
  window.__r301 = { fillRect: 0, putImageData: 0, drawImage: 0 }
  const c2d = CanvasRenderingContext2D.prototype
  for (const name of ['fillRect', 'putImageData', 'drawImage']) {
    const orig = c2d[name]
    c2d[name] = function (...args) { window.__r301[name]++; return orig.apply(this, args) }
  }
})

// 效果库（三体 tab 默认首 tab）
await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
await sleep(1500) // 挂载+首轮绘制稳定

// ── ② 渲染进程 JS CPU 差分（6s 窗口） ──────────────────────────────────
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const metric = (ms, name) => ms.find((m) => m.name === name)?.value ?? 0
const m0 = await cdp.send('Performance.getMetrics')
const c0 = await page.evaluate(() => ({ ...window.__r301, cards: document.querySelectorAll('.effect-card canvas').length }))
await sleep(6000)
const c1 = await page.evaluate(() => ({ ...window.__r301, cards: document.querySelectorAll('.effect-card canvas').length }))
const m1 = await cdp.send('Performance.getMetrics')

const dt = 6
const scriptD = metric(m1.metrics, 'ScriptDuration') - metric(m0.metrics, 'ScriptDuration')
const taskD = metric(m1.metrics, 'TaskDuration') - metric(m0.metrics, 'TaskDuration')
console.log(`phase=${PHASE}  窗口=${dt}s  挂载卡 canvas=${c1.cards}`)
console.log(`  fillRect      ${String(c1.fillRect - c0.fillRect).padStart(9)} 次  (${((c1.fillRect - c0.fillRect) / dt).toFixed(0)}/s)`)
console.log(`  putImageData  ${String(c1.putImageData - c0.putImageData).padStart(9)} 次  (${((c1.putImageData - c0.putImageData) / dt).toFixed(1)}/s)`)
console.log(`  drawImage     ${String(c1.drawImage - c0.drawImage).padStart(9)} 次  (${((c1.drawImage - c0.drawImage) / dt).toFixed(1)}/s)`)
console.log(`  渲染进程 JS: ScriptDuration ${scriptD.toFixed(2)}s (${(100 * scriptD / dt).toFixed(1)}% of wall) / TaskDuration ${taskD.toFixed(2)}s (${(100 * taskD / dt).toFixed(1)}%)`)

// ── ③ 截图：全视图 + CPU 卡（三体运动）2 帧 1s 帧差 ────────────────────
await page.screenshot({ path: join(OUT, 'effects-view.png') })
const cpuCard = page.locator('.effect-card', { hasText: '三体运动' }).first()
await cpuCard.locator('canvas').screenshot({ path: join(OUT, 'cpu-card-0.png') }).catch(() => {})
await sleep(1000)
await cpuCard.locator('canvas').screenshot({ path: join(OUT, 'cpu-card-1.png') }).catch(() => {})

try { electron.kill() } catch {}
await sleep(800) // Windows 文件句柄释放

/** Playwright 写的 PNG 偶带尾部残留字节——按 IEND 截断后再解析。 */
function readPngSafe(f) {
  const raw = readFileSync(f)
  const end = raw.lastIndexOf(Buffer.from('IEND'))
  return PNG.sync.read(end >= 0 ? raw.subarray(0, Math.min(raw.length, end + 8)) : raw)
}
function frameDiff(a, b) {
  try {
    const pa = readPngSafe(a), pb = readPngSafe(b)
    if (pa.data.length !== pb.data.length) return 0
    let d = 0, n = 0
    for (let i = 0; i < pa.data.length; i += 4) {
      if (Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]) > 12) d++
      n++
    }
    return d / n
  } catch (e) { console.error('frameDiff error:', e instanceof Error ? e.message : e); return 0 }
}
console.log(`  CPU 卡 1s 帧差 ${(frameDiff(join(OUT, 'cpu-card-0.png'), join(OUT, 'cpu-card-1.png')) * 100).toFixed(1)}%  (动画存活证据)`)

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
