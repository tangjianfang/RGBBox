// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { ModuleRail } from '../../../src/renderer/src/components/ModuleRail'

beforeEach(() => cleanup())

function renderRail(over: { model3dEnabled?: boolean } = {}) {
  const props = {
    activeView: 'dashboard' as const,
    onSwitch: vi.fn(),
    onOpenSettings: vi.fn(),
    isSettingsActive: false,
    model3dEnabled: over.model3dEnabled ?? false
  }
  return { props, ...render(<ModuleRail {...props} />) }
}

describe('ModuleRail', () => {
  it('renders dashboard + card modules (model3d gated) + bottom settings', () => {
    const { container } = renderRail()
    // dashboard + 10 卡片模块（R333 +images）− model3d + 底部 settings
    expect(container.querySelectorAll('.rail-item').length).toBe(11)
    expect(container.querySelector('.rail-settings')).not.toBeNull()
  })

  it('shows the model3d entry when enabled', () => {
    const { container } = renderRail({ model3dEnabled: true })
    expect(container.querySelectorAll('.rail-item').length).toBe(12)
  })

  // R333: rail display order is pinned — the images module sits right after
  // video (the migration split them; the order is user-visible navigation
  // structure, not an implementation detail). model3d enabled keeps images
  // in place (flag only gates model3d itself, never neighbours).
  it('renders modules in display order: images right after video, settings last', () => {
    for (const model3dEnabled of [false, true]) {
      const { container } = renderRail({ model3dEnabled })
      const labels = [...container.querySelectorAll('.rail-item')]
        .map((el) => el.getAttribute('aria-label'))
      expect(labels).toEqual(model3dEnabled
        ? ['nav.dashboard', 'nav.workspace', 'nav.effects', 'nav.video', 'nav.images',
           'nav.audio', 'nav.model3d', 'nav.games', 'nav.diagnostics', 'nav.architecture', 'nav.ai', 'nav.settings']
        : ['nav.dashboard', 'nav.workspace', 'nav.effects', 'nav.video', 'nav.images',
           'nav.audio', 'nav.games', 'nav.diagnostics', 'nav.architecture', 'nav.ai', 'nav.settings'])
    }
  })

  it('marks the active view', () => {
    const { container } = renderRail()
    const first = container.querySelector('.rail-item') as HTMLElement // dashboard
    expect(first.classList.contains('active')).toBe(true)
    expect((container.querySelector('.rail-settings') as HTMLElement).classList.contains('active')).toBe(false)
  })

  it('clicking a module calls onSwitch; settings button calls onOpenSettings', () => {
    const { container, props } = renderRail()
    const workspace = [...container.querySelectorAll('.rail-item')]
      .find((el) => el.textContent?.includes('nav.workspace')) as HTMLElement
    fireEvent.click(workspace)
    expect(props.onSwitch).toHaveBeenCalledWith('workspace')
    fireEvent.click(container.querySelector('.rail-settings') as HTMLElement)
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
  })
})
