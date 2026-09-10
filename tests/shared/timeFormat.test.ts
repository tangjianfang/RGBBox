import { describe, expect, it } from 'vitest'
import { formatMediaTime } from '../../src/shared/timeFormat'

describe('shared/timeFormat formatMediaTime (R71.8)', () => {
  it('formats zero and sub-minute values', () => {
    expect(formatMediaTime(0)).toBe('0:00')
    expect(formatMediaTime(9)).toBe('0:09')
    expect(formatMediaTime(59.9)).toBe('0:59')
  })

  it('formats minute-tier values with zero-padded seconds', () => {
    expect(formatMediaTime(61)).toBe('1:01')
    expect(formatMediaTime(603)).toBe('10:03')
    // R71.8: the audio transport used to show "75:23" for this
    expect(formatMediaTime(75 * 60 + 23)).toBe('1:15:23')
  })

  it('formats hour-tier values as h:mm:ss', () => {
    expect(formatMediaTime(3600)).toBe('1:00:00')
    expect(formatMediaTime(3661)).toBe('1:01:01')
    expect(formatMediaTime(2 * 3600 + 5 * 60 + 9)).toBe('2:05:09')
  })

  it('maps non-finite and negative inputs to 0:00 (live streams / bad metadata)', () => {
    expect(formatMediaTime(Infinity)).toBe('0:00')
    expect(formatMediaTime(NaN)).toBe('0:00')
    expect(formatMediaTime(-5)).toBe('0:00')
  })
})
