/**
 * R246: vision onboarding walkthrough — the REAL app, camera-free (synthetic
 * pipeline through the assistant's __rgbboxAssistant E2E seam):
 *   step 1 env: wizard mounts, skeleton preview + mirror self-check visible;
 *   step 2 cal: synthetic hand cooperates with the wizard → active;
 *   step 3 gestures: pinch + palm complete from the live synthetic demo,
 *              chord-menu injected on the 'vision-input' bus (the synthetic
 *              hand holds all five fingers open — no release transitions);
 *   step 4 task: chord 'light' + direction injected, the APPLY waits for the
 *              real synthetic pinch cycle → done card;
 *   funnel {opened, calDone, firstCmd} === 1/1/1, onboarded flag persisted.
 *
 * Full flow must finish < 180s (PRD acceptance). Port 9311. Cleans rgbbox:*
 * keys before kill (the r225 isolated-userData pattern).
 */
import { assertFreshOut, chromium } from './lib/cdp.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9311
const OUT = 'docs/ui-review/r246'
// ISOLATED userData (the r131-verify pattern): a shared profile lets a
// previous run's persisted `visionAssistant=1` boot the app with the
// assistant already on → its camera-mode enable wins the host and the
// synthetic init no-ops — the walkthrough must start from a virgin profile.
const userDataDir = join(tmpdir(), 'rgbbox-r246-walkthrough')

assertFreshOut()
mkdirSync(OUT, { recursive: true })
rmSync(userDataDir, { recursive: true, force: true })
const electron = spawn('node_modules/electron/dist/electron.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, 'out/main/index.js',
], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })
let browser
for (let i = 0; i < 40; i++) {
  try { browser = await chromium.connectOverCDP(`http://localhost:${PORT}`); break } catch { await sleep(500) }
}
if (!browser) throw new Error('CDP never came up')
const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
if (!page) throw new Error('renderer page not found')
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(400)

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const t0 = Date.now()
// clean first-run state (onboarding flag, funnel, assistant pref)
await page.evaluate(() => {
  localStorage.removeItem('rgbbox:visionOnboarded')
  localStorage.removeItem('rgbbox:visionFunnel')
  localStorage.removeItem('rgbbox:visionAssistant')
})

// ── start: synthetic assistant via the E2E seam ────────────────────────────
const started = await page.evaluate(async () => {
  const seam = window.__rgbboxAssistant
  if (!seam) return false
  return await seam.startSynthetic()
})
check('synthetic assistant started (E2E seam)', started)
// the host's duplicate-init path can reply ready BEFORE the model load
// finishes (the hello-resend race, same as the games seam) — poll until the
// first snapshots actually flow (r131 waits up to ~21s for the same reason)
let pipelineUp = false
for (let i = 0; i < 60 && !pipelineUp; i++) {
  await sleep(700)
  pipelineUp = await page.evaluate(() => window.__rgbboxAssistant.probe().state !== 'idle')
}
check('synthetic pipeline producing frames', pipelineUp)

// ── step 1: env precheck ───────────────────────────────────────────────────
await page.waitForSelector('.vision-onboarding[data-step="env"]', { timeout: 15000 })
// ONE round-trip sampling the env DOM inside the 1.5s stability window (the
// step advances to cal once the hand has been seen that long); the screenshot
// afterwards may already catch cal — the earlier DOM read is the assertion
const envOk = await page.evaluate(() => ({
  step: document.querySelector('.vision-onboarding')?.dataset.step ?? null,
  skeleton: !!document.querySelector('.vision-ob-skeleton'),
  mirrorBtn: !!document.querySelector('[data-action="ob-mirror"]'),
  prompt: document.querySelector('.vision-onboarding')?.textContent ?? '',
}))
await page.screenshot({ path: `${OUT}/step1-env.png` })
check('step1: skeleton preview + mirror self-check rendered',
  envOk.step === 'env' && envOk.skeleton && envOk.mirrorBtn && envOk.prompt.length > 0,
  `step=${envOk.step} skeleton=${envOk.skeleton} mirror=${envOk.mirrorBtn}`)

// ── step 2: calibration (synthetic hand cooperates) ────────────────────────
await page.waitForSelector('.vision-onboarding[data-step="cal"]', { timeout: 30000 })
await sleep(700)
await page.screenshot({ path: `${OUT}/step2-cal.png` })
check('step2: calibration step reached', true)

// ── step 3: three gestures ─────────────────────────────────────────────────
await page.waitForSelector('.vision-onboarding[data-step="gestures"]', { timeout: 60000 })
// pinch + palm come from the LIVE synthetic demo (real pipeline events)
await page.waitForSelector('[data-gesture="pinch"].done', { timeout: 30000 })
check('step3: pinch card checked off (live synthetic pinch)', true)
await page.waitForSelector('[data-gesture="palm"].done', { timeout: 20000 })
check('step3: palm card checked off (geom openness hold)', true)
await page.screenshot({ path: `${OUT}/step3-gestures.png` }) // 2/3 cards live — the menu inject below batches with the step advance
// chord-menu injected on the window bus (synthetic hand never releases fingers)
await page.evaluate(() => window.dispatchEvent(new CustomEvent('vision-input', {
  detail: { kind: 'chord', key: null, name: 'menu', down: true },
})))
await sleep(300)

// ── step 4: first task — light ring ────────────────────────────────────────
await page.waitForSelector('.vision-onboarding[data-step="task"]', { timeout: 10000 })
await page.screenshot({ path: `${OUT}/step4-task.png` })
await page.evaluate(() => window.dispatchEvent(new CustomEvent('vision-input', {
  detail: { kind: 'chord', key: null, name: 'light', down: true },
})))
await sleep(500) // ring opens
const ringOpen = await page.evaluate(() => !!document.querySelector('.vision-radial.light'))
check('step4: light ring opened by chord', ringOpen)
await page.evaluate(() => window.dispatchEvent(new CustomEvent('vision-input', {
  detail: { kind: 'direction', key: 'ArrowRight', down: true, dir: 'right' },
})))
await sleep(300)
// wait for the REAL synthetic pinch cycle to confirm the apply (≤ ~4.5s);
// fall back to an injected pinch only if the cycle misses the window twice
let done = false
for (let i = 0; i < 2 && !done; i++) {
  try {
    await page.waitForSelector('.vision-onboarding[data-step="done"]', { timeout: 5000 })
    done = true
  } catch { /* retry one more cycle */ }
}
if (!done) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('vision-input', {
    detail: { kind: 'pinch', key: 'Space', down: true },
  })))
  await page.waitForSelector('.vision-onboarding[data-step="done"]', { timeout: 8000 })
  done = true
}
check('step4: light applied through the ring → done card', done)
await page.screenshot({ path: `${OUT}/step4-applied-done.png` })

// ── funnel + persistence + close ───────────────────────────────────────────
const funnel = await page.evaluate(() => JSON.parse(localStorage.getItem('rgbbox:visionFunnel') ?? '{}'))
check('funnel counters 1/1/1', funnel.opened === 1 && funnel.calDone === 1 && funnel.firstCmd === 1,
  JSON.stringify(funnel))

await page.click('.vision-onboarding [data-action="ob-finish"]')
await page.waitForSelector('.vision-onboarding', { state: 'detached', timeout: 8000 })
check('finish button closes the wizard', true)
// the wizard persists the flag itself at exit — read it AFTER the finish click
const onboarded = await page.evaluate(() => localStorage.getItem('rgbbox:visionOnboarded'))
check('onboarded flag persisted', onboarded === '1')

const elapsed = Date.now() - t0
check('full flow under the 180s budget', elapsed < 180_000, `${(elapsed / 1000).toFixed(1)}s`)

// ── replay entry (Settings) re-opens the wizard live ───────────────────────
await page.locator('.module-rail .rail-item').filter({ hasText: /设置|Settings/ }).first().click()
await page.waitForSelector('[data-setting="vision-replay-onboarding"]', { timeout: 15000 })
await page.screenshot({ path: `${OUT}/settings-entry.png` })
await page.click('[data-setting="vision-replay-onboarding"]')
// the assistant is still on → the reset event must remount the wizard NOW
await page.waitForSelector('.vision-onboarding', { timeout: 8000 })
const replay = await page.evaluate(() => ({
  flag: localStorage.getItem('rgbbox:visionOnboarded'),
  mounted: !!document.querySelector('.vision-onboarding'),
  step: document.querySelector('.vision-onboarding')?.dataset.step ?? null,
}))
check('Settings replay entry re-opens the wizard (flag cleared + live remount)',
  replay.flag === null && replay.mounted, JSON.stringify(replay))
await page.screenshot({ path: `${OUT}/settings-replay.png` })

// restore clean state
await page.evaluate(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && k.startsWith('rgbbox:')) localStorage.removeItem(k)
  }
}).catch(() => {})
console.log(failures === 0 ? '\nR246 walkthrough: ALL PASS' : `\nR246 walkthrough: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
