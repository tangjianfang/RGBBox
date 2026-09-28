// R200(FR-G06): hit-stop / 预警 / 轨迹 / recap 文案选择。
import { describe, expect, it } from 'vitest'
import { HIT_STOP, hitStopTick, recapCoachKey, SPAWN_WARN_SECONDS, tickTrail, tickWarnings, TRAIL_LIFE } from '../../../src/renderer/src/games/juice'
import { initialTetrisState, startTetris, tickTetris } from '../../../src/renderer/src/games/tetris'
import { initialSlashState, slash as slashCut } from '../../../src/renderer/src/games/slash'

describe('juice hitStopTick (FR-G06.1)', () => {
  it('freezes completely during the stop; no time jumps on thaw', () => {
    const [r1, dt1] = hitStopTick(HIT_STOP.heavy, 0.016)
    expect(dt1).toBe(0)
    expect(r1).toBeGreaterThan(0)
    let [remain] = [HIT_STOP.light, 0] as [number, number]
    let injected = 0
    let dt = 0.016
    while (true) {
      const [r, d] = hitStopTick(remain, dt)
      remain = r
      injected += d
      if (r === 0) break
    }
    // 恢复后不补帧:注入总量 ≤ 冻结时长(丢弃溢出)
    expect(injected).toBe(0)
  })

  it('tetris 4-line clear triggers hitStop and dt does not accumulate during freeze', () => {
    const state = initialTetrisState()
    startTetris(state)
    for (let y = 16; y < 20; y += 1) for (let x = 0; x < 10; x += 1) state.grid[y][x] = (x >= 4 && x <= 7 && y === 19) ? 0 : 1
    state.kind = 0; state.rot = 0; state.px = 4; state.py = 18
    state.lockTimer = 10
    state.commands = []
    tickTetris(state, 0.001)
    expect(state.hitStop).toBeGreaterThan(0)
    const clockBefore = state.clock
    tickTetris(state, 0.016) // 冻结帧
    expect(state.clock).toBe(clockBefore) // dt 不累积
  })

  it('slash bonus hit triggers hit-stop and pushes a trail point', () => {
    const s = initialSlashState()
    s.phase = 'running'
    // 手造一个在判定圈内的 bonus 块
    s.blocks.push({ id: 999, dir: 0, t: 0.9, speed: 1, hue: 50, bonus: true })
    const out = slashCut(s, 0)
    expect(out).toBe('hit')
    expect(s.hitStop).toBeGreaterThan(0)
    expect(s.trail.length).toBe(1)
  })
})

describe('juice warnings & trail (FR-G06.2/6.3)', () => {
  it('spawn warnings tick down and expire', () => {
    let w = [{ edge: 1 as const, t: SPAWN_WARN_SECONDS }]
    w = tickWarnings(w, 0.2)
    expect(w).toHaveLength(1)
    expect(w[0].t).toBeCloseTo(0.3, 5)
    w = tickWarnings(w, 0.35)
    expect(w).toHaveLength(0)
  })

  it('trail points fade out over TRAIL_LIFE', () => {
    let trail = [{ x: 1, y: 1, life: TRAIL_LIFE }]
    trail = tickTrail(trail, TRAIL_LIFE / 2)
    expect(trail).toHaveLength(1)
    trail = tickTrail(trail, TRAIL_LIFE)
    expect(trail).toHaveLength(0)
  })
})

describe('juice recap copy (FR-G06.5)', () => {
  it('selects a coach line by run context', () => {
    expect(recapCoachKey(100, null)).toBe('recap.firstRun')
    expect(recapCoachKey(100, 0)).toBe('recap.firstRun')
    expect(recapCoachKey(120, 100)).toBe('recap.improved')
    expect(recapCoachKey(85, 100)).toBe('recap.close')
    expect(recapCoachKey(10, 100)).toBe('recap.practice')
  })
})
