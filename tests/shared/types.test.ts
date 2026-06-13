import { describe, it, expect } from 'vitest'
import { EFFECT_3D_KINDS, is3DEffect, type EffectKind, type Effect3DKind } from '../../src/shared/types'

describe('shared/types', () => {
  describe('is3DEffect', () => {
    it('returns true for the 6 known 3D effect kinds', () => {
      const kinds: Effect3DKind[] = [
        'sphere-pulse',
        'warp-portal',
        'neon-galaxy',
        'lava-sphere',
        'laser-show',
        'hologram'
      ]
      for (const k of kinds) {
        expect(is3DEffect(k)).toBe(true)
      }
    })

    it('returns false for CPU-only effect kinds', () => {
      const cpuKinds: EffectKind[] = [
        'screen-ambient',
        'static',
        'breathing',
        'rainbow',
        'wave',
        'zone-gradient',
        'fire',
        'starlight',
        'ripple',
        'spectrum',
        'comet',
        'lightning',
        'aurora',
        'explode',
        'audio-beat',
        'audio-equalizer',
        'random-color',
        'custom-paint',
        'image-paint',
        'plasma',
        'vortex',
        'tunnel',
        'crystal',
        'glitch',
        'matrix-rain',
        'neon-pulse',
        'nebula',
        'fluid-flow',
        'mirror-symmetry',
        'dna-helix',
        'black-hole',
        'solar-system',
        'spiral-galaxy',
        'orion-nebula',
        'pulsar-beacon',
        'hurricane-eye',
        'lightning-leader',
        'icosahedral-virus',
        'protein-folding',
        'mitosis-spindle',
        'synapse-pulse',
        'quantum-collapse',
        'microvilli-field',
        'eclipse-alignment',
        'comet-tail',
        'magnetosphere-aurora',
        'wave-diffraction',
        'vortex-flame',
        'tokamak-plasma'
      ]
      for (const k of cpuKinds) {
        expect(is3DEffect(k)).toBe(false)
      }
    })
  })

  describe('EFFECT_3D_KINDS', () => {
    it('contains exactly 6 kinds', () => {
      expect(EFFECT_3D_KINDS.size).toBe(6)
    })

    it('is a Set<EffectKind>', () => {
      expect(EFFECT_3D_KINDS).toBeInstanceOf(Set)
    })
  })
})
