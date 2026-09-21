import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EffectKind, EffectLayer } from '../../../../shared/types'
import { parseStoredSchedule, scheduleBlockForHour } from '../../domain/schedule'
import type { ScheduleBlockId } from '../../domain/schedule'

/**
 * R147 P3b: scheduled-effects domain, moved verbatim from App.tsx — the
 * time-of-day blocks (day/evening/night), their assigned effect kinds, the
 * 60s clock, and the effect-switch effect that applies the current block's
 * kind whenever it changes.
 */
export function useScheduleDomain(args: {
  selectedLayer: EffectLayer | null
  selectEffect: (kind: EffectKind) => void
}) {
  const { selectedLayer, selectEffect } = args
  const [scheduleEnabled, setScheduleEnabled] = useState(() =>
    localStorage.getItem('rgbbox:scheduleEnabled') === '1'
  )
  const [scheduleEffects, setScheduleEffects] = useState<Record<ScheduleBlockId, EffectKind>>(() =>
    parseStoredSchedule(localStorage.getItem('rgbbox:scheduleEffects'))
  )
  const [scheduleNow, setScheduleNow] = useState(() => new Date())

  // ── Persist UI state to localStorage ────────────────────────────────────
  useEffect(() => { localStorage.setItem('rgbbox:scheduleEnabled', scheduleEnabled ? '1' : '0') }, [scheduleEnabled])
  useEffect(() => { localStorage.setItem('rgbbox:scheduleEffects', JSON.stringify(scheduleEffects)) }, [scheduleEffects])

  useEffect(() => {
    const intervalId = window.setInterval(() => setScheduleNow(new Date()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const activeScheduleBlock = useMemo(() => scheduleBlockForHour(scheduleNow.getHours()), [scheduleNow])
  const scheduledEffectKind = scheduleEffects[activeScheduleBlock.id]

  useEffect(() => {
    if (!scheduleEnabled || !selectedLayer) return
    if (selectedLayer.kind === scheduledEffectKind) return
    selectEffect(scheduledEffectKind)
  }, [scheduleEnabled, selectedLayer, scheduledEffectKind, selectEffect])

  const setScheduleEffect = useCallback((blockId: ScheduleBlockId, kind: EffectKind) => {
    setScheduleEffects((prev) => ({ ...prev, [blockId]: kind }))
  }, [])

  return {
    scheduleEnabled, setScheduleEnabled,
    scheduleEffects, setScheduleEffect,
    activeScheduleBlock, scheduledEffectKind,
  }
}
