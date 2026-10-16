/**
 * R304 真机走查 — 感觉台交互 + 画板上舞台 + 用户原始异常场景复现：
 *   ① 工作区默认：感觉台在位（两标签/调感觉默认页 4 盘）
 *   ② 专家参数页切换（长尾在位）
 *   ③ 自定义绘制（用户报障场景）：侧栏零幽灵控制 + 画板在舞台全宽面板
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r304-feel-console')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r304-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9930 + (Date.now() % 60)
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

// 工作区
await page.locator('.module-rail .rail-item').nth(1).click()
await page.waitForSelector('.fx-sidebar', { timeout: 15000 })
await sleep(1000)

// ① 感觉台在位
const tabs = await page.locator('.feel-tab').count()
const dialRows = await page.locator('.feel-body .feel-row').count()
const primaryBand = await page.locator('.primary-params').count()
const quickSegments = await page.locator('.quick-segment-control').count()
const layerBasics = await page.locator('.layer-basics').count()
const tools = await page.locator('.ws-tools-collapsible').count()
console.log(`感觉台标签=${tabs} 感觉盘行=${dialRows} 主参数带残留=${primaryBand} 语义chips残留=${quickSegments} 图层区=${layerBasics} 玩法折叠=${tools}`)
await page.screenshot({ path: join(OUT, 'ws-feel-tab.png') })
if (tabs !== 2 || dialRows < 3 || primaryBand !== 0 || quickSegments !== 0 || layerBasics === 0 || tools === 0) {
  console.error('FAIL: 感觉台结构不符'); process.exit(1)
}

// ② 专家参数页
await page.locator('.feel-tab').nth(1).click()
await sleep(400)
const expertRows = await page.locator('.feel-expert .feel-row').count()
const hasReset = await page.locator('.feel-expert .fx-reset-defaults').count()
console.log(`专家页长尾行=${expertRows} 重置钮=${hasReset}`)
await page.screenshot({ path: join(OUT, 'ws-expert-tab.png') })
if (expertRows < 3 || hasReset !== 1) { console.error('FAIL: 专家页不符'); process.exit(1) }
await page.locator('.feel-tab').nth(0).click()

// ③ 用户报障场景：自定义绘制
let item = page.locator('.effect-kind-btn', { hasText: '自定义绘制' }).first()
if (await item.count() === 0) {
  const toggle = page.locator('.advanced-toggle-row').first() // R297 教训:按类名
  if (await toggle.count() > 0) { await toggle.click(); await sleep(500) }
  item = page.locator('.effect-kind-btn', { hasText: '自定义绘制' }).first()
}
if (await item.count() === 0) { console.error('FAIL: 自定义绘制入口未找到'); process.exit(1) }
await item.first().click()
await sleep(1000)
const paintStage = await page.locator('.paint-stage-panel').count()
const sidebarGhost = await page.locator('.feel-console input[type="range"]').count()
const paintHint = await page.locator('.feel-console .feel-empty').count()
console.log(`画板舞台面板=${paintStage} 侧栏滑杆残留=${sidebarGhost} paint提示=${paintHint}`)
await page.screenshot({ path: join(OUT, 'ws-custom-paint.png') })
if (paintStage !== 1 || sidebarGhost !== 0) { console.error('FAIL: 画板未上舞台或侧栏有幽灵控制'); process.exit(1) }

console.log('WALKTHROUGH PASS — 感觉台两页 + 画板上舞台 + 用户场景修复')

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
