import { describe, it, expect } from 'vitest'
import {
  closeView, openView, resolveInitialTabs, sanitizeTabs,
  type TabNavState
} from '../../../src/renderer/src/hooks/tabNavigation'

const base: TabNavState = { tabs: ['dashboard', 'workspace'], activeView: 'workspace' }

describe('sanitizeTabs', () => {
  it('always prepends dashboard exactly once and dedupes', () => {
    expect(sanitizeTabs(['workspace', 'dashboard', 'effects', 'workspace'], true))
      .toEqual(['dashboard', 'workspace', 'effects'])
  })
  it('drops unknown / non-tabbable (profiles) entries', () => {
    expect(sanitizeTabs(['workspace', 'nope', 'profiles'], true)).toEqual(['dashboard', 'workspace'])
  })
  it('drops model3d when disabled', () => {
    expect(sanitizeTabs(['model3d', 'video'], false)).toEqual(['dashboard', 'video'])
  })
  it('empty / non-array input returns dashboard-only', () => {
    expect(sanitizeTabs(undefined, true)).toEqual(['dashboard'])
    expect(sanitizeTabs('nope', true)).toEqual(['dashboard'])
  })
})

describe('resolveInitialTabs', () => {
  it('fresh install → dashboard only', () => {
    expect(resolveInitialTabs(null, null, false)).toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
  it('legacy rgbbox:view migrates into a tab (old users land back home-free)', () => {
    expect(resolveInitialTabs(null, 'audio', true))
      .toEqual({ tabs: ['dashboard', 'audio'], activeView: 'audio' })
  })
  it('stored tabs + stored active are restored', () => {
    expect(resolveInitialTabs('["dashboard","effects","video"]', 'video', true))
      .toEqual({ tabs: ['dashboard', 'effects', 'video'], activeView: 'video' })
  })
  it('corrupt stored tabs falls back to legacy view migration', () => {
    expect(resolveInitialTabs('{bad json', 'effects', true))
      .toEqual({ tabs: ['dashboard', 'effects'], activeView: 'effects' })
  })
  it('active not in tabs (model3d disabled) falls back to dashboard', () => {
    expect(resolveInitialTabs('["dashboard","model3d"]', 'model3d', false))
      .toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
})

describe('openView', () => {
  it('appends new module tab and activates it', () => {
    expect(openView(base, 'audio')).toEqual({ tabs: ['dashboard', 'workspace', 'audio'], activeView: 'audio' })
  })
  it('re-open focuses existing tab without duplicating', () => {
    expect(openView(base, 'workspace')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'workspace' })
  })
  it('dashboard just activates', () => {
    const s = { tabs: ['dashboard', 'workspace'], activeView: 'workspace' } as TabNavState
    expect(openView(s, 'dashboard')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'dashboard' })
  })
  it('non-tabbable view is a no-op', () => {
    expect(openView(base, 'profiles')).toEqual(base)
  })
})

describe('closeView', () => {
  it('dashboard cannot be closed', () => {
    expect(closeView(base, 'dashboard')).toEqual(base)
  })
  it('closing the active tab returns to dashboard', () => {
    expect(closeView(base, 'workspace')).toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
  it('closing a background tab keeps the active one', () => {
    const s = { tabs: ['dashboard', 'workspace', 'effects'], activeView: 'workspace' } as TabNavState
    expect(closeView(s, 'effects')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'workspace' })
  })
})
