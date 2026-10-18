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
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const PORT = 9281
const BASELINE = 'docs/ui-baseline' // trusted, git-tracked (T3: never silently overwritten)
const CURRENT = 'docs/ui-baseline/current' // gitignored re-run output
const DIFFDIR = 'docs/ui-baseline/diff' // gitignored diff images
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai']

// Per-view diff-rate limits as a *fraction of pixels* allowed to differ.
// Default 0.1%. R163.3: the former workspace/video 0.2% exceptions are
// RETIRED — the volatile-text mask (device-name async fill) plus the
// display-map settle land both views back under the default 0.1% line.
// (Record threshold changes here AND in the PRD.)
const DIFF_LIMITS = {
  _default: 0.001,
  // R287: diagnostics 是活数据仪表盘——时延值/条宽(引擎实测 ms 的函数)、
  // 进程 PID/CPU%(每次启动必变)、CPU 表行数(子进程增减→下方面板整体位移,
  // 视口内外漂移,union rect 也无法稳定覆盖)。R285 前 0.1682%、R287 期
  // 0.118-0.139% 三案同族。0.1%→0.35% 放宽:布局真回归(元素错位/溢出)
  // 通常 >>1%,该余量只容纳活数据抖动,不掩真伤。时延条/CPU 面板已尽量
  // volatile 遮罩,放宽只兜遮不住的残余。
  diagnostics: 0.0035,
}

// Canvas rects recorded at capture time (*.boxes.json) are zeroed in BOTH
// images before matching. Canvases are the "stage" (R148.2): effect previews
// / 3D scenes animate with random phase (measured: architecture 0.43% and
// unbounded during demo cuts, effects flips between 0% and 0.79%) — content
// pixels must not gate, UI chrome around them still does (a moved canvas
// leaves non-overlapping rects unmasked on one side → diff fires).
//
// R163.3 (R156-§5.2 A): volatile-TEXT rects join the mask too — the video
// view's device/source names fill in asynchronously (enumerate timing), which
// was the standing 0.0574% noise. Selectors are script-side on purpose
// (zero product-code hooks); extend the list as new volatile regions appear.
// R233: + the workspace header's displays-count metric — it mirrors the async
// topology enumeration (1→2 displays), same race the map panel masks below.
const VOLATILE_TEXT_SELECTORS = ['.video-source-name', '.workspace-header .metric:first-child']
// R233: whole-PANEL activity regions join the mask. The workspace right panel
// (.panel.map-panel: DisplayMap mirrors the host's live display topology,
// linked-display row, VideoWallEditor) and the bottom sampling panel
// (.panel.sampling-panel: live engine metrics — estimated fps/throughput text
// driven by the running engine loop) render host/session-dependent live state.
// Measured vs the R224-era baseline the two panels were the entire 1.46%
// workspace diff (6x6 grid: right column rows 1-4 + bottom rows) while the
// rest of the view was pixel-identical run-to-run. Selectors exist only in
// WorkspaceView (grep-verified), so the other 8 views get zero extra mask.
// R287: diagnostics 活数据入 volatile——①时延条(dd.diag-dd-bar):bar 宽度是
// 引擎实测 ms 的函数,随每次重建确定性平移(R285 前 0.1682%、0.1181% 两案同族);
//②进程 CPU 面板整块(.panel:has(.process-cpu-table)):PID 每启动必变 + CPU% 实时
// 波动 + 行数随 Electron 子进程增减 → 表高变化会把下方崩溃面板整体推移,单遮
// 表格救不了布局移位,须连同崩溃面板(.panel:has(.diag-crash-list,.diag-crash-empty))
// 一起入列,靠 union rect 覆盖两侧最大延展。快照门禁只守布局回归,不守活数据。
const VOLATILE_REGION_SELECTORS = [
  '.panel.map-panel', '.panel.sampling-panel', '.diag-dd-bar',
  '.panel:has(.diag-dd-bar)', // R287: pipeline 面板整块——时延「值文本」在 dd 外围,单遮 bar 不够
  '.panel:has(.process-cpu-table)', '.panel:has(.diag-crash-list)',
  '.panel:has(.diag-crash-empty)',
]
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

/** R233: cluster intersecting rects (±slack) into covering boxes. The union
 * set is applied to BOTH images: a volatile panel may RESIZE run-to-run
 * (workspace map-panel grows ~60px when the async topology enumeration lands
 * before the shot — linked-display-row + VideoWallEditor mount), and masking
 * each side with only its own rect would leave an unmasked rim on the other
 * side (measured 2.32% from a 61px sampling-panel shift). */
function unionRects (rects, slack = 8) {
  const out = rects.map((r) => ({ ...r }))
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]; const b = out[j]
        const overlaps = a.x - slack < b.x + b.w + slack && b.x - slack < a.x + a.w + slack &&
          a.y - slack < b.y + b.h + slack && b.y - slack < a.y + a.h + slack
        if (overlaps) {
          const x0 = Math.min(a.x, b.x); const y0 = Math.min(a.y, b.y)
          out[i] = { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }
          out.splice(j, 1)
          merged = true
        }
      }
    }
  }
  return out
}

const mode = process.argv.includes('--update-baseline') ? 'update' : process.argv.includes('--compare') ? 'compare' : 'capture'

assertFreshOut()
mkdirSync(CURRENT, { recursive: true })
if (mode === 'compare') mkdirSync(DIFFDIR, { recursive: true })

// R281: 隔离 userData——街机档案/效果使用态等用户活动数据不再进入快照
// (两轮漂移事故根因:R225 走查污染 profile、R281 前游戏档案活数据 0.67%)。
const SNAPSHOT_UDD = join(tmpdir(), `rgbbox-snap-${Date.now()}`)
launchElectron({ port: PORT, userDataDir: SNAPSHOT_UDD })
const { page } = await connectRenderer({ port: PORT })

// R222.3(T5): 注入 prefers-reduced-motion:reduce——app.css:8913 已有全局
// 动画灭杀开关但脚本未用,是 workspace 2.72% 假阳性(动画偏相位帧)的根。
// CDP 媒体特性模拟在页面加载前/后均可生效,截图前统一定格动画。
try {
  await page.emulateMedia({ reducedMotion: 'reduce' })
} catch { /* 旧驱动不支持时静默降级(维持旧行为) */ }

// Stable-ish viewport for comparable shots.
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// Persisted UI state → clean boot. E2E runs leave rgbbox:* keys behind
// (visionSensitivity, samplingTab, collapsed panels…) and they shift layouts
// across runs — a workspace diff of 1.14% was traced to exactly this.
// Every rgbbox:/rgbbox- key goes so each capture starts identically.
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
// R306/T19: the one-time first-boot vision hint lives on the dashboard — a
// fresh capture profile is always "first boot", so the card would land in
// every snapshot. Dismiss it once: baselines capture the STEADY state (the
// pre-T19 baselines stay valid, no re-baseline needed).
await page.locator('[data-action="vision-hint-dismiss"]').click({ timeout: 4000 }).catch(() => {})
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
    // R287: diagnostics 的进程 CPU 表行是流式抵达的——rect 抓小了会在
    // 比对时露出未遮罩的行(PID 每启动必变)。沉淀到表满员再截图+抓 rect。
    if (view === 'diagnostics') await sleep(2200)
    await page.screenshot({ path: `${shotDir}/${view}.png` })
    // Canvas rects in viewport coords (DPR-independent: the shot is CSS-sized).
    // Recorded for every view; consumed only where CANVAS_MASK says so.
    // R163.3: volatile-text rects (async-filled device names) ride the same
    // boxes.json. R233: volatile-REGION rects (live panels) ride along too,
    // but kept in a SEPARATE list — canvases mask per-side (a moved canvas
    // still gates) while volatile rects mask by UNION across both sides
    // (live panels may resize/shift run-to-run; see unionRects).
    const boxes = await page.evaluate((selectors) => {
      const rect = (el) => {
        const r = el.getBoundingClientRect()
        return { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.width), h: Math.ceil(r.height) }
      }
      const canvases = [...document.querySelectorAll('canvas')]
        .filter((c) => c.getBoundingClientRect().width > 8 && c.getBoundingClientRect().height > 8)
        .map(rect)
      const volatile = selectors.flatMap((sel) =>
        [...document.querySelectorAll(sel)]
          .filter((el) => el.getBoundingClientRect().width > 4)
          .map(rect)
      )
      return { canvases, volatile }
    }, [...VOLATILE_TEXT_SELECTORS, ...VOLATILE_REGION_SELECTORS])
    writeFileSync(`${shotDir}/${view}.boxes.json`, JSON.stringify(boxes))
    ok++
    console.log(`SHOT  ${view} → ${shotDir}/ (${boxes.canvases.length} canvas + ${boxes.volatile.length} volatile)`)
  } catch (err) {
    console.error(`FAIL  ${view}: ${err.message.split('\n')[0]}`)
  }
}
console.log(`${ok}/${VIEWS.length} views captured into ${shotDir}/`)
if (ok !== VIEWS.length) process.exit(1)
if (mode !== 'compare') {
  // R160.5 (§7.2 stale-baseline lesson): stamp the commit this baseline was
  // shot against. T1's freshness check is relative and only fires on the NEXT
  // run — editing sources after this point silently invalidates the baseline.
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    console.log(`\nBASELINE UPDATED at HEAD ${head} — touch src/ after this and you MUST rebuild + re-run --update-baseline.`)
  } catch { /* git unavailable — the guard line is best-effort */ }
  process.exit(0)
}

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
      const ba = loadBoxes(BASELINE)
      const bb = loadBoxes(CURRENT)
      // R233: canvases mask per-side; volatile text+region rects mask by the
      // UNION of both sides (a resized/shifted live panel must not leave an
      // unmasked rim on the other side).
      const union = unionRects([...ba.volatile, ...bb.volatile])
      maskBoxes(a, [...ba.canvases, ...union])
      maskBoxes(b, [...bb.canvases, ...union])
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
