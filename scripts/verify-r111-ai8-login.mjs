/**
 * R111 real-machine smoke (v2): the AI8 login CTA opens the official site and
 * the token lands in the renderer, via EITHER path:
 *  A) persisted site session → poller captures within seconds of open
 *  B) logged-out window → injected fake userStore captured (deterministic)
 * Then the manual-close path is checked tolerantly (with a persisted session
 * the window can capture faster than a manual close — both outcomes are fine
 * as long as the renderer stays healthy).
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

const clearViaUi = async () => {
  await page.evaluate(() => {
    const button = document.querySelector('button[data-action="ai8-clear-token"]')
    if (button) button.click()
  })
  await sleep(300)
}
const rendererToken = async () => page.evaluate(() => ({
  stored: localStorage.getItem('rgbbox:ai8Token'),
  status: document.querySelector('.ai-ai8-tokenrow .ai-status')?.textContent ?? '',
  cta: !!document.querySelector('button[data-action="ai8-open-login"]'),
}))
const findLoginPage = () => {
  const pages = browser.contexts()[0].pages()
  return pages.find(p => p !== page && !p.url().includes('index.html')) ?? null
}

await page.locator('.rail-item', { hasText: 'AI' }).first().click()
await sleep(1200)
await page.locator('.ai-tab[data-tab="ai8"]').click()
await sleep(500)
await clearViaUi()

const cta = await page.evaluate(() => !!document.querySelector('button[data-action="ai8-open-login"]'))
check('cta: login panel renders with primary button', cta)
await page.screenshot({ path: 'docs/screenshots/r111-ai8-login-cta.png' })

// ── open the login window (force: the button disables itself on click) ──
await page.locator('button[data-action="ai8-open-login"]').click({ force: true })

let loginPage = null
for (let i = 0; i < 20; i++) {
  await sleep(1000)
  loginPage = findLoginPage()
  if (loginPage && !loginPage.isClosed()) break
}
check('login: child window opened (official site)', !!loginPage, loginPage?.url().slice(0, 60) ?? 'none')

// path A: persisted session captures on its own
let capturedA = false
for (let i = 0; i < 20; i++) {
  await sleep(1000)
  const state = await rendererToken()
  if (state.stored && state.stored !== '') { capturedA = true; break }
  if (!loginPage || loginPage.isClosed()) break
}

if (capturedA) {
  const state = await rendererToken()
  check('capture A: persisted session auto-captured (real token)', state.stored.length > 20, `len=${state.stored.length} status=${state.status}`)
} else {
  // path B: logged-out window — inject a fake signed-in userStore
  check('login: window still open (logged out) → injection path', !!loginPage && !loginPage.isClosed())
  if (loginPage && !loginPage.isClosed()) {
    for (let i = 0; i < 25; i++) {
      await sleep(1000)
      try {
        const ready = await loginPage.evaluate(() => document.readyState)
        if (ready === 'complete' || ready === 'interactive') break
      } catch { /* navigating */ }
    }
    await loginPage.evaluate(() => {
      localStorage.setItem('userStore', JSON.stringify({ auth: { token: 'e2e-captured-token' }, user: { nickname: 'E2E Tester', isLogin: true, uid: 42 } }))
    }).catch(() => {})
    for (let i = 0; i < 12; i++) {
      await sleep(1000)
      const state = await rendererToken()
      if (state.stored === 'e2e-captured-token') break
    }
  }
  const state = await rendererToken()
  check('capture B: injected token captured into the renderer', state.stored === 'e2e-captured-token', `stored=${state.stored}`)
}

const okState = await rendererToken()
check('renderer: token-ok state shown', !okState.cta && okState.status.includes('已就绪'), okState.status)
await sleep(1500)
const goneAfterCapture = findLoginPage() === null
check('login: child window auto-closed after capture', goneAfterCapture)

// ── manual-close path (tolerant): with a persisted session the window may
// capture before we can close it — assert the renderer stays healthy either way ──
await clearViaUi()
await page.locator('button[data-action="ai8-open-login"]').click({ force: true })
await sleep(1500)
const secondPage = findLoginPage()
if (secondPage && !secondPage.isClosed()) {
  await secondPage.close().catch(() => {})
}
await sleep(1500)
const healthy = await rendererToken()
const capturedAnyway = healthy.stored !== null && healthy.stored !== ''
check('cancel/capture: renderer healthy after the second open', (healthy.cta || capturedAnyway) && errors.length === 0, `cta=${healthy.cta} captured=${capturedAnyway}`)

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
