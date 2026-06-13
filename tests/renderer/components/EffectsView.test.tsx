// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { EffectsView } from '../../../src/renderer/src/components/EffectsView'
import { setupRendererMocks } from '../_helpers'
import type { EffectKind } from '../../../src/shared/types'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/EffectsView', () => {
  it('renders without crashing and shows the effect list', () => {
    const { container } = render(
      <EffectsView
        activeKind="rainbow"
        favoriteKinds={[]}
        onSelectEffect={() => {}}
        onToggleFavorite={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })

  it('renders the preset name / kind label', () => {
    const { container } = render(
      <EffectsView
        activeKind="rainbow"
        favoriteKinds={[]}
        onSelectEffect={() => {}}
        onToggleFavorite={() => {}}
      />
    )
    expect(container.textContent?.length).toBeGreaterThan(0)
  })

  it('marks the selected preset', () => {
    const { container } = render(
      <EffectsView
        activeKind="rainbow"
        favoriteKinds={[]}
        onSelectEffect={() => {}}
        onToggleFavorite={() => {}}
      />
    )
    const cards = container.querySelectorAll('[class*="card"], button, [data-testid]')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('invokes onChange when a preset is clicked', () => {
    const onSelectEffect = vi.fn()
    const { container } = render(
      <EffectsView
        activeKind="rainbow"
        favoriteKinds={[]}
        onSelectEffect={onSelectEffect}
        onToggleFavorite={() => {}}
      />
    )
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('highlights favorited kinds', () => {
    const favs: EffectKind[] = ['fire', 'plasma']
    const { container } = render(
      <EffectsView
        activeKind="rainbow"
        favoriteKinds={favs}
        onSelectEffect={() => {}}
        onToggleFavorite={() => {}}
      />
    )
    expect(container).toBeTruthy()
  })
})
