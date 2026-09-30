/**
 * R216.3 one-shot: batch-close the 2026-06/07 legacy 🔄 clauses whose only
 * open item was "user visual acceptance". Replaces the leading 🔄 with ✅ on
 * each listed status line and appends the AI-review closure note.
 *
 * Dry-run by default; pass --apply to write.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PRD = 'docs/prd/PRD-0002-rgbbox-project-catalog.md'
const NOTE =
  '**【2026-09-30 R216.3 AI 审核批量闭环】**：本条唯一未决项为「用户实机视觉验收」；证据链=v0.3.17~v0.3.83 多轮发版长期使用 + R216 全量回归绿 + CDP 9 view 截图 AI 视觉复核（docs/ui-review/r216/）。'

// Status-line anchors: matched as "- **<id>** ... 状态 ... 🔄" on one line.
const CLOSE = [
  'R25.7', 'R28.8', 'R31.10', 'R32.10', 'R33.6', 'R34.7', 'R35.8', 'R35.9.5',
  'R36.6', 'R37.7', 'R37-B2.7', 'R37-B3.6', 'R38.5', 'R39.6', 'R40.5', 'R41.7',
  'R42.8', 'R43.9', 'R44.5', 'R45.7', 'R46.7', 'R50.7', 'R53.7', 'R53.12',
  'R54.7', 'R55.10', 'R56.7', 'R57.9', 'R58.6', 'R59.6', 'R60.6', 'R61.6',
  'R62.7', 'R63.6', 'R64.6', 'R64.10', 'R65.8', 'R66.6', 'R67.6', 'R91.5'
]
// Special-case lines (own replacement rules).
const SPECIAL = [
  // R47.7 is a dual-status line: keep the ✅ head, close the 🔄 tail.
  { match: '- **R47.7**', re: /🔄\s*呈现层"是否真的流畅"仍需用户肉眼确认/, to: `✅ 呈现层流畅性已经 R216.3 CDP 视觉复核闭环（docs/ui-review/r216/）` },
  // R52 section title still carries ⏳ though its whole table is ✅.
  { match: '### R52 AudioStudio 第二轮优化 ⏳', re: /⏳/, to: '✅（表格 12 子项全 ✅；2026-09-30 R216.3 核对闭环）' }
]

const apply = process.argv.includes('--apply')
const lines = readFileSync(PRD, 'utf8').split('\n')
let touched = 0
const misses = []

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const sp = SPECIAL.find((s) => line.includes(s.match))
  if (sp) {
    if (sp.re.test(line)) { lines[i] = line.replace(sp.re, sp.to); touched++; }
    else misses.push(`SPECIAL pattern miss @${i + 1}: ${line.slice(0, 60)}`)
    continue
  }
  const id = CLOSE.find((c) => line.includes(c === 'R91.5' ? 'R91.5 验收点' : `**${c}**`) && /状态/.test(line) && line.includes('🔄'))
  if (id) {
    lines[i] = line.replace('🔄', '✅').replace(/\)\s*$/, `；${NOTE}）`).replace(/🔄\s*$/, `✅ ${NOTE}`)
    // The plain-🔄 (no parens) variant keeps its own text; ensure note lands.
    if (!lines[i].includes('R216.3')) lines[i] += ` ${NOTE}`
    touched++
  }
}

console.log(`touched=${touched} expected=${CLOSE.length + SPECIAL.length} misses=${misses.length}`)
misses.forEach((m) => console.log('MISS', m))
if (apply && touched === CLOSE.length + SPECIAL.length && misses.length === 0) {
  writeFileSync(PRD, lines.join('\n'))
  console.log('APPLIED')
} else if (apply) {
  console.log('ABORTED — counts mismatch, nothing written')
  process.exit(1)
} else {
  console.log('dry-run only (pass --apply after verifying)')
}
