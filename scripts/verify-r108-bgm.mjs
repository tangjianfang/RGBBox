/**
 * R108 real-machine smoke: music toggle persists, BGM code path runs inside a
 * game screen with zero errors (actual audible output is for human ears).
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

await page.evaluate(() => localStorage.setItem('rgbbox:gamesBgm', 'on'))
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

const bgmBtn = page.locator('button[title="音乐开关"], button[title="Music"]').first()
check('bgm: toggle button present on hub', (await bgmBtn.count()) === 1)
await bgmBtn.click()
await sleep(300)
let stored = await page.evaluate(() => localStorage.getItem('rgbbox:gamesBgm'))
check('bgm: off persists', stored === 'off', `stored=${stored}`)
await bgmBtn.click()
await sleep(300)
stored = await page.evaluate(() => localStorage.getItem('rgbbox:gamesBgm'))
check('bgm: back on persists', stored === 'on', `stored=${stored}`)

// run a game screen with BGM active for a few seconds — zero errors proves the
// scheduling path holds in the real AudioContext environment
await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(600)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(300)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(4000)
const phase = await page.evaluate(() => [...document.querySelectorAll('.games-stat-grid span')][0]?.textContent ?? '')
check('bgm: game runs with BGM active', phase.includes('运行') || phase.includes('Running'), phase)
check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
