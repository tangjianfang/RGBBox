/**
 * R226.5: video smoke — for every video under testdata/vision/videos/:
 * extract a fixture through the REAL wasm (if missing), replay it through the
 * real SessionController, and print per-gesture recall / latency / false-fire
 * metrics. Exit 1 when any fixture breaches its own gates. This is the
 * "real-machine evidence chain" automated: video → MediaPipe → engine.
 *
 *   yarn vision:smoke          (friendly exit 0 when no videos recorded yet)
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { evaluate } from '../tests/vision/replay-harness.mjs'

const VIDEOS = 'testdata/vision/videos'
const FIXTURES = 'testdata/vision/fixtures'

if (!existsSync(VIDEOS) || readdirSync(VIDEOS).filter((f) => /\.(mp4|webm|mov|avi)$/i.test(f)).length === 0) {
  console.log(`no videos in ${VIDEOS}/ yet — record gesture clips (protocol: 校准三步 → 手势段), then:\n  yarn vision:extract testdata/vision/videos/<clip>.webm --auto`)
  process.exit(0)
}

let failures = 0
for (const f of readdirSync(VIDEOS).filter((x) => /\.(mp4|webm|mov|avi)$/i.test(f)).sort()) {
  const base = resolve(FIXTURES, basename(f).replace(/\.[^.]+$/, ''))
  if (!existsSync(`${base}.jsonl`)) {
    console.log(`\n== extracting ${f} (real MediaPipe) ==`)
    const r = spawnSync('node_modules/electron/dist/electron.exe', [
      'tools/vision-dataset/main.mjs', '--', '--src', resolve(VIDEOS, f), '--out', FIXTURES, '--auto',
    ], { stdio: 'inherit' })
    if (r.status !== 0 || !existsSync(`${base}.jsonl`)) { console.error(`extract failed for ${f}`); failures++; continue }
  }
  console.log(`\n== replay ${basename(base)} ==`)
  const res = evaluate(base)
  console.table(res.metrics.gestures.map((g) => ({
    gesture: g.name, windows: g.windows, hits: g.hits,
    recall: g.recall.toFixed(2), latencyP50: g.latencyP50, latencyP95: g.latencyP95,
  })))
  console.log(`overall recall=${res.metrics.recall.toFixed(2)} falseFires=${res.metrics.falseFires} activeFrom=${res.run.activeFrom}ms`)
  if (res.ok) console.log('PASS')
  else { console.error(`FAIL — ${res.failures.join('; ')}`); failures++ }
}
console.log(failures === 0 ? '\nvision smoke: ALL PASS' : `\nvision smoke: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
