/**
 * R240 / TASK-UNIVERSE F5: i18n full-corpus audit — the execution engine for
 * the 143 F5 batch instances. Five checks over the zh/en dictionaries:
 *   1. key-parity    — keys present in one side but missing in the other
 *   2. empty-value   — either side maps a key to '' / whitespace
 *   3. placeholder   — {var} sets differ between zh and en
 *   4. same-text     — zh === en for non-trivial strings (suspicious: either
 *                      untranslated, or intentional — needs eyes, listed)
 *   5. length-ratio  — en > 3× zh (layout-overflow candidates for review)
 *
 * Output: console summary + docs/I18N-AUDIT.md (findings as F5 batch rows).
 * Exit 1 when parity/empty/placeholder findings exist (the fixable classes).
 *
 *   node scripts/i18n-audit.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const src = readFileSync('src/renderer/src/i18n/index.tsx', 'utf8')

/** extract one dictionary block: const ZH = { ... } / const EN = { ... } */
function extractDict(name) {
  // declarations carry a type annotation: `const ZH: TranslationTable = {`
  const decl = src.indexOf(`const ${name}`)
  if (decl < 0) throw new Error(`dictionary ${name} not found`)
  const start = src.indexOf('{', decl)
  let i = start + 1, depth = 1, buf = ''
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth > 0) buf += ch
    i++
  }
  return buf
}

/** parse `'key': 'value',` lines (single-quote strings with escapes) */
function parseKeys(block) {
  const map = new Map()
  for (const m of block.matchAll(/'((?:[^'\\]|\\.)+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\'/g, "'")
    const val = m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n')
    if (!map.has(key)) map.set(key, val) // first wins; duplicate keys flagged below
  }
  // duplicate raw key occurrences
  const dupes = [...block.matchAll(/'((?:[^'\\]|\\.)+)':\s*'/g)].map((m) => m[1])
  const dupeSet = dupes.filter((k, i) => dupes.indexOf(k) !== i)
  return { map, dupes: [...new Set(dupeSet)] }
}

const zh = parseKeys(extractDict('ZH'))
const en = parseKeys(extractDict('EN'))

const findings = { missingInEn: [], missingInZh: [], empty: [], placeholder: [], sameText: [], longEn: [], dupes: [] }
for (const [k, v] of zh.map) {
  if (!en.map.has(k)) findings.missingInEn.push(k)
  else {
    const ev = en.map.get(k)
    if (!v.trim() || !ev.trim()) findings.empty.push(k)
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
    if (ph(v) !== ph(ev)) findings.placeholder.push(`${k} (zh{${ph(v)}} en{${ph(ev)}})`)
    if (v === ev && v.trim() && /[一-鿿]/.test(v) === false && v.length > 3) findings.sameText.push(k)
    if (ev.length > v.length * 3 && ev.length > 40) findings.longEn.push(`${k} (${v.length}→${ev.length})`)
  }
}
for (const k of en.map.keys()) if (!zh.map.has(k)) findings.missingInZh.push(k)
findings.dupes.push(...zh.dupes.map((k) => `ZH:${k}`), ...en.dupes.map((k) => `EN:${k}`))

const fixable = findings.missingInEn.length + findings.missingInZh.length + findings.empty.length + findings.placeholder.length
let md = `# I18N-AUDIT — 全量审计报告（R240 / F5 族）\n\n`
md += `> 生成：${new Date().toISOString()}（node scripts/i18n-audit.mjs）\n`
md += `> 语料：zh ${zh.map.size} 键 / en ${en.map.size} 键\n\n`
md += `| 检查 | 发现 | 处置 |\n|---|---|---|\n`
md += `| en 缺键 | ${findings.missingInEn.length} | 必修（F5 实例） |\n`
md += `| zh 缺键 | ${findings.missingInZh.length} | 必修 |\n`
md += `| 空值 | ${findings.empty.length} | 必修 |\n`
md += `| 占位符不一致 | ${findings.placeholder.length} | 必修 |\n`
md += `| zh=en 同文（非中文） | ${findings.sameText.length} | 人工复核 |\n`
md += `| en 超长（>3×zh） | ${findings.longEn.length} | 人工复核（溢出候选） |\n`
md += `| 重复键 | ${findings.dupes.length} | 必修 |\n\n`
const section = (title, rows) => {
  if (!rows.length) return
  md += `## ${title}（${rows.length}）\n\n`
  for (let i = 0; i < rows.length; i += 12) md += `- ${rows.slice(i, i + 12).join('\n- ')}\n\n`
}
section('en 缺键', findings.missingInEn)
section('zh 缺键', findings.missingInZh)
section('空值', findings.empty)
section('占位符不一致', findings.placeholder)
section('zh=en 同文（复核：或为刻意的品牌/术语）', findings.sameText)
section('en 超长（复核：布局溢出候选）', findings.longEn)
section('重复键（后者生效）', findings.dupes)
writeFileSync('docs/I18N-AUDIT.md', md)

console.log(`zh=${zh.map.size} en=${en.map.size} | fixable findings: ${fixable} (+${findings.dupes.length} dupes)`)
console.log(`report → docs/I18N-AUDIT.md`)
if (fixable > 0 || findings.dupes.length > 0) {
  console.log(`classes: missingInEn=${findings.missingInEn.length} missingInZh=${findings.missingInZh.length} empty=${findings.empty.length} placeholder=${findings.placeholder.length} dupes=${findings.dupes.length}`)
  process.exit(1)
}
