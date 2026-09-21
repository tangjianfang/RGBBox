import { describe, expect, it, vi } from 'vitest'

// screensaverManager imports electron directly (BrowserWindow/powerMonitor/
// powerSaveBlocker/screen) and systemSettingsStore (app.getPath at module
// level). Only the pure idle-transition decision is tested here — the mock
// just needs to satisfy the import chain.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/rgbbox-test', isPackaged: true },
  BrowserWindow: class {},
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  screen: { getAllDisplays: () => [] },
  powerMonitor: { getSystemIdleState: () => 'active', on: () => {}, removeListener: () => {} },
  powerSaveBlocker: { start: () => 1, stop: () => {} },
}))

const { decideScreensaverAction, getPollPlan } = await import('../../src/main/screensaverManager')

describe('main/screensaverManager decideScreensaverAction (R74)', () => {
  it('opens when the system goes idle and nothing is open', () => {
    expect(decideScreensaverAction('idle', false, false)).toBe('open')
  })

  it('stays put while idle and already open', () => {
    expect(decideScreensaverAction('idle', true, false)).toBe('none')
  })

  it('does not re-open after a manual close until the system is active again', () => {
    expect(decideScreensaverAction('idle', false, true)).toBe('none')
    // once activity resumed, suppression is lifted and a later idle re-triggers
    expect(decideScreensaverAction('active', false, true)).toBe('none')
    expect(decideScreensaverAction('idle', false, false)).toBe('open')
  })

  it('closes on activity (user input ended the screensaver)', () => {
    expect(decideScreensaverAction('active', true, false)).toBe('close')
    expect(decideScreensaverAction('active', false, false)).toBe('none')
  })

  it('closes on lock-screen — windows are invisible behind the secure desktop', () => {
    expect(decideScreensaverAction('locked', true, false)).toBe('close')
    expect(decideScreensaverAction('locked', false, false)).toBe('close')
  })

  it('never acts on unknown idle states', () => {
    expect(decideScreensaverAction('unknown', false, false)).toBe('none')
    expect(decideScreensaverAction('unknown', true, false)).toBe('none')
  })
})

describe('main/screensaverManager getPollPlan (R146)', () => {
  it('polls slowly against the configured idle threshold while no window is open', () => {
    expect(getPollPlan(false, 5)).toEqual({ intervalMs: 20_000, idleThresholdSeconds: 300 })
    expect(getPollPlan(false, 1)).toEqual({ intervalMs: 20_000, idleThresholdSeconds: 60 })
  })

  it('switches to a 1s any-input poll while the screensaver is showing', () => {
    // 1s cadence + 1s threshold: ANY keyboard/mouse input in the last second
    // reads as 'active' → all windows close. Independent of window focus,
    // which the Windows foreground lock denies to a background-opened window.
    expect(getPollPlan(true, 5)).toEqual({ intervalMs: 1_000, idleThresholdSeconds: 1 })
    expect(getPollPlan(true, 30)).toEqual({ intervalMs: 1_000, idleThresholdSeconds: 1 })
  })
})
