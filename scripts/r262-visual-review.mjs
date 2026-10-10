/**
 * R262/R263 视觉复核 — zh 画布文案(等级/连击中文) + 死亡结算钩子行。
 * 风筝 3s 拍运行画面 → 松手站桩等死 → 轮询 .run-recap 截结算屏。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9313
const OUT = 'docs/ui-review/r258-led-games'

const udd = join(tmpdir(), `rgbbox-r262-${Date.now()}`)
mkdirSync(udd, { recursive: true })
mkdirSync(OUT, { recursive: true })
const electron = spawn('node_modules/electron/dist/electron.exe',
  [`--remote-debugging-port=${PORT}`, '--user-data-dir=' + udd, 'out/main/index.js'], { stdio: 'ignore' })
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

const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90)) })

await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(1000)
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(800)
const startBtn = page.locator('[data-action="ready-start"], button:has-text("开始")')
if (await startBtn.count() > 0) await startBtn.first().click()
await sleep(2000)
console.log('data-game:', await page.locator('.games-screen').getAttribute('data-game'))

// 阶段 1:风筝 3s → 拍 zh 运行画面(等级 n/第 n 座岛应中文)
const DIRS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']
let held = null
for (let i = 0; i < 15; i++) {
  const next = DIRS[i % 4]
  if (held && held !== next) await page.keyboard.up(held).catch(() => {})
  await page.keyboard.down(next).catch(() => {})
  held = next
  await sleep(200)
}
await sleep(1200) // 等一次可能的升级横幅消失
await page.screenshot({ path: `${OUT}/08-zh-canvas.png` })
console.log('SHOT 08-zh-canvas')
if (held) await page.keyboard.up(held).catch(() => {})

// 阶段 2:站桩等死(标准 7HP,敌人围杀)→ 轮询 .run-recap
let sawRecap = false
for (let i = 0; i < 750 && !sawRecap; i++) { // ≤150s
  if ((await page.locator('.run-recap').count()) > 0) {
    sawRecap = true
    await sleep(500)
    await page.screenshot({ path: `${OUT}/09-death-recap.png` })
    console.log('SHOT 09-death-recap (死亡结算+钩子行)')
  }
  await sleep(200)
}
if (!sawRecap) console.log('150s 内未死亡(未拍到结算屏)')

console.log(`Console errors: ${consoleErrors.length}`)
try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch {}
process.exit(consoleErrors.length ? 1 : 0)
