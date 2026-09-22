/**
 * R148 S0 / R158.2: contrast auditor.
 *
 * Two passes:
 *  1. PAIR REGISTRY (R158.2 — the fix for the "pairs checked: 0" era):
 *     tokens.css declares the semantic fg/bg combos that actually occur in
 *     the UI as --pair-<name>-fg / --pair-<name>-bg; every declared pair is
 *     checked. Same-rule scanning can never see these (fg and bg usually
 *     live in different rules — text on card, status on panel…).
 *  2. SAME-RULE scan (R148 S0 original): `color` paired with the nearest
 *     `background`(-*) declaration in the same rule. Inherited/cascaded
 *     backgrounds are invisible here — a lower bound, kept for tracking.
 *
 * R158.2 root-cause note: styles.css became a 3-line @import facade in R148
 * S1 and this auditor kept reading just that file — zero rules matched, so
 * "pairs checked: 0 / 0 violations" was hollow-true. @imports are now
 * inlined before scanning.
 *
 * Usage: node scripts/ui-audit-contrast.mjs [--threshold 4.5]
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const args = process.argv.slice(2)
const thresholdIdx = args.indexOf('--threshold')
const THRESHOLD = thresholdIdx !== -1 ? Number(args[thresholdIdx + 1]) : 4.5

/** Read a CSS file and inline its @import facade (relative hrefs). */
const readCss = (p) => readFileSync(p, 'utf8')
const entryPath = 'src/renderer/src/styles.css'
const css = readCss(entryPath).replace(/@import\s+'([^']+)'\s*;/g, (_, href) => readCss(join(dirname(entryPath), href)))

// ── token map (var → raw value; values may chain through var() refs) ────────
const tokens = new Map()
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
  tokens.set(m[1], m[2].trim())
}
const resolveColor = (value, depth = 0) => {
  if (depth > 5) return null
  const v = value.trim()
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v
  if (v.startsWith('var(')) {
    const name = v.slice(4, v.indexOf(')')).split(',')[0].trim()
    return tokens.has(name) ? resolveColor(tokens.get(name), depth + 1) : null
  }
  return null // rgba()/named → skipped (documented limitation)
}

const srgbToLinear = (c) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = (hex) => {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const violations = []
let checked = 0
let skipped = 0
const check = (label, fgRaw, bgRaw) => {
  const fgHex = resolveColor(fgRaw)
  const bgHex = resolveColor(bgRaw)
  if (!fgHex || !bgHex) { skipped++; return }
  checked++
  const ratio = contrast(fgHex, bgHex)
  if (ratio < THRESHOLD) {
    violations.push({ selector: label, fg: fgHex, bg: bgHex, ratio: Number(ratio.toFixed(2)) })
  }
}

// ── pass 1: the --pair-* registry in tokens.css (R158.2) ────────────────────
const pairFg = new Map()
const pairBg = new Map()
for (const m of css.matchAll(/--pair-([a-z0-9-]+)-(fg|bg)\s*:\s*([^;}]+)/g)) {
  ;(m[2] === 'fg' ? pairFg : pairBg).set(m[1], m[3].trim())
}
for (const [name, fgRaw] of pairFg) {
  const bgRaw = pairBg.get(name)
  if (!bgRaw) continue // half-declared pair → not a pair
  check(`pair:${name}`, fgRaw, bgRaw)
}

// ── pass 2: same-rule scan (R148 S0 original, lower bound) ──────────────────
for (const ruleMatch of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const body = ruleMatch[2]
  const selector = ruleMatch[1].trim().replace(/\s+/g, ' ').slice(-90)
  const decls = {}
  for (const d of body.split(';')) {
    const idx = d.indexOf(':')
    if (idx === -1) continue
    const prop = d.slice(0, idx).trim()
    const value = d.slice(idx + 1).trim()
    if (prop === 'color' || prop === 'background' || prop === 'background-color') decls[prop] = value
  }
  const fg = decls['color']
  const bg = decls['background'] ?? decls['background-color']
  if (!fg || !bg) continue
  check(selector, fg, bg)
}

violations.sort((a, b) => a.ratio - b.ratio)
console.log(`pairs checked: ${checked}   (registry ${pairFg.size} declared, ${skipped} skipped: unresolved color)   below ${THRESHOLD}:1 → ${violations.length}`)
for (const v of violations.slice(0, 40)) {
  console.log(`  ${String(v.ratio).padStart(5)}:1  ${v.fg} on ${v.bg}  ← ${v.selector}`)
}
if (violations.length > 40) console.log(`  … +${violations.length - 40} more`)
process.exit(violations.length === 0 ? 0 : 1)
