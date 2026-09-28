// FR-G02(R198): 本地遥测环形缓冲 + arcade profile 聚合。
import { describe, expect, it } from 'vitest'
import {
  appendRun, clearAllGameData, loadRuns, profileStats, recordRun,
  RUNS_PER_GAME, RUNS_KEY_PREFIX, saveRuns, streakDaysFrom, type GameRunRecord,
} from '../../../src/renderer/src/domain/gamesTelemetry'

const DAY = 86_400_000
function mkStore(): { get: Map<string, string>; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> } {
  const get = new Map<string, string>()
  return {
    get,
    storage: {
      getItem: (k: string) => get.get(k) ?? null,
      setItem: (k: string, v: string) => { get.set(k, v) },
      removeItem: (k: string) => { get.delete(k) },
    },
  }
}
const run = (over: Partial<GameRunRecord> = {}): GameRunRecord => ({ date: 1000, score: 100, duration: 60, highlight: '', ...over })

describe('gamesTelemetry ring buffer (FR-G02)', () => {
  it('loads empty on missing/corrupt storage; append+save roundtrip', () => {
    const { storage, get } = mkStore()
    expect(loadRuns(storage, 'td').runs).toEqual([])
    expect(loadRuns(null, 'td').runs).toEqual([])
    get.set(RUNS_KEY_PREFIX + 'td', '{broken')
    expect(loadRuns(storage, 'td').runs).toEqual([])
    const buf = appendRun({ runs: [] }, run({ score: 42, highlight: '首局' }))
    saveRuns(storage, 'td', buf)
    expect(loadRuns(storage, 'td').runs).toEqual([run({ score: 42, highlight: '首局' })])
  })

  it('rolls at 20 runs (oldest dropped)', () => {
    let buf = { runs: [] as GameRunRecord[] }
    for (let i = 0; i < RUNS_PER_GAME + 7; i += 1) buf = appendRun(buf, run({ score: i }))
    expect(buf.runs.length).toBe(RUNS_PER_GAME)
    expect(buf.runs[0].score).toBe(7) // oldest 7 dropped
    expect(buf.runs[buf.runs.length - 1].score).toBe(RUNS_PER_GAME + 6)
  })

  it('recordRun = load→append→save one-shot', () => {
    const { storage } = mkStore()
    recordRun(storage, 'tetris', run({ score: 10 }))
    recordRun(storage, 'tetris', run({ score: 20 }))
    const buf = loadRuns(storage, 'tetris')
    expect(buf.runs.map((r) => r.score)).toEqual([10, 20])
  })
})

describe('gamesTelemetry profile stats (FR-G02)', () => {
  it('aggregates runs: totals, best merge, delta%, streak', () => {
    const today = 50 * DAY
    const runs = [
      run({ date: today - 2 * DAY, score: 100, duration: 60 }),
      run({ date: today - 1 * DAY, score: 150, duration: 90 }),
      run({ date: today, score: 120, duration: 30 }),
    ]
    const stats = profileStats({ runs }, 999, today)
    expect(stats.totalRuns).toBe(3)
    expect(stats.totalSeconds).toBe(180)
    expect(stats.lastScore).toBe(120)
    expect(stats.bestScore).toBe(999) // external best wins
    expect(stats.deltaPct).toBe(Math.round(((120 - 150) / 150) * 100)) // -20
    expect(stats.streakDays).toBe(3)
  })

  it('delta null below two runs; empty buffer zeros', () => {
    expect(profileStats({ runs: [run({ score: 5 })] }).deltaPct).toBeNull()
    const empty = profileStats({ runs: [] }, 7)
    expect(empty).toMatchObject({ totalRuns: 0, totalSeconds: 0, lastScore: 0, bestScore: 7, deltaPct: null, streakDays: 0 })
  })

  it('streak breaks on gaps and anchors to today-or-yesterday', () => {
    const today = 80 * DAY
    expect(streakDaysFrom([], today)).toBe(0)
    expect(streakDaysFrom([today], today)).toBe(1)
    // 昨天有、今天没有 → streak 从昨天往前数(不算断)
    expect(streakDaysFrom([today - DAY, today - 2 * DAY], today)).toBe(2)
    // 前天为止 → 今天昨天都空 → 0
    expect(streakDaysFrom([today - 2 * DAY], today)).toBe(0)
    // 断一天
    expect(streakDaysFrom([today, today - 2 * DAY], today)).toBe(1)
  })
})

describe('gamesTelemetry clear (FR-G02.3)', () => {
  it('clears runs; keeps bests by default, removes when asked', () => {
    const { storage } = mkStore()
    recordRun(storage, 'td', run())
    recordRun(storage, 'slash', run())
    storage.setItem('rgbbox:gamesBest:td', '500')
    clearAllGameData(storage, false, (id) => `rgbbox:gamesBest:${id}`)
    expect(loadRuns(storage, 'td').runs).toEqual([])
    expect(loadRuns(storage, 'slash').runs).toEqual([])
    expect(storage.getItem('rgbbox:gamesBest:td')).toBe('500')
    recordRun(storage, 'td', run())
    clearAllGameData(storage, true, (id) => `rgbbox:gamesBest:${id}`)
    expect(storage.getItem('rgbbox:gamesBest:td')).toBeNull()
  })
})
