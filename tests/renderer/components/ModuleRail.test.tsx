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
    // dashboard + 8 卡片模块 − model3d + 底部 settings
    expect(container.querySelectorAll('.rail-item').length).toBe(9)
    expect(container.querySelector('.rail-settings')).not.toBeNull()
  })

  it('shows the model3d entry when enabled', () => {
    const { container } = renderRail({ model3dEnabled: true })
    expect(container.querySelectorAll('.rail-item').length).toBe(10)
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
