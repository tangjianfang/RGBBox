// FR-G09(R205 M3 交付): daily 种子 + 记录。
import { describe, expect, it } from 'vitest'
import { dailySeed, loadDaily, mulberry32, recordDaily } from '../../../src/renderer/src/games/daily'

const DAY = 86_400_000
function mkStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

describe('daily seed + rng (FR-G09/OD-05)', () => {
  it('mulberry32 is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 8 }, () => a())
    const seqB = Array.from({ length: 8 }, () => b())
    expect(seqA).toEqual(seqB)
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(mulberry32(43)()).not.toBe(seqA[0])
  })

  it('dailySeed changes across days and is stable within a day', () => {
    const d1 = new Date('2026-09-27T10:00:00Z')
    const d1b = new Date('2026-09-27T22:00:00Z')
    const d2 = new Date('2026-09-28T10:00:00Z')
    expect(dailySeed(d1)).toBe(dailySeed(d1b))
    expect(dailySeed(d1)).not.toBe(dailySeed(d2))
  })
})

describe('daily record (FR-G09)', () => {
  it('records best/attempts; stale (yesterday-seed) records reset', () => {
    const st = mkStore()
    const today = new Date('2026-09-27T12:00:00Z')
    const r1 = recordDaily(st, 'td', 100, today)
    expect(r1).toMatchObject({ best: 100, attempts: 1 })
    const r2 = recordDaily(st, 'td', 80, today)
    expect(r2).toMatchObject({ best: 100, attempts: 2 })
    const r3 = recordDaily(st, 'td', 200, today)
    expect(r3).toMatchObject({ best: 200, attempts: 3 })
    // load 只认当日种子
    expect(loadDaily(st, 'td', today)?.best).toBe(200)
    const tomorrow = new Date(today.getTime() + DAY)
    expect(loadDaily(st, 'td', tomorrow)).toBeNull()
    // 跨日重新记 → 重置
    const r4 = recordDaily(st, 'td', 5, tomorrow)
    expect(r4).toMatchObject({ best: 5, attempts: 1 })
  })
})
