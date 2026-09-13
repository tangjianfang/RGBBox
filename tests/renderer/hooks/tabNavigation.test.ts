import { describe, it, expect } from 'vitest'
import { isKnownView, isViewReachable, resolveInitialView } from '../../../src/renderer/src/hooks/tabNavigation'

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

describe('isViewReachable (single feature-flag gate)', () => {
  it('profiles is never reachable', () => {
    expect(isViewReachable('profiles', true)).toBe(false)
  })
  it('model3d gated by flag', () => {
    expect(isViewReachable('model3d', false)).toBe(false)
    expect(isViewReachable('model3d', true)).toBe(true)
  })
  it('everything else reachable', () => {
    expect(isViewReachable('dashboard', false)).toBe(true)
    expect(isViewReachable('settings', false)).toBe(true)
  })
})
