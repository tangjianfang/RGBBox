// @vitest-environment happy-dom
// R321: <html lang> must follow the UI language (it was hard-coded "en" and never
// updated, so Chinese text was tagged English and could pick a JP/KR face for
// shared Han glyphs on non-Chinese Windows).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useEffect } from 'react'

const { I18nProvider, useI18n } = await vi.importActual<typeof import('../../../src/renderer/src/i18n')>('../../../src/renderer/src/i18n')

let setLangRef: ((l: 'zh' | 'en') => void) | null = null
function Probe(): null {
  const { setLang } = useI18n()
  useEffect(() => { setLangRef = setLang }, [setLang])
  return null
}

describe('I18nProvider keeps <html lang> in step with the UI language (R321)', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    document.documentElement.lang = 'en' // index.html's static value
    setLangRef = null
  })

  it('default (no saved choice) is zh → zh-CN before first paint', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('a saved English choice is honoured at boot', () => {
    localStorage.setItem('rgbbox:lang', 'en')
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(document.documentElement.lang).toBe('en')
  })

  it('switching language at runtime updates the attribute both ways', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(document.documentElement.lang).toBe('zh-CN')
    act(() => setLangRef?.('en'))
    expect(document.documentElement.lang).toBe('en')
    act(() => setLangRef?.('zh'))
    expect(document.documentElement.lang).toBe('zh-CN')
  })
})
