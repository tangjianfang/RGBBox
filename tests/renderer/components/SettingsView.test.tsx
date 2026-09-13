// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { SettingsView, type SettingsViewProps } from '../../../src/renderer/src/components/SettingsView'

beforeEach(() => cleanup())

function makeProps(over: Partial<SettingsViewProps> = {}): SettingsViewProps {
  return {
    running: true,
    onToggleEngine: vi.fn(),
    powerSaveBlock: false,
    onPowerSaveBlock: vi.fn(),
    autoLaunch: false,
    onAutoLaunch: vi.fn(),
    screensaverEnabled: false,
    screensaverMinutes: 5,
    onScreensaver: vi.fn(),
    snipHotkey: 'Alt+A',
    onSnipHotkey: vi.fn(),
    ...over
  }
}

describe('SettingsView', () => {
  it('renders the three config groups (AI group moved to AI Lab, R88)', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    const groups = container.querySelectorAll('.settings-group h3')
    const titles = [...groups].map((g) => g.textContent)
    expect(titles).toEqual([
      'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey'
    ])
  })

  it('runtime group: engine toggle, powerSaveBlock, autoLaunch callbacks fire', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    fireEvent.click(container.querySelector('.settings-group .icon-button') as HTMLElement)
    expect(props.onToggleEngine).toHaveBeenCalledOnce()
    const checks = [...container.querySelectorAll('.settings-group label.status-panel input[type="checkbox"]')]
    fireEvent.click(checks[0]); fireEvent.click(checks[1])
    expect(props.onPowerSaveBlock).toHaveBeenCalledWith(true)
    expect(props.onAutoLaunch).toHaveBeenCalledWith(true)
  })

  it('screensaver toggle + threshold fire onScreensaver', () => {
    const props = makeProps({ screensaverEnabled: true, screensaverMinutes: 5 })
    const { container } = render(<SettingsView {...props} />)
    const checks = [...container.querySelectorAll('.settings-group label.status-panel input[type="checkbox"]')]
    fireEvent.click(checks[2]) // screensaver is the 3rd checkbox
    expect(props.onScreensaver).toHaveBeenCalledWith({ enabled: false })
    const select = container.querySelector('.settings-group select[data-setting="screensaver-minutes"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '10' } })
    expect(props.onScreensaver).toHaveBeenCalledWith({ idleMinutes: 10 })
  })

  it('snip hotkey select fires onSnipHotkey', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    const select = container.querySelector('select[data-setting="snip-hotkey"]') as HTMLSelectElement
    expect([...select.querySelectorAll('option')].length).toBeGreaterThan(1)
    fireEvent.change(select, { target: { value: select.options[1].value } })
    expect(props.onSnipHotkey).toHaveBeenCalledWith(select.options[1].value)
  })

  it('ai group is gone (moved to AI Lab, R88)', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    expect(container.querySelector('.settings-group[data-group="ai"]')).toBeNull()
  })
})
