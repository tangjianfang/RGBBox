// R148 S5: theme preference resolution + <html data-theme> application.
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  UI_THEME_DEFAULT,
  UI_THEME_OPTIONS,
  applyTheme,
  bootTheme,
  isUiThemeId,
  resolveTheme,
} from '../../../src/renderer/src/domain/uiTheme'

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

describe('resolveTheme', () => {
  it('explicit preferences win regardless of OS scheme', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it("system rides prefers-color-scheme and unknown ids degrade to system behavior", () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('bogus', false)).toBe('light')
  })

  it('dark is the shipped default (stage-first design language)', () => {
    expect(UI_THEME_DEFAULT).toBe('dark')
    expect(UI_THEME_OPTIONS.map((o) => o.id)).toEqual(['dark', 'light', 'system'])
    expect(isUiThemeId('light')).toBe(true)
    expect(isUiThemeId('nope')).toBe(false)
  })
})

describe('applyTheme', () => {
  it('light stamps data-theme="light" on <html>; dark removes it (root default)', () => {
    expect(applyTheme('light', true)).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(applyTheme('dark', false)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})

describe('bootTheme', () => {
  it('applies the persisted preference pre-paint; missing storage falls back to dark', () => {
    localStorage.setItem('rgbbox:theme', 'light')
    expect(bootTheme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    localStorage.removeItem('rgbbox:theme')
    expect(bootTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('storage failures degrade silently to the dark default', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(bootTheme()).toBe('dark')
    get.mockRestore()
  })
})
