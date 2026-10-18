// @vitest-environment happy-dom
// R306/T19: the first-boot vision hint — a one-time dismissible card on the
// dashboard pointing at the AI Lab vision bench. Dismissal persists; a
// damaged storage flag re-shows (a hint must never trap or vanish wrongly).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { VisionFirstHint } from '../../../../src/renderer/src/components/vision/VisionFirstHint'
import { setupRendererMocks } from '../../_helpers'

const KEY = 'rgbbox:visionHintDismissed'

beforeEach(() => {
  localStorage.clear()
  cleanup()
  setupRendererMocks()
})
afterEach(() => cleanup())

describe('components/vision/VisionFirstHint (R306/T19)', () => {
  it('renders on first boot; dismiss persists across remounts', () => {
    const first = render(<VisionFirstHint />).container
    expect(first.querySelector('[data-hint="vision"]')).toBeTruthy()
    expect(first.textContent).toContain('ai.lab.vision.hint.title')
    fireEvent.click(first.querySelector('[data-action="vision-hint-dismiss"]') as HTMLElement)
    expect(localStorage.getItem(KEY)).toBe('1')
    cleanup()
    const second = render(<VisionFirstHint />).container
    expect(second.querySelector('[data-hint="vision"]')).toBeNull()
  })

  it('a damaged flag falls back to SHOWING the hint (never silently gone)', () => {
    localStorage.setItem(KEY, 'not-a-one')
    const c = render(<VisionFirstHint />).container
    expect(c.querySelector('[data-hint="vision"]')).toBeTruthy()
  })
})
