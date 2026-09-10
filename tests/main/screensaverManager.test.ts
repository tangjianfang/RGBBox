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

const { decideScreensaverAction } = await import('../../src/main/screensaverManager')

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
