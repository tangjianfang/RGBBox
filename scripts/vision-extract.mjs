/**
 * R226.3: extract a replay fixture from a recorded gesture video —
 * plays it through the REAL vendored MediaPipe in the tools window.
 *
 *   yarn vision:extract <video> [--gestures pinch,dir-up,...] [--auto] [--out dir]
 *
 * Default gestures cover the core vocabulary keys 1-9 (interactive marking).
 * Videos stay out of git (testdata/vision/videos); fixtures land next to the
 * committed ones by default.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const video = argv.find((a) => !a.startsWith('--'))
if (!video) {
  console.error('usage: yarn vision:extract <video> [--gestures pinch,dir-up,dir-right,...] [--auto] [--out testdata/vision/fixtures]')
  process.exit(1)
}
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : dflt
}
const gestures = flag('gestures', 'pinch,dir-right,dir-up-right,dir-up,dir-up-left,dir-left,dir-down-left,dir-down,dir-down-right')
const out = resolve(flag('out', 'testdata/vision/fixtures'))
const auto = argv.includes('--auto') ? '--auto' : ''

const r = spawnSync('node_modules/electron/dist/electron.exe', [
  'tools/vision-dataset/main.cjs', '--',
  '--src', resolve(video), '--out', out, '--gestures', gestures, auto,
].filter(Boolean), { stdio: 'inherit' })
process.exit(r.status ?? 1)
