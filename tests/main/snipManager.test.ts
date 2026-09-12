import { describe, it, expect } from 'vitest'
import { isPresetSnipHotkey, matchDisplayToSource, physicalThumbSize, resolveFinishAction, PRESET_SNIP_HOTKEYS } from '../../src/main/snipManager'
import { ipcChannels } from '../../src/shared/ipc'

describe('snipManager pure (R80.2)', () => {
  it('matchDisplayToSource pairs by display_id string; unmatched displays skipped', () => {
    const sources = [
      { id: 'screen:0', display_id: '123' },
      { id: 'window:1' },
      { id: 'screen:2', display_id: '456' },
    ]
    const displays = [{ id: 123 }, { id: 456 }, { id: 789 }]
    const m = matchDisplayToSource(sources, displays)
    expect(m.get(123)?.id).toBe('screen:0')
    expect(m.get(456)?.id).toBe('screen:2')
    expect(m.has(789)).toBe(false)
    expect(m.size).toBe(2)
  })

  it('physicalThumbSize = bounds × scaleFactor (rounded)', () => {
    expect(physicalThumbSize({ bounds: { width: 2560, height: 1440 }, scaleFactor: 1 })).toEqual({ width: 2560, height: 1440 })
    expect(physicalThumbSize({ bounds: { width: 1706.67, height: 960 }, scaleFactor: 1.5 })).toEqual({ width: 2560, height: 1440 })
  })

  it('resolveFinishAction: copy = clipboard+capture, save = download+capture only', () => {
    expect(resolveFinishAction('copy')).toEqual({ clipboard: true, addCapture: true, download: false })
    expect(resolveFinishAction('save')).toEqual({ clipboard: false, addCapture: true, download: true })
  })

  it('IPC channel constants exist (R80.4)', () => {
    expect(ipcChannels.snipGetFrame).toBe('rgbbox:snip:get-frame')
    expect(ipcChannels.snipFinish).toBe('rgbbox:snip:finish')
    expect(ipcChannels.snipCancel).toBe('rgbbox:snip:cancel')
  })

  it('R81: snip hotkey preset whitelist', () => {
    expect(PRESET_SNIP_HOTKEYS).toEqual(['Alt+A', 'Ctrl+Alt+A', 'Ctrl+Shift+S', 'F2', 'PrintScreen'])
    expect(isPresetSnipHotkey('Alt+A')).toBe(true)
    expect(isPresetSnipHotkey('F2')).toBe(true)
    expect(isPresetSnipHotkey('Ctrl+Z')).toBe(false)   // 非白名单
    expect(isPresetSnipHotkey('')).toBe(false)
    expect(ipcChannels.snipGetHotkey).toBe('rgbbox:snip:get-hotkey')
    expect(ipcChannels.snipSetHotkey).toBe('rgbbox:snip:set-hotkey')
  })
})
