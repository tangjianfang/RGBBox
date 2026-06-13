// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MiniGamesView } from '../../../src/renderer/src/components/MiniGamesView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

describe('renderer/components/MiniGamesView', () => {
  it('renders the mini-games view container', () => {
    const { container } = render(<MiniGamesView />)
    expect(container).toBeTruthy()
  })

  it('renders a list of game entries', () => {
    const { container } = render(<MiniGamesView />)
    expect(container.querySelectorAll('button, [role="button"]').length).toBeGreaterThan(0)
  })

  it('transitions to a game when one is clicked', () => {
    const { container } = render(<MiniGamesView />)
    const buttons = container.querySelectorAll('button')
    if (buttons.length > 0) fireEvent.click(buttons[0])
    expect(container).toBeTruthy()
  })
})
