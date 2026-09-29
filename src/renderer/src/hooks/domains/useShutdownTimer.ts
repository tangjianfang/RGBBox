import { useCallback, useEffect, useState } from 'react'

/**
 * R147 P3b: R73 scheduled-shutdown domain, moved verbatim from App.tsx —
 * restore any pending OS shutdown countdown (survives app restarts — the OS
 * timer is authoritative), tick the remaining time down once a second, and
 * arm/cancel via the main-process IPC.
 */
export function useShutdownTimer() {
  // R73: scheduled-shutdown countdown (drives both the sidebar chip and the HUD panel)
  const [shutdownInfo, setShutdownInfo] = useState<{ deadlineMs: number; totalMs: number; remainingMs: number } | null>(null)
  const [shutdownPanelOpen, setShutdownPanelOpen] = useState(false)

  // Restore any pending OS shutdown countdown (survives app restarts — the OS
  // timer is authoritative), then tick the remaining time down once a second.
  useEffect(() => {
    let alive = true
    void window.rgbbox.shutdownStatus().then((s) => {
      if (alive && s.armed && s.deadlineMs != null) {
        setShutdownInfo({ deadlineMs: s.deadlineMs, totalMs: 0, remainingMs: Math.max(0, s.deadlineMs - Date.now()) })
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!shutdownInfo || shutdownInfo.remainingMs <= 0) return
    const timer = window.setInterval(() => {
      setShutdownInfo((prev) => {
        if (!prev) return prev
        const remainingMs = prev.deadlineMs - Date.now()
        return remainingMs <= 0 ? null : { ...prev, remainingMs }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [shutdownInfo?.deadlineMs])

  // R214: 失败时返回主进程 error 码(invalid-seconds/spawn-failed/…)供面板
  // 按码显示——此前一切失败都被误标为「仅支持 Windows」。
  const armShutdownTimer = useCallback(async (seconds: number): Promise<string | null> => {
    const res = await window.rgbbox.shutdownArm(seconds)
    if (res.ok && res.deadlineMs != null) {
      setShutdownInfo({ deadlineMs: res.deadlineMs, totalMs: seconds * 1000, remainingMs: seconds * 1000 })
      return null
    }
    return res.error ?? 'unknown'
  }, [])

  const cancelShutdownTimer = useCallback(async (): Promise<void> => {
    await window.rgbbox.shutdownCancel().catch(() => {})
    setShutdownInfo(null)
  }, [])

  return { shutdownInfo, shutdownPanelOpen, setShutdownPanelOpen, armShutdownTimer, cancelShutdownTimer }
}
