/**
 * R282 真机复核 — 右下角悬浮坞:视频视图双按钮纵向排列不重叠/半透明。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r282-dock')
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r282-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9333
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

// 1) 非视频视图:仅手势助手单钮
await page.screenshot({ path: join(OUT, 'dock-single.png') })
const single = await page.evaluate(() => document.querySelectorAll('.corner-dock .corner-dock-item').length)
console.log(`非视频视图 dock 按钮数: ${single}`)

// 2) 视频视图:AI 听音入驻 → 双钮纵向
await page.locator('.module-rail .rail-item').nth(3).click() // video
await sleep(1500)
await page.screenshot({ path: join(OUT, 'dock-video.png') })
const boxes = await page.evaluate(() => {
  const dock = document.querySelector('.corner-dock')
  const rect = dock?.getBoundingClientRect()
  const items = [...(dock?.querySelectorAll('.corner-dock-item') ?? [])].map((el) => {
    const b = el.getBoundingClientRect()
    return { text: (el.textContent ?? '').trim().slice(0, 12), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }
  })
  return { dockRect: rect ? { bottom: Math.round(rect.bottom), right: Math.round(rect.right), w: Math.round(rect.width), h: Math.round(rect.height) } : null, items }
})
console.log(JSON.stringify(boxes, null, 1))
const it = boxes.items
const overlap = it.length === 2 && !(it[0].bottom <= it[1].top + 2 || it[1].bottom <= it[0].top + 2)
console.log(`视频视图按钮数: ${it.length} | 重叠: ${overlap ? 'YES ❌' : 'NO ✓'} | 纵向排列: ${it.length === 2 && it[0].top !== it[1].top ? '✓' : '?'}`)
const op = await page.evaluate(() => getComputedStyle(document.querySelector('.corner-dock')).opacity)
console.log(`dock opacity(半透明): ${op}`)

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(it.length === 2 && !overlap ? 0 : 1)
