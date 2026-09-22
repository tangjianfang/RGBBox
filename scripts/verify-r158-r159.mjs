/**
 * R158/R159 acceptance E2E: local crash-log visibility + content-level zh
 * localization + the contrast gate, against a freshly built out/.
 *
 * Checks:
 *   1. crash records land in userData/logs and render on the Diagnostics card
 *      (a fixture record is planted before spawn; the app runs with an
 *      isolated --user-data-dir so the dev profile is untouched);
 *   2. zh UI shows no English direct-output at the four R159 sites (effect
 *      card label/description, architecture labels, game tile title);
 *   3. the contrast auditor is live: pairs ≥ 40, 0 violations (exit code).
 *
 * Usage: node scripts/verify-r158-r159.mjs   (run `yarn build` first)
 */
import { chromium, assertFreshOut } from './lib/cdp.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9297
const ELECTRON = 'node_modules/electron/dist/electron.exe'

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`) } else { fail++; console.log(`FAIL  ${name}`) }
}

assertFreshOut()

// ── 1. contrast gate (no app needed) ────────────────────────────────────────
const audit = spawnSync(process.execPath, ['scripts/ui-audit-contrast.mjs'], { encoding: 'utf8' })
const pairsMatch = audit.stdout.match(/pairs checked: (\d+)/)
ok('contrast: pairs checked ≥ 40 (was 0 before R158.2)', Number(pairsMatch?.[1] ?? 0) >= 40)
ok('contrast: 0 violations', audit.status === 0)

// ── 2. spawn with an isolated userData + planted crash fixture ──────────────
const userData = mkdtempSync(join(tmpdir(), 'rgbbox-verify-r158-'))
mkdirSync(join(userData, 'logs'), { recursive: true })
const fixture = {
  at: new Date().toISOString(),
  kind: 'uncaughtException',
  message: 'VERIFY-R158 fixture crash record',
  stack: 'Error: VERIFY-R158 fixture crash record\n    at verify',
  version: '0.0.0-verify',
  platform: process.platform,
  electron: '41.4.0'
}
writeFileSync(join(userData, 'logs', 'crash-20990101000000000-000.json'), JSON.stringify(fixture))

const electron = spawn(ELECTRON, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} ; try { rmSync(userData, { recursive: true, force: true }) } catch {} })

let browser
for (let i = 0; i < 60 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://localhost:${PORT}`) } catch { await sleep(500) }
}
if (!browser) { console.error('FAIL  CDP never came up'); process.exit(1) }
const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
if (!page) { console.error('FAIL  renderer page not found'); process.exit(1) }

// Clean boot → default zh (persisted rgbbox:* keys from dev runs would win).
await page.evaluate(() => {
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('rgbbox:') || k.startsWith('rgbbox-'))) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)
const lang = await page.evaluate(() => localStorage.getItem('rgbbox:lang'))
ok('boot language defaults to zh', lang === null || lang === 'zh')

const rail = page.locator('.module-rail .rail-item')

// ── 3. Diagnostics: crash card renders the fixture ──────────────────────────
await rail.nth(6).click()
await sleep(800)
const crashText = await page.evaluate(() => document.querySelector('.diagnostics-view')?.textContent ?? '')
ok('diagnostics: crash card lists the fixture record', crashText.includes('VERIFY-R158 fixture crash record'))
ok('diagnostics: crash kind pill localized (未捕获异常)', crashText.includes('未捕获异常'))

// ── 4. R159 zh spot checks: no English direct-output ────────────────────────
await rail.nth(2).click() // effects
await sleep(800)
const effectCardText = await page.evaluate(() => document.querySelector('.effect-card-info')?.textContent ?? '')
ok('effects (E3): first card label is localized zh', /[一-鿿]/.test(effectCardText) && !effectCardText.startsWith('Screen Ambient'))

await rail.nth(7).click() // architecture (rail order: dashboard..diagnostics=0..6, architecture=7, ai=8)
await sleep(1200)
const archText = await page.evaluate(() => document.querySelector('.arch-labels')?.textContent ?? '')
ok('architecture (AR1): module labels localized (Electron 主进程)', archText.includes('Electron 主进程'))

await rail.nth(5).click() // games
await sleep(800)
const gamesText = await page.evaluate(() => document.body.textContent ?? '')
ok('games (G4): TD tile title is zh (气球塔防竞技场)', gamesText.includes('气球塔防竞技场'))
ok('games (G4): no leftover English tile titles', !gamesText.includes('Balloon TD Arena') && !gamesText.includes('Nova Swarm') && !gamesText.includes('Neon Blocks'))

await rail.nth(8).click() // ai lab (AI5 error strings render only on error — covered by the code-prefix mapping)
await sleep(600)
ok('probe baseline JSON exists (R158.1)', (() => { try { return JSON.parse(readFileSync('docs/reviews/probe-runtime-latest.json', 'utf8')).viewFps.length === 9 } catch { return false } })())

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
try { electron.kill() } catch {}
try { rmSync(userData, { recursive: true, force: true }) } catch {}
process.exit(fail === 0 ? 0 : 1)
