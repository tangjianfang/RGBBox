/**
 * R158.1: runtime probe — R155's one-off %TEMP% CDP probe promoted to a repo
 * asset, plus the Apple-anchor measurements R157.2 flagged as unmeasured:
 * full cold start (spawn → first paint → rail interactive), longtask hang
 * count (>250ms, MetricKit MXHangDiagnostic scale) and per-view rAF fps.
 *
 * Modes:
 *   node scripts/probe-runtime.mjs          quick: cold-start ×5 + hang + 9-view fps
 *   node scripts/probe-runtime.mjs --full   + engine-load p95 (30s) + 30min heap
 *                                           curve + interaction pulse — S4's three
 *                                           deep samples (R156-S4 → R158.1)
 *
 * Anchors are recorded as REFERENCE LINES, not gates: Apple's 400ms first
 * frame / 250ms hang / 60fps come from the native-app scale (WWDC2019,
 * MetricKit). Electron pays the Chromium spawn up front, so this script's job
 * is to establish the RGBBox baseline — thresholds get set from evidence,
 * not copied.
 *
 * Cross-process time alignment: the probe's performance.now() clock and the
 * renderer's are unrelated (verify-r131 documented the trap). Cold-start
 * numbers are therefore anchored on wall-clock epoch: spawnEpoch (Date.now()
 * right before spawn) vs the page's performance.timeOrigin + paint entries.
 *
 * Output: console summary + docs/reviews/probe-runtime-latest.json (tracked —
 * the baseline table the follow-up reports quote).
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9281
const COLD_PORT_BASE = 9290 // one port per cold-start round (Windows socket reuse)
const ELECTRON = 'node_modules/electron/dist/electron.exe'
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']
const OUT_JSON = 'docs/reviews/probe-runtime-latest.json'
const FULL = process.argv.includes('--full')

/** One cold-start round: spawn → (CDP up → page up → rail interactive), epoch-aligned. */
async function coldStartOnce (port) {
  const spawnEpoch = Date.now()
  const electron = spawn(ELECTRON, [`--remote-debugging-port=${port}`, 'out/main/index.js'], { stdio: 'ignore' })
  try {
    // Main-process readiness = CDP endpoint answering. 50ms polling so the
    // reported number is not coarser than the poll step; 60s ceiling so a
    // spawn failure surfaces as an error instead of a hang.
    const cdpDeadline = Date.now() + 60000
    for (;;) {
      try { await fetch(`http://localhost:${port}/json/version`, { signal: AbortSignal.timeout(400) }); break } catch {
        if (Date.now() > cdpDeadline) throw new Error(`CDP endpoint never came up on :${port} (electron spawn failed?)`)
        await sleep(50)
      }
    }
    const cdpUpMs = Date.now() - spawnEpoch
    const browser = await chromium.connectOverCDP(`http://localhost:${port}`)
    let page
    for (let i = 0; i < 60 && !page; i++) {
      page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
      if (!page) await sleep(100)
    }
    if (!page) throw new Error('renderer page never appeared')
    await page.waitForSelector('.module-rail', { timeout: 15000 })
    const railInteractiveMs = Date.now() - spawnEpoch
    // First paint from the page's own timeline, epoch-aligned via timeOrigin
    // (probe clock and page clock are unrelated — wall epoch is the only
    // honest bridge; see the header note).
    const paint = await page.evaluate(() => {
      const fp = performance.getEntriesByType('paint').find((e) => e.name === 'first-paint')
      return fp ? { origin: performance.timeOrigin, rel: fp.startTime } : null
    })
    const firstPaintMs = paint ? Math.round(paint.origin + paint.rel) - spawnEpoch : null
    await browser.close()
    return { cdpUpMs, firstPaintMs, railInteractiveMs }
  } finally {
    try { electron.kill() } catch {}
    // Wait for the process to be REALLY gone before the next round: the app
    // holds app.requestSingleInstanceLock() (src/main/index.ts), which is only
    // released on true exit — a rushed respawn dies silently and CDP never
    // comes up (seen on round 5 with a bare 300ms sleep).
    const exitDeadline = Date.now() + 15000
    while (electron.exitCode === null && Date.now() < exitDeadline) await sleep(200)
  }
}

// ── boot the resident instance (ui-snapshot's clean-state pattern) ─────────
assertFreshOut()
console.log(FULL ? 'mode: FULL (quick + load p95 + 30min heap + interaction pulse)' : 'mode: quick (cold-start ×5 + hang + 9-view fps)')

// Cold start ×5 (independent spawns).
const cold = []
for (let i = 0; i < 5; i++) {
  const r = await coldStartOnce(COLD_PORT_BASE + i)
  cold.push(r)
  console.log(`cold[${i + 1}/5]  cdp-up ${r.cdpUpMs}ms  first-paint ${r.firstPaintMs}ms  rail-interactive ${r.railInteractiveMs}ms`)
}
const p50 = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)]
const coldSummary = {
  cdpUp: { p50: p50(cold.map((c) => c.cdpUpMs)), max: Math.max(...cold.map((c) => c.cdpUpMs)) },
  firstPaint: { p50: p50(cold.filter((c) => c.firstPaintMs != null).map((c) => c.firstPaintMs)), max: Math.max(...cold.filter((c) => c.firstPaintMs != null).map((c) => c.firstPaintMs ?? 0)) },
  railInteractive: { p50: p50(cold.map((c) => c.railInteractiveMs)), max: Math.max(...cold.map((c) => c.railInteractiveMs)) },
  rounds: cold,
}

// Resident instance: hang observer + per-view fps + console hygiene.
launchElectron({ port: PORT })
const { browser, page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

const consoleIssues = []
const pageErrors = []
page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') consoleIssues.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`) })
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 200)))

// Same clean-boot ritual as ui-snapshot: persisted rgbbox:* keys shift layouts.
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

// Hang sampling (R158.1 ②): longtask entries >250ms, MetricKit scale.
await page.evaluate(() => {
  window.__probeLongtasks = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 250) window.__probeLongtasks.push({ start: Math.round(e.startTime), duration: Math.round(e.duration) })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch { window.__probeLongtasks = null }
})

// Per-view fps (R158.1 ③): 2s rAF sample per view, verify-r131's proven pattern.
const viewFps = []
for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  try {
    await page.locator('.module-rail .rail-item').nth(i).click()
    await sleep(650)
    const fps = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0
      const t0 = performance.now()
      const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else resolve(frames / ((performance.now() - t0) / 1000)) }
      requestAnimationFrame(loop)
    }))
    viewFps.push({ view, fps: Math.round(fps) })
    console.log(`fps   ${view.padEnd(13)} ${Math.round(fps)}`)
  } catch (err) {
    viewFps.push({ view, error: err.message.split('\n')[0] })
    console.log(`fps   ${view.padEnd(13)} FAIL ${err.message.split('\n')[0]}`)
  }
}
const hangLongtasks = await page.evaluate(() => window.__probeLongtasks ?? [])
console.log(`hangs >250ms during navigation: ${hangLongtasks.length}`)
console.log(`console error/warning: ${consoleIssues.length}  pageerror: ${pageErrors.length}`)

const report = { date: new Date().toISOString(), mode: FULL ? 'full' : 'quick', coldStart: coldSummary, hangLongtasks, viewFps, consoleIssues, pageErrors }

// ── FULL additions (S4's three deep samples) ───────────────────────────────
if (FULL) {
  // ① Engine-load p95: apply an effect, let it run 30s, read the diagnostics
  // latency card (dt text contains "P95" in both zh/en).
  let loadNote = 'engine load: '
  try {
    await page.locator('.module-rail .rail-item').nth(2).click() // effects
    await sleep(650)
    await page.locator('.effect-card-main').first().click()
    await sleep(30000)
    await page.locator('.module-rail .rail-item').nth(6).click() // diagnostics
    await sleep(650)
    const diag = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.diagnostics-list > div')]
      const read = (needle) => {
        const row = rows.find((r) => r.querySelector('dt')?.textContent?.includes(needle))
        return row ? row.querySelector('.diag-val, dd')?.textContent?.trim() : null
      }
      return { p95: read('P95'), avg: read('Avg') ?? read('平均'), frameAge: rows[0]?.querySelector('dd')?.textContent?.trim() }
    })
    report.engineLoad = { p95FrameMs: diag.p95, avgFrameMs: diag.avg, frameAge: diag.frameAge, sampledAfterMs: 30000 }
    loadNote += `p95 ${diag.p95} / avg ${diag.avg} (frame-age: ${diag.frameAge})`
  } catch (err) {
    report.engineLoad = { error: err.message.split('\n')[0] }
    loadNote += `skipped (${err.message.split('\n')[0]})`
  }
  console.log(loadNote)

  // ② 30min heap curve: one sample every 30s. The point is the slope, not the
  // level — R156-S4's gate idea was growth <10% over the window.
  const heap = []
  for (let i = 0; i < 60; i++) {
    const mb = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null)).catch(() => null)
    heap.push({ atMin: (i * 0.5).toFixed(1), mb: mb == null ? null : Math.round(mb * 10) / 10 })
    if (i % 8 === 0) console.log(`heap  ${heap[heap.length - 1].atMin}min  ${heap[heap.length - 1].mb}MB`)
    if (i < 59) await sleep(30000)
  }
  const vals = heap.map((h) => h.mb).filter((v) => v != null)
  report.heapCurve = { samples: heap, first: vals[0], last: vals[vals.length - 1], growthPct: vals[0] ? Math.round(((vals[vals.length - 1] - vals[0]) / vals[0]) * 1000) / 10 : null }
  console.log(`heap  curve ${report.heapCurve.first}MB → ${report.heapCurve.last}MB (${report.heapCurve.growthPct}%)`)

  // ③ Interaction pulse: tab cycling every 2s + slider nudges, console and
  // pageerror watched throughout (counter diff is reported by the summary).
  const beforeConsole = consoleIssues.length
  const beforeErrors = pageErrors.length
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < VIEWS.length; i++) {
      await page.locator('.module-rail .rail-item').nth(i).click()
      await sleep(2000)
    }
  }
  // Slider nudges on the effects view (keyboard — the a11y-legal path).
  try {
    await page.locator('.module-rail .rail-item').nth(2).click()
    await sleep(650)
    const slider = page.locator('input[type="range"]').first()
    await slider.focus()
    for (let k = 0; k < 8; k++) { await slider.press('ArrowRight'); await sleep(250) }
  } catch {}
  report.interactionPulse = {
    tabSwitches: 45, sliderNudges: 8,
    newConsoleIssues: consoleIssues.length - beforeConsole,
    newPageErrors: pageErrors.length - beforeErrors,
  }
  console.log(`pulse 45 tab switches + 8 slider nudges → +${report.interactionPulse.newConsoleIssues} console, +${report.interactionPulse.newPageErrors} pageerror`)
}

writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
console.log(`\nreport → ${OUT_JSON} (Apple reference lines: first-frame 400ms / hang 250ms / fps 60)`)

await browser.close()
process.exit(0)
