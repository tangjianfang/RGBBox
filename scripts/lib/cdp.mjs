/**
 * R152: shared CDP helpers for scripts/*.mjs — the single place that knows how
 * to reach playwright and how to refuse running against a stale out/ build.
 *
 *  - chromium comes from the repo devDependency (T2: 38 scripts used to hard
 *    code other machines' npm-global / %TEMP% playwright paths and died with
 *    ERR_MODULE_NOT_FOUND everywhere else);
 *  - assertFreshOut() implements the T1 fail-fast: the 2026-09-22 review ran
 *    nine screenshots against a build whose renderer assets were two days old
 *    (main fresh, renderer stale). Never again — snapshot/E2E scripts must
 *    call this before spawning electron.
 *
 * Usage:
 *   import { chromium, assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
 */
import { chromium } from 'playwright-core'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

export { chromium }

/** Newest mtime under `dir` (recursive, file leaves only). 0 when missing. */
function newestMtime (dir) {
  if (!existsSync(dir)) return 0
  let newest = 0
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, ent.name)
      if (ent.isDirectory()) walk(p)
      else {
        const m = statSync(p).mtimeMs
        if (m > newest) newest = m
      }
    }
  }
  walk(dir)
  return newest
}

/** Oldest mtime among files matching `exts` under `dir` (non-recursive). Infinity when none. */
function oldestMtime (dir, exts) {
  if (!existsSync(dir)) return Infinity
  let oldest = Infinity
  for (const f of readdirSync(dir)) {
    if (!exts.some((e) => f.endsWith(e))) continue
    const m = statSync(join(dir, f)).mtimeMs
    if (m < oldest) oldest = m
  }
  return oldest
}

/** Commit time of the last change to sources/build config ('' when git is unusable). */
function lastSourceCommitMs () {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%ci', '--', 'src/', 'electron.vite.config.ts', 'electron.vite.config.mts', 'package.json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    const t = Date.parse(out)
    return Number.isNaN(t) ? 0 : t
  } catch {
    return 0
  }
}

/**
 * T1 fail-fast: out/ must not be older than the sources it claims to build.
 * Reference time = max(last source commit, newest working-tree mtime under
 * src/ + build configs) so uncommitted local edits are covered too.
 */
export function assertFreshOut ({ quiet = false } = {}) {
  const problems = []

  const srcMs = Math.max(
    newestMtime('src'),
    ...['electron.vite.config.ts', 'electron.vite.config.mts', 'package.json']
      .map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0))
  )
  const commitMs = lastSourceCommitMs()
  const refMs = Math.max(srcMs, commitMs)

  const mainMs = statSync('out/main/index.js')?.mtimeMs ?? 0
  if (!mainMs) problems.push('out/main/index.js missing')
  else if (mainMs < refMs) problems.push(`out/main/index.js stale (${new Date(mainMs).toISOString()} < sources ${new Date(refMs).toISOString()})`)

  const cssMs = oldestMtime('out/renderer/assets', ['.css'])
  if (cssMs === Infinity) problems.push('no out/renderer/assets/*.css')
  else if (cssMs < refMs) problems.push(`out/renderer/assets CSS stale (${new Date(cssMs).toISOString()} < sources ${new Date(refMs).toISOString()})`)

  if (problems.length) {
    console.error('STALE BUILD — out/ does not reflect current sources:')
    for (const p of problems) console.error(`  - ${p}`)
    console.error("Run `yarn build` first (T1: reviews/E2E on a half-fresh build are invalid).")
    process.exit(1)
  }
  if (!quiet) console.log('fresh-build check ok (out/main + renderer CSS newer than sources)')
}

/** Spawn the built app with a CDP port. Electron is killed on process exit. */
export function launchElectron ({ port = 9281, entry = 'out/main/index.js' } = {}) {
  const electron = spawn('node_modules/electron/dist/electron.exe', [`--remote-debugging-port=${port}`, entry], { stdio: 'ignore' })
  process.on('exit', () => { try { electron.kill() } catch {} })
  return electron
}

/** Connect over CDP and return the renderer page. Throws after timeoutMs. */
export async function connectRenderer ({ port = 9281, timeoutMs = 20000, urlPart = 'index.html' } = {}) {
  let browser
  for (let i = 0; i < timeoutMs / 500; i++) {
    try { browser = await chromium.connectOverCDP(`http://localhost:${port}`); break } catch { await sleep(500) }
  }
  if (!browser) throw new Error('CDP never came up')
  const page = browser.contexts()[0].pages().find((p) => p.url().includes(urlPart))
  if (!page) throw new Error('renderer page not found')
  return { browser, page }
}
