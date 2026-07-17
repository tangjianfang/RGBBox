import { describe, it, expect } from 'vitest'
import { regionToNormalizedRect, isFullscreenRegion } from '../../src/engine/overlayRegionFrame'
import type { OverlayConfig } from '../../src/shared/types'

describe('engine/overlayRegionFrame', () => {
  describe('isFullscreenRegion', () => {
    it('treats undefined config and an explicit fullscreen region as fullscreen', () => {
      expect(isFullscreenRegion(undefined)).toBe(true)
      expect(isFullscreenRegion({ region: 'fullscreen' })).toBe(true)
    })

    it('treats every preset third and custom region as non-fullscreen', () => {
      expect(isFullscreenRegion({ region: 'top-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'middle-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'bottom-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'left-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'center-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'right-third' })).toBe(false)
      expect(isFullscreenRegion({ region: 'custom', custom: { x: 0, y: 0, width: 1, height: 1 } })).toBe(false)
    })

    it('treats an unknown region string as fullscreen (matches the existing default-case fallback used by regionToNormalizedRect / computeRegionBounds)', () => {
      expect(isFullscreenRegion({ region: 'bogus' as OverlayConfig['region'] })).toBe(true)
    })
  })

  describe('regionToNormalizedRect', () => {
    it('returns the full rect for fullscreen / undefined / unknown region', () => {
      expect(regionToNormalizedRect(undefined)).toEqual({ x: 0, y: 0, width: 1, height: 1 })
      expect(regionToNormalizedRect({ region: 'fullscreen' })).toEqual({ x: 0, y: 0, width: 1, height: 1 })
      expect(regionToNormalizedRect({ region: 'bogus' as OverlayConfig['region'] })).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    })

    it('returns the matching third for each preset region', () => {
      expect(regionToNormalizedRect({ region: 'top-third' })).toEqual({ x: 0, y: 0, width: 1, height: 1 / 3 })
      expect(regionToNormalizedRect({ region: 'middle-third' })).toEqual({ x: 0, y: 1 / 3, width: 1, height: 1 / 3 })
      expect(regionToNormalizedRect({ region: 'bottom-third' })).toEqual({ x: 0, y: 2 / 3, width: 1, height: 1 / 3 })
      expect(regionToNormalizedRect({ region: 'left-third' })).toEqual({ x: 0, y: 0, width: 1 / 3, height: 1 })
      expect(regionToNormalizedRect({ region: 'center-third' })).toEqual({ x: 1 / 3, y: 0, width: 1 / 3, height: 1 })
      expect(regionToNormalizedRect({ region: 'right-third' })).toEqual({ x: 2 / 3, y: 0, width: 1 / 3, height: 1 })
    })

    it('returns the custom rect when region is custom', () => {
      const custom = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }
      expect(regionToNormalizedRect({ region: 'custom', custom })).toEqual(custom)
    })

    it('falls back to the full rect when custom region has no custom bounds', () => {
      expect(regionToNormalizedRect({ region: 'custom' })).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    })
  })
})

