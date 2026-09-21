// @vitest-environment happy-dom
// R147 P0: App-level smoke test — the God Component previously had ZERO
// direct test coverage. Every later refactor phase (P1–P5) leans on this as
// the minimum "App still mounts, boots its IPC surface and renders the shell
// + initial view" tripwire. Deep behaviour stays covered by the 25 per-view
// component suites + CDP E2E.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { setupRendererMocks } from './_helpers'
import { defaultProfile } from '../../src/shared/defaultProfile'

// App creates the preview-engine worker on mount (App.tsx ~907) — happy-dom
// has no Worker; stub with an inert instance.
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  terminate = vi.fn()
}

beforeAll(() => {
  ;(globalThis as unknown as { Worker: unknown }).Worker = FakeWorker
})

const { App } = await import('../../src/renderer/src/App')

describe('renderer/App smoke (R147 P0)', () => {
  it('mounts the shell, boots the IPC surface and renders the initial view', async () => {
    const rgbbox = setupRendererMocks()
    // Full real default profile — the migration spread + effects switch need
    // a well-formed profile, the helper's bare {} would not survive boot.
    rgbbox.getDefaultProfile.mockResolvedValue(structuredClone(defaultProfile))
    localStorage.removeItem('rgbbox:view') // deterministic: dashboard boot

    render(<App />)

    // Boot IPC fan-out completes → shell replaces the boot screen. Rail with
    // its view buttons (ai reachable by default, model3d filtered by flag).
    // "nav.workspace" matches twice by design: rail item + dashboard tile —
    // the tile is the proof the initial VIEW rendered, not just the chrome.
    const nav = await screen.findByRole('navigation', { name: 'a11y.moduleNav' })
    expect(nav).toBeInTheDocument()
    const workspaceButtons = await screen.findAllByRole('button', { name: 'nav.workspace' })
    expect(workspaceButtons.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: 'nav.ai' }).length).toBeGreaterThanOrEqual(1)
    // Boot fan-out consumed: IPC version landed in the shell brand tooltip.
    expect(screen.getByTitle('RGBBox v0.0.0-test')).toBeInTheDocument()
  })
})
