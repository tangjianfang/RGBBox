/**
 * R258/R259 视觉高标准自动化 review — LED 联动 + boss 预警 + 中文横幅。
 * 启动真实 app → 进入游戏 → CDP 截图各阶段 → AI 视觉复核。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9310
const OUT = 'docs/ui-review/r258-led-games'

const udd = join(tmpdir(), `rgbbox-r258-${Date.now()}`)
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

// Navigate to games view
await page.locator('.module-rail .rail-item').nth(5).click() // games
await sleep(1000)

// Screenshot 1: games hub
await page.screenshot({ path: `${OUT}/01-hub.png` })
console.log('SHOT 01-hub')

// Start Swarm (survival) — click first game tile
const tiles = page.locator('.game-tile:not(.ghost)')
if (await tiles.count() > 0) {
  await tiles.first().click()
  await sleep(800)
  // Click start button
  const startBtn = page.locator('[data-action="ready-start"], button:has-text("开始")')
  if (await startBtn.count() > 0) {
    await startBtn.first().click()
    await sleep(2000)
    // Screenshot 2: running game (should show Chinese banner, particles, effects)
    await page.screenshot({ path: `${OUT}/02-survival-running.png` })
    console.log('SHOT 02-survival-running')
    // Wait for potential boss warning / more gameplay
    await sleep(3000)
    await page.screenshot({ path: `${OUT}/03-survival-late.png` })
    console.log('SHOT 03-survival-late')
  }
}

// Screenshot 4: hub after game (return)
await page.locator('button:has-text("返回")').click().catch(async () => {
  await page.keyboard.press('Escape')
})
await sleep(800)
await page.screenshot({ path: `${OUT}/04-back-to-hub.png` })
console.log('SHOT 04-back-to-hub')

console.log(`\n${4} screenshots → ${OUT}/`)
console.log(`Console errors: ${consoleErrors.length}`)
for (const e of consoleErrors.slice(0, 5)) console.log(`  [err] ${e}`)

try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch {}
process.exit(consoleErrors.length ? 1 : 0)
