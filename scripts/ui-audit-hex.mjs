/**
 * R148 S0: bare-hex linter — every literal color in renderer CSS outside the
 * token definition layer is a violation (the design system's single source of
 * truth is the primitive/semantic token scales; components must consume
 * var(--*) only).
 *
 * Usage: node scripts/ui-audit-hex.mjs [--css <files...>] [--json]
 * Exit code 1 when violations remain (CI gate); --baseline <n> is NOT
 * supported on purpose — the count must go to zero in S1.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_FILES = [
  'src/renderer/src/styles.css',
]

/** Files (relative) whose content legitimately DEFINES the primitives. */
const TOKEN_FILES = new Set([
  'src/renderer/src/styles/tokens.css', // S1 split target
])

const args = process.argv.slice(2)
const files = []
{
  let i = 0
  while (i < args.length) {
    if (args[i] === '--css') {
      i++
      while (i < args.length && !args[i].startsWith('--')) files.push(args[i++])
    }
    i++
  }
}
const json = args.includes('--json')
const targets = files.length ? files : DEFAULT_FILES

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g

let total = 0
const report = []
for (const file of targets) {
  const abs = resolve(file)
  const isTokenFile = TOKEN_FILES.has(file.replaceAll('\\', '/'))
  const css = readFileSync(abs, 'utf8')
  // The FIRST :root block is the token definition layer — hexes there are the
  // single source of truth (after the S1 split this whole block lives in
  // styles/tokens.css, which TOKEN_FILES also whitelists).
  const firstRootEnd = isTokenFile ? -1 : css.indexOf('}', css.indexOf(':root'))
  const lines = css.split(/\r?\n/)
  let inBlockComment = false
  let consumed = 0 // running byte offset to locate the first :root block per line
  const rootStart = css.indexOf(':root')
  lines.forEach((line, idx) => {
    const lineStart = consumed
    const lineEnd = consumed + line.length
    consumed = lineEnd + 1
    // Skip lines inside the first :root block (token definitions).
    if (!isTokenFile && firstRootEnd !== -1 && lineStart <= firstRootEnd && lineEnd >= rootStart) return
    // crude comment stripping — good enough for an audit (false negatives on
    // `color: /* x */ #fff` are acceptable; there are none today)
    let work = line
    if (inBlockComment) {
      const end = work.indexOf('*/')
      if (end === -1) return
      work = work.slice(end + 2)
      inBlockComment = false
    }
    const start = work.indexOf('/*')
    if (start !== -1) {
      if (!work.includes('*/', start)) inBlockComment = true
      work = work.slice(0, start)
    }
    if (work.trim().startsWith('//')) return
    if (isTokenFile && work.includes('--')) return // token definition lines
    for (const m of work.matchAll(HEX_RE)) {
      total++
      report.push({ file, line: idx + 1, hex: m[0].toLowerCase(), text: line.trim().slice(0, 110) })
    }
  })
}

if (json) {
  console.log(JSON.stringify({ total, report }, null, 1))
} else {
  const byHex = new Map()
  for (const r of report) byHex.set(r.hex, (byHex.get(r.hex) ?? 0) + 1)
  console.log(`bare-hex violations: ${total}`)
  for (const [hex, count] of [...byHex.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${hex}  ×${count}`)
  }
  for (const r of report.slice(0, 12)) console.log(`  e.g. ${r.file}:${r.line}  ${r.text}`)
  if (report.length > 12) console.log(`  … +${report.length - 12} more (use --json for full list)`)
}
process.exitCode = total === 0 ? 0 : 1
