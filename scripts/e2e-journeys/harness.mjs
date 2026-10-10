/**
 * R238 / TASK-UNIVERSE F11: journey harness — one CDP-driven RGBBox instance
 * per run, ISOLATED userData (the R225 lesson: journeys act on the app, they
 * must never touch the developer's real profile), a tiny assert/report
 * library, and every journey registered in one list the runner executes.
 *
 *   node scripts/e2e-journeys/run.mjs [journeyId ...]     # default: all
 */
import { chromium, launchElectron, connectRenderer } from '../lib/cdp.mjs'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9301

/** isolated app instance — journeys MUST go through this, never bare launchElectron */
export async function withApp(fn) {
  const udd = join(tmpdir(), `rgbbox-journey-${Date.now()}`)
  rmSync(udd, { recursive: true, force: true })
  mkdirSync(udd, { recursive: true })
  // launchElectron (cdp.mjs) has no udd passthrough — spawn our own for isolation
  const { spawn } = await import('node:child_process')
  const electron = spawn('node_modules/electron/dist/electron.exe',
    [`--remote-debugging-port=${PORT}`, '--user-data-dir=' + udd, 'out/main/index.js'],
    { stdio: 'ignore' })
  process.on('exit', () => { try { electron.kill() } catch {} })
  try {
    let page = null
    for (let i = 0; i < 40 && !page; i++) {
      try {
        const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
        page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
        if (!page) { await sleep(500); page = null }
      } catch { await sleep(500) }
    }
    if (!page) throw new Error('journey app never came up')
    await page.waitForSelector('.module-rail', { timeout: 15000 })
    const cleanup = async () => {
      try { electron.kill() } catch { /* already gone */ }
      await sleep(800) // let the OS release userData file locks (EPERM otherwise)
      try { rmSync(udd, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }) }
      catch { /* best-effort: it's a temp dir, the OS cleans it */ }
    }
    return { page, cleanup }
  } catch (e) { try { electron.kill() } catch {} try { rmSync(udd, { recursive: true, force: true }) } catch {} throw e }
}

export { sleep }

// ── assert/report ───────────────────────────────────────────────────────────
export const results = []
export function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) process.exitCode = 1
}
export function summary() {
  const fail = results.filter((r) => !r.ok).length
  console.log(fail === 0 ? `\njourneys: ALL PASS (${results.length} checks)` : `\njourneys: ${fail} FAIL / ${results.length}`)
  return fail === 0
}
