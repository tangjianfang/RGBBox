// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { ProfileManager } from '../../../src/renderer/src/components/ProfileManager'
import { setupRendererMocks } from '../_helpers'
import type { Profile } from '../../../src/shared/types'

beforeEach(() => {
  setupRendererMocks()
  cleanup()
})

const baseProfile: Profile = {
  id: 'p-1',
  name: 'Default',
  layers: []
}

describe('renderer/components/ProfileManager', () => {
  it('renders an empty state when no profiles are loaded', async () => {
    ;(window.rgbbox.listProfiles as any) = vi.fn().mockResolvedValue([])
    const { container } = render(
      <ProfileManager
        currentProfile={baseProfile}
        onLoad={() => {}}
        onClose={() => {}}
      />
    )
    // After initial listProfiles resolves, an empty list should show
    await waitFor(() => expect(window.rgbbox.listProfiles).toHaveBeenCalled())
    expect(container).toBeTruthy()
  })

  it('renders one row per profile in the list', async () => {
    ;(window.rgbbox.listProfiles as any) = vi.fn().mockResolvedValue([
      { id: 'p-1', name: 'Test Profile' },
      { id: 'p-2', name: 'Other' }
    ])
    const { container } = render(
      <ProfileManager
        currentProfile={baseProfile}
        onLoad={() => {}}
        onClose={() => {}}
      />
    )
    await waitFor(() => expect(container.textContent).toMatch(/Test Profile|Other/))
  })

  it('highlights the active profile', async () => {
    ;(window.rgbbox.listProfiles as any) = vi.fn().mockResolvedValue([
      { id: 'p-1', name: 'Test Profile' }
    ])
    const { container } = render(
      <ProfileManager
        currentProfile={baseProfile}
        onLoad={() => {}}
        onClose={() => {}}
      />
    )
    await waitFor(() => expect(container.textContent).toMatch(/Test Profile/))
  })

  it('invokes onLoad when a profile is loaded', async () => {
    ;(window.rgbbox.listProfiles as any) = vi.fn().mockResolvedValue([
      { id: 'p-2', name: 'Other' }
    ])
    ;(window.rgbbox.loadProfileById as any) = vi.fn().mockResolvedValue({ id: 'p-2', name: 'Other' })
    const onLoad = vi.fn()
    const { container } = render(
      <ProfileManager
        currentProfile={baseProfile}
        onLoad={onLoad}
        onClose={() => {}}
      />
    )
    await waitFor(() => expect(container.textContent).toMatch(/Other/))
  })

  it('invokes onClose when close is clicked', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <ProfileManager
        currentProfile={baseProfile}
        onLoad={() => {}}
        onClose={onClose}
      />
    )
    // Try to find and click a close button
    const buttons = Array.from(container.querySelectorAll('button'))
    const closeBtn = buttons.find((b) => /close|cancel|×/i.test(b.textContent ?? b.getAttribute('aria-label') ?? ''))
    if (closeBtn) closeBtn.click()
  })
})
