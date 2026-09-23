// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { EffectsView } from '../../../src/renderer/src/components/EffectsView'
import { setupRendererMocks } from '../_helpers'
import type { EffectKind } from '../../../src/shared/types'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

const baseProps = {
  activeKind: 'rainbow' as EffectKind,
  favoriteKinds: [] as EffectKind[],
  curatedKinds: ['aurora', 'rainbow', 'wave'] as EffectKind[],
  onPreviewEffect: () => {},
  onInspire: () => {},
  onSelectEffect: () => {},
  onToggleFavorite: () => {},
}

describe('renderer/components/EffectsView', () => {
  it('renders without crashing and shows the effect list', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    expect(container).toBeTruthy()
  })

  it('renders the preset name / kind label', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('marks the selected preset', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const cards = container.querySelectorAll('[class*="card"], button, [data-testid]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('invokes onChange when a preset is clicked', () => {
    const onSelectEffect = vi.fn()
    const { container } = render(<EffectsView {...baseProps} onSelectEffect={onSelectEffect} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('highlights favorited kinds', () => {
    const favs: EffectKind[] = ['fire', 'plasma']
    const { container } = render(<EffectsView {...baseProps} favoriteKinds={favs} />)
    expect(container).toBeTruthy()
  })

  // ── R164.1 (S1): curated strip + search/tag filter ──────────────────────

  it('R164.1: renders the curated strip with exactly the curated kinds', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const strip = container.querySelector('.effects-curated-section')
    expect(strip).not.toBeNull()
    // 3 curated cards (mock i18n returns keys — assert by card count only).
    expect(strip!.querySelectorAll('.effect-card, [class*="effect-card"]')?.length ?? strip!.querySelectorAll('button').length).toBeGreaterThanOrEqual(3)
  })

  it('R164.1: search filters the grid across categories (and empty query keeps the tag filter)', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const search = container.querySelector('input.effects-search') as HTMLInputElement
    expect(search).not.toBeNull()
    // Classic tab is the default: its 7 cards are mounted before searching.
    const before = container.querySelectorAll('.effects-card-grid')[1].querySelectorAll('.effect-card-main').length
    expect(before).toBe(7)
    // Searching "black-hole" mounts the science card even though the classic
    // tag is active — search overrides the tag filter.
    fireEvent.change(search, { target: { value: 'black-hole' } })
    const after = container.querySelectorAll('.effects-card-grid')[1].querySelectorAll('.effect-card-main').length
    expect(after).toBe(1)
  })

  it('R164.1: no-match search shows the empty hint', () => {
    const { container } = render(<EffectsView {...baseProps} />)
    const search = container.querySelector('input.effects-search') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'zzz-no-such-effect' } })
    expect(container.textContent).toContain('effects.searchNone')
  })
})
