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
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { evaluate } from '../tests/vision/replay-harness.mjs'

const VIDEOS = 'testdata/vision/videos'
const FIXTURES = 'testdata/vision/fixtures'

const hasVideos = existsSync(VIDEOS) && (
  readdirSync(VIDEOS).some((f) => /\.(mp4|webm|mov|avi)$/i.test(f)) ||
  (existsSync(`${VIDEOS}/downloaded`) && readdirSync(`${VIDEOS}/downloaded`).some((f) => /\.(mp4|webm|mov|avi)$/i.test(f))))
if (!hasVideos) {
  console.log(`no videos in ${VIDEOS}/ yet — fetch some online (yarn vision:fetch) or record gesture clips (protocol: 校准三步 → 手势段), then:\n  yarn vision:extract testdata/vision/videos/<clip>.webm --auto`)
  process.exit(0)
}

let failures = 0
// R226.9: videos live in the root dir AND the fetcher's downloaded/ subdir
const videoFiles = [
  ...readdirSync(VIDEOS).filter((x) => /\.(mp4|webm|mov|avi)$/i.test(x)).map((f) => resolve(VIDEOS, f)),
  ...(existsSync(`${VIDEOS}/downloaded`)
    ? readdirSync(`${VIDEOS}/downloaded`).filter((x) => /\.(mp4|webm|mov|avi)$/i.test(x)).map((f) => resolve(VIDEOS, 'downloaded', f))
    : []),
].sort()
for (const videoPath of videoFiles) {
  const f = basename(videoPath)
  const base = resolve(FIXTURES, f.replace(/\.[^.]+$/, ''))
  if (!existsSync(`${base}.jsonl`)) {
    console.log(`\n== extracting ${f} (real MediaPipe) ==`)
    const r = spawnSync('node_modules/electron/dist/electron.exe', [
      'tools/vision-dataset/main.cjs', '--', '--src', videoPath, '--out', FIXTURES, '--auto',
    ], { stdio: 'inherit' })
    if (r.status !== 0 || !existsSync(`${base}.jsonl`)) { console.error(`extract failed for ${f}`); failures++; continue }
  }

  const labelsPath = `${base}.labels.json`
  const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : null
  if (labels && (labels.marks?.length ?? 0) > 0) {
    // R226.4 tier — recorded with the calibration protocol, full replay gating
    console.log(`\n== replay ${basename(base)} ==`)
    const res = evaluate(base)
    console.table(res.metrics.gestures.map((g) => ({
      gesture: g.name, windows: g.windows, hits: g.hits,
      recall: g.recall.toFixed(2), latencyP50: g.latencyP50, latencyP95: g.latencyP95,
    })))
    console.log(`overall recall=${res.metrics.recall.toFixed(2)} falseFires=${res.metrics.falseFires} activeFrom=${res.run.activeFrom}ms`)
    if (res.ok) console.log('PASS')
    else { console.error(`FAIL — ${res.failures.join('; ')}`); failures++ }
  } else {
    // R226.9 tier — downloaded videos (no calibration protocol / no marks):
    // detection-level gating on the extracted landmarks. An optional
    // <name>.labels.json with { detect: <0..1> } overrides the gate — used to
    // keep documented hard-negatives (tiny/distant hands) in the corpus.
    const res = detectionStats(`${base}.jsonl`)
    const detectGate = labels?.detect ?? 0.25
    console.log(`\n== detection ${basename(base)} ==`)
    console.log(`frames=${res.frames} handsRate=${(res.handsRate * 100).toFixed(0)}% avgScore=${res.avgScore.toFixed(2)} twoHands=${(res.twoHandsRate * 100).toFixed(0)}%`)
    if (res.handsRate >= detectGate) console.log(`PASS (handsRate ≥ ${(detectGate * 100).toFixed(0)}%)`)
    else { console.error(`FAIL — handsRate < ${(detectGate * 100).toFixed(0)}%: 不是手部视频/模型退化？`); failures++ }
  }
}

/** R226.9: detection-level metrics over an extracted fixture (no session). */
function detectionStats (jsonl) {
  const lines = readFileSync(jsonl, 'utf8').split(/\r?\n/).filter(Boolean)
  let frames = 0, withHands = 0, two = 0, scoreSum = 0, scoreN = 0
  for (const line of lines) {
    const f = JSON.parse(line)
    frames++
    const n = f.hands?.length ?? 0
    if (n > 0) { withHands++; scoreSum += f.hands.reduce((s, h) => s + (h.score ?? 0), 0); scoreN += n }
    if (n >= 2) two++
  }
  return { frames, handsRate: frames ? withHands / frames : 0, avgScore: scoreN ? scoreSum / scoreN : 0, twoHandsRate: frames ? two / frames : 0 }
}
console.log(failures === 0 ? '\nvision smoke: ALL PASS' : `\nvision smoke: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
