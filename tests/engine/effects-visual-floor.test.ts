import { describe, expect, it } from 'vitest'
import { renderEffectPixel } from '../../src/engine/effects'
import { effectPresets } from '../../src/shared/defaultProfile'
import type { EffectKind, EffectLayer, RgbColor } from '../../src/shared/types'

/**
 * R167.3 — visual floor gate (常设门禁).
 *
 * Every CPU effect is rendered at the DEFAULT delivery grid (24×14, the
 * workspace/overlay size) with its preset defaults over a fixed virtual-time
 * sweep, and must stay above a per-tier luminance/coverage floor. This locks
 * in the R167 "delivery pass": the science pack used to measure avgLum
 * 0.013–0.11 with as little as 6% lit cells — visually "nothing happened".
 *
 * Tiers encode DESIGN INTENT, not a single uniform bar:
 *  - ambient : full-field washes → bright AND covering
 *  - feature : structure/points/lines on a dark field (by design) → visible,
 *              allowed to keep their dark canvas
 *  - strobe  : flash/sparse signature looks (lightning, matrix rain, audio
 *              idle) → duty-cycle-bound; only need to be non-invisible
 *  - tool    : custom-paint / image-paint with no content → MUST be black
 *
 * Also sweeps every effect for NaN channels (R166: starlight used to produce
 * NaN via Math.pow(negative, 2.8)).
 */

const COLS = 24
const ROWS = 14
const SAMPLE_SECS = [0, 0.37, 0.83, 1.21, 1.67, 2.13, 2.59, 3.01, 3.41, 3.89, 4.31, 4.73, 5.21, 5.63, 6.07, 6.49]

const GPU_3D_KINDS = new Set<string>(['sphere-pulse', 'warp-portal', 'neon-galaxy', 'lava-sphere', 'laser-show', 'hologram'])

const AMBIENT: EffectKind[] = [
  'static', 'screen-ambient', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'spectrum', 'random-color',
  'plasma', 'vortex', 'tunnel', 'crystal', 'glitch', 'neon-pulse', 'nebula', 'aurora',
  'orion-nebula', 'mirror-symmetry', 'ripple', 'solar-system',
]
const FEATURE: EffectKind[] = [
  'fire', 'starlight', 'comet', 'explode', 'audio-equalizer', 'fluid-flow', 'dna-helix',
  'black-hole', 'spiral-galaxy', 'pulsar-beacon', 'hurricane-eye', 'lightning-leader',
  'icosahedral-virus', 'protein-folding', 'mitosis-spindle', 'synapse-pulse',
  'quantum-collapse', 'microvilli-field', 'eclipse-alignment', 'comet-tail',
  'magnetosphere-aurora', 'wave-diffraction', 'vortex-flame', 'tokamak-plasma',
]
const STROBE: EffectKind[] = ['lightning', 'matrix-rain', 'audio-beat']
const TOOL: EffectKind[] = ['custom-paint', 'image-paint']

const FLOORS = {
  ambient: { avgLum: 0.09, litPct: 45 },
  feature: { avgLum: 0.04, litPct: 20 },
  strobe: { avgLum: 0.03, litPct: 8 },
} as const

function lum(c: RgbColor): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
}

interface Metrics { avgLum: number; litPct: number; nan: number }

function measure(kind: EffectKind): Metrics {
  const preset = effectPresets.find((p) => p.kind === kind)
  if (!preset) throw new Error(`no preset for ${kind}`)
  const layer: EffectLayer = {
    id: `floor-${kind}`, name: kind, kind, enabled: true, opacity: 1,
    blendMode: 'normal', parameters: { ...preset.defaults },
  }
  let sumLum = 0
  let litCells = 0
  let totalCells = 0
  let nan = 0
  for (const now of SAMPLE_SECS) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = renderEffectPixel(layer, { x, y, columns: COLS, rows: ROWS, now })
        if (Number.isNaN(c.r) || Number.isNaN(c.g) || Number.isNaN(c.b)) nan++
        const l = lum(c)
        sumLum += l
        if (l > 8 / 255) litCells++
        totalCells++
      }
    }
  }
  return { avgLum: sumLum / totalCells, litPct: (litCells / totalCells) * 100, nan }
}

describe('engine/effects visual floor (R167.3)', () => {
  const cases: [label: keyof typeof FLOORS, kinds: EffectKind[]][] = [
    ['ambient', AMBIENT],
    ['feature', FEATURE],
    ['strobe', STROBE],
  ]

  for (const [tier, kinds] of cases) {
    it(`${tier} tier stays above the R167 floor`, () => {
      const failures: string[] = []
      for (const kind of kinds) {
        const m = measure(kind)
        if (m.nan > 0) failures.push(`${kind}: ${m.nan} NaN channels`)
        if (m.avgLum < FLOORS[tier].avgLum || m.litPct < FLOORS[tier].litPct) {
          failures.push(`${kind}: avgLum ${m.avgLum.toFixed(3)}/${FLOORS[tier].avgLum}, lit ${m.litPct.toFixed(1)}%/${FLOORS[tier].litPct}%`)
        }
      }
      expect(failures, failures.join('; ')).toEqual([])
    })
  }

  it('tool effects with no content stay pure black (correct empty state)', () => {
    for (const kind of TOOL) {
      const m = measure(kind)
      expect(m.avgLum, `${kind} empty state should be black`).toBe(0)
      expect(m.litPct, `${kind} empty state should be unlit`).toBe(0)
      expect(m.nan, `${kind} must not produce NaN`).toBe(0)
    }
  })

  it('every CPU effect kind in the presets is covered by a tier', () => {
    const covered = new Set<string>([...AMBIENT, ...FEATURE, ...STROBE, ...TOOL])
    const cpu = effectPresets.map((p) => p.kind).filter((k) => !GPU_3D_KINDS.has(k))
    const missing = cpu.filter((k) => !covered.has(k))
    expect(missing, `unassigned kinds: ${missing.join(', ')}`).toEqual([])
  })
})
