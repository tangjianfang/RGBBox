// R224.3: resolved UI theme → WCO overlay color mapping (pure, shared).
import { describe, it, expect } from 'vitest'
import {
  TITLE_BAR_OVERLAY_COLORS,
  isResolvedTheme,
  titleBarOverlayColors,
} from '../../src/shared/titleBarTheme'

describe('titleBarOverlayColors', () => {
  it('dark keeps the shipped overlay values (= dark --bg-toolbar / current symbol)', () => {
    expect(titleBarOverlayColors('dark')).toEqual({ color: '#11191f', symbolColor: '#9cb7c3' })
    expect(TITLE_BAR_OVERLAY_COLORS.dark).toEqual({ color: '#11191f', symbolColor: '#9cb7c3' })
  })

  it('light flips to the light --bg-toolbar / --text-secondary so the strip joins the topbar', () => {
    expect(titleBarOverlayColors('light')).toEqual({ color: '#e9eff2', symbolColor: '#3f5a66' })
  })

  it('unknown values fall back to dark (root default) instead of throwing', () => {
    expect(titleBarOverlayColors('bogus' as never)).toEqual(TITLE_BAR_OVERLAY_COLORS.dark)
  })
})

describe('isResolvedTheme', () => {
  it('accepts exactly dark|light', () => {
    expect(isResolvedTheme('dark')).toBe(true)
    expect(isResolvedTheme('light')).toBe(true)
    expect(isResolvedTheme('system')).toBe(false)
    expect(isResolvedTheme('')).toBe(false)
  })
})
