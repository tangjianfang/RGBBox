// R198(FR-G01): 教练 hints 触发条件 + pickHint 去重 + 首局引导存储。
import { describe, expect, it } from 'vitest'
import { pickHint, isOnboarded, markOnboarded, COACH_REPEAT_WINDOW_MS } from '../../../src/renderer/src/games/coach'
import { tdHints } from '../../../src/renderer/src/games/td'
import { survivalHints } from '../../../src/renderer/src/games/survival'
import { tetrisHints, boardHoles, stackHeight } from '../../../src/renderer/src/games/tetris'
import { slashHints } from '../../../src/renderer/src/games/slash'
import { initialState as initialTd } from '../../../src/renderer/src/games/td'
import { initialSurvivalState } from '../../../src/renderer/src/games/survival'
import { initialTetrisState, startTetris } from '../../../src/renderer/src/games/tetris'
import { initialSlashState } from '../../../src/renderer/src/games/slash'

const store = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}

describe('coach pickHint (FR-G01.1)', () => {
  it('picks the highest priority not in the repeat window; dedups within 30s', () => {
    const hints = [{ key: 'a', tone: 'tip' as const, priority: 10 }, { key: 'b', tone: 'warn' as const, priority: 50 }]
    const now = 100_000
    expect(pickHint(hints, {}, now)?.key).toBe('b')
    // b 刚展示过 → 退而取 a
    expect(pickHint(hints, { b: now - 1000 }, now)?.key).toBe('a')
    // 全在窗口内 → null
    expect(pickHint(hints, { a: now - 500, b: now - 1000 }, now)).toBeNull()
    // b 出窗后回归
    expect(pickHint(hints, { a: now - 1000, b: now - COACH_REPEAT_WINDOW_MS - 1 }, now)?.key).toBe('b')
  })
})

describe('td hints (FR-G01, ≥5)', () => {
  it('fires on no-tower / low lives / idle coins / early start / upgrade ready', () => {
    const s = initialTd()
    s.phase = 'running'
    const keys = (st: typeof s) => tdHints(st).map((h) => h.key)
    expect(keys(s)).toContain('td.noTower')
    s.towers.push({ id: 1, kind: 'dart', x: 100, y: 100, level: 1, spent: 100, angle: 0, range: 100, cooldown: 0, fireRate: 1, damage: 5 })
    s.coins = 300
    expect(keys(s)).toContain('td.coinsIdle')
    expect(keys(s)).toContain('td.upgradeReady')
    s.lives = 5
    expect(keys(s)).toContain('td.livesLow')
    s.wave = 1
    s.balloons = []
    s.waveCooldown = 5
    expect(keys(s)).toContain('td.earlyStart')
    s.phase = 'ready'
    expect(tdHints(s)).toEqual([])
  })
})

describe('survival hints (FR-G01, ≥5)', () => {
  it('fires on low hp / pending spin / boss soon / portal / combo', () => {
    const s = initialSurvivalState()
    s.phase = 'running'
    s.player.hp = 1
    s.player.maxHp = 10
    const keys = survivalHints(s).map((h) => h.key)
    expect(keys).toContain('sw.hpLow')
    s.pendingSpins = 1
    expect(survivalHints(s).map((h) => h.key)).toContain('sw.spinReady')
    s.bossTimer = 80
    expect(survivalHints(s).map((h) => h.key)).toContain('sw.bossSoon')
    s.portal = { x: 100, y: 100 }
    expect(survivalHints(s).map((h) => h.key)).toContain('sw.portal')
    s.combo = 9
    expect(survivalHints(s).map((h) => h.key)).toContain('sw.combo')
  })
})

describe('tetris hints (FR-G01, ≥5)', () => {
  it('fires on stack high / holes / hold unused / b2b / combo', () => {
    const s = initialTetrisState()
    startTetris(s)
    // 堆 15 行高
    for (let y = 5; y < 20; y += 1) for (let x = 0; x < 10; x += 1) s.grid[y][x] = 1
    expect(stackHeight(s)).toBe(15)
    expect(tetrisHints(s).map((h) => h.key)).toContain('te.stackHigh')
    // 洞:一列顶部有填充、下方悬空(整列挖空不算洞)
    for (let y = 6; y < 20; y += 1) s.grid[y][3] = 0
    expect(boardHoles(s)).toBeGreaterThan(0)
    expect(tetrisHints(s).map((h) => h.key)).toContain('te.holes')
    s.pieceId = 8
    s.holdKind = null
    expect(tetrisHints(s).map((h) => h.key)).toContain('te.holdUnused')
    s.b2b = true
    expect(tetrisHints(s).map((h) => h.key)).toContain('te.b2b')
    s.combo = 3
    expect(tetrisHints(s).map((h) => h.key)).toContain('te.combo')
  })
})

describe('slash hints (FR-G01, ≥5)', () => {
  it('fires on time low / bomb ready / combo praise / wrong cut / aim', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.timeLeft = 8
    expect(slashHints(s).map((h) => h.key)).toContain('sl.timeLow')
    s.bombCd = 0
    expect(slashHints(s).map((h) => h.key)).toContain('sl.bombReady')
    s.combo = 12
    expect(slashHints(s).map((h) => h.key)).toContain('sl.comboPraise')
    s.flash = 0.1
    expect(slashHints(s).map((h) => h.key)).toContain('sl.wrongCut')
    const s2 = initialSlashState()
    s2.phase = 'running'
    s2.bestCombo = 0
    s2.combo = 0
    expect(slashHints(s2).map((h) => h.key)).toContain('sl.aim')
  })
})

describe('onboarding storage (FR-G01.3)', () => {
  it('marks and reads per-game onboarding flags', () => {
    const st = store()
    expect(isOnboarded(st, 'td')).toBe(false)
    markOnboarded(st, 'td')
    expect(isOnboarded(st, 'td')).toBe(true)
    expect(isOnboarded(st, 'tetris')).toBe(false)
  })
})
