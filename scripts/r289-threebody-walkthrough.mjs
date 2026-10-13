/**
 * R289 真机走查 — 三体主题灯效库:tab 存在性 + 四效果预览各 2 帧(动感证据)
 * + AI 目视复核素材。
 */
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r289-threebody')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r289-${Date.now()}`)
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

// 效果库(三体 tab 是默认首 tab)
await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
await sleep(1500)
await page.screenshot({ path: join(OUT, 'threebody-tab.png') })
const cards = await page.locator('.effect-card').count()
console.log(`三体 tab 截图卡片(含精选区): ${cards}`)

// 逐效果:点卡 → 自动跳工作台 → 预览 2 帧
const NAMES = { '三体运动': 'three-body', '三日凌空': 'trisolaran-suns', '水滴': 'droplet-mirror', '引力波': 'gravity-wave' }
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
      if (Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i+1] - pb.data[i+1]) + Math.abs(pa.data[i+2] - pb.data[i+2]) > 12) d++
      n++
    }
    return d / n
  } catch (e) { console.error('frameDiff error:', e instanceof Error ? e.message : e); return 0 }
}
const shots = []
for (const [zh, slug] of Object.entries(NAMES)) {
  // 回效果库找卡
  await page.locator('.module-rail .rail-item').nth(2).click()
  await page.waitForSelector('.effect-card', { timeout: 15000 })
  await sleep(600)
  const card = page.locator('.effect-card', { hasText: zh }).first()
  if (await card.count() === 0) { console.error(`FAIL: ${zh} 卡未找到`); continue }
  await card.click()
  await sleep(1600) // 自动跳工作台 + 预览起帧
  const canvas = page.locator('.preview-frame canvas').first()
  const f0 = join(OUT, `${slug}-0.png`)
  const f1 = join(OUT, `${slug}-1.png`)
  await canvas.screenshot({ path: f0 }).catch(() => {})
  await sleep(1000)
  await canvas.screenshot({ path: f1 }).catch(() => {})
  shots.push([slug, f0, f1])
}

try { electron.kill() } catch {}
await sleep(800) // Windows 文件句柄释放后再读(读早了 pngjs 抛错→diff 被吞成 0)
for (const [slug, f0, f1] of shots) {
  console.log(`${slug}: 1s 帧差 ${(frameDiff(f0, f1) * 100).toFixed(1)}%`)
}

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
