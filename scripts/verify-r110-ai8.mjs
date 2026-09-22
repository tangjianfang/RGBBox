/**
 * R110 real-machine smoke: AI8 tab renders, the PUBLIC model template really
 * loads from ai8.rcouyi.com (no token needed), no-token send is guarded, a
 * fake token persists, and a send with it surfaces a graceful business error.
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

await page.evaluate(() => localStorage.removeItem('rgbbox:ai8Token'))
await page.locator('.rail-item', { hasText: 'AI' }).first().click()
await sleep(1200)

await page.locator('.ai-tab[data-tab="ai8"]').click()
await sleep(300)
check('tab: AI8 tab present and activatable', await page.evaluate(() => document.querySelector('.ai-tab[data-tab="ai8"]')?.getAttribute('aria-selected') === 'true'))

// public model template — real network, no token
for (let i = 0; i < 15; i++) {
  await sleep(1000)
  const count = await page.evaluate(() => document.querySelectorAll('select[data-field="ai8-model"] option').length)
  if (count > 1) {
    check('models: public /chat/tmpl really loads', count > 50, `options=${count}`)
    break
  }
  if (i === 14) check('models: public /chat/tmpl really loads', false, 'timeout — see network')
}
await page.screenshot({ path: 'docs/screenshots/r110-ai8-tab.png' })

// no-token send is guarded: the token row must be visible
const guardVisible = await page.evaluate(() => !!document.querySelector('input[data-field="ai8-token"]'))
check('guard: no-token state shows the token row', guardVisible)

// paste a fake token and persist it
await page.locator('input[data-field="ai8-token"]').fill('fake-token-for-error-path')
await page.locator('button[data-action="ai8-save-token"]').click()
await sleep(300)
const stored = await page.evaluate(() => localStorage.getItem('rgbbox:ai8Token'))
check('token: fake token persisted', stored === 'fake-token-for-error-path', `stored=${stored}`)

// new session with a fake token → graceful business error in the log
await page.locator('button[data-action="ai8-new-session"]').click()
for (let i = 0; i < 12; i++) {
  await sleep(1000)
  const err = await page.evaluate(() => document.querySelector('[data-field="ai8-log"] .ai-msg-error')?.textContent ?? '')
  if (err !== '') {
    check('error path: business error shown gracefully', /Token|失败|token/i.test(err), err.slice(0, 60))
    break
  }
  if (i === 11) check('error path: business error shown gracefully', false, 'no error surfaced in 12s')
}
await page.evaluate(() => localStorage.removeItem('rgbbox:ai8Token'))

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
