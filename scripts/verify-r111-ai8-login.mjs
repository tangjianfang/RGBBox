/**
 * R111 real-machine smoke: the AI8 login CTA opens the official site in a
 * child window; injecting a fake userStore into that window's localStorage is
 * captured by the main-process poller and lands in the renderer token state.
 * Also covers the manual-close path (renderer stays healthy, no token).
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

await page.locator('.rail-item', { hasText: 'AI' }).first().click()
await sleep(1200)
await page.locator('.ai-tab[data-tab="ai8"]').click()
await sleep(500)
// a previous run's poller may have captured a token into the live component —
// clear through the UI so both state and storage reset
await page.evaluate(() => {
  const button = document.querySelector('button[data-action="ai8-clear-token"]')
  if (button) button.click()
})
await page.evaluate(() => localStorage.removeItem('rgbbox:ai8Token'))
await sleep(300)

const cta = await page.evaluate(() => ({
  title: document.querySelector('.ai-ai8-login-title')?.textContent ?? '',
  button: !!document.querySelector('button[data-action="ai8-open-login"]'),
}))
check('cta: login panel renders with primary button', cta.title !== '' && cta.button, JSON.stringify(cta))
await page.screenshot({ path: 'docs/screenshots/r111-ai8-login-cta.png' })

// ── open the login window (force: the button disables itself on click, which
// trips Playwright's post-click actionability re-check even though it landed) ──
await page.locator('button[data-action="ai8-open-login"]').click({ force: true })
let loginPage = null
for (let i = 0; i < 20; i++) {
  await sleep(1000)
  loginPage = browser.contexts()[0].pages().find(p => p !== page && !p.url().includes('index.html')) ?? null
  if (loginPage && !loginPage.isClosed()) break
}
check('login: child window opened (official site loading)', !!loginPage && !loginPage.isClosed(), loginPage?.url().slice(0, 60) ?? 'none')

// wait for the page to commit so localStorage is addressable
for (let i = 0; i < 25; i++) {
  await sleep(1000)
  try {
    const ready = await loginPage.evaluate(() => document.readyState)
    if (ready === 'complete' || ready === 'interactive') break
  } catch { /* page navigating */ }
}
// inject a fake signed-in userStore — the main-process poller must swallow it
await loginPage.evaluate(() => {
  localStorage.setItem('userStore', JSON.stringify({ auth: { token: 'e2e-captured-token' }, user: { nickname: 'E2E Tester', isLogin: true, uid: 42 } }))
})
let captured = false
for (let i = 0; i < 12; i++) {
  await sleep(1000)
  captured = await page.evaluate(() => localStorage.getItem('rgbbox:ai8Token') === 'e2e-captured-token')
  if (captured) break
}
check('capture: poller grabbed the injected token into the renderer', captured)
const tokenState = await page.evaluate(() => ({
  stored: localStorage.getItem('rgbbox:ai8Token'),
  status: document.querySelector('.ai-ai8-tokenrow .ai-status')?.textContent ?? '',
}))
check('capture: renderer shows token-ok with account', tokenState.stored === 'e2e-captured-token' && /AI8 token/.test(tokenState.status), JSON.stringify(tokenState))
await sleep(1500)
const windowClosed = !(await browser.contexts()[0].pages().find(p => p !== page && !p.url().includes('index.html')) ?? null)
check('login: child window auto-closed after capture', !!windowClosed)

// ── manual-close path: open again, close the child from outside ──
await page.locator('button[data-action="ai8-clear-token"]').click()
await sleep(400)
await page.locator('button[data-action="ai8-open-login"]').click()
let secondPage = null
for (let i = 0; i < 20; i++) {
  await sleep(1000)
  secondPage = browser.contexts()[0].pages().find(p => p !== page && !p.url().includes('index.html')) ?? null
  if (secondPage && !secondPage.isClosed()) break
}
if (secondPage && !secondPage.isClosed()) {
  await secondPage.close().catch(() => {})
  await sleep(800)
}
const stillHealthy = await page.evaluate(() => ({
  cta: !!document.querySelector('button[data-action="ai8-open-login"]'),
  stored: localStorage.getItem('rgbbox:ai8Token'),
}))
check('cancel: manual close leaves the renderer healthy without a token', stillHealthy.cta && stillHealthy.stored === null, JSON.stringify(stillHealthy))

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
