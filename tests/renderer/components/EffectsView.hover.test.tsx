// R225: hover-preview pill state machine — enter debounce (R164.2) + leave
// grace + pill self-retention (R225.2 fixes the dead 应用 button and, with the
// fixed-position pill, the mount/unmount flicker loop).
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { EffectsView } from '../../../src/renderer/src/components/EffectsView'
import { setupRendererMocks } from '../_helpers'
import type { EffectKind } from '../../../src/shared/types'

beforeEach(() => {
  vi.useFakeTimers()
  setupRendererMocks()
  cleanup()
})

afterEach(() => {
  vi.useRealTimers()
})

const baseProps = {
  activeKind: 'rainbow' as EffectKind,
  favoriteKinds: [] as EffectKind[],
  curatedKinds: ['aurora', 'rainbow', 'wave'] as EffectKind[],
  onPreviewEffect: vi.fn(),
  onInspire: () => {},
  onSelectEffect: vi.fn(),
  onToggleFavorite: () => {},
}

/** React derives pointerenter/leave from pointerover/out — drive those. */
function hoverIn(el: Element) { act(() => { fireEvent.pointerOver(el) }) }
function hoverOut(el: Element) { act(() => { fireEvent.pointerOut(el) }) }
function advance(ms: number) { act(() => { vi.advanceTimersByTime(ms) }) }

function firstCard(container: HTMLElement): Element {
  const card = container.querySelector('.effect-card')
  if (!card) throw new Error('no .effect-card rendered')
  return card
}

describe('renderer/components/EffectsView hover preview (R164.2 + R225)', () => {
  it('R164.2 (kept): hovering a card shows the pill only after the 300ms debounce', () => {
    const onPreviewEffect = vi.fn()
    const { container } = render(<EffectsView {...baseProps} onPreviewEffect={onPreviewEffect} />)
    const card = firstCard(container)

    hoverIn(card)
    expect(container.querySelector('.fx-preview-pill')).toBeNull()

    advance(300)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull()
    expect(onPreviewEffect).toHaveBeenCalled()
  })

  it('R225.2: leaving the card keeps the pill for a 300ms grace (was: instant clear)', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const card = firstCard(container)
    hoverIn(card)
    advance(300)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull()

    hoverOut(card)
    advance(250)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull() // grace window

    advance(100)
    expect(container.querySelector('.fx-preview-pill')).toBeNull() // grace expired
  })

  it('R225.2: hovering the pill itself retains the preview (button reachable)', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const card = firstCard(container)
    hoverIn(card)
    advance(300)
    const pill = container.querySelector('.fx-preview-pill')!

    hoverOut(card)     // travel from card toward the pill…
    hoverIn(pill)      // …arrive before grace expires
    advance(1000)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull()
  })

  it('R225.2: leaving the pill clears after the grace window', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const card = firstCard(container)
    hoverIn(card)
    advance(300)
    const pill = container.querySelector('.fx-preview-pill')!

    hoverOut(card)
    hoverIn(pill)
    hoverOut(pill)
    advance(250)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull()
    advance(100)
    expect(container.querySelector('.fx-preview-pill')).toBeNull()
  })

  it('Esc clears the preview immediately (no grace wait)', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const card = firstCard(container)
    hoverIn(card)
    advance(300)
    expect(container.querySelector('.fx-preview-pill')).not.toBeNull()

    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(container.querySelector('.fx-preview-pill')).toBeNull()
  })

  it('R225.2: the pill 应用 button commits the preview and dismisses the pill', () => {
    const onSelectEffect = vi.fn()
    const { container } = render(<EffectsView {...baseProps} onSelectEffect={onSelectEffect} />)
    const card = firstCard(container)
    hoverIn(card)
    advance(300)
    const pill = container.querySelector('.fx-preview-pill')!
    hoverOut(card)
    hoverIn(pill)

    act(() => { fireEvent.click(pill.querySelector('button')!) })
    expect(onSelectEffect).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.fx-preview-pill')).toBeNull()
  })
})
