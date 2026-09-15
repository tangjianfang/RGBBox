/**
 * R99 real-machine smoke: games platform — hub tiles, TD regression chain,
 * Nova Swarm run (move + auto-fire kills + score), fullscreen toggle,
 * sfx toggle persistence. Zero page errors expected throughout.
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

const chips = async () => page.evaluate(() => {
  const out = {}
  document.querySelectorAll('.games-stat-grid span').forEach(el => {
    const label = el.getAttribute('aria-label') || ''
    const num = label.match(/(\d+)/)
    if (label.includes('状态') || label.includes('status')) out.phase = el.textContent.trim()
    else if (label.includes('波次') || label.includes('wave')) out.wave = label.match(/(\d+)\s*\/\s*(\S+)/)?.[0]
    else if (label.includes('金币') || label.includes('coins')) out.coins = num?.[1]
    else if (label.includes('总分') || label.includes('得分') || label.includes('score')) out.score = num?.[1]
  })
  return out
})

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1200)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(400) }

// ── Hub ──
const tileCount = await page.evaluate(() => ({
  hub: !!document.querySelector('.games-hub'),
  tiles: document.querySelectorAll('.game-tile:not(.ghost)').length,
  ghost: document.querySelectorAll('.game-tile.ghost').length,
  canvas: document.querySelectorAll('.games-hub canvas, .games-view > .games-hub canvas').length,
}))
check('hub: two game tiles + ghost slot, no game canvas', tileCount.hub && tileCount.tiles === 2 && tileCount.ghost === 1 && tileCount.canvas === 0, JSON.stringify(tileCount))
await page.screenshot({ path: 'docs/screenshots/r99-hub.png' })

// ── TD regression chain ──
await page.locator('.game-tile:not(.ghost)').first().click()
await sleep(700)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(400)
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
const spot = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.35 }
await page.mouse.click(spot.x, spot.y)
await sleep(600)
let c = await chips()
check('td: tower built, coins 220→150', c.coins === '150', `coins=${c.coins}`)
await page.mouse.click(spot.x, spot.y)
await sleep(600)
const detail = await page.evaluate(() => document.querySelector('.tower-detail')?.textContent ?? '')
check('td: tower selection panel opens', detail.includes('Lv1'), detail.slice(0, 40))
await page.locator('.tower-detail button:has-text("升级")').first().click()
await sleep(600)
c = await chips()
check('td: upgrade via panel, coins 150→90', c.coins === '90', `coins=${c.coins}`)
await page.locator('.tower-detail button:has-text("出售")').first().click()
await sleep(600)
c = await chips()
check('td: sell refunds to 181', c.coins === '181', `coins=${c.coins}`)
await page.mouse.click(spot.x, spot.y)
await sleep(1800)
c = await chips()
check('td: rebuild auto-launches wave 1', c.wave === '1/12', `wave=${c.wave}`)

// ── Fullscreen toggle ──
await page.locator('button[title="全屏"], button[title="Fullscreen"]').first().click()
await sleep(600)
let fsOn = await page.evaluate(() => document.querySelector('.games-screen')?.classList.contains('fs') ?? false)
check('fs: fullscreen layer active', fsOn)
await page.screenshot({ path: 'docs/screenshots/r99-td-fullscreen.png' })
await page.keyboard.press('Escape')
await sleep(500)
fsOn = await page.evaluate(() => document.querySelector('.games-screen')?.classList.contains('fs') ?? false)
check('fs: Esc exits fullscreen', !fsOn)

// ── Nova Swarm ──
await page.locator('button:has-text("返回游戏库"), button:has-text("Game library")').first().click()
await sleep(600)
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(700)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(400)
await page.keyboard.down('D')
await sleep(2500)
await page.keyboard.up('D')
await sleep(6000)
c = await chips()
check('swarm: auto-fire racks up score (>0)', c.score !== undefined && Number(c.score) > 0, `score=${c.score}`)
await page.screenshot({ path: 'docs/screenshots/r99-swarm-play.png' })

// ── SFX toggle persistence ──
const sfxBtn = page.locator('button[title="音效开关"], button[title="Sound effects"]').first()
await sfxBtn.click()
await sleep(300)
const sfxStored = await page.evaluate(() => localStorage.getItem('rgbbox:gamesSfx'))
check('sfx: toggle persists to localStorage', sfxStored === 'off', `stored=${sfxStored}`)
await sfxBtn.click()
await sleep(300)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
