/**
 * R288 补拍 — warp-portal 在 R284 暗谷地板 + R287 音频驱动后的真机证据。
 * R283 评审时 warp-portal 是「五维分=代码推演」(GPU 线自述局限,无实拍)。
 * 拍 2 帧(间隔 600ms)做 motion 粗证 + 亮像素/彩色占比与 R283 基线对照。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r288-warp-portal')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r288-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9410 + (Date.now() % 80)
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

await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
let card = page.locator('.effect-card', { hasText: '曲速门户' }).first()
if (await card.count() === 0) {
  const tabs = await page.locator('.effects-category-tab').count()
  for (let ti = 0; ti < tabs && (await card.count()) === 0; ti++) {
    await page.locator('.effects-category-tab').nth(ti).click()
    await sleep(400)
  }
}
if (await card.count() === 0) { console.error('FAIL: warp-portal card not found'); process.exit(1) }
await card.click()
await sleep(1500) // onSelectEffect 自动跳工作台

const canvas = page.locator('.preview-3d')
await canvas.screenshot({ path: join(OUT, 'warp-portal-0.png') })
await sleep(600)
await canvas.screenshot({ path: join(OUT, 'warp-portal-1.png') })

const { PNG } = await import('pngjs')
const { readFileSync } = await import('node:fs')
const p0 = PNG.sync.read(readFileSync(join(OUT, 'warp-portal-0.png')))
const p1 = PNG.sync.read(readFileSync(join(OUT, 'warp-portal-1.png')))
let lit = 0, colored = 0, diff = 0, n = 0
for (let i = 0; i < p0.data.length; i += 4) {
  const l0 = p0.data[i] + p0.data[i+1] + p0.data[i+2]
  if (l0 > 90) lit++
  if (Math.abs(p0.data[i]-p0.data[i+1]) > 30 || Math.abs(p0.data[i+1]-p0.data[i+2]) > 30) colored++
  if (Math.abs(p0.data[i]-p1.data[i]) + Math.abs(p0.data[i+1]-p1.data[i+1]) + Math.abs(p0.data[i+2]-p1.data[i+2]) > 40) diff++
  n++
}
console.log(`warp-portal 实拍: 亮像素 ${(lit/n*100).toFixed(1)}% | 彩色 ${(colored/n*100).toFixed(1)}% | 600ms 帧差 ${(diff/n*100).toFixed(1)}%`)
console.log(`R283 基线对照: 引擎域 motion-sweep 无实拍(GPU 推演)——本片为首份实拍证据`)

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
