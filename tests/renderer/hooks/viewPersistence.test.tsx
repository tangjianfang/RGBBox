// @vitest-environment happy-dom
// R86 review fix: the write side of 'rgbbox:view' persistence moved from the
// (deleted, tested) R85 hook into App.tsx — these tests pin the load/persist
// contract so a later refactor can't silently drop "记忆上次视图" (R86.3).
import { describe, it, expect, beforeEach } from 'vitest'
import {
  VIEW_STORAGE_KEY, loadStoredView, persistView, resolveInitialView
} from '../../../src/renderer/src/hooks/tabNavigation'

beforeEach(() => {
  localStorage.clear()
})

describe('view persistence roundtrip (R86)', () => {
  it('persistView writes the shared key; loadStoredView reads it back', () => {
    persistView('audio')
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('audio')
    expect(loadStoredView(localStorage)).toBe('audio')
  })

  it('roundtrip through resolveInitialView restores the last view', () => {
    persistView('effects')
    expect(resolveInitialView(loadStoredView(localStorage), true)).toBe('effects')
  })

  it('loadStoredView tolerates a missing storage (null)', () => {
    expect(loadStoredView(null)).toBeNull()
  })

  it('unreachable persisted value still falls back to dashboard', () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'model3d')
    expect(resolveInitialView(loadStoredView(localStorage), false)).toBe('dashboard')
  })
})
