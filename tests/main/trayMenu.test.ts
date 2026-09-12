import { describe, it, expect } from 'vitest'
import { asUiLocale, trayMenuLabels } from '../../src/main/trayMenu'

describe('trayMenu (R80.12)', () => {
  it('zh labels match shipped defaults', () => {
    const L = trayMenuLabels('zh', 'Alt+A')
    expect(L.toggle).toBe('显示 / 隐藏主界面')
    expect(L.snip).toBe('截图 (Alt+A)')
    expect(L.quit).toBe('退出 RGBBox')
  })

  it('en labels follow the hotkey label through', () => {
    const L = trayMenuLabels('en', 'Alt+A')
    expect(L.toggle).toBe('Show / Hide Main Window')
    expect(L.snip).toBe('Snip (Alt+A)')
    expect(L.quit).toBe('Quit RGBBox')
    expect(trayMenuLabels('en', 'F2').snip).toBe('Snip (F2)')
  })

  it('asUiLocale whitelists zh/en and defaults to zh', () => {
    expect(asUiLocale('en')).toBe('en')
    expect(asUiLocale('zh')).toBe('zh')
    expect(asUiLocale('fr')).toBe('zh')
    expect(asUiLocale(undefined)).toBe('zh')
  })
})
