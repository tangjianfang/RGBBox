// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTabNavigation } from '../../../src/renderer/src/hooks/useTabNavigation'

beforeEach(() => {
  localStorage.clear()
})

describe('useTabNavigation', () => {
  it('starts on dashboard-only for a fresh install', () => {
    const { result } = renderHook(() => useTabNavigation(false))
    expect(result.current.tabs).toEqual(['dashboard'])
    expect(result.current.activeView).toBe('dashboard')
  })

  it('migrates a legacy rgbbox:view into a restored tab', () => {
    localStorage.setItem('rgbbox:view', 'audio')
    const { result } = renderHook(() => useTabNavigation(true))
    expect(result.current.tabs).toEqual(['dashboard', 'audio'])
    expect(result.current.activeView).toBe('audio')
  })

  it('persists tabs and active view after open/close', () => {
    const { result } = renderHook(() => useTabNavigation(true))
    act(() => result.current.openView('effects'))
    act(() => result.current.openView('video'))
    act(() => result.current.closeView('effects'))
    expect(localStorage.getItem('rgbbox:tabs')).toBe('["dashboard","video"]')
    expect(localStorage.getItem('rgbbox:view')).toBe('video')
  })

  it('close of the active tab lands back on dashboard', () => {
    const { result } = renderHook(() => useTabNavigation(true))
    act(() => result.current.openView('games'))
    act(() => result.current.closeView('games'))
    expect(result.current.activeView).toBe('dashboard')
    expect(result.current.tabs).toEqual(['dashboard'])
  })
})
