// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { AudioMeters } from '../../../src/renderer/src/components/AudioMeters'

describe('components/AudioMeters (R147 P2)', () => {
  it('subscribes once and writes --level CSS variables straight to the DOM (no re-render path)', () => {
    let deliver: ((d: { bass: number; mid: number; high: number }) => void) | null = null
    const unsubscribe = vi.fn()
    const subscribe = vi.fn((cb: (d: { bass: number; mid: number; high: number }) => void) => {
      deliver = cb
      return unsubscribe
    })
    const { container } = render(<AudioMeters subscribe={subscribe} />)
    expect(subscribe).toHaveBeenCalledOnce()

    const meters = container.querySelectorAll<HTMLDivElement>('.audio-meter')
    expect(meters.length).toBe(3)
    deliver!({ bass: 0.7, mid: 0.5, high: 0.25 })
    expect(meters[0].style.getPropertyValue('--level')).toBe('0.7')
    expect(meters[1].style.getPropertyValue('--level')).toBe('0.5')
    expect(meters[2].style.getPropertyValue('--level')).toBe('0.25')

    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
