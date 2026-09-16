/**
 * R107 real-machine smoke: codex button opens the overlay, four sections hold
 * 3/5/12/8 entries, close restores, zero regressions.
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

await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(700)

await page.locator('button:has-text("图鉴"), button:has-text("Codex")').first().click()
await sleep(500)
const codex = await page.evaluate(() => ({
  overlay: !!document.querySelector('.codex-overlay'),
  entries: document.querySelectorAll('.codex-entry').length,
  sections: document.querySelectorAll('.codex-section').length,
  sample: document.querySelector('.codex-entry small')?.textContent ?? '',
}))
check('codex: overlay opens with 4 sections / 28 entries', codex.overlay && codex.sections === 4 && codex.entries === 3 + 5 + 12 + 8, JSON.stringify({ sections: codex.sections, entries: codex.entries }))
check('codex: lore lines render', codex.sample.length > 6, codex.sample.slice(0, 40))
await page.screenshot({ path: 'docs/screenshots/r107-codex.png' })

await page.locator('.codex-head button').first().click()
await sleep(400)
const closed = await page.evaluate(() => document.querySelector('.codex-overlay') === null)
check('codex: close restores the game screen', closed)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
