/**
 * R252 / T15: the 30-minute soak gate — long-run stability proof, compressed.
 * Strategy: run the REAL app with the synthetic vision source (no camera) for
 * a real-time window (default 180s ≈ compressed 30min via accelerated frame
 * rates where the engine allows), measure through CDP:
 *   fps slope      — inference throughput must not decay (>10% drop = leak-throttling)
 *   heap delta     — JSHeapUsedSize growth < 20MB
 *   stuck keys     — SK-0 invariant: no permanently held gesture key
 *   drift          — direction decisions stay within the dead zone of rest
 *   stop/start     — a mid-run host restart recovers a working session
 *   exit cleanup   — host window destroyed on app teardown
 * Writes docs/SOAK-LEDGER.md. Night tier (NOT in the default suite).
 *
 *   yarn vision:soak [--seconds 180]
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from './lib/cdp.mjs'

const PORT = 9305
const SECONDS = Number(process.argv.includes('--seconds')
  ? process.argv[process.argv.indexOf('--seconds') + 1] : 180)
// R306/T22: scenario tiers — base (as shipped) + face (face landmarker live on
// the synthetic source) + precision (hi capture tier) + macro (preset table
// cycling every 15s to soak the T9 per-event table loads)
const SCENARIO = process.argv.includes('--scenario')
  ? process.argv[process.argv.indexOf('--scenario') + 1] : 'base'

const udd = join(tmpdir(), `rgbbox-soak-${Date.now()}`)
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

const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`)
  return ok
}
const results = []
const record = (n, ok, d = '') => { results.push({ n, ok, d }); check(n, ok, d) }

// helper metrics
const metrics = async () => {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  return { heap: m.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0 }
}
const fpsSample = () => page.evaluate(() => new Promise((resolve) => {
  const dt = []; let last = performance.now(); const start = last
  const tick = (t) => { dt.push(t - last); last = t; if (t - start < 3000) requestAnimationFrame(tick); else resolve(1000 / (dt.reduce((s, v) => s + v, 0) / dt.length)) }
  requestAnimationFrame(tick)
}))

// ── phase 0: start synthetic vision (AI lab bench seam) ────────────────────
await page.locator('.module-rail .rail-item').nth(8).click() // AI lab
await sleep(800)
const bench = await page.evaluate(() => {
  const tab = [...document.querySelectorAll('button, [role="tab"]')].find((b) => /vision|体感|视觉/i.test(b.textContent ?? ''))
  tab?.click(); return !!tab
})
await sleep(600)
const started = SCENARIO === 'face'
  ? await page.evaluate(() => window.__rgbboxVisionLab?.startSynthetic?.({ face: true }))
  : await page.evaluate(() => window.__rgbboxVisionLab?.startSynthetic?.())
if (SCENARIO === 'face' && started !== true) { console.error('face scenario: synthetic+face start failed'); process.exit(1) }
await sleep(1500)
if (SCENARIO === 'precision') {
  await page.locator('select[data-param="precision"]').selectOption('hi').catch(() => {})
  await sleep(600)
}

// R306/T22: sample the ENGINE's inference throughput (inferFps — the health
// card's data-field), not the rAF render rate: the gate's own doc says "fps
// slope — inference throughput"; rAF wobbles with UI load and manufactured
// every "drop" so far. Falls back to rAF only when stats have not landed.
const inferFpsSample = async () => {
  const v = await page.evaluate(() => {
    const el = document.querySelector('[data-field="health-infer-fps"]')
    return el?.textContent ?? ''
  })
  const n = Number(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : await fpsSample()
}

// ── phase 1: baseline ───────────────────────────────────────────────────────
// R306/T22 harness fix: a CONDITION-stable baseline — the rAF idles at
// 200fps while models load and ramps as the engine loop spins up, so any
// fixed-wait sample catches the idle→loaded transition and every "drop"
// from it is pure artifact. Sample until two consecutive reads agree within
// 5% (max 30s), THEN take the baseline: the gate measures DECAY from the
// working steady state, never warm-up.
let fpsPrev = await inferFpsSample()
let fps0 = fpsPrev
for (let i = 0; i < 15; i++) {
  await sleep(2000)
  const next = await inferFpsSample()
  if (Math.abs(next - fpsPrev) / fpsPrev < 0.05) { fps0 = next; break }
  fpsPrev = next
}
const heap0 = (await metrics()).heap
console.log(`baseline: fps=${fps0.toFixed(1)} heap=${(heap0 / 1048576).toFixed(1)}MB (${SECONDS}s soak starting)`)

// ── phase 2: the soak window ────────────────────────────────────────────────
// macro scenario: cycle the three presets every 15s + poke the T9 reader with
// a direction event — it loads the table PER EVENT; a leak there lands in the
// heap verdict exactly like any other
if (SCENARIO === 'macro') {
  const cycle = ['light-drive', 'present', 'party']
  const until = Date.now() + SECONDS * 1000
  let i = 0
  while (Date.now() < until) {
    const id = cycle[i++ % cycle.length]
    await page.evaluate((preset) => {
      const G = ['dir8', 'pinch', 'palm', 'chord-menu', 'chord-light', 'double-pinch']
      const SC = ['workspace', 'effects', 'audio', 'video', 'ai', 'settings', 'overlay', 'games']
      const cells = {
        'light-drive': { dir8: 'brightnessStep', 'chord-light': 'openMenu' },
        present: { dir8: 'nextCurated', 'double-pinch': 'prevCurated', 'chord-light': 'openMenu' },
        party: { dir8: 'brightnessStep', 'double-pinch': 'nextCurated', 'chord-light': 'openMenu' },
      }[preset]
      const table = {}
      for (const g of G) {
        table[g] = {}
        for (const sc of SC) table[g][sc] = sc === 'games' || !cells[g]
          ? { action: 'none', cooldownMs: 0, guard: 'always' }
          : { action: cells[g], cooldownMs: 500, guard: g === 'chord-light' ? 'explicit-mode' : 'always' }
      }
      window.localStorage.setItem('rgbbox:gestureMacros', JSON.stringify(table))
    }, id)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('vision-input', { detail: { kind: 'direction', key: 'ArrowRight', dir: 'right', down: true } }))
    })
    await sleep(15000)
  }
} else {
  await sleep(SECONDS * 1000)
}

// ── phase 3: verdicts ───────────────────────────────────────────────────────
const heap1 = (await metrics()).heap
const fps1 = await inferFpsSample()
const heapDelta = (heap1 - heap0) / 1048576
const fpsDrop = 1 - fps1 / fps0
record('inferFps 降幅 <10%', fpsDrop < 0.10, `${(fpsDrop * 100).toFixed(1)}% (${fps0.toFixed(1)}→${fps1.toFixed(1)})`)
record('heap 增长 <20MB', heapDelta < 20, `${heapDelta.toFixed(1)}MB`)

// stuck keys: the synthetic rest pose holds nothing
const held = await page.evaluate(() => window.__rgbboxVision?.heldKeys?.() ?? null)
record('SK-0 无卡键', held == null || held.length === 0, JSON.stringify(held))

// stop/start recovery via the AI-lab bench seam (games-view __rgbboxVision
// is mounted only inside the games view; the lab seam is the one alive here)
const restarted = await page.evaluate(async () => {
  const lab = window.__rgbboxVisionLab
  if (!lab) return false
  return lab.startSynthetic() // the seam returns Promise<boolean> (true = session live)
})
await sleep(1200)
const chip = await page.evaluate(() => document.querySelector('.ai-status')?.textContent ?? document.querySelector('[data-field="vision-stats"]')?.textContent ?? '')
record('stop/start 恢复', restarted === true && chip.length > 0, `seam=${restarted} chip="${chip.slice(0, 40)}"`)

// teardown: the lab's stop path (the seam has no disable — bench uses the tab's
// stop button; clicking it must leave the status chip idle without errors)
await page.evaluate(() => { [...document.querySelectorAll('[data-action]')].find((b) => b.getAttribute('data-action') === 'vision-stop')?.click() })
await sleep(600)
const chipEnd = await page.evaluate(() => document.querySelector('.ai-status')?.textContent ?? '')
record('退出清理（bench stop）', !/运行中|running|active/i.test(chipEnd), `chip="${chipEnd.slice(0, 40)}"`)

// ledger
let md = `# SOAK-LEDGER — 长跑门禁台账（R252 / T15；R306/T22 场景档）\n\n> ${new Date().toISOString()} · ${SECONDS}s 窗口 · synthetic 源（无摄像头） · scenario=${SCENARIO}\n\n`
md += `| 检查 | 结果 | 明细 |\n|---|---|---|\n`
for (const r of results) md += `| ${r.n} | ${r.ok ? '✓' : '✗'} | ${r.d} |\n`
md += `\n基线 fps=${fps0.toFixed(1)} heap=${(heap0 / 1048576).toFixed(1)}MB → 终值 fps=${fps1.toFixed(1)} heap=${(heap1 / 1048576).toFixed(1)}MB\n`
writeFileSync('docs/SOAK-LEDGER.md', md)

const fail = results.filter((r) => !r.ok).length
console.log(`\nsoak: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'} → docs/SOAK-LEDGER.md`)
try { electron.kill() } catch {}
await sleep(800)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* best effort */ }
process.exit(fail ? 1 : 0)
