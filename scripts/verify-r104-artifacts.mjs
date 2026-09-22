/**
 * R104 real-machine smoke: artifact unlock by seeded run stats, toggle
 * persistence, Glass Heart run injection (HP=1), persistence across remounts.
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

// seed stats that unlock all eight artifacts, nothing enabled yet
await page.evaluate(() => localStorage.setItem('rgbbox:gamesMeta:swarm', JSON.stringify({
  coins: 0,
  perm: { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 },
  stats: { runs: 10, totalKills: 2000, bosses: 5, bestCombo: 20, bestScore: 2000 },
  artifacts: {},
})))

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

// remount so seeded meta is read
const railHome = page.locator('.rail-item').first()
await railHome.click().catch(() => {})
await sleep(700)
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(900)
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(700)

const chips = await page.evaluate(() => ({
  total: document.querySelectorAll('.artifact-chip').length,
  locked: document.querySelectorAll('.artifact-chip.locked').length,
  on: document.querySelectorAll('.artifact-chip.on').length,
}))
check('artifacts: eight chips, all unlocked, none on', chips.total === 8 && chips.locked === 0 && chips.on === 0, JSON.stringify(chips))
await page.screenshot({ path: 'docs/screenshots/r104-artifact-bar.png' })

await page.locator('.artifact-chip').nth(1).click()
await sleep(400)
const afterOn = await page.evaluate(() => ({
  on: document.querySelectorAll('.artifact-chip.on').length,
  saved: JSON.parse(localStorage.getItem('rgbbox:gamesMeta:swarm') ?? '{}').artifacts?.glass ?? null,
}))
check('artifacts: toggle Glass Heart on + persisted', afterOn.on === 1 && afterOn.saved === true, JSON.stringify(afterOn))

await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(800)
const lives = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('.games-stat-grid span')].find(el => (el.getAttribute('aria-label') || '').includes('生命'))
  return chip?.textContent.trim() ?? null
})
check('artifacts: Glass Heart run starts at 1 HP', lives === '1', `lives=${lives}`)
await page.screenshot({ path: 'docs/screenshots/r104-glass-run.png' })

// persistence across remount: hub → other view → back
await page.locator('button:has-text("返回游戏库"), button:has-text("Game library")').first().click()
await sleep(400)
await railHome.click().catch(() => {})
await sleep(600)
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(800)
if (await backBtn.count()) { await backBtn.first().click(); await sleep(300) }
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(600)
const stillOn = await page.evaluate(() => document.querySelectorAll('.artifact-chip.on').length)
check('artifacts: enabled set survives view remount', stillOn === 1, `on=${stillOn}`)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
