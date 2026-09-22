/**
 * R148 S0 / R152: visual baseline snapshots + pixelmatch hard gate.
 *
 * Modes:
 *   node scripts/ui-snapshot.mjs                    capture 9 views into current/ (no verdict)
 *   node scripts/ui-snapshot.mjs --compare          capture + diff vs baseline — exit 1 when any
 *                                                   view exceeds its diff-rate limit (the gate)
 *   node scripts/ui-snapshot.mjs --update-baseline  capture straight into the trusted baseline
 *                                                   (explicit; git-tracked docs/ui-baseline/)
 *
 * Freshness: refuses to run against a stale out/ (T1 half-fresh-build accident).
 * Portability: playwright-core is a repo devDependency via scripts/lib/cdp.mjs (T2).
 */
import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const PORT = 9281
const BASELINE = 'docs/ui-baseline' // trusted, git-tracked (T3: never silently overwritten)
const CURRENT = 'docs/ui-baseline/current' // gitignored re-run output
const DIFFDIR = 'docs/ui-baseline/diff' // gitignored diff images
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

// Per-view diff-rate limits as a *fraction of pixels* allowed to differ.
// Default 0.1%. Calibrated exceptions (record raises here AND in PRD R152):
//  - workspace/video 0.2%: cross-launch 1px layout-line jitter (measured
//    0.05–0.12%, e.g. display-map runtime measuring settles ±1px; same-process
//    double-shots are 0.0000% — it is NOT content animation). A real chrome
//    regression dwarfs this (one recolored button ≈ 10k+ px).
const DIFF_LIMITS = {
  _default: 0.001,
  workspace: 0.002,
  video: 0.002,
}

// Canvas rects recorded at capture time (*.boxes.json) are zeroed in BOTH
// images before matching. Canvases are the "stage" (R148.2): effect previews
// / 3D scenes animate with random phase (measured: architecture 0.43% and
// unbounded during demo cuts, effects flips between 0% and 0.79%) — content
// pixels must not gate, UI chrome around them still does (a moved canvas
// leaves non-overlapping rects unmasked on one side → diff fires).
const CANVAS_MASK_ALL = true

/** Zero out canvas rects (±2px edge slack) in a PNG in place. */
function maskBoxes (img, boxes) {
  for (const b of boxes) {
    const x0 = Math.max(0, b.x - 2); const y0 = Math.max(0, b.y - 2)
    const x1 = Math.min(img.width, b.x + b.w + 2); const y1 = Math.min(img.height, b.y + b.h + 2)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4
        img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255
      }
    }
  }
}

const mode = process.argv.includes('--update-baseline') ? 'update' : process.argv.includes('--compare') ? 'compare' : 'capture'

assertFreshOut()
mkdirSync(CURRENT, { recursive: true })
if (mode === 'compare') mkdirSync(DIFFDIR, { recursive: true })

launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })

// Stable-ish viewport for comparable shots.
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// localStorage view persistence → reset to a clean dashboard boot.
await page.evaluate(() => localStorage.removeItem('rgbbox:view')).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700) // boot fan-out + dashboard settle

// Rail order at runtime = ['dashboard', ...CARD_VIEWS] which matches VIEWS
// exactly (model3d filtered out by the compile-time flag). The aria-labels
// are translated text, so index-based clicking is the stable handle.
const shotDir = mode === 'update' ? BASELINE : CURRENT
let ok = 0
for (let i = 0; i < VIEWS.length; i++) {
  const view = VIEWS[i]
  try {
    await page.locator('.module-rail .rail-item').nth(i).click()
    await sleep(650) // lazy chunk fetch + first paint
    await page.screenshot({ path: `${shotDir}/${view}.png` })
    // Canvas rects in viewport coords (DPR-independent: the shot is CSS-sized).
    // Recorded for every view; consumed only where CANVAS_MASK says so.
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')]
        .map((c) => c.getBoundingClientRect())
        .filter((r) => r.width > 8 && r.height > 8)
        .map((r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.width), h: Math.ceil(r.height) }))
    )
    writeFileSync(`${shotDir}/${view}.boxes.json`, JSON.stringify(boxes))
    ok++
    console.log(`SHOT  ${view} → ${shotDir}/ (${boxes.length} canvas)`)
  } catch (err) {
    console.error(`FAIL  ${view}: ${err.message.split('\n')[0]}`)
  }
}
console.log(`${ok}/${VIEWS.length} views captured into ${shotDir}/`)
if (ok !== VIEWS.length) process.exit(1)
if (mode !== 'compare') process.exit(0)

// ── pixelmatch hard gate (R148 S3 batches run this every batch) ─────────────
let gateOk = true
console.log('\nview          diff-rate   limit      verdict')
for (const view of VIEWS) {
  const baseP = `${BASELINE}/${view}.png`
  const curP = `${CURRENT}/${view}.png`
  if (!existsSync(baseP)) {
    console.log(`${view.padEnd(12)}  —           —          MISSING BASELINE (run --update-baseline)`)
    gateOk = false
    continue
  }
  const a = PNG.sync.read(readFileSync(baseP))
  const b = PNG.sync.read(readFileSync(curP))
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${view.padEnd(12)}  —           —          SIZE ${a.width}x${a.height} vs ${b.width}x${b.height}`)
    gateOk = false
    continue
  }
  if (CANVAS_MASK_ALL) {
    const loadBoxes = (dir) => JSON.parse(readFileSync(`${dir}/${view}.boxes.json`, 'utf8'))
    try {
      maskBoxes(a, loadBoxes(BASELINE))
      maskBoxes(b, loadBoxes(CURRENT))
    } catch {
      console.log(`${view.padEnd(12)}  —           —          NO boxes.json (re-capture with --update-baseline)`)
      gateOk = false
      continue
    }
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 })
  const rate = n / (a.width * a.height)
  const limit = DIFF_LIMITS[view] ?? DIFF_LIMITS._default
  const verdict = rate <= limit ? 'ok' : 'OVER LIMIT'
  if (rate > limit) {
    gateOk = false
    writeFileSync(`${DIFFDIR}/${view}.png`, PNG.sync.write(diff))
  } else if (n > 0) {
    // Keep small-noise diffs around too — cheap, and they explain near-misses.
    writeFileSync(`${DIFFDIR}/${view}.png`, PNG.sync.write(diff))
  }
  console.log(`${view.padEnd(12)}  ${(rate * 100).toFixed(4)}%    ${(limit * 100).toFixed(3)}%   ${verdict}${n > 0 ? `  (diff/${DIFFDIR}/${view}.png)` : ''}`)
}
console.log(gateOk ? '\nGATE PASS — all views within limits' : '\nGATE FAIL — see table above')
process.exit(gateOk ? 0 : 1)
