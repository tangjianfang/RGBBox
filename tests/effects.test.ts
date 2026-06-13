import { describe, it, expect } from 'vitest'
import { renderEffectPixel } from '../src/engine/effects'
import type { EffectContext } from '../src/engine/effects'
import type { EffectLayer } from '../src/shared/types'

function makeContext(overrides: Partial<EffectContext> = {}): EffectContext {
  return {
    x: 5,
    y: 5,
    columns: 10,
    rows: 10,
    now: 1000,
    ...overrides
  }
}

function makeLayer(kind: string, params: Record<string, number | string | boolean> = {}): EffectLayer {
  return {
    id: 'test-layer',
    name: 'Test',
    kind: kind as EffectLayer['kind'],
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    parameters: params
  }
}

describe('renderEffectPixel', () => {
  describe('static effect', () => {
    it('returns the configured color', () => {
      const layer = makeLayer('static', { color: '#ff0000' })
      const ctx = makeContext()
      const result = renderEffectPixel(layer, ctx)
      expect(result.r).toBe(255)
      expect(result.g).toBe(0)
      expect(result.b).toBe(0)
    })

    it('uses white as default color', () => {
      const layer = makeLayer('static', {})
      const ctx = makeContext()
      const result = renderEffectPixel(layer, ctx)
      // Default color from hexToRgb for missing param would be white
      expect(result.r).toBe(255)
      expect(result.g).toBe(255)
      expect(result.b).toBe(255)
    })
  })

  describe('breathing effect', () => {
    it('produces varying brightness over time', () => {
      const layer = makeLayer('breathing', { color: '#ffffff', speed: 1 })
      const results = new Set<number>()
      // Use fractional increments so sin() produces different values
      for (let t = 0; t < 2; t += 0.1) {
        const ctx = makeContext({ now: t })
        const result = renderEffectPixel(layer, ctx)
        results.add(result.r)
      }
      // Should have varying brightness values
      expect(results.size).toBeGreaterThan(1)
    })
  })

  describe('rainbow effect', () => {
    it('produces different colors at different positions', () => {
      const layer = makeLayer('rainbow', { speed: 1 })
      const ctx1 = makeContext({ x: 0 })
      const ctx2 = makeContext({ x: 5 })
      const ctx3 = makeContext({ x: 9 })

      const r1 = renderEffectPixel(layer, ctx1)
      const r2 = renderEffectPixel(layer, ctx2)
      const r3 = renderEffectPixel(layer, ctx3)

      // Not all the same color
      const colors = [r1, r2, r3]
      const unique = new Set(colors.map(c => `${c.r},${c.g},${c.b}`))
      expect(unique.size).toBeGreaterThan(1)
    })
  })

  describe('wave effect', () => {
    it('produces varying intensity across positions', () => {
      const layer = makeLayer('wave', { color: '#00ff00', speed: 1 })
      const intensities = new Set<number>()
      for (let x = 0; x < 10; x++) {
        const ctx = makeContext({ x })
        const result = renderEffectPixel(layer, ctx)
        intensities.add(result.g)
      }
      expect(intensities.size).toBeGreaterThan(1)
    })
  })

  describe('fire effect', () => {
    it('returns valid RGB color', () => {
      const layer = makeLayer('fire', { intensity: 0.8 })
      const ctx = makeContext()
      const result = renderEffectPixel(layer, ctx)
      expect(result.r).toBeGreaterThanOrEqual(0)
      expect(result.r).toBeLessThanOrEqual(255)
      expect(result.g).toBeGreaterThanOrEqual(0)
      expect(result.g).toBeLessThanOrEqual(255)
      expect(result.b).toBeGreaterThanOrEqual(0)
      expect(result.b).toBeLessThanOrEqual(255)
    })
  })

  describe('starlight effect', () => {
    it('produces pixels with valid values', () => {
      const layer = makeLayer('starlight', { density: 0.5, color: '#ffffff' })
      const ctx = makeContext()
      const result = renderEffectPixel(layer, ctx)
      expect(result.r).toBeGreaterThanOrEqual(0)
      expect(result.r).toBeLessThanOrEqual(255)
    })
  })

  describe('screen-ambient effect', () => {
    it('returns enhanced screen pixel when available', () => {
      const layer = makeLayer('screen-ambient', { saturation: 1, contrast: 1 })
      const ctx = makeContext({ _screenPixel: { r: 128, g: 64, b: 32 } })
      const result = renderEffectPixel(layer, ctx)
      // With saturation=1, contrast=1 it should be identity
      expect(result.r).toBe(128)
      expect(result.g).toBe(64)
      expect(result.b).toBe(32)
    })

    it('returns fallback animation when no screen pixel', () => {
      const layer = makeLayer('screen-ambient', {})
      const ctx = makeContext({ _screenPixel: undefined })
      const result = renderEffectPixel(layer, ctx)
      // Falls back to animated color - just check it's valid RGB
      expect(result.r).toBeGreaterThanOrEqual(0)
      expect(result.r).toBeLessThanOrEqual(255)
      expect(result.g).toBeGreaterThanOrEqual(0)
      expect(result.g).toBeLessThanOrEqual(255)
    })
  })

  describe('audio-beat effect', () => {
    it('responds to audio beat input', () => {
      const layer = makeLayer('audio-beat', { color: '#ff0000' })
      const noBeat = renderEffectPixel(layer, makeContext({ _audioBeat: 0, _audioBass: 0 }))
      const highBeat = renderEffectPixel(layer, makeContext({ _audioBeat: 1, _audioBass: 1 }))
      // High beat should produce brighter output
      expect(highBeat.r).toBeGreaterThanOrEqual(noBeat.r)
    })
  })

  describe('all effects return valid RGB', () => {
    const effectKinds = [
      'static', 'breathing', 'rainbow', 'wave', 'zone-gradient', 'fire', 'starlight',
      'ripple', 'spectrum', 'comet', 'lightning', 'aurora', 'explode',
      'audio-beat', 'audio-equalizer', 'random-color', 'custom-paint', 'image-paint',
      'plasma', 'vortex', 'tunnel', 'crystal', 'glitch',
      'matrix-rain', 'neon-pulse', 'nebula', 'fluid-flow', 'mirror-symmetry',
      'dna-helix', 'black-hole', 'solar-system', 'spiral-galaxy', 'orion-nebula',
      'pulsar-beacon', 'hurricane-eye', 'lightning-leader', 'icosahedral-virus',
      'protein-folding', 'mitosis-spindle', 'synapse-pulse', 'quantum-collapse',
      'microvilli-field', 'eclipse-alignment', 'comet-tail', 'magnetosphere-aurora',
      'wave-diffraction', 'vortex-flame', 'tokamak-plasma'
    ]

    for (const kind of effectKinds) {
      it(`${kind} returns RGB in [0, 255]`, () => {
        const layer = makeLayer(kind, { color: '#ff8800', speed: 1, intensity: 0.5 })
        const ctx = makeContext({
          _audioBass: 0.5,
          _audioMid: 0.5,
          _audioHigh: 0.5,
          _audioBeat: 0.5,
          _audioFreqBands: Array(32).fill(0.5)
        })
        const result = renderEffectPixel(layer, ctx)
        expect(result.r).toBeGreaterThanOrEqual(0)
        expect(result.r).toBeLessThanOrEqual(255)
        expect(result.g).toBeGreaterThanOrEqual(0)
        expect(result.g).toBeLessThanOrEqual(255)
        expect(result.b).toBeGreaterThanOrEqual(0)
        expect(result.b).toBeLessThanOrEqual(255)
      })
    }
  })

  describe('newly covered effects (zone-gradient, audio-equalizer, custom-paint, image-paint)', () => {
    it('zone-gradient produces colour weighted by zone position', () => {
      const layer = makeLayer('zone-gradient', { from: '#ff0000', to: '#0000ff', angle: 90 })
      // angle=90 = vertical: top of grid is "from", bottom is "to"
      const top = renderEffectPixel(layer, makeContext({ x: 5, y: 0, columns: 10, rows: 10 }))
      const bottom = renderEffectPixel(layer, makeContext({ x: 5, y: 9, columns: 10, rows: 10 }))
      // Top should be more red, bottom should be more blue
      expect(top.r).toBeGreaterThan(bottom.r)
      expect(top.b).toBeLessThan(bottom.b)
    })

    it('audio-equalizer responds to bass/mid/high bands', () => {
      const layer = makeLayer('audio-equalizer', {})
      const quiet = renderEffectPixel(layer, makeContext({ _audioBass: 0, _audioMid: 0, _audioHigh: 0, y: 9 }))
      const loud = renderEffectPixel(layer, makeContext({ _audioBass: 1, _audioMid: 1, _audioHigh: 1, y: 9 }))
      // At least one channel should differ
      const sameR = quiet.r === loud.r
      const sameG = quiet.g === loud.g
      const sameB = quiet.b === loud.b
      expect(sameR && sameG && sameB).toBe(false)
    })

    it('custom-paint uses pixelData parameter', () => {
      // pixelData is a flat 1D array of '#rrggbb' strings;
      // renderEffectPixel looks up the index `y * columns + x`.
      const pixelData = JSON.stringify([
        '#000000', '#111111', '#00ff00', '#ff0000'
      ])
      const layer = makeLayer('custom-paint', { pixelData })
      // y=1, columns=2, x=0 → idx = 1 * 2 + 0 = 2 → '#00ff00'
      const result = renderEffectPixel(layer, makeContext({ x: 0, y: 1, columns: 2, rows: 2 }))
      expect(result.g).toBe(255)
      expect(result.r).toBe(0)
      expect(result.b).toBe(0)
    })

    it('custom-paint returns black when index is out of range', () => {
      const pixelData = JSON.stringify(['#ff0000'])
      const layer = makeLayer('custom-paint', { pixelData })
      // y=0, columns=1, x=0 → idx = 0 (in range)
      const r0 = renderEffectPixel(layer, makeContext({ x: 0, y: 0, columns: 1, rows: 1 }))
      expect(r0.r).toBe(255)
      // y=0, columns=2, x=0 → idx = 0 (in range) but flat array of length 1 means idx=1 OOB
      const r1 = renderEffectPixel(layer, makeContext({ x: 1, y: 0, columns: 2, rows: 1 }))
      expect(r1.r).toBe(0)
    })

    it('custom-paint returns black when pixelData is missing', () => {
      const layer = makeLayer('custom-paint', {})
      const result = renderEffectPixel(layer, makeContext({ x: 0, y: 0, columns: 10, rows: 10 }))
      expect(result.r).toBe(0)
      expect(result.g).toBe(0)
      expect(result.b).toBe(0)
    })

    it('image-paint returns a valid pixel (may use cached image sample)', () => {
      const layer = makeLayer('image-paint', {})
      const result = renderEffectPixel(layer, makeContext())
      // Even without an image sample, the result should be valid RGB
      expect(result.r).toBeGreaterThanOrEqual(0)
      expect(result.r).toBeLessThanOrEqual(255)
      expect(result.g).toBeGreaterThanOrEqual(0)
      expect(result.g).toBeLessThanOrEqual(255)
      expect(result.b).toBeGreaterThanOrEqual(0)
      expect(result.b).toBeLessThanOrEqual(255)
    })
  })
})
