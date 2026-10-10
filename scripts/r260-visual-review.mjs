/**
 * R260 视觉复核 — 质变卡 levelup UI(「形态改变」标签+虚线描边)真机截图。
 * 骨架同 r258:真实 app + CDP;进 survival 后轮询 .levelup-cards,
 * 出现即截图;若含 .levelup-card.transform 再单拍一张并提前收工。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9311
const OUT = 'docs/ui-review/r258-led-games'

const udd = join(tmpdir(), `rgbbox-r260-${Date.now()}`)
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

// 进 survival
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(1000)
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(800)
const startBtn = page.locator('[data-action="ready-start"], button:has-text("开始")')
if (await startBtn.count() > 0) await startBtn.first().click()
await sleep(1500)
console.log('data-game:', await page.locator('.games-screen').getAttribute('data-game'))

let sawTransform = false
let levelups = 0
const DIRS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']
let held = null
for (let i = 0; i < 450 && !sawTransform; i++) { // ≤90s 轮询
  // 风筝走位:每 1.6s 换向(顺时针四向),防站桩速死
  if (i % 8 === 0) {
    const next = DIRS[(i / 8) % 4]
    if (held && held !== next) await page.keyboard.up(held).catch(() => {})
    await page.keyboard.down(next).catch(() => {})
    held = next
  }
  const cards = page.locator('.levelup-cards')
  if ((await cards.count()) > 0) {
    levelups += 1
    if (held) await page.keyboard.up(held).catch(() => {})
    await sleep(400) // 卡片入场动画稳定
    await page.screenshot({ path: `${OUT}/05-levelup-cards.png` })
    console.log(`SHOT 05-levelup-cards (第 ${levelups} 次升级)`)
    if ((await page.locator('.levelup-card.transform').count()) > 0) {
      sawTransform = true
      await page.screenshot({ path: `${OUT}/06-transform-card.png` })
      console.log('SHOT 06-transform-card (质变卡出现)')
    }
    await page.locator('.levelup-card').first().click().catch(() => {})
    await sleep(300)
  }
  await sleep(200)
}

console.log(`levelups 捕获 ${levelups} 次;质变卡 ${sawTransform ? '捕获' : '未捕获(概率 ~20%/次,正常)'}`)
console.log(`Console errors: ${consoleErrors.length}`)

try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch {}
process.exit(consoleErrors.length ? 1 : 0)
