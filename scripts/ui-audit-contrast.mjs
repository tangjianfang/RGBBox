/**
 * R148 S0: contrast auditor — statically pairs `color` with the nearest
 * `background`(-*) declaration in the same CSS rule and computes the WCAG
 * 2.1 contrast ratio. var() references resolve against :root tokens.
 *
 * Static analysis caveats (documented, accepted): only same-rule pairs are
 * checked (inherited/cascaded backgrounds are invisible here), so this is a
 * LOWER bound on violations — good for tracking the S1 cleanup, not a full
 * a11y certificate.
 *
 * Usage: node scripts/ui-audit-contrast.mjs [--threshold 4.5]
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const thresholdIdx = args.indexOf('--threshold')
const THRESHOLD = thresholdIdx !== -1 ? Number(args[thresholdIdx + 1]) : 4.5
const css = readFileSync('src/renderer/src/styles.css', 'utf8')

// ── token map (var → hex) ─────────────────────────────────────────────────
const tokens = new Map()
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)) {
  tokens.set(m[1], m[2])
}
const resolveColor = (value) => {
  const v = value.trim()
  if (v.startsWith('#')) return v
  if (v.startsWith('var(')) {
    const name = v.slice(4, v.indexOf(')')).split(',')[0].trim()
    return tokens.get(name) ?? null
  }
  return null // rgba()/named → skipped (lower bound tool)
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

// ── walk rules (one nesting level; nested selectors flattened by greedy scan) ──
const violations = []
let checked = 0
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
  const fgHex = resolveColor(fg)
  const bgHex = resolveColor(bg)
  if (!fgHex || !bgHex) continue
  checked++
  const ratio = contrast(fgHex, bgHex)
  if (ratio < THRESHOLD) {
    violations.push({ selector, fg: fgHex, bg: bgHex, ratio: Number(ratio.toFixed(2)) })
  }
}

violations.sort((a, b) => a.ratio - b.ratio)
console.log(`pairs checked: ${checked}   below ${THRESHOLD}:1 → ${violations.length}`)
for (const v of violations.slice(0, 30)) {
  console.log(`  ${String(v.ratio).padStart(5)}:1  ${v.fg} on ${v.bg}  ← ${v.selector}`)
}
if (violations.length > 30) console.log(`  … +${violations.length - 30} more`)
