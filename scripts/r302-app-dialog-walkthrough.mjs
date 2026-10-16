/**
 * R302 真机走查 — 应用内样式化对话框替换原生弹框（复现用户截图场景）：
 *   隔离 udd 预置 11 张截图 → 视频站截图条「清空全部」→
 *   ① 应用内 danger 对话框出现（截图，AI 目视对比原生白底）
 *   ② Esc 关闭 → 截图仍在（11 张）
 *   ③ 再次打开 → 点 danger 确认 → 截图清空
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r302-app-dialog')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r302-${Date.now()}`)
mkdirSync(udd, { recursive: true })

// ── 预置 11 张截图（用户场景同数）────────────────────────────────────────
const capDir = join(udd, 'captures')
mkdirSync(capDir, { recursive: true })
const entries = []
for (let i = 1; i <= 11; i++) {
  const img = new PNG({ width: 16, height: 9 })
  for (let p = 0; p < img.data.length; p += 4) {
    img.data[p] = 40 + i * 8; img.data[p + 1] = 90 + i * 6; img.data[p + 2] = 140 + i * 4; img.data[p + 3] = 255
  }
  const id = `cap-photo-${(1700000000000 + i).toString(36)}-seed${i}`
  writeFileSync(join(capDir, `${id}.png`), PNG.sync.write(img))
  entries.push({ id, file: `${id}.png`, name: `seed-${i}.png`, ts: 1700000000000 + i * 1000, kind: 'photo' })
}
writeFileSync(join(capDir, 'index.json'), JSON.stringify(entries))
console.log(`预置截图: ${entries.length} 张 → ${capDir}`)

const PORT = 9610 + (Date.now() % 80)
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

// 视频站（rail 顺序 dashboard/workspace/effects/video）
await page.locator('.module-rail .rail-item').nth(3).click()
await page.waitForSelector('.video-filmstrip-clearall', { timeout: 15000 })
await sleep(600)

const filmstripCount = async () => await page.locator('.video-filmstrip .video-filmstrip-item, .video-filmstrip [class*="item"]').count()

// ── ① 清空全部 → 应用内 danger 对话框 ──────────────────────────────────
await page.locator('.video-filmstrip-clearall').click()
await page.waitForSelector('.app-dialog', { timeout: 5000 })
const msg = await page.locator('.app-dialog-message').textContent()
const hasDanger = await page.locator('.app-dialog-buttons .btn-danger').count()
await page.screenshot({ path: join(OUT, 'dialog-open.png') })
console.log(`对话框出现: message="${msg?.trim()}" danger钮=${hasDanger}（含 {count} 替换: ${msg?.includes('11') ? '是' : '否'}）`)
if (!msg || !msg.includes('11') || hasDanger !== 1) { console.error('FAIL: 对话框内容/danger 变体不符'); process.exit(1) }

// ── ② Esc 关闭 → 截图仍在 ──────────────────────────────────────────────
await page.keyboard.press('Escape')
await sleep(400)
const dialogGone = (await page.locator('.app-dialog').count()) === 0
const kept = await filmstripCount()
console.log(`Esc 后: 对话框已关=${dialogGone} 截图仍=${kept} 张`)
if (!dialogGone || kept < 11) { console.error('FAIL: Esc 未取消或截图被误删'); process.exit(1) }

// ── ③ 再次打开 → 点确认 → 清空走通 ─────────────────────────────────────
await page.locator('.video-filmstrip-clearall').click()
await page.waitForSelector('.app-dialog-buttons .btn-danger', { timeout: 5000 })
await page.locator('.app-dialog-buttons .btn-danger').click()
await sleep(1200)
const cleared = await filmstripCount()
const dialogAfter = (await page.locator('.app-dialog').count()) === 0
console.log(`确认后: 对话框已关=${dialogAfter} 截图余=${cleared} 张`)
if (!dialogAfter || cleared !== 0) { console.error('FAIL: 确认未清空'); process.exit(1) }

console.log('WALKTHROUGH PASS — 应用内对话框三段行为（出现/Esc 取消/确认清空）全过')

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
