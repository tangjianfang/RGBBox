/**
 * R290 真机验收 — ①按窗口句柄截图全链 ②标注器不再放大失真。
 * 链路:开一个小窗口(Notepad)→VideoStudio 窗口源卡片「截图」角标→
 * captureStore kind 'window' 条目+原生分辨率→打开标注器→显示比例 ≤1(1:1 或缩小)。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { spawn } from 'node:child_process'
import { PNG } from 'pngjs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r290-window-snip')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r290-${Date.now()}`)
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

// ① 开一个确定存在的小窗口(记事本)
const notepad = spawn('notepad.exe', [], { detached: false, stdio: 'ignore' })
await sleep(1800)

// ② 视频工作站 → 屏幕模式,等窗口源卡片
await page.locator('.module-rail .rail-item').nth(3).click()
await sleep(1200)
const modeBtns = page.locator('.video-chip, .video-mode-btn, [class*=mode]')
// 找「屏幕」模式按钮(按文本)
const screenChip = page.locator('button', { hasText: '屏幕' }).first()
if (await screenChip.count() > 0) await screenChip.click()
await sleep(1500)
// 只看窗口源
const windowChip = page.locator('.video-source-filter button', { hasText: '窗口' }).first()
if (await windowChip.count() > 0) await windowChip.click()
await page.waitForSelector('.video-source-card', { timeout: 15000 })
await sleep(1000)

const cards = page.locator('.video-source-card')
const n = await cards.count()
console.log('window source cards:', n)
// 找记事本卡
let notepadCard = null
for (let i = 0; i < n; i++) {
  const txt = (await cards.nth(i).textContent()) ?? ''
  if (txt.includes('记事本') || txt.toLowerCase().includes('notepad')) { notepadCard = cards.nth(i); break }
}
if (!notepadCard) { console.error('FAIL: notepad window not listed'); try { notepad.kill() } catch {}; process.exit(1) }
const shotBtn = notepadCard.locator('.video-source-shot')
if (await shotBtn.count() === 0) { console.error('FAIL: shot button missing on window card'); try { notepad.kill() } catch {}; process.exit(1) }
await notepadCard.locator('.video-source-shot').click()
await sleep(2500) // 捕获+toast+胶片条刷新

// ③ 验证 captureStore 新条目(kind window)
const entries = await page.evaluate(() => window.rgbbox.capturesList())
const win = entries.filter((e) => e.kind === 'window')
console.log('window captures:', win.length, win.map((e) => e.name).slice(0, 3))
if (win.length === 0) { console.error('FAIL: no window capture saved'); try { notepad.kill() } catch {}; process.exit(1) }
const entry = win[0]

// PNG 原生分辨率证明(文件读取——走 preload read? 截图判尺寸用 Node 侧直接读)
const { readFileSync } = await import('node:fs')
const png = PNG.sync.read(readFileSync(entry.file))
console.log('captured PNG:', png.width + 'x' + png.height)
await page.screenshot({ path: join(OUT, 'video-window-shot.png') })

// ④ 打开标注器验证 1:1 不放大(胶片条缩略图双击 = 编辑)
const thumb = page.locator('.video-filmstrip-item .video-filmstrip-thumb').first()
await thumb.dblclick().catch(async () => {
  // 兜底:显式编辑按钮
  await page.locator('.video-filmstrip-edit').first().click().catch(() => {})
})
await sleep(2200)
await page.screenshot({ path: join(OUT, 'annotator-after.png') }).catch(() => {})

// 标注器 canvas 显示尺寸 vs 原生 PNG 尺寸(AnnotateOverlay 用 canvas 渲染)
const disp = await page.evaluate(() => {
  const canvas = document.querySelector('.video-annotate-canvas')
  if (!canvas) return null
  const r = canvas.getBoundingClientRect()
  return { dispW: Math.round(r.width), dispH: Math.round(r.height) }
})
console.log('annotator canvas:', JSON.stringify(disp), '| native PNG:', png.width + 'x' + png.height)
const ratio = disp ? disp.dispW / png.width : null
console.log('display/native ratio:', ratio === null ? 'n/a(标注器未开)' : ratio.toFixed(3))
console.log(ratio !== null && ratio > 1.05 ? `FAIL: 放大 ${ratio.toFixed(2)}×` : ratio !== null ? `PASS: 无放大失真(${ratio <= 1 ? '缩小' : '~1:1'})` : 'FAIL: 标注器未打开')

try { notepad.kill() } catch {}
try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
