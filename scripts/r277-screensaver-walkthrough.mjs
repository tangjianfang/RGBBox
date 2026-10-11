/**
 * R277 真机视觉复核 — CJK 屏保截图(表现层零容忍收尾)。
 * 隔离 udd → saveProfile(中文 static 层) → CDP 开 ?screensaver=1 页 →
 * 截图 → 像素自检(非全黑) + AI 目视「灯效屏保」五字。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r277-screensaver')
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r277-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9321
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
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)

// 1. 预置 CJK profile:单 scene + static 中文层
const cjkProfile = {
  id: 'cjk-saver', name: 'CJK 屏保测试', activeSceneId: 's1', performanceMode: 'balanced',
  sampling: { columns: 96, rows: 54, fps: 30, renderStyle: 'smooth', showGap: false },
  scenes: [{ id: 's1', name: 'S1', layers: [{ id: 'layer-101', kind: 'static', enabled: true, parameters: { text: '灯效屏保', textX: 0.5, textY: 0.5, textScale: 2, textWeight: 700, color: '#67e8f9' } }] }],
}
await page.evaluate(async (p) => { await window.rgbbox.saveProfile(p) }, cjkProfile)
await sleep(300)

// 2. 开屏保页(同 file:// origin,preload 同源可用)
const mainUrl = page.url()
const saverUrl = mainUrl.split('?')[0] + '?screensaver=1&displayId=0'
// Electron CDP 不支持 createBrowserContext——复用默认 context 开页
// Electron CDP 禁 createTarget——主窗口直接导航屏保分支(隔离 udd,跑完即弃)
const saverPage = page
await saverPage.goto(saverUrl)
await sleep(2500) // 等默认 profile 拉取 + 数帧渲染

const shot = join(OUT, 'cjk-screensaver.png')
await saverPage.screenshot({ path: shot })
console.log('SHOT cjk-screensaver.png')

// 3. 像素自检:非全黑(有渲染内容)
const { PNG } = await import('pngjs')
const { readFileSync } = await import('node:fs')
const png = PNG.sync.read(readFileSync(shot))
let lit = 0
for (let i = 0; i < png.data.length; i += 4) {
  if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 60) lit++
}
console.log(`lit pixels: ${lit} (${((lit / (png.width * png.height)) * 100).toFixed(1)}%)`)
console.log(lit > 50 ? 'PIXEL CHECK PASS(画面非空)' : 'PIXEL CHECK FAIL(全黑?)')

try { saverPage.close() } catch { /* ignore */ }
try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(lit > 50 ? 0 : 1)
