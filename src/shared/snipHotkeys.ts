/**
 * snipHotkeys — R81: 全局截图热键预设（主进程白名单 + 设置 UI 下拉共用）。
 */
export const PRESET_SNIP_HOTKEYS = ['Alt+A', 'Ctrl+Alt+A', 'Ctrl+Shift+S', 'F2', 'PrintScreen'] as const

export type SnipHotkey = (typeof PRESET_SNIP_HOTKEYS)[number]

export function isPresetSnipHotkey(accel: string): accel is SnipHotkey {
  return (PRESET_SNIP_HOTKEYS as readonly string[]).includes(accel)
}
