/**
 * dist-archive7z — R95: high-ratio 7z archive of the packaged win-unpacked
 * directory (7-Zip LZMA2, -mx=9). Run after a package build:
 *   yarn dist:win && yarn dist:7z
 * Produces release/RGBBox-<version>-win.7z next to the electron-builder zip.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')).version
const src = join(root, 'release', 'win-unpacked')
const out = join(root, 'release', `RGBBox-${version}-win.7z`)
const SEVEN_ZIP = 'C:\\Program Files\\7-Zip\\7z.exe'

if (!existsSync(src)) {
  console.error(`[dist:7z] ${src} not found — run a package build first (yarn dist:win)`)
  process.exit(1)
}
if (!existsSync(SEVEN_ZIP)) {
  console.error(`[dist:7z] 7-Zip not found at ${SEVEN_ZIP}`)
  process.exit(1)
}

console.log(`[dist:7z] ${src} -> ${out}`)
// a=archive, -t7z LZMA2, -mx=9 ultra, -mmt multithread, -xr!$PLUGINSDIR none expected
execFileSync(SEVEN_ZIP, ['a', '-t7z', out, 'win-unpacked/*', '-mx=9', '-mmt=8'], {
  cwd: join(root, 'release'),
  stdio: 'inherit',
})
console.log('[dist:7z] done')
