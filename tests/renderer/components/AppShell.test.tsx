// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AppShell } from '../../../src/renderer/src/components/AppShell'

beforeEach(() => cleanup())

type ShellProps = Parameters<typeof AppShell>[0]

function makeProps(over: Partial<ShellProps> = {}): ShellProps {
  return {
    tabs: ['dashboard', 'workspace'],
    activeView: 'dashboard',
    onOpen: vi.fn(),
    onClose: vi.fn(),
    version: '0.3.44',
    audioEnabled: false,
    onToggleAudio: vi.fn(),
    lang: 'zh',
    onToggleLang: vi.fn(),
    shutdownLabel: '',
    onShutdownClick: vi.fn(),
    children: <div className="fake-view">VIEW</div>,
    ...over
  }
}

describe('AppShell', () => {
  it('renders topbar (brand + tabs + controls) and children as content', () => {
    const { container } = render(<AppShell {...makeProps()} />)
    expect(container.querySelector('.topbar .brand-mark')?.textContent).toBe('RB')
    expect(container.querySelector('.topbar .tab-bar')).not.toBeNull()
    expect(container.querySelector('.app-content .fake-view')?.textContent).toBe('VIEW')
  })

  it('audio toggle reflects state and fires onToggleAudio', () => {
    const onToggleAudio = vi.fn()
    const { container } = render(<AppShell {...makeProps({ onToggleAudio, audioEnabled: true })} />)
    const btn = container.querySelector('.topbar-controls .audio-toggle') as HTMLElement
    expect(btn.classList.contains('active')).toBe(true)
    fireEvent.click(btn)
    expect(onToggleAudio).toHaveBeenCalledOnce()
  })

  it('audio meters render only when levels provided', () => {
    const props = makeProps({ audioEnabled: true })
    const { container, rerender } = render(<AppShell {...props} />)
    expect(container.querySelector('.topbar-meters')).toBeNull()
    rerender(<AppShell {...makeProps({ audioEnabled: true, audioLevels: { bass: 0.5, mid: 0.2, high: 0.1 } })} />)
    expect(container.querySelectorAll('.topbar-meters .audio-meter').length).toBe(3)
  })

  it('shutdown chip is always visible (R73 stays armable) — "off" hint when idle, opens HUD on click', () => {
    const onShutdownClick = vi.fn()
    const { container } = render(<AppShell {...makeProps({ onShutdownClick })} />)
    const chip = container.querySelector('.topbar-chip') as HTMLElement
    expect(chip.textContent).toContain('shutdown.off')
    expect(chip.classList.contains('armed')).toBe(false)
    fireEvent.click(chip)
    expect(onShutdownClick).toHaveBeenCalledOnce()
  })

  it('armed countdown shows in the chip with the armed state', () => {
    const { container } = render(<AppShell {...makeProps({ shutdownLabel: '36:12' })} />)
    const chip = container.querySelector('.topbar-chip') as HTMLElement
    expect(chip.textContent).toContain('36:12')
    expect(chip.classList.contains('armed')).toBe(true)
  })

  it('settings menu closes after a menu item is clicked', () => {
    const { container } = render(<AppShell {...makeProps()} />)
    const details = container.querySelector('.topbar-menu[data-menu="settings"]') as HTMLDetailsElement
    details.setAttribute('open', '')
    fireEvent.click(container.querySelector('.topbar-menu[data-menu="settings"] .topbar-menu-item') as HTMLElement)
    expect(details.hasAttribute('open')).toBe(false)
  })

  it('settings menu opens the settings view via onOpen', () => {
    const onOpen = vi.fn()
    const { container } = render(<AppShell {...makeProps({ onOpen })} />)
    const item = container.querySelector('.topbar-menu[data-menu="settings"] .topbar-menu-item') as HTMLElement
    fireEvent.click(item)
    expect(onOpen).toHaveBeenCalledWith('settings')
  })

  it('user menu items exist and are all disabled (reserved, R85.3)', () => {
    const { container } = render(<AppShell {...makeProps()} />)
    const items = container.querySelectorAll('.topbar-menu[data-menu="user"] .topbar-menu-item[disabled]')
    expect(items.length).toBe(3) // login / profile / logout
    expect(container.querySelector('.topbar-menu-about')?.textContent).toContain('0.3.44')
  })
})
