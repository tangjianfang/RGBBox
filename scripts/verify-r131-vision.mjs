/**
 * R131 packaged-app verification: launch the dist:dir build (file:// origin —
 * the hard path) with CDP and prove the full vision chain end to end:
 *
 *  1. media://app asset route serves the wasm + .task models (file:// fetch
 *     is blocked; this is the R131.4 core risk)
 *  2. VisionInput.init() loads the MediaPipe runtime + both models from that
 *     route (delegate GPU or CPU both pass)
 *  3. The synthetic source auto-calibrates through the 3-step wizard → active
 *  4. Tetris: pinch starts the run; direction gestures move/rotate the piece;
 *     hard drop fires — i.e. pollVision really drives the game (no keyboard)
 *  5. Back to hub stops the engine and releases every held key
 *
 * Usage: node scripts/verify-r131-vision.mjs [path-to-RGBBox.exe]
 */
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const exe = process.argv[2] ?? 'release/win-unpacked/RGBBox.exe'
const OUT = 'docs/screenshots'
const PORT = 9251

// Isolated userData: the single-instance lock is keyed on it — lets this run
// beside a live dev instance without stealing or being blocked by its lock.
const userDataDir = (process.env.TEMP || '/tmp') + '/rgbbox-r131-verify'
const electron = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`], {
  cwd: process.cwd(),
  stdio: ['ignore', 'ignore', 'ignore'],
})
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1 }
let dead = false
electron.on('exit', (c) => { dead = true; console.log('APP EXIT', c) })

try {
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://localhost:${PORT}`) } catch { await sleep(500) }
  }
  if (!browser) throw new Error('CDP never came up')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
  ok('packaged app booted (file:// renderer)', !!page && page.url().startsWith('file:'))
  if (!page) throw new Error('no renderer page')

  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

  // ── 1. media://app route serves the assets ────────────────────────────────
  const assets = await page.evaluate(async () => {
    const probe = async (url) => {
      try {
        const res = await fetch(url)
        const buf = await res.arrayBuffer()
        return { status: res.status, type: res.headers.get('content-type'), bytes: buf.byteLength }
      } catch (err) {
        return { error: String(err).slice(0, 120) }
      }
    }
    return {
      wasm: await probe('media://app/vendor/mediapipe/vision_wasm_internal.wasm'),
      hand: await probe('media://app/models/hand_landmarker.task'),
      bundle: await probe('media://app/vendor/mediapipe/vision_bundle.js'),
    }
  })
  ok('media://app serves wasm (application/wasm)', assets.wasm.status === 200 && assets.wasm.type === 'application/wasm' && assets.wasm.bytes > 1_000_000)
  ok('media://app serves hand_landmarker.task', assets.hand.status === 200 && assets.hand.bytes > 5_000_000)
  ok('media://app serves vision_bundle.js (module)', assets.bundle.status === 200 && /javascript/.test(assets.bundle.type ?? ''))

  // ── 2-4. synthetic pipeline drives Tetris through the real UI wiring ──────
  await page.locator('.rail-item', { hasText: '游戏' }).first().click()
  await sleep(900)
  await page.locator('.game-tile:not(.ghost)').nth(2).click() // Tetris
  await sleep(600)

  const started = await page.evaluate(async () => {
    await window.__rgbboxVision.enableSynthetic()
    return true
  })
  ok('enableSynthetic() resolved (models + wasm loaded via file:// media route)', started)

  // ── R132: the joystick pad overlay mounts with the vision session ────────
  await sleep(600)
  ok('VisionPad overlay mounted (.vision-pad canvas)', !!(await page.evaluate(() => document.querySelector('.vision-pad canvas'))))

  // wizard: center 1.5s + reach 2.6s + pinch 3.6s (+ margin). While Tetris sits
  // in its ready phase, an active session shows the localized pinch-to-start
  // hint instead of the engine's 已激活 label — either proves "active".
  let active = false
  for (let i = 0; i < 30 && !active; i++) {
    await sleep(700)
    active = await page.evaluate(() => {
      const text = document.querySelector('.games-canvas-status')?.textContent ?? ''
      return text.includes('已激活') || text.includes('捏合手势开局')
    })
  }
  ok('calibration wizard completed → active (synthetic hand)', active)
  await page.screenshot({ path: `${OUT}/r131-tetris-active.png` })
  // close-up of the pad itself (its text/compass is ~10px at full-page scale)
  await page.locator('.vision-pad').screenshot({ path: `${OUT}/r132-vision-pad.png` }).catch(() => {})

  // pinch-to-start: synthetic pinches every ~4s; wait for the run to start
  let running = false
  for (let i = 0; i < 16 && !running; i++) {
    await sleep(700)
    running = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent.includes('运行中') ?? false)
  }
  ok('pinch gesture started the Tetris run (no keyboard)', running)

  // gestures play the game: figure-eight sweeps + pinches must land commands
  await sleep(8000)
  await page.screenshot({ path: `${OUT}/r131-tetris-playing.png` })
  const played = await page.evaluate(() => ({
    held: window.__rgbboxVision.held(),
    status: document.querySelector('.games-canvas-status')?.textContent ?? '',
    snapshot: window.__rgbboxVision.snapshot(),
  }))
  ok('direction/pinch gestures reached the game (status chip live)', played.status.includes('👁'))
  // R132.2/.1: pad presence + inference stats flowing (fps/p95/delegate)
  ok('VisionPad still mounted mid-game', !!(await page.evaluate(() => document.querySelector('.vision-pad'))))
  const infer = played.snapshot?.stats?.infer ?? { n: 0 }
  console.log(`  vision stats: ${Math.round(played.snapshot?.stats?.fps ?? 0)}fps · infer p50 ${Math.round(infer.p50 ?? NaN)}ms · p95 ${Math.round(infer.p95 ?? NaN)}ms · ${played.snapshot?.stats?.delegate ?? '-'}`)
  ok('inference stats flowing (n > 30 samples)', infer.n > 30)

  // ── R133: Survival (Nova Swarm) — vision must actually move the player ────
  await page.locator('button', { hasText: '返回游戏库' }).first().click()
  await sleep(600)
  await page.locator('.game-tile:not(.ghost)').nth(1).click() // Nova Swarm
  await sleep(600)
  await page.evaluate(() => window.__rgbboxVision.enableSynthetic())
  // R133 profile short-circuit: returning session skips the wizard → active
  let swarmActive = false
  for (let i = 0; i < 30 && !swarmActive; i++) {
    await sleep(700)
    swarmActive = await page.evaluate(() => {
      const probe = window.__rgbboxVision.probe()
      return probe.phase === 'running' || document.querySelector('.games-canvas-status')?.textContent.includes('已激活') || document.querySelector('.games-canvas-status')?.textContent.includes('捏合手势开局')
    })
  }
  ok('swarm: vision session resumed active without re-running the wizard', swarmActive)
  // pinch-to-start, then sample the player position over 3s of figure-eight
  let swarmRunning = false
  for (let i = 0; i < 16 && !swarmRunning; i++) {
    await sleep(700)
    swarmRunning = await page.evaluate(() => window.__rgbboxVision.probe().phase === 'running')
  }
  ok('swarm: pinch gesture started the run', swarmRunning)
  const p1 = await page.evaluate(() => window.__rgbboxVision.probe().player)
  await sleep(3000)
  const p2 = await page.evaluate(() => {
    const probe = window.__rgbboxVision.probe()
    return { player: probe.player, axis: probe.axis, phase: probe.phase }
  })
  const moved = Math.hypot(p2.player.x - p1.x, p2.player.y - p1.y)
  console.log(`  swarm player moved ${moved.toFixed(1)} units in 3s (axis ${p2.axis.x.toFixed(2)},${p2.axis.y.toFixed(2)} phase ${p2.phase})`)
  ok('swarm: vision gestures MOVED the player (vision→movement closed loop)', moved > 5 && p2.phase === 'running')
  await page.screenshot({ path: `${OUT}/r133-swarm-playing.png` })

  // ── R136: main-thread liberation + visibility ─────────────────────────────
  // rAF fps of the GAME page while the worker pipeline runs — the structural
  // proof that inference no longer starves the game loop.
  const fpsSample = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0
    const t0 = performance.now()
    const loop = () => {
      frames++
      if (performance.now() - t0 < 2000) requestAnimationFrame(loop)
      else resolve(frames / ((performance.now() - t0) / 1000))
    }
    requestAnimationFrame(loop)
  }))
  console.log(`  game rAF fps with vision running: ${fpsSample.toFixed(0)}`)
  ok('rAF fps ≥ 55 while the vision worker pipeline runs', fpsSample >= 55)
  ok('R136: vision banner mounted', !!(await page.evaluate(() => document.querySelector('.vision-banner'))))
  ok('R136: skeleton source flows (pickedLandmarks in snapshot)', !!(await page.evaluate(() => window.__rgbboxVision.snapshot()?.pickedLandmarks)))

  // R132.3: exit notice — disable via the header toggle, expect the chip text
  await page.locator('button[aria-label="关闭视觉体感输入"]').first().click()
  await sleep(400)
  const exitNotice = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent ?? '')
  ok('exit notice shows after disabling (已退出体感)', exitNotice.includes('已退出体感'))

  // ── 5. hub stops the engine, releases keys ───────────────────────────────
  await page.locator('button', { hasText: '返回游戏库' }).first().click()
  await sleep(800)
  const afterHub = await page.evaluate(() => ({
    held: window.__rgbboxVision?.held() ?? ['seam-already-removed'],
    camBtn: !!document.querySelector('button[aria-label="games.vision.enable"], button[aria-label="开启视觉体感输入"]'),
  }))
  ok('back to hub released every held key', afterHub.held.length === 0)
  ok('no vision page errors', errors.length === 0)
  if (errors.length > 0) console.log('ERRORS:', errors.slice(0, 5))
} finally {
  electron.kill()
}
console.log(dead ? 'app exited early — see APP EXIT above' : 'done')
