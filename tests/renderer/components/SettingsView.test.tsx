// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { SettingsView, type SettingsViewProps } from '../../../src/renderer/src/components/SettingsView'

beforeEach(() => { localStorage.clear(); cleanup() })

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
    uiFontScale: 'md',
    onUiFontScale: vi.fn(),
    uiTheme: 'dark',
    onUiTheme: vi.fn(),
    ...over
  }
}

describe('SettingsView', () => {
  it('renders the four config groups (appearance added by R160.4; AI group moved to AI Lab, R88)', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    const groups = container.querySelectorAll('.settings-group h3')
    const titles = [...groups].map((g) => g.textContent)
    expect(titles).toEqual([
      'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey', 'settings.group.appearance', 'settings.group.games',
      'settings.group.gestures',
    ])
  })

  it('R306/T8: gesture macros — preset apply persists, matrix edits round-trip, conflicts surface live', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    const section = container.querySelector('[data-macro="gestures"]') as HTMLElement
    expect(section).toBeTruthy()
    // preset picker: default + the three shipped presets
    const presetSel = section.querySelector('[data-setting="macro-preset"]') as HTMLSelectElement
    expect(presetSel.options.length).toBe(4)
    fireEvent.change(presetSel, { target: { value: 'party' } })
    const stored = () => JSON.parse(localStorage.getItem('rgbbox:gestureMacros') ?? 'null')
    expect(stored().dir8.workspace.action).toBe('brightnessStep')
    // shipped preset → zero conflicts
    expect(section.querySelector('[data-field="macro-conflicts"]')!.textContent).toContain('0')
    // editing one cell through the matrix round-trips the same storage
    const cell = section.querySelector('[data-cell="dir8:workspace"]') as HTMLSelectElement
    fireEvent.change(cell, { target: { value: 'nextCurated' } })
    expect(stored().dir8.workspace.action).toBe('nextCurated')
    // games scenes stay exempt — no games column in the matrix
    expect(section.querySelector('[data-cell="pinch:games"]')).toBeNull()
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

  it('R160.4: font-scale select offers the five tiers and fires onUiFontScale', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    const select = container.querySelector('select[data-setting="ui-font-scale"]') as HTMLSelectElement
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['xs', 'sm', 'md', 'lg', 'xl'])
    fireEvent.change(select, { target: { value: 'lg' } })
    expect(props.onUiFontScale).toHaveBeenCalledWith('lg')
  })

  it('R148 S5: theme select offers dark/light/system and fires onUiTheme', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    const select = container.querySelector('select[data-setting="ui-theme"]') as HTMLSelectElement
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['dark', 'light', 'system'])
    fireEvent.change(select, { target: { value: 'light' } })
    expect(props.onUiTheme).toHaveBeenCalledWith('light')
  })

  it('R236.3: privacy note renders inside the appearance group', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    const note = container.querySelector('[data-field="privacy-note"]')
    expect(note).not.toBeNull()
    // label + statement both come from i18n (t returns the key in tests)
    expect(note?.textContent).toContain('settings.privacy.label')
    expect(note?.textContent).toContain('settings.privacy.note')
    // it sits under the appearance group, not a group of its own
    const groups = container.querySelectorAll('.settings-group')
    expect(groups.length).toBe(6) // R306/T8 added the gestures macro group
    expect(groups[3].contains(note as Node)).toBe(true)
  })
})
