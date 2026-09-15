/**
 * R98 real-machine smoke: tower-defense-only view — build → select → upgrade
 * panel → sell refund → auto wave, status bar, speed toggle, best chip.
 * Zero page errors expected throughout.
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

const stats = async () => page.evaluate(() => {
  const out = {}
  document.querySelectorAll('.games-stat-grid span').forEach(el => {
    const label = el.getAttribute('aria-label') || ''
    const num = label.match(/(\d+)/)
    if (label.includes('状态') || label.includes('status')) out.phase = el.textContent.trim()
    else if (label.includes('波次') || label.includes('wave')) out.wave = label.match(/(\d+)\s*\/\s*(\d+)/)?.[0]
    else if (label.includes('金币') || label.includes('coins')) out.coins = num?.[1]
    else if (label.includes('最高分') || label.includes('Best')) out.best = num?.[1]
  })
  return out
})

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1200)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(400) }

check('view: single game shell (3 tower cards, no game cards)', await page.evaluate(() =>
  document.querySelectorAll('.tower-card').length === 3 && document.querySelectorAll('.game-card').length === 0))
await page.screenshot({ path: 'docs/screenshots/r98-td-ready.png' })

await page.locator('button:has-text("重新开始")').first().click()
await sleep(400)
let s = await stats()
check('view: fresh state 220 coins / wave 0', s.coins === '220' && s.wave === '0/12', `coins=${s.coins} wave=${s.wave}`)
check('view: best chip present', s.best !== undefined, `best=${s.best}`)

const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
const spot = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.35 }

await page.mouse.click(spot.x, spot.y)
await sleep(700)
s = await stats()
check('td: tower built, coins 220→150', s.coins === '150', `coins=${s.coins}`)

await page.mouse.click(spot.x, spot.y)
await sleep(700)
const detailText = await page.evaluate(() => document.querySelector('.tower-detail')?.textContent ?? '')
check('td: clicking tower opens detail panel (Lv1)', detailText.includes('Lv1'), `text=${detailText.slice(0, 60)}`)

await page.locator('.tower-detail button:has-text("升级")').first().click()
await sleep(700)
s = await stats()
const detailText2 = await page.evaluate(() => document.querySelector('.tower-detail')?.textContent ?? '')
check('td: upgrade via panel, coins 150→90, shows Lv2', s.coins === '90' && detailText2.includes('Lv2'), `coins=${s.coins} lv=${detailText2.slice(0, 40)}`)

await page.locator('.tower-detail button:has-text("出售")').first().click()
await sleep(700)
s = await stats()
const detailGone = await page.evaluate(() => document.querySelector('.tower-detail') === null)
check('td: sell refunds 70% (90+91=181), panel closes', s.coins === '181' && detailGone, `coins=${s.coins} panelGone=${detailGone}`)

await page.mouse.click(spot.x, spot.y)
await sleep(1800)
s = await stats()
const statusText = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent ?? '')
check('td: rebuild auto-launches wave 1, status bar live', s.wave === '1/12' && (s.phase === '运行中' || s.phase === 'Running'), `wave=${s.wave} phase=${s.phase}`)
check('td: status bar shows balloons or countdown', /气球|下一波|balloon|Next/i.test(statusText), `status=${statusText.slice(0, 50)}`)
await page.screenshot({ path: 'docs/screenshots/r98-td-play.png' })

const speedBtn = page.locator('button[title="加速播放"], button[title="Playback speed"]')
check('td: 2x speed toggle present', (await speedBtn.count()) === 1)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
