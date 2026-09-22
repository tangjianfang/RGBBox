/**
 * R106 real-machine regression: island HUD in the status bar, swarm still runs
 * clean. The boss→portal→island chain needs a 90s+ run and is covered by unit
 * tests plus the R109 long-run finale.
 */
import { chromium } from 'playwright-core'
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

await page.evaluate(() => localStorage.setItem('rgbbox:gamesMeta:swarm', JSON.stringify({
  coins: 0,
  perm: { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 },
  stats: { runs: 1, totalKills: 0, bosses: 0, bestCombo: 0, bestScore: 0 },
  artifacts: {},
  achievements: { firstRun: true },
})))

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }
const railHome = page.locator('.rail-item').first()
await railHome.click().catch(() => {})
await sleep(600)
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(800)
if (await backBtn.count()) { await backBtn.first().click(); await sleep(300) }

await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(600)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(300)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(3000)
const status = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent ?? '')
check('hud: status bar shows Island 1', /岛屿\s*1|Island\s*1/i.test(status), status.slice(0, 70))
const phase = await page.evaluate(() => [...document.querySelectorAll('.games-stat-grid span')][0]?.textContent ?? '')
check('regression: run is alive', phase.includes('运行') || phase.includes('Running'), phase)
check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
