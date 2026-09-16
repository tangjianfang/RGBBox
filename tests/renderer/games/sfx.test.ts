// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { isBgmEnabled, isSfxEnabled, setBgmEnabled, setSfxEnabled } from '../../../src/renderer/src/games/sfx'

describe('renderer/games/sfx toggles (R108)', () => {
  it('bgm toggle persists across module state and localStorage', () => {
    setBgmEnabled(false)
    expect(isBgmEnabled()).toBe(false)
    expect(localStorage.getItem('rgbbox:gamesBgm')).toBe('off')
    setBgmEnabled(true)
    expect(isBgmEnabled()).toBe(true)
    expect(localStorage.getItem('rgbbox:gamesBgm')).toBe('on')
  })

  it('sfx toggle persists', () => {
    setSfxEnabled(false)
    expect(isSfxEnabled()).toBe(false)
    expect(localStorage.getItem('rgbbox:gamesSfx')).toBe('off')
    setSfxEnabled(true)
    expect(isSfxEnabled()).toBe(true)
  })
})
