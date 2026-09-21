/**
 * R148 S1 one-shot tokenizer: maps every bare-hex cluster (RGB-distance
 * clustered, human-reviewed mapping below) to a semantic/design token and
 * rewrites styles.css in place. The cluster merge is DELIBERATE — the ~20
 * slight tints inside each cluster were undisciplined drift of the same
 * semantic color; they collapse to one token value now.
 *
 * Usage: node scripts/ui-s1-tokenize.mjs          (rewrites styles.css)
 *        node scripts/ui-s1-tokenize.mjs --dry    (report only)
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'src/renderer/src/styles.css'

/** hex (lowercased, as emitted by the audit) → token */
const MAP = {
  // ── accent family (dual-green unification: #46c6a8 dies, --accent #42e8a9 wins)
  '#46c6a8': 'var(--accent)', '#43d6a8': 'var(--accent)', '#55d4a0': 'var(--accent)', '#4ec9b0': 'var(--accent)',
  '#8fe8cf': 'var(--accent-bright-text)', '#8fe9d2': 'var(--accent-bright-text)', '#7de8cc': 'var(--accent-bright-text)',
  '#91dcca': 'var(--accent-bright-text)', '#80f0d1': 'var(--accent-bright-text)', '#8fd6c8': 'var(--accent-bright-text)',
  '#76efd0': 'var(--accent-bright-text)', '#7de8d0': 'var(--accent-bright-text)',
  '#5dffc0': 'var(--accent-bright-text)', '#65f1bf': 'var(--accent-bright-text)',
  '#c5f0e4': 'var(--accent-soft-text)', '#dff5ee': 'var(--accent-soft-text)', '#aef3e0': 'var(--accent-soft-text)', '#b6f3e3': 'var(--accent-soft-text)',
  '#36a87c': 'var(--accent-deep-text)', '#36c887': 'var(--accent-deep-text)', '#2f9e7e': 'var(--accent-deep-text)',
  // ── text scale (drift collapses to the four semantic steps)
  '#e6edf0': 'var(--text-primary)',
  '#9fb7c1': 'var(--text-secondary)', '#a8c0c9': 'var(--text-secondary)', '#a8c0c8': 'var(--text-secondary)',
  '#a2b7bf': 'var(--text-secondary)', '#a8c0cc': 'var(--text-secondary)', '#9cb7c3': 'var(--text-secondary)',
  '#a0bbc4': 'var(--text-secondary)', '#b7cbd3': 'var(--text-secondary)', '#b9d2d9': 'var(--text-secondary)',
  '#8aa2ad': 'var(--text-muted)', '#9bb6c2': 'var(--text-muted)', '#7f9aa5': 'var(--text-muted)', '#8fb6c6': 'var(--text-muted)',
  '#9bb7c0': 'var(--text-muted)', '#6b97a8': 'var(--text-muted)', '#94a3b8': 'var(--text-muted)', '#78919b': 'var(--text-muted)',
  '#7a96a0': 'var(--text-muted)', '#8aa0ab': 'var(--text-muted)', '#9aa4b2': 'var(--text-muted)',
  '#55707c': 'var(--text-faint)', '#5e8091': 'var(--text-faint)', '#45636f': 'var(--text-faint)', '#4a7a8a': 'var(--text-faint)',
  '#3a6070': 'var(--text-faint)', '#5c707a': 'var(--text-faint)', '#5c7e8a': 'var(--text-faint)', '#4a6a7a': 'var(--text-faint)',
  '#6a8a96': 'var(--text-faint)', '#6a8e9b': 'var(--text-faint)', '#6fa898': 'var(--text-faint)',
  // ── ice-blue info text family
  '#dff8ff': 'var(--info-text)', '#e8f7fa': 'var(--info-text)', '#f2fafc': 'var(--info-text)', '#e2f8ff': 'var(--info-text)',
  '#f0fbfd': 'var(--info-text)', '#f2fbfd': 'var(--info-text)', '#e6f2f8': 'var(--info-text)', '#eff8fb': 'var(--info-text)',
  '#e6f4ff': 'var(--info-text)', '#e8f8ff': 'var(--info-text)',
  '#c9e4ec': 'var(--info-soft-text)', '#d7e4ec': 'var(--info-soft-text)', '#d9edf2': 'var(--info-soft-text)', '#cfe8f0': 'var(--info-soft-text)',
  '#d7e7eb': 'var(--info-soft-text)', '#d3eef2': 'var(--info-soft-text)', '#dceff4': 'var(--info-soft-text)', '#dce6eb': 'var(--info-soft-text)',
  '#c9dbe1': 'var(--info-soft-text)', '#bde9ee': 'var(--info-soft-text)', '#d0ecf5': 'var(--info-soft-text)', '#cdeeff': 'var(--info-soft-text)',
  '#b7d5de': 'var(--info-soft-text)',
  '#6fd7f0': 'var(--info-vivid-text)', '#67e8f9': 'var(--info-vivid-text)', '#8dd4f0': 'var(--info-vivid-text)',
  '#7bd0f4': 'var(--info-vivid-text)', '#7ec8e3': 'var(--info-vivid-text)', '#a5e8f5': 'var(--info-vivid-text)', '#a8e2f0': 'var(--info-vivid-text)',
  '#4fc3f7': 'var(--status-info)', '#3db7ff': 'var(--status-info)', '#38bdf8': 'var(--status-info)', '#46a0c6': 'var(--status-info)',
  // ── surfaces (near-black layering collapses to 3 semantic steps)
  '#0d1620': 'var(--surface-deep)', '#0f171c': 'var(--surface-deep)', '#0d1318': 'var(--surface-deep)', '#0f1418': 'var(--surface-deep)',
  '#0b1014': 'var(--surface-deep)', '#081014': 'var(--surface-deep)', '#05090b': 'var(--surface-deep)', '#05080a': 'var(--surface-deep)',
  '#101820': 'var(--surface-deep)', '#0d141a': 'var(--surface-deep)', '#0a1014': 'var(--surface-deep)', '#080d11': 'var(--surface-deep)',
  '#0d1216': 'var(--surface-deep)', '#0d1e17': 'var(--surface-deep)', '#05090d': 'var(--surface-deep)', '#071118': 'var(--surface-deep)',
  '#061015': 'var(--surface-deep)', '#0c1318': 'var(--surface-deep)', '#0c1419': 'var(--surface-deep)', '#0d1519': 'var(--surface-deep)',
  '#0a0e14': 'var(--surface-deep)', '#0f172a': 'var(--surface-deep)',
  '#1e2e36': 'var(--surface-raised)', '#26343c': 'var(--surface-raised)', '#2d424c': 'var(--surface-raised)', '#131d23': 'var(--surface-raised)',
  '#111d23': 'var(--surface-raised)', '#253740': 'var(--surface-raised)', '#2a3d46': 'var(--surface-raised)', '#2a3e48': 'var(--surface-raised)',
  '#101920': 'var(--surface-raised)', '#1b3d34': 'var(--surface-raised)', '#11191f': 'var(--surface-raised)', '#1d2d35': 'var(--surface-raised)',
  '#1b343b': 'var(--surface-raised)', '#243640': 'var(--surface-raised)', '#2d1a1f': 'var(--surface-raised)', '#243841': 'var(--surface-raised)',
  '#1a342f': 'var(--surface-raised)', '#15342d': 'var(--surface-raised)', '#101a21': 'var(--surface-raised)', '#273a43': 'var(--surface-raised)',
  '#13252b': 'var(--surface-raised)', '#233740': 'var(--surface-raised)', '#18313a': 'var(--surface-raised)', '#162029': 'var(--surface-raised)',
  '#1a2a32': 'var(--surface-raised)', '#223840': 'var(--surface-raised)', '#1a2229': 'var(--surface-raised)', '#14332b': 'var(--surface-raised)',
  '#18242b': 'var(--surface-raised)', '#1f3139': 'var(--surface-raised)', '#162936': 'var(--surface-raised)', '#1a3540': 'var(--surface-raised)',
  '#162228': 'var(--surface-raised)', '#1d2e36': 'var(--surface-raised)', '#1b2a31': 'var(--surface-raised)', '#19313a': 'var(--surface-raised)',
  '#1a3028': 'var(--surface-raised)', '#102028': 'var(--surface-raised)', '#142d26': 'var(--surface-raised)', '#263e49': 'var(--surface-raised)',
  '#16222b': 'var(--surface-raised)', '#1c2f38': 'var(--surface-raised)', '#1a2a33': 'var(--surface-raised)', '#28424e': 'var(--surface-raised)',
  '#111920': 'var(--surface-raised)', '#162530': 'var(--surface-raised)', '#0f2f28': 'var(--surface-raised)', '#142d3a': 'var(--surface-raised)',
  '#13262d': 'var(--surface-raised)', '#1b3a42': 'var(--surface-raised)', '#0d2535': 'var(--surface-raised)', '#0f2c3c': 'var(--surface-raised)',
  '#1f333c': 'var(--surface-raised)', '#101d23': 'var(--surface-raised)', '#143027': 'var(--surface-raised)', '#20343d': 'var(--surface-raised)',
  '#193631': 'var(--surface-raised)', '#1a2f38': 'var(--surface-raised)', '#1a2332': 'var(--surface-raised)',
  '#2b4653': 'var(--border-strong)', '#34505a': 'var(--border-strong)', '#33505b': 'var(--border-strong)', '#2d4550': 'var(--border-strong)',
  '#3a5a68': 'var(--border-strong)', '#274550': 'var(--border-strong)', '#3a5260': 'var(--border-strong)', '#2f4a55': 'var(--border-strong)',
  '#294550': 'var(--border-strong)', '#2c4650': 'var(--border-strong)', '#234f42': 'var(--border-strong)', '#2d4a58': 'var(--border-strong)', '#3a5a6a': 'var(--border-strong)',
  // ── status semantics
  '#f87171': 'var(--status-error)', '#ff5d5d': 'var(--status-error)', '#f07070': 'var(--status-error)', '#ff6b6b': 'var(--status-error)', '#ff8a65': 'var(--status-error)',
  '#fde68a': 'var(--status-warn)', '#fde047': 'var(--status-warn)', '#ffcb45': 'var(--status-warn)',
  '#fbbf24': 'var(--status-warn-strong)', '#e0a040': 'var(--status-warn-strong)', '#fb923c': 'var(--status-warn-strong)',
  '#86efac': 'var(--status-success)', '#4ade80': 'var(--status-success)',
  // ── primitives & game content colors (content layer, not chrome)
  '#fff': 'var(--white)', '#ffffff': 'var(--white)',
  '#000': 'var(--black)', '#000000': 'var(--black)',
  '#f8a0b0': 'var(--fx-pink)', '#ff9d9d': 'var(--fx-pink)', '#ffb8c4': 'var(--fx-pink)',
  '#42e8a9': 'var(--accent)',
}

const dry = process.argv.includes('--dry')
let css = readFileSync(FILE, 'utf8')

// Protect the :root token definition block from self-replacement — the
// FIRST :root block (no nesting inside, ~34 lines; later media-query blocks
// that redefine --gap-block etc. must NOT extend the protected range).
const rootStart = css.indexOf(':root')
const rootEnd = css.indexOf('}', rootStart) + 1
if (rootStart === -1 || rootEnd === 0) throw new Error('token :root block not found — adjust anchors')
const head = css.slice(0, rootStart)
const rootBlock = css.slice(rootStart, rootEnd)
const body = css.slice(rootEnd)

let replaced = 0
const replacedBy = new Map()
for (const bodyPart of [body]) {
  let out = bodyPart
  // longest-first so #46c6a880-style 8-digit hexes match their 6-digit prefix intent
  for (const hex of Object.keys(MAP).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(hex + '(?![0-9a-fA-F])', 'gi')
    out = out.replace(re, () => {
      replaced++
      replacedBy.set(MAP[hex], (replacedBy.get(MAP[hex]) ?? 0) + 1)
      return MAP[hex]
    })
  }
  var newBody = out
}

if (dry) {
  console.log(`would replace ${replaced} occurrences into ${replacedBy.size} tokens`)
  for (const [tok, n] of [...replacedBy].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${tok}`)
} else {
  writeFileSync(FILE, head + rootBlock + newBody)
  console.log(`replaced ${replaced} occurrences into ${replacedBy.size} tokens (styles.css rewritten)`)
}
