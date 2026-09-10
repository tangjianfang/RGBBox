import { describe, expect, it, vi } from 'vitest'

// shutdownScheduler pulls systemSettingsStore → electron app (module-level
// app.getPath call). Pure helpers under test never touch it, but the import
// chain still needs the mock.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/rgbbox-test' },
}))

const { buildShutdownArgs, buildCancelArgs, validateArmSeconds } = await import('../../src/main/shutdownScheduler')

describe('main/shutdownScheduler (R73)', () => {
  describe('buildShutdownArgs', () => {
    it('arms a Windows shutdown N seconds from now', () => {
      expect(buildShutdownArgs(600)).toEqual(['/s', '/f', '/t', '600', '/c', 'RGBBox scheduled shutdown'])
    })

    it('floors and clamps fractional/zero seconds to at least 1', () => {
      expect(buildShutdownArgs(90.7)[3]).toBe('90')
      expect(buildShutdownArgs(0)[3]).toBe('1')
    })

    it('supports a custom comment', () => {
      expect(buildShutdownArgs(60, 'later').at(-1)).toBe('later')
    })
  })

  describe('buildCancelArgs', () => {
    it('aborts a pending shutdown', () => {
      expect(buildCancelArgs()).toEqual(['/a'])
    })
  })

  describe('validateArmSeconds', () => {
    it('accepts 1 second through 24 hours', () => {
      expect(validateArmSeconds(1)).toBe(true)
      expect(validateArmSeconds(3600)).toBe(true)
      expect(validateArmSeconds(24 * 3600)).toBe(true)
    })

    it('rejects zero, negative, fractional garbage and beyond a day', () => {
      expect(validateArmSeconds(0)).toBe(false)
      expect(validateArmSeconds(-30)).toBe(false)
      expect(validateArmSeconds(NaN)).toBe(false)
      expect(validateArmSeconds(Infinity)).toBe(false)
      expect(validateArmSeconds(24 * 3600 + 1)).toBe(false)
    })
  })
})
