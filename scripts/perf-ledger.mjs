/**
 * R241 / TASK-UNIVERSE F15: perf ledger — quick-tier baseline per view:
 *   idle-fps  (10s rAF sampling: mean + p95 of frame intervals → fps)
 *   idle-heap (CDP Performance.getMetrics JSHeapUsedSize at idle)
 *   switch-ms (rail click → view root selector visible)
 * Writes docs/PERF-LEDGER.md (script-owned; rerun to refresh). The 30-min
 * memory slope belongs to the soak gate (T15), NOT this quick tier.
 *
 *   node scripts/perf-ledger.mjs
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9302
// rail reality (probed): 10 items — dashboard..ai + settings; no standalone profiles entry
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'model3d', 'ai', 'settings']
const VIEW_SEL = { dashboard: '.dashboard, .workspace, .metric', workspace: '.workspace-main, .content-grid, .panel', effects: '.effects-curated-section, .effect-card', video: '.video-studio, .panel', audio: '.audio-studio, .panel', games: '.games-hub, .game-tile', diagnostics: '.diag, .panel, .metric', model3d: 'canvas', ai: '.ai-lab, .panel', settings: '.settings-group' }

const udd = join(tmpdir(), `rgbbox-perf-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const electron = spawn('node_modules/electron/dist/electron.exe',
  [`--remote-debugging-port=${PORT}`, '--user-data-dir=' + udd, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')

const rows = []
for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  const t0 = Date.now()
  // reached = the rail marks THIS item current (language-agnostic; per-view
  // root classes are shared e.g. audio also renders .workspace). Poll to the
  // flip — no artificial sleeps inflating the measurement.
  const waitCurrent = async (n) => {
    const t = Date.now()
    await page.waitForFunction((k) => document.querySelectorAll('.module-rail .rail-item')[k]?.getAttribute('aria-current') === 'page', i, { timeout: 8000 }).catch(() => {})
    return Date.now() - t
  }
  await page.locator('.module-rail .rail-item').nth(i).click().catch(() => {})
  const coldMs = await waitCurrent(i)
  // warm pass: away and back (first visit pays the lazy chunk, warm is the UX number)
  let warmMs = coldMs
  if (i > 0) {
    await page.locator('.module-rail .rail-item').nth(i - 1).click().catch(() => {})
    await waitCurrent(i - 1)
    const tw = Date.now()
    await page.locator('.module-rail .rail-item').nth(i).click().catch(() => {})
    warmMs = await waitCurrent(i)
    void tw
  }
  if (view === 'model3d') await page.waitForTimeout(2000) // WebGL init settles BEFORE fps sampling
  const visible = await page.evaluate((n) => document.querySelectorAll('.module-rail .rail-item')[n]?.getAttribute('aria-current') === 'page', i)
  const switchMs = warmMs
  rows.length // noop
  rows.push({ view, coldMs, warmMs })
  // idle fps: 10s of rAF frame intervals in the page
  const fps = await page.evaluate(() => new Promise((resolve) => {
    const dt = []; let last = performance.now()
    const tick = (t) => { dt.push(t - last); last = t; if (t - start < 10000) requestAnimationFrame(tick); else {
      dt.sort((a, b) => a - b)
      const mean = dt.reduce((s, v) => s + v, 0) / dt.length
      const p95 = dt[Math.floor(dt.length * 0.95)]
      resolve({ mean: 1000 / mean, p95: 1000 / p95 })
    } }
    const start = performance.now()
    requestAnimationFrame(tick)
  }))
  const { metrics } = await cdp.send('Performance.getMetrics')
  const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0
  const last = rows[rows.length - 1]
  Object.assign(last, { visible, fpsMean: Number(fps.mean.toFixed(1)), fpsP95: Number(fps.p95.toFixed(1)), heapMB: Number((heap / 1048576).toFixed(1)) })
  console.log(`${view.padEnd(12)} visible=${visible ? 'y' : 'N'} cold=${String(last.coldMs).padStart(4)} warm=${String(warmMs).padStart(4)}ms fps=${fps.mean.toFixed(1)}/${fps.p95.toFixed(1)} heap=${(heap / 1048576).toFixed(1)}MB`)
}

const red = rows.filter((r) => !r.visible || r.fpsMean < 45 || r.warmMs > 300)
let md = `# PERF-LEDGER — 性能台账（R241 / F15 快速档）\n\n> ${new Date().toISOString()}（node scripts/perf-ledger.mjs 重跑刷新）｜30min 内存长坡归 soak 门禁（T15）\n\n`
md += `| 视图 | 可见 | 切换 ms | fps 均值 | fps p95 | 空闲堆 MB |\n|---|---|---|---|---|---|\n`
for (const r of rows) md += `| ${r.view} | ${r.visible ? '✓' : '✗'} | ${r.switchMs} | ${r.fpsMean} | ${r.fpsP95} | ${r.heapMB} |\n`
md += `\n红线：fps<45 或切换>300ms 或不可见 —— 本档 **${red.length} 项**${red.length ? '：' + red.map((r) => r.view).join(', ') + '（逐项立案）' : ''}\n`
writeFileSync('docs/PERF-LEDGER.md', md)
console.log(`\nledger → docs/PERF-LEDGER.md | red items: ${red.length}`)
try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* best effort */ }
process.exit(red.length ? 1 : 0)
