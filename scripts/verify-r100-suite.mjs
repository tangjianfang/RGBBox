/**
 * R100 real-machine smoke: 3-tile hub, TD mint-spire economy tower,
 * Nova Swarm regression, Tetris playable via keyboard commands.
 * Zero page errors expected throughout.
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

const chips = async () => page.evaluate(() => {
  const out = {}
  document.querySelectorAll('.games-stat-grid span').forEach(el => {
    const label = el.getAttribute('aria-label') || ''
    const num = label.match(/(\d+)/)
    if (label.includes('状态') || label.includes('status')) out.phase = el.textContent.trim()
    else if (label.includes('金币') || label.includes('coins')) out.coins = num?.[1]
    else if (label.includes('总分') || label.includes('得分') || label.includes('score')) out.score = num?.[1]
  })
  return out
})

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1200)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(400) }
// normalize to hub: a previous script run may have left a game screen mounted
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(500) }

const tiles = await page.evaluate(() => ({
  tiles: document.querySelectorAll('.game-tile:not(.ghost)').length,
  ghost: document.querySelectorAll('.game-tile.ghost').length,
}))
check('hub: three game tiles + ghost slot', tiles.tiles === 3 && tiles.ghost === 1, JSON.stringify(tiles))
await page.screenshot({ path: 'docs/screenshots/r100-hub.png' })

// ── TD: five tower cards, mint spire economy ──
await page.locator('.game-tile:not(.ghost)').first().click()
await sleep(700)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(400)
const towerCards = await page.evaluate(() => document.querySelectorAll('.tower-card').length)
check('td: five tower cards', towerCards === 5, `cards=${towerCards}`)
await page.locator('button:has-text("Mint Spire")').first().click()
await sleep(300)
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35)
await sleep(600)
let c = await chips()
check('td: mint spire built, instant first mint (220−120+6=106)', c.coins === '106', `coins=${c.coins}`)
await sleep(4600)
c = await chips()
check('td: mint spire mints again after 4s cooldown', c.coins !== null && Number(c.coins) >= 112, `coins=${c.coins}`)
await page.screenshot({ path: 'docs/screenshots/r100-td-mint.png' })

// ── Nova Swarm regression (auto-fire alive) ──
await page.locator('button:has-text("返回游戏库"), button:has-text("Game library")').first().click()
await sleep(500)
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(600)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(5000)
c = await chips()
check('swarm: auto-fire still racks up score', c.score !== undefined && Number(c.score) > 0, `score=${c.score}`)

// ── Tetris: playable via keyboard commands ──
await page.locator('button:has-text("返回游戏库"), button:has-text("Game library")').first().click()
await sleep(500)
await page.locator('.game-tile:not(.ghost)').nth(2).click()
await sleep(600)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(400)
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowLeft')
await page.keyboard.press('ArrowUp')
await page.keyboard.press('Space')
await sleep(700)
c = await chips()
check('tetris: hard drop scores row distance', c.score !== undefined && Number(c.score) >= 20, `score=${c.score}`)
await page.keyboard.down('ArrowDown')
await sleep(1200)
await page.keyboard.up('ArrowDown')
await sleep(400)
await page.screenshot({ path: 'docs/screenshots/r100-tetris-play.png' })

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
