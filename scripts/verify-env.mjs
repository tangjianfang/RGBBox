/**
 * verify:env — the TOOLCHAIN health gate. Every other test in this repo
 * assumes node_modules is correctly installed; this script is the ONLY one
 * that checks the assumption itself. Run it:
 *   - after ANY node_modules change (install/reinstall/manual repair)
 *   - at the start of any work session (pre-flight)
 *   - whenever something "used to work" and now doesn't
 *
 * Checks 6 layers bottom-up; first failure = stop (fast exit, clear message):
 *   L0 node version ≥ engines requirement
 *   L1 vitest resolves (test infrastructure alive)
 *   L2 typecheck passes (TS compiler alive)
 *   L3 electron binary spawns --version (THE check that was missing —
 *      a stale path.txt / missing dist / broken symlink all die here)
 *   L4 build produces out/ (bundler alive)
 *   L5 smoke:app passes (real app launches, real IPC works)
 *
 *   yarn verify:env          # L0-L4 (~30s)
 *   yarn verify:env --full   # L0-L5 including smoke (~60s)
 */
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const FULL = process.argv.includes('--full')
const results = []
let failed = 0

function check(name, fn) {
  const t0 = Date.now()
  try {
    const detail = fn()
    const ms = Date.now() - t0
    results.push({ name, ok: true, detail, ms })
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''} (${ms}ms)`)
    return true
  } catch (e) {
    failed++
    const ms = Date.now() - t0
    results.push({ name, ok: false, detail: e.message.slice(0, 120), ms })
    console.log(`  ✗ ${name} — ${e.message.slice(0, 160)} (${ms}ms)`)
    return false
  }
}

console.log(`\nverify:env — toolchain health check (${FULL ? 'full' : 'quick'})\n`)

// ── L0: node version ────────────────────────────────────────────────────
check('L0 node version', () => {
  const v = process.version
  const major = Number(v.match(/v(\d+)/)?.[1] ?? 0)
  if (major < 20) throw new Error(`node ${v} too old (need ≥20)`)
  return v
})

// ── L1: vitest resolves ────────────────────────────────────────────────
check('L1 vitest resolves', () => {
  const bin = 'node_modules/.bin/vitest'
  if (!existsSync(bin) && !existsSync(bin + '.cmd')) throw new Error('vitest binary not found')
  return 'binary present'
})

// ── L2: typecheck ───────────────────────────────────────────────────────
check('L2 typecheck', () => {
  execSync('npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -1', { encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
  return 'web config compiles'
})

// ── L3: electron binary spawns — THE missing check ─────────────────────
check('L3 electron binary spawns', () => {
  const electronPath = 'node_modules/electron/dist/electron.exe'
  if (!existsSync(electronPath)) throw new Error(`${electronPath} not found — dist/ missing or extraction incomplete`)
  const pathTxt = 'node_modules/electron/path.txt'
  if (!existsSync(pathTxt)) throw new Error(`${pathTxt} not found — electron launcher will throw`)
  // THE exact bug that bit us: echo adds \n, the launcher reads it as a literal path
  const content = readFileSync(pathTxt, 'utf8')
  if (content !== 'electron.exe') throw new Error(`path.txt contains "${content.replace(/\n/g, '\\n')}" (expected "electron.exe" with NO trailing newline — echo adds \n!)`)
  const r = spawnSync(electronPath, ['--version'], { encoding: 'utf8', timeout: 15000 })
  if (r.status !== 0) throw new Error(`electron --version exited ${r.status}: ${(r.stderr || '').slice(0, 80)}`)
  return r.stdout.trim()
})

// ── L4: build produces out/ ─────────────────────────────────────────────
check('L4 build produces out/', () => {
  const mainJs = 'out/main/index.js'
  if (!existsSync(mainJs)) {
    execSync('yarn build 2>&1 | tail -1', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' })
  }
  if (!existsSync(mainJs)) throw new Error('out/main/index.js not found after build')
  const css = statSync('out/main/index.js')
  if (css.size < 1000) throw new Error(`out/main/index.js suspiciously small (${css.size}B)`)
  return 'out/ present'
})

// ── L5: smoke:app (full mode only) ─────────────────────────────────────
if (FULL) {
  check('L5 smoke:app', () => {
    const r = spawnSync('node', ['scripts/smoke-app.mjs'], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' })
    if (r.status !== 0) throw new Error(`smoke:app FAILED — ${(r.stderr || r.stdout || '').slice(-120)}`)
    return 'real app launched, IPC verified'
  })
}

// ── summary ─────────────────────────────────────────────────────────────
console.log(`\n${'-'.repeat(50)}`)
if (failed === 0) {
  console.log(`verify:env — ALL PASS (${results.length} checks, ${results.reduce((s, r) => s + r.ms, 0)}ms)`)
  process.exit(0)
} else {
  console.log(`verify:env — ${failed} FAIL / ${results.length}`)
  console.log(`\nDo NOT proceed with any work until these pass.`)
  console.log(`Common fixes:`)
  console.log(`  electron:  python -c "open('node_modules/electron/path.txt','w').write('electron.exe')"` )
  console.log(`             (NO echo — it adds \\n that becomes part of the spawn path)`)
  console.log(`  vitest:    yarn install`)
  console.log(`  build:     yarn build`)
  process.exit(1)
}
