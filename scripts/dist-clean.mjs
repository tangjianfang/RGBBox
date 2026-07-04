#!/usr/bin/env node
/**
 * scripts/dist-clean.mjs
 *
 * Force-remove the `release/` directory before packaging.
 *
 * Why this exists:
 *   electron-builder calls EnsureEmptyDir on release/win-unpacked before writing
 *   app.asar. On Windows that file handle is often transiently held by Windows
 *   Defender / Search Indexer / a leftover RGBBox.exe from a previous run; the
 *   delete then fails with ERROR_SHARING_VIOLATION (Win32 32) and the build
 *   aborts partway.
 *
 * Behavior:
 *   - On Windows, first tries `cmd /c rd /s /q` which bypasses Node file-handle
 *     locking issues (e.g., VS Code watcher holding app.asar from previous run).
 *   - Falls back to fs.rmSync(..., { recursive: true, force: true }).
 *   - On EBUSY / EPERM / ENOTEMPTY, sleeps `delayMs` and retries, up to `tries`.
 *   - Logs each retry; prints a single hint at the end if the directory is still
 *     locked (target the user, not the build process).
 *
 * CLI:
 *   node scripts/dist-clean.mjs [--tries 12] [--delay 4000] [--target release]
 *
 * Defaults: 12 tries × 4 s = up to 48 s of retries, which is long enough to outlast
 * a Defender full-content scan cycle on app.asar (~80 MB) but short enough to
 * keep yarn dist:win predictable.
 */
import { rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

function parseArgs(argv) {
  const args = { tries: 12, delay: 4000, target: 'release' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tries') args.tries = Number(argv[++i])
    else if (a === '--delay') args.delay = Number(argv[++i])
    else if (a === '--target') args.target = String(argv[++i])
  }
  return args
}

const { tries, delay, target } = parseArgs(process.argv.slice(2))
const dir = resolve(process.cwd(), target)

if (!existsSync(dir)) {
  console.log(`[dist-clean] ${target}/ not present; nothing to remove.`)
  process.exit(0)
}

// On Windows, try cmd /c rd /s /q first — it can bypass handles held by the
// VS Code file watcher or Windows Defender that block Node's fs.rmSync.
if (process.platform === 'win32') {
  try {
    execSync(`cmd /c rd /s /q "${dir}"`, { stdio: 'pipe' })
    if (!existsSync(dir)) {
      console.log(`[dist-clean] removed ${target}/ via cmd rd on attempt 1/${tries}.`)
      process.exit(0)
    }
  } catch {
    // fall through to the retry loop below
  }
}

for (let attempt = 1; attempt <= tries; attempt++) {
  try {
    rmSync(dir, { recursive: true, force: true })
    if (!existsSync(dir)) {
      console.log(`[dist-clean] removed ${target}/ on attempt ${attempt}/${tries}.`)
      process.exit(0)
    }
  } catch (err) {
    const code = err && (err.code || err.errno)
    const retryable = code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
    if (!retryable) {
      console.error(`[dist-clean] non-retryable error (${code}): ${err.message}`)
      process.exit(1)
    }
    if (attempt === tries) {
      console.error(
        `[dist-clean] ${target}/ still locked after ${tries} tries ` +
          `(last error: ${code} ${err.message}).\n` +
          `Hint: close any Explorer window open on ${target}, exit any running ` +
          `RGBBox.exe, or wait ~30s for Defender to finish scanning the prior ` +
          `app.asar before retrying.`,
      )
      process.exit(1)
    }
    console.log(
      `[dist-clean] attempt ${attempt}/${tries} failed (${code}); retrying in ${delay}ms.`,
    )
    await new Promise((r) => setTimeout(r, delay))
  }
}
