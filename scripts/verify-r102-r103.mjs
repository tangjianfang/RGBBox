/**
 * R102 real fullscreen (HTML5 Fullscreen API fills the display) +
 * R103 gamepad support (injected getGamepads stub, presence chip + Start).
 */
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.connectOverCDP('http://localhost:9250')
const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
if (!page) { console.error('no page'); process.exit(1) }
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

// ── R102: true fullscreen on TD ──
await page.locator('.game-tile:not(.ghost)').first().click()
await sleep(600)
const windowed = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  return { innerW: window.innerWidth, canvasW: canvas?.getBoundingClientRect().width ?? 0 }
})
await page.locator('button[title="全屏"], button[title="Fullscreen"]').first().click()
await sleep(900)
const fs = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  return {
    fullscreenEl: !!document.fullscreenElement,
    innerW: window.innerWidth,
    canvasW: canvas?.getBoundingClientRect().width ?? 0,
  }
})
check('fs: document.fullscreenElement set', fs.fullscreenEl, JSON.stringify(fs))
check('fs: viewport now display-wide', fs.innerW >= windowed.innerW * 1.5, `windowed=${windowed.innerW} fs=${fs.innerW}`)
check('fs: canvas scales up ≥1.4×', fs.canvasW > windowed.canvasW * 1.4, `canvas ${windowed.canvasW | 0}→${fs.canvasW | 0}`)
await page.screenshot({ path: 'docs/screenshots/r102-td-native-fullscreen.png' })

await page.keyboard.press('Escape')
await sleep(700)
const afterEsc = await page.evaluate(() => ({
  fullscreenEl: !!document.fullscreenElement,
  innerW: window.innerWidth,
  label: [...document.querySelectorAll('button')].find(b => (b.title || '').includes('全屏') || (b.title || '').toLowerCase().includes('fullscreen'))?.textContent ?? '',
}))
check('fs: Esc exits native fullscreen, button label restored', !afterEsc.fullscreenEl && afterEsc.innerW < fs.innerW && !afterEsc.label.includes('退出'), JSON.stringify(afterEsc))

// ── R103: gamepad stub → swarm detects + runs ──
await page.locator('button:has-text("返回游戏库"), button:has-text("Game library")').first().click()
await sleep(500)
await page.evaluate(() => {
  const pad = {
    id: 'TestPad (vendor: 1234 product: 5678)',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0.6, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  }
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] })
})
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(700)
// a previous script run may have left the run frozen at a level-up card —
// restart normalizes to ready, then start.
await page.locator('button:has-text("重新开始")').first().click()
await sleep(400)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(3500)
const swarm = await page.evaluate(() => {
  const status = document.querySelector('.games-canvas-status')?.textContent ?? ''
  const phase = [...document.querySelectorAll('.games-stat-grid span')][0]?.textContent ?? ''
  return { status, phase }
})
check('gamepad: presence chip shows in status bar', swarm.status.includes('TestPad'), swarm.status.slice(0, 80))
check('gamepad: run stays alive with stub pad (zero errors)', swarm.phase.includes('运行') || swarm.phase.includes('Running'), swarm.phase)
await page.evaluate(() => {
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, null, null, null] })
})
await sleep(800)
const chipGone = await page.evaluate(() => !(document.querySelector('.games-canvas-status')?.textContent ?? '').includes('TestPad'))
check('gamepad: chip clears when pad unplugged', chipGone)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
