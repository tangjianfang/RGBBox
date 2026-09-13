import { describe, it, expect } from 'vitest'
import { isKnownView, resolveInitialView } from '../../../src/renderer/src/hooks/tabNavigation'

describe('resolveInitialView (R86 single-view)', () => {
  it('null / invalid / profiles falls back to dashboard', () => {
    expect(resolveInitialView(null, false)).toBe('dashboard')
    expect(resolveInitialView('nope', true)).toBe('dashboard')
    expect(resolveInitialView('profiles', true)).toBe('dashboard')
  })
  it('valid stored view is restored', () => {
    expect(resolveInitialView('audio', true)).toBe('audio')
    expect(resolveInitialView('settings', true)).toBe('settings')
    expect(resolveInitialView('dashboard', false)).toBe('dashboard')
  })
  it('model3d falls back when disabled', () => {
    expect(resolveInitialView('model3d', false)).toBe('dashboard')
    expect(resolveInitialView('model3d', true)).toBe('model3d')
  })
})

describe('isKnownView', () => {
  it('accepts union members, rejects others', () => {
    expect(isKnownView('workspace')).toBe(true)
    expect(isKnownView(123)).toBe(false)
    expect(isKnownView(undefined)).toBe(false)
  })
})
