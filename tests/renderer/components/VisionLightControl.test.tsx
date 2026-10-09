// @vitest-environment happy-dom
// R229: 手势控灯 v1 — the LIGHT ring. Gesture semantics over the real
// vision-input bus: chord open/close, direction select, pinch apply,
// cancel/Esc close. The apply path itself (selectEffect + toast) lives in
// App — here we lock the interaction contract.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { VisionLightControl } from '../../../src/renderer/src/components/vision/VisionLightControl'
import type { EffectKind } from '../../../src/shared/types'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  cleanup()
})

const KINDS: EffectKind[] = ['aurora', 'fire', 'rainbow', 'wave', 'plasma', 'comet', 'sparkle', 'laser', 'strobe']

function fireVision(detail: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new CustomEvent('vision-input', { detail }))
  })
}

function renderRing(active = true, onApplyEffect = vi.fn()) {
  const onOpenChange = vi.fn()
  const utils = render(
    <VisionLightControl active={active} curatedKinds={KINDS} onApplyEffect={onApplyEffect} onOpenChange={onOpenChange} />,
  )
  return { ...utils, onApplyEffect, onOpenChange }
}

describe('renderer/components/VisionLightControl (R229 手势控灯)', () => {
  it('chord light opens the ring; the same chord closes it', () => {
    const { container, onOpenChange } = renderRing()
    expect(container.querySelector('.vision-radial.light')).toBeNull()
    fireVision({ kind: 'chord', name: 'light', down: true })
    expect(container.querySelector('.vision-radial.light')).not.toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireVision({ kind: 'chord', name: 'light', down: true })
    expect(container.querySelector('.vision-radial.light')).toBeNull()
  })

  it('inactive (games view / assistant off) never opens', () => {
    const { container } = renderRing(false)
    fireVision({ kind: 'chord', name: 'light', down: true })
    expect(container.querySelector('.vision-radial.light')).toBeNull()
  })

  it('directions move the highlight in ring order; pinch applies and closes', () => {
    const { container, onApplyEffect } = renderRing()
    fireVision({ kind: 'chord', name: 'light', down: true })
    // right = slot 0 (aurora), up = slot 2 (rainbow)
    fireVision({ kind: 'direction', key: 'ArrowRight', down: true, dir: 'right' })
    expect(container.querySelectorAll('.vision-radial-item')[0].className).toContain('sel')
    fireVision({ kind: 'direction', key: 'ArrowUp', down: true, dir: 'up' })
    expect(container.querySelectorAll('.vision-radial-item')[2].className).toContain('sel')
    fireVision({ kind: 'pinch', key: 'Space', down: true })
    expect(onApplyEffect).toHaveBeenCalledWith('rainbow')
    expect(container.querySelector('.vision-radial.light')).toBeNull()
  })

  it('cancel chord and Esc both close without applying', () => {
    const a = renderRing()
    fireVision({ kind: 'chord', name: 'light', down: true })
    fireVision({ kind: 'chord', name: 'cancel', down: true })
    expect(a.container.querySelector('.vision-radial.light')).toBeNull()

    const b = renderRing()
    fireVision({ kind: 'chord', name: 'light', down: true })
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(b.container.querySelector('.vision-radial.light')).toBeNull()
    expect(a.onApplyEffect).not.toHaveBeenCalled()
    expect(b.onApplyEffect).not.toHaveBeenCalled()
  })

  it('max 8 slots regardless of curated size', () => {
    const { container } = renderRing()
    fireVision({ kind: 'chord', name: 'light', down: true })
    expect(container.querySelectorAll('.vision-radial-item').length).toBe(8)
  })

  it('direction/pinch outside an open ring are ignored (no stray applies)', () => {
    const { onApplyEffect } = renderRing()
    fireVision({ kind: 'direction', key: 'ArrowUp', down: true, dir: 'up' })
    fireVision({ kind: 'pinch', key: 'Space', down: true })
    expect(onApplyEffect).not.toHaveBeenCalled()
  })
})
