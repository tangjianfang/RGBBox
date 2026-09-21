import { describe, expect, it } from 'vitest'
import { SCHEDULE_BLOCKS, parseStoredSchedule, scheduleBlockForHour } from '../../../src/renderer/src/domain/schedule'

describe('domain/schedule scheduleBlockForHour (R147 P1)', () => {
  it('maps hours into day / evening / night blocks', () => {
    expect(scheduleBlockForHour(9).id).toBe('day')
    expect(scheduleBlockForHour(8).id).toBe('day')
    expect(scheduleBlockForHour(17).id).toBe('day')
    expect(scheduleBlockForHour(18).id).toBe('evening')
    expect(scheduleBlockForHour(21).id).toBe('evening')
    expect(scheduleBlockForHour(22).id).toBe('night')
    expect(scheduleBlockForHour(23).id).toBe('night')
  })

  it('night wraps past midnight', () => {
    expect(scheduleBlockForHour(0).id).toBe('night')
    expect(scheduleBlockForHour(7).id).toBe('night')
  })

  it('exposes three blocks covering the full 24h day', () => {
    expect(SCHEDULE_BLOCKS).toHaveLength(3)
    const covered = new Set(Array.from({ length: 24 }, (_, h) => scheduleBlockForHour(h).id))
    expect(covered).toEqual(new Set(['day', 'evening', 'night']))
  })
})

describe('domain/schedule parseStoredSchedule (R147 P1)', () => {
  it('falls back to defaults for null / broken JSON', () => {
    expect(parseStoredSchedule(null)).toEqual({ day: 'screen-ambient', evening: 'aurora', night: 'breathing' })
    expect(parseStoredSchedule('oops')).toEqual({ day: 'screen-ambient', evening: 'aurora', night: 'breathing' })
  })

  it('keeps valid kinds and restores defaults for invalid ones', () => {
    expect(parseStoredSchedule('{"day":"rainbow","evening":"nope"}')).toEqual({
      day: 'rainbow',
      evening: 'aurora',
      night: 'breathing',
    })
  })
})
