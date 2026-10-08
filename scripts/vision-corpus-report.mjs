/**
 * R226.10: corpus coverage report — how close the real-data corpus is to the
 * 100% matrix defined in tests/vision/fixtures-replay/corpus.matrix.json.
 *
 *   yarn vision:corpus
 *
 * Samples are counted from every replay fixture's labels sidecar:
 *   - marks[].gesture     → vocabulary cells (pinch / dir-* / …)
 *   - labels.tags[]       → condition + enginePath cells (dim / lost / sens-* / …)
 *   - detection-tier clips (no marks) count toward the `normal` condition only.
 * NOT a CI gate — the corpus grows recording-session by recording-session;
 * this report is the to-do list for the next session.
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const MATRIX = JSON.parse(readFileSync(new URL('../tests/vision/fixtures-replay/corpus.matrix.json', import.meta.url), 'utf8'))
const DIRS = [
  // committed replay fixtures (CI-visible corpus)
  new URL('../tests/vision/fixtures-replay/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  // local downloaded/extracted fixtures (detection tier)
  'testdata/vision/fixtures',
]

const samples = new Map() // cell id -> { n, sources[] }
const bump = (id, src) => {
  const cell = samples.get(id) ?? { n: 0, sources: [] }
  cell.n++
  if (cell.sources.length < 3) cell.sources.push(src)
  samples.set(id, cell)
}

for (const dir of DIRS) {
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.labels.json'))) {
    const labels = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    const src = basename(f).replace('.labels.json', '')
    for (const m of labels.marks ?? []) bump(m.gesture, src)
    for (const tag of labels.tags ?? []) {
      bump(tag, src)
      if (tag.startsWith('hand:')) bump('hand-varieties', src)
    }
    if (!labels.marks?.length) bump('normal', src) // detection-tier clip
    if (labels.marks?.length) bump('calibration', src) // protocol clip ⇒ wizard path
    if (labels.profile) bump(`sens-${labels.profile}`, src)
  }
  // markless detection clips (no labels sidecar at all) count toward `normal`
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    if (!existsSync(join(dir, f.replace(/\.jsonl$/, '.labels.json')))) bump('normal', f.replace(/\.jsonl$/, ''))
  }
}

let rows = []
let covered = 0, total = 0
for (const group of ['vocabulary', 'conditions', 'enginePaths']) {
  for (const cell of MATRIX[group]) {
    total++
    const s = samples.get(cell.id)
    const ok = (s?.n ?? 0) >= cell.min
    if (ok) covered++
    rows.push({ group, id: cell.id, min: cell.min, have: s?.n ?? 0, ok, note: cell.note ?? '', from: (s?.sources ?? []).join(',') })
  }
}

const pct = (covered / total * 100).toFixed(0)
console.log(`\ncorpus coverage: ${covered}/${total} cells (${pct}%) — target 100%`)
const missing = rows.filter((r) => !r.ok)
if (missing.length) {
  console.log(`\nmissing / insufficient (next recording session to-do, ${missing.length}):`)
  for (const r of missing) {
    console.log(`  [${r.group}] ${r.id}: have ${r.have}/${r.min}${r.note ? ` — ${r.note}` : ''}`)
  }
  console.log(`
recording protocol per clip: 校准三步（居中→八向→捏合）→ 手势段（按键 1-9 打标注）
  yarn vision:extract testdata/vision/videos/<clip>.webm     # 交互标注
  yarn vision:extract testdata/vision/videos/<clip>.webm --auto && # 或先抽后补 tags/marks
labels sidecar fields: marks[].gesture / tags[]（dim|backlight|far|close|fast|exit-enter|two-person|left-hand|hand:<name>|lost|precision） / profile（standard|sport|relax）`)
} else {
  console.log('\nALL CELLS COVERED — corpus at 100% of the matrix.')
}
console.log(`\n${'-'.repeat(60)}`)
for (const r of rows.filter((r) => r.ok)) console.log(`  ✓ [${r.group}] ${r.id} ${r.have}/${r.min}`)
