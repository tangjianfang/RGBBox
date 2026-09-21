import { useCallback, useEffect, useState } from 'react'

/**
 * R147 P3b: main-process settings mirrors, moved verbatim from App.tsx — the
 * R74 light-effect screensaver settings and the R81 global snip hotkey. Main
 * owns the watchers/persistence; these mirrors just reflect + optimistically
 * apply settings-view edits.
 */
export function useSettingsMirror() {
  // R74: light-effect screensaver settings mirror (main owns the idle watcher)
  const [screensaverEnabled, setScreensaverEnabled] = useState(false)
  const [screensaverMinutes, setScreensaverMinutes] = useState(5)
  // R81: global snip hotkey mirror (main owns globalShortcut + persistence)
  const [snipHotkey, setSnipHotkeyState] = useState<string>('Alt+A')
  const [powerSaveBlock, setPowerSaveBlock] = useState(false)
  const [autoLaunch, setAutoLaunch] = useState(false)

  // ── R74: light-effect screensaver ──────────────────────────────────────────
  useEffect(() => {
    void window.rgbbox.screensaverGetSettings().then((s) => {
      setScreensaverEnabled(s.enabled)
      setScreensaverMinutes(s.idleMinutes)
    }).catch(() => {})
  }, [])

  const applyScreensaverSettings = useCallback((patch: { enabled?: boolean; idleMinutes?: number }) => {
    void window.rgbbox.screensaverSetSettings(patch).then((s) => {
      setScreensaverEnabled(s.enabled)
      setScreensaverMinutes(s.idleMinutes)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    void window.rgbbox.snipGetHotkey().then((k) => setSnipHotkeyState(k)).catch(() => { /* default */ })
  }, [])

  const applySnipHotkey = useCallback((accel: string) => {
    setSnipHotkeyState(accel)   // 乐观更新；冲突时主进程回滚并返回当前键
    void window.rgbbox.snipSetHotkey(accel).then((r) => setSnipHotkeyState(r.hotkey)).catch(() => { /* keep */ })
  }, [])

  return {
    screensaverEnabled, screensaverMinutes, applyScreensaverSettings,
    snipHotkey, applySnipHotkey,
    powerSaveBlock, setPowerSaveBlock,
    autoLaunch, setAutoLaunch,
  }
}
