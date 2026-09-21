import { useCallback, useEffect, useState } from 'react'
import type { AutomationMode } from '../../domain/automation'
import { AUTOMATION_MODES, parseStoredAutomationParams } from '../../domain/automation'

/**
 * R147 P3b: parameter-automation domain state, moved verbatim from App.tsx.
 * The consumer of these values is the engine tick loop (via engineConfigRef
 * in App) — this hook owns the state, persistence and toggling only.
 */
export function useAutomationDomain() {
  const [automationEnabled, setAutomationEnabled] = useState(() =>
    localStorage.getItem('rgbbox:automationEnabled') === '1'
  )
  const [automationMode, setAutomationMode] = useState<AutomationMode>(() => {
    const saved = localStorage.getItem('rgbbox:automationMode') as AutomationMode | null
    return saved && AUTOMATION_MODES.includes(saved) ? saved : 'sine'
  })
  const [automatedParams, setAutomatedParams] = useState<string[]>(() =>
    parseStoredAutomationParams(localStorage.getItem('rgbbox:automatedParams'))
  )

  // ── Persist UI state to localStorage ────────────────────────────────────
  useEffect(() => { localStorage.setItem('rgbbox:automationEnabled', automationEnabled ? '1' : '0') }, [automationEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:automationMode', automationMode) }, [automationMode])
  useEffect(() => { localStorage.setItem('rgbbox:automatedParams', JSON.stringify(automatedParams)) }, [automatedParams])

  const toggleAutomatedParam = useCallback((name: string) => {
    setAutomatedParams((prev) => {
      if (prev.includes(name)) return prev.filter((entry) => entry !== name)
      return [...prev, name]
    })
  }, [])

  return {
    automationEnabled, setAutomationEnabled,
    automationMode, setAutomationMode,
    automatedParams, toggleAutomatedParam,
  }
}
