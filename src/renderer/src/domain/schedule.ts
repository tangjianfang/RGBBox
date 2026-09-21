// R147 P1: extracted verbatim from App.tsx module scope (scheduled effects).
import { effectPresets } from '../../../shared/defaultProfile'
import type { EffectKind } from '../../../shared/types'

export type ScheduleBlockId = 'day' | 'evening' | 'night'

export interface ScheduleBlockDefinition {
  id: ScheduleBlockId
  labelKey: 'schedule.day' | 'schedule.evening' | 'schedule.night'
  timeLabel: string
  startHour: number
  endHour: number
}

export const SCHEDULE_BLOCKS: ScheduleBlockDefinition[] = [
  { id: 'day', labelKey: 'schedule.day', timeLabel: '08:00-18:00', startHour: 8, endHour: 18 },
  { id: 'evening', labelKey: 'schedule.evening', timeLabel: '18:00-22:00', startHour: 18, endHour: 22 },
  { id: 'night', labelKey: 'schedule.night', timeLabel: '22:00-08:00', startHour: 22, endHour: 8 }
]

export const DEFAULT_SCHEDULE_EFFECTS: Record<ScheduleBlockId, EffectKind> = {
  day: 'screen-ambient',
  evening: 'aurora',
  night: 'breathing'
}

export function parseStoredSchedule(raw: string | null): Record<ScheduleBlockId, EffectKind> {
  if (!raw) return DEFAULT_SCHEDULE_EFFECTS
  try {
    const parsed = JSON.parse(raw) as Partial<Record<ScheduleBlockId, unknown>>
    const validKinds = new Set(effectPresets.map((preset) => preset.kind))
    return Object.fromEntries(
      SCHEDULE_BLOCKS.map((block) => {
        const kind = parsed[block.id]
        return [block.id, typeof kind === 'string' && validKinds.has(kind as EffectKind) ? kind : DEFAULT_SCHEDULE_EFFECTS[block.id]]
      })
    ) as Record<ScheduleBlockId, EffectKind>
  } catch {
    return DEFAULT_SCHEDULE_EFFECTS
  }
}

export function scheduleBlockForHour(hour: number): ScheduleBlockDefinition {
  return SCHEDULE_BLOCKS.find((block) => {
    if (block.startHour < block.endHour) return hour >= block.startHour && hour < block.endHour
    return hour >= block.startHour || hour < block.endHour
  }) ?? SCHEDULE_BLOCKS[0]
}
