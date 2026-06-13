import { describe, it, expect } from 'vitest'
import { computeZoneMaskWeight, renderPreviewFrame } from '../../src/engine/previewEngine'
import type { EffectLayer, Profile, RgbFrame } from '../../src/shared/types'

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'test-profile',
    name: 'Test',
    activeSceneId: 'scene-1',
    performanceMode: 'balanced',
    sampling: {
      columns: 10,
      rows: 5,
      fps: 30,
      smoothing: 0.5,
      brightnessLimit: 1.0,
      saturationBoost: 1.0,
      usePerformanceGuard: true,
      showGap: false,
    },
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        displayIds: [1],
        layers: [
          {
            id: 'layer-1',
            name: 'Static Red',
            kind: 'static',
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            parameters: { color: '#ff0000' },
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('engine/previewEngine', () => {
  describe('computeZoneMaskWeight', () => {
    it('"full" preset returns 1 for all positions', () => {
      expect(computeZoneMaskWeight(0, 0, 10, 5, 'full')).toBe(1)
      expect(computeZoneMaskWeight(9, 4, 10, 5, 'full')).toBe(1)
    })

    it('"top" preset: top row → 1, bottom row → 0', () => {
      expect(computeZoneMaskWeight(5, 0, 10, 5, 'top')).toBeGreaterThan(0.9)
      expect(computeZoneMaskWeight(5, 4, 10, 5, 'top')).toBeLessThan(0.1)
    })

    it('"bottom" preset: bottom row → 1, top row → 0', () => {
      expect(computeZoneMaskWeight(5, 0, 10, 5, 'bottom')).toBeLessThan(0.1)
      expect(computeZoneMaskWeight(5, 4, 10, 5, 'bottom')).toBeGreaterThan(0.9)
    })

    it('"left" preset: left col → 1, right col → 0', () => {
      expect(computeZoneMaskWeight(0, 2, 10, 5, 'left')).toBeGreaterThan(0.9)
      expect(computeZoneMaskWeight(9, 2, 10, 5, 'left')).toBeLessThan(0.1)
    })

    it('"right" preset: right col → 1, left col → 0', () => {
      expect(computeZoneMaskWeight(0, 2, 10, 5, 'right')).toBeLessThan(0.1)
      expect(computeZoneMaskWeight(9, 2, 10, 5, 'right')).toBeGreaterThan(0.9)
    })

    it('"center" preset: centre → 1, corner → 0', () => {
      expect(computeZoneMaskWeight(5, 2, 10, 5, 'center')).toBeGreaterThan(0.5)
      expect(computeZoneMaskWeight(0, 0, 10, 5, 'center')).toBeLessThan(0.1)
    })

    it('unknown zone returns 1 (pass-through)', () => {
      expect(computeZoneMaskWeight(5, 2, 10, 5, 'bogus')).toBe(1)
    })
  })

  describe('renderPreviewFrame', () => {
    it('produces a frame of the requested dimensions', () => {
      const frame = renderPreviewFrame(makeProfile())
      expect(frame.columns).toBe(10)
      expect(frame.rows).toBe(5)
      expect(frame.pixels).toHaveLength(10 * 5 * 3)
      expect(frame.generatedAt).toBeGreaterThan(0)
    })

    it('static red layer → all pixels are red', () => {
      const frame = renderPreviewFrame(makeProfile())
      for (let i = 0; i < frame.pixels.length; i += 3) {
        expect(frame.pixels[i]).toBe(255)
        expect(frame.pixels[i + 1]).toBe(0)
        expect(frame.pixels[i + 2]).toBe(0)
      }
    })

    it('disabled layer does not contribute colour', () => {
      const profile = makeProfile()
      profile.scenes[0].layers[0].enabled = false
      const frame = renderPreviewFrame(profile)
      // Should be black (no enabled layers)
      for (let i = 0; i < frame.pixels.length; i += 3) {
        expect(frame.pixels[i]).toBe(0)
        expect(frame.pixels[i + 1]).toBe(0)
        expect(frame.pixels[i + 2]).toBe(0)
      }
    })

    it('zero-size sampling is clamped to 1x1', () => {
      const profile = makeProfile()
      profile.sampling.columns = 0
      profile.sampling.rows = 0
      const frame = renderPreviewFrame(profile)
      expect(frame.columns).toBe(1)
      expect(frame.rows).toBe(1)
      expect(frame.pixels).toHaveLength(3)
    })

    it('falls back to first scene if activeSceneId not found', () => {
      const profile = makeProfile()
      profile.activeSceneId = 'nonexistent'
      const frame = renderPreviewFrame(profile)
      // Still renders the first scene's layer
      expect(frame.pixels[0]).toBe(255)
    })

    it('uses scene display slot mask (linkedDisplays)', () => {
      const profile = makeProfile()
      profile.scenes[0].displayIds = [1, 2, 3]
      profile.scenes[0].linkedDisplays = true
      profile.scenes[0].layers[0].parameters = { color: '#ff0000', _displaySlot: '1' }
      const frame = renderPreviewFrame(profile)
      // The middle display slot (index 1 of 3) should be fully lit; the other two slots should be black.
      // Sample the centre of each slot: with cols=10, slots are roughly x=[0..2], [3..6], [7..9]
      const cols = frame.columns
      const rows = frame.rows
      // Centre column of the middle slot (x=5): should be fully red (255)
      const middleP3 = (Math.floor(rows / 2) * cols + 5) * 3
      expect(frame.pixels[middleP3]).toBe(255)
      // Centre of the left slot (x=1): should be black (mask=0)
      const leftP3 = (Math.floor(rows / 2) * cols + 1) * 3
      expect(frame.pixels[leftP3]).toBe(0)
      // Centre of the right slot (x=8): should be black (mask=0)
      const rightP3 = (Math.floor(rows / 2) * cols + 8) * 3
      expect(frame.pixels[rightP3]).toBe(0)
    })

    it('zone mask masks out-of-zone pixels', () => {
      const profile = makeProfile()
      profile.scenes[0].layers[0].parameters = { color: '#ff0000', _maskZone: 'top' }
      const frame = renderPreviewFrame(profile)
      const cols = frame.columns
      const rows = frame.rows
      // Top row should be red, bottom row should be black
      const topR = frame.pixels[0]
      const bottomP3 = ((rows - 1) * cols + Math.floor(cols / 2)) * 3
      const bottomR = frame.pixels[bottomP3]
      expect(topR).toBeGreaterThan(100)
      expect(bottomR).toBe(0)
    })

    it('respects brightnessLimit', () => {
      const profile = makeProfile()
      profile.sampling.brightnessLimit = 0.5
      const frame = renderPreviewFrame(profile)
      expect(frame.pixels[0]).toBe(Math.round(255 * 0.5))
    })

    it('smoothing with previousFrame produces intermediate colour', () => {
      const profile = makeProfile()
      const previousFrame: RgbFrame = {
        columns: 10,
        rows: 5,
        pixels: new Uint8ClampedArray(10 * 5 * 3), // all black
        generatedAt: 0,
      }
      profile.sampling.smoothing = 0.5
      const frame = renderPreviewFrame(profile, 0, previousFrame)
      // With smoothing=0.5, the result is halfway between red and black → ~128
      expect(frame.pixels[0]).toBeGreaterThan(50)
      expect(frame.pixels[0]).toBeLessThan(200)
    })

    it('ignores previousFrame with mismatched dimensions', () => {
      const profile = makeProfile()
      const previousFrame: RgbFrame = {
        columns: 5,
        rows: 5, // mismatched
        pixels: new Uint8ClampedArray(5 * 5 * 3),
        generatedAt: 0,
      }
      const frame = renderPreviewFrame(profile, 0, previousFrame)
      // Should ignore previousFrame → full red
      expect(frame.pixels[0]).toBe(255)
    })

    it('usePerformanceGuard=false disables smoothing', () => {
      const profile = makeProfile()
      profile.sampling.usePerformanceGuard = false
      profile.sampling.smoothing = 0.9
      const previousFrame: RgbFrame = {
        columns: 10,
        rows: 5,
        pixels: new Uint8ClampedArray(10 * 5 * 3), // all black
        generatedAt: 0,
      }
      const frame = renderPreviewFrame(profile, 0, previousFrame)
      // No smoothing → pure red
      expect(frame.pixels[0]).toBe(255)
    })

    it('uses screen sample when dimensions match', () => {
      const profile = makeProfile()
      const screenSample: RgbFrame = {
        columns: 10,
        rows: 5,
        pixels: new Uint8ClampedArray(10 * 5 * 3).fill(128) as Uint8ClampedArray,
        generatedAt: 0,
      }
      const layer: EffectLayer = {
        id: 'sa',
        name: 'Screen Ambient',
        kind: 'screen-ambient',
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        parameters: { saturation: 1, contrast: 1 },
      }
      profile.scenes[0].layers = [layer]
      const frame = renderPreviewFrame(profile, 0, undefined, undefined, screenSample)
      // Should be 128 (from screen sample, no smoothing)
      expect(frame.pixels[0]).toBeGreaterThan(120)
      expect(frame.pixels[0]).toBeLessThan(136)
    })
  })
})
