/**
 * R260 视觉复核二段 — 质变卡选定后的「弹幕形态」真机画面。
 * 风筝 bot 轮询 levelup;offers 含质变卡时选它(而非第一张),
 * 1.5s 后截运行画面(八向开花/激光拖尾/追踪拐弯应可见)。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9312
const OUT = 'docs/ui-review/r258-led-games'

const udd = join(tmpdir(), `rgbbox-r260f-${Date.now()}`)
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
await sleep(1500)
console.log('data-game:', await page.locator('.games-screen').getAttribute('data-game'))

let picked = null
let levelups = 0
const DIRS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']
let held = null
for (let i = 0; i < 600 && !picked; i++) { // ≤120s
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
    const transformCard = page.locator('.levelup-card.transform')
    if ((await transformCard.count()) > 0) {
      const name = (await transformCard.first().locator('strong').textContent()) ?? '?'
      await transformCard.first().click()
      picked = name
      await sleep(1500) // 弹幕形态成型
      await page.screenshot({ path: `${OUT}/07-bullet-form.png` })
      console.log(`SHOT 07-bullet-form (选了质变卡「${name}」)`)
    } else {
      await page.locator('.levelup-card').first().click().catch(() => {})
      await sleep(300)
    }
  }
  await sleep(200)
}

if (!picked) console.log('120s 内未出现质变卡 offer(概率 ~20%/级,重跑即可)')
console.log(`levelups ${levelups} 次;Console errors: ${consoleErrors.length}`)

try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch {}
process.exit(consoleErrors.length ? 1 : 0)
