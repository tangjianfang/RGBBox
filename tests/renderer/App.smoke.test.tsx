// @vitest-environment happy-dom
// R147 P0: App-level smoke test — the God Component previously had ZERO
// direct test coverage. Every later refactor phase (P1–P5) leans on this as
// the minimum "App still mounts, boots its IPC surface and renders the shell
// + initial view" tripwire. Deep behaviour stays covered by the 25 per-view
// component suites + CDP E2E.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { setupRendererMocks } from './_helpers'
import { defaultProfile } from '../../src/shared/defaultProfile'
import { VIEW_STORAGE_KEY } from '../../src/renderer/src/hooks/tabNavigation'

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
    // R303: 磁贴可访问名现在含描述行（读屏器获得更多上下文）→ 正则子串匹配。
    const nav = await screen.findByRole('navigation', { name: 'a11y.moduleNav' })
    expect(nav).toBeInTheDocument()
    const workspaceButtons = await screen.findAllByRole('button', { name: /nav\.workspace/ })
    expect(workspaceButtons.length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: 'nav.ai' }).length).toBeGreaterThanOrEqual(1)
    // Boot fan-out consumed: IPC version landed in the shell brand tooltip.
    expect(screen.getByTitle('RGBBox v0.0.0-test')).toBeInTheDocument()
  })

  // R333 routing: a persisted 'images' view boots the image studio (the
  // migration's new route), the rail marks it current, and — unlike the
  // keep-alive video/audio anchors — switching away unmounts it（无持续播放
  // 媒体；相机/屏幕轨道随 unmount cleanup 停）。切回重挂载。
  it('R333: boots into the images studio and unmounts it on switch-away (no keep-alive)', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.getDefaultProfile.mockResolvedValue(structuredClone(defaultProfile))
    localStorage.setItem(VIEW_STORAGE_KEY, 'images') // deterministic: images boot

    const { container, unmount } = render(<App />)

    // routed: lazy ImageStudioView resolves inside Suspense → studio root
    await waitFor(() => {
      expect(container.querySelector('.images-studio')).not.toBeNull()
    })
    // rail ↔ route lockstep: the images rail item is the current page
    const railBtn = (v: string) =>
      [...container.querySelectorAll('.module-rail .rail-item')].find(
        (el) => el.getAttribute('aria-label') === v
      )
    expect(railBtn('nav.images')?.getAttribute('aria-current')).toBe('page')
    // single active view: the video studio is NOT mounted alongside
    expect(container.querySelector('.video-studio')).toBeNull()

    // switch away → video anchor mounts (its own keep-alive), images unmounts
    fireEvent.click(railBtn('nav.video')!)
    await waitFor(() => {
      expect(container.querySelector('.video-studio')).not.toBeNull()
    })
    expect(container.querySelector('.images-studio')).toBeNull()

    // switch back → fresh mount (filmstrip re-lists captures on mount)
    fireEvent.click(railBtn('nav.images')!)
    await waitFor(() => {
      expect(container.querySelector('.images-studio')).not.toBeNull()
    })
    unmount()
  })
})
