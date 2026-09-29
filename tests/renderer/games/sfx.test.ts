// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  BGM_PRESETS,
  getActiveBgmPreset,
  getBgmTension,
  isBgmEnabled,
  isSfxEnabled,
  setBgmEnabled,
  setBgmPreset,
  setBgmTension,
  setSfxEnabled,
} from '../../../src/renderer/src/games/sfx'

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

describe('renderer/games/sfx BGM 张力变奏 (FR-G07 二期)', () => {
  it('non-default preset: setBgmTension(1) applies the tension variant, (0) reverts to base', () => {
    setBgmPreset('td')
    expect(getBgmTension()).toBe(0)
    setBgmTension(1)
    expect(getBgmTension()).toBe(1)
    const active = getActiveBgmPreset()
    expect(active).toMatchObject(BGM_PRESETS.td.tension!)
    // 变奏形态守护:主旋律八度上移、节拍加密(音符时值随 stepMs 缩短)
    expect(active.arp[0]).toBe(BGM_PRESETS.td.arp[0] * 2)
    expect(active.stepMs).toBeLessThan(BGM_PRESETS.td.stepMs)
    setBgmTension(0)
    expect(getBgmTension()).toBe(0)
    // 回切后生效预设即基线对象本身
    expect(getActiveBgmPreset()).toBe(BGM_PRESETS.td)
  })

  it('default preset has no tension: setBgmTension(1) is a no-op', () => {
    setBgmPreset('default')
    setBgmTension(1)
    expect(getBgmTension()).toBe(0)
    expect(getActiveBgmPreset()).toBe(BGM_PRESETS.default)
    setBgmTension(0)
    expect(getBgmTension()).toBe(0)
  })

  it('tension override is partial: unspecified fields inherit from the base preset', () => {
    const original = BGM_PRESETS.swarm.tension
    try {
      BGM_PRESETS.swarm.tension = { stepMs: 123 }
      setBgmPreset('swarm')
      setBgmTension(1)
      const active = getActiveBgmPreset()
      expect(active.stepMs).toBe(123)
      expect(active.arp).toEqual(BGM_PRESETS.swarm.arp)
      expect(active.wave).toBe(BGM_PRESETS.swarm.wave)
    } finally {
      BGM_PRESETS.swarm.tension = original
      setBgmTension(0)
    }
  })

  it('setBgmPreset resets the tension level to 0', () => {
    setBgmPreset('td')
    setBgmTension(1)
    setBgmPreset('slash')
    expect(getBgmTension()).toBe(0)
    expect(getActiveBgmPreset()).toBe(BGM_PRESETS.slash)
  })
})
