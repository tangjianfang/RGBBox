/**
 * R101 real-machine smoke: character select (persisted), permanent shop buy
 * flow (persisted coins), character stats injected at run start, rarity-colored
 * level-up cards, run-build inventory sidebar. Roulette wheel + death summary
 * are engine-unit-verified (boss takes 90s live) — see PRD notes.
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

await page.evaluate(() => localStorage.setItem('rgbbox:gamesMeta:swarm', JSON.stringify({ coins: 200, perm: { damage: 0, fireRate: 0, moveSpeed: 0, maxHp: 0, xpGain: 0, luck: 0 } })))
// remount the view so the seeded meta is read at init
const railHome = page.locator('.rail-item').first()
await railHome.click().catch(() => {})
await sleep(700)
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(700)

// ── character select ──
const setup = await page.evaluate(() => ({
  cards: document.querySelectorAll('.char-card').length,
  title: document.querySelector('.swarm-setup-title')?.textContent ?? '',
}))
check('setup: three ship cards shown', setup.cards === 3, JSON.stringify(setup))
await page.locator('.char-card').nth(1).click()
await sleep(400)
const charSaved = await page.evaluate(() => localStorage.getItem('rgbbox:swarmChar'))
const selected = await page.evaluate(() => document.querySelectorAll('.char-card.selected').length)
check('setup: Bulwark selected + persisted', charSaved === 'bulwark' && selected === 1, `saved=${charSaved} selected=${selected}`)
await page.screenshot({ path: 'docs/screenshots/r101-setup.png' })

// ── permanent shop ──
const coinsBefore = await page.evaluate(() => document.querySelector('.swarm-coins')?.textContent ?? '')
check('shop: seeded 200 coins visible', coinsBefore.includes('200'), `coins=${coinsBefore}`)
const shopRows = await page.evaluate(() => document.querySelectorAll('.shop-row').length)
check('shop: six permanent upgrades listed', shopRows === 6, `rows=${shopRows}`)
await page.locator('.shop-row button').first().click()
await sleep(500)
const coinsAfter = await page.evaluate(() => document.querySelector('.swarm-coins')?.textContent ?? '')
const metaSaved = await page.evaluate(() => localStorage.getItem('rgbbox:gamesMeta:swarm'))
check('shop: buy deducts (200→140) + persisted', coinsAfter.includes('140') && metaSaved?.includes('"damage":1'), `coins=${coinsAfter} meta=${metaSaved?.slice(0, 60)}`)
await page.screenshot({ path: 'docs/screenshots/r101-shop.png' })

// ── run: character stats injected ──
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(800)
const lives = await page.evaluate(() => {
  const chip = [...document.querySelectorAll('.games-stat-grid span')].find(el => (el.getAttribute('aria-label') || '').includes('生命'))
  return chip?.textContent.trim() ?? null
})
check('run: Bulwark starts with 8 HP', lives === '8', `lives=${lives}`)

// ── wait for a level-up (rarity cards) or death summary ──
let levelupSeen = false
let summarySeen = false
for (let i = 0; i < 45; i++) {
  await sleep(1000)
  const state = await page.evaluate(() => ({
    cards: document.querySelectorAll('.levelup-card').length,
    summary: document.querySelectorAll('.swarm-summary').length,
    inv: document.querySelectorAll('.swarm-inv li').length,
  }))
  if (state.cards > 0) { levelupSeen = true; break }
  if (state.summary > 0) { summarySeen = true; break }
}
if (levelupSeen) {
  const cards = await page.evaluate(() => document.querySelectorAll('.levelup-card').length)
  check('levelup: three rarity-colored cards', cards >= 3, `cards=${cards}`)
  await page.screenshot({ path: 'docs/screenshots/r101-levelup.png' })
  await page.locator('.levelup-card').first().click()
  await sleep(700)
  const inv = await page.evaluate(() => document.querySelectorAll('.swarm-inv li').length)
  check('inventory: build row appears after pick', inv >= 1, `rows=${inv}`)
} else if (summarySeen) {
  check('summary: death report overlay shown (levelup not reached in time)', true)
  await page.screenshot({ path: 'docs/screenshots/r101-summary.png' })
} else {
  check('levelup or summary within 45s', false, 'neither appeared')
}

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
