import { describe, it, expect } from 'vitest'
import {
  applyGarbage,
  dropInterval,
  garbageFor,
  GARBAGE_CELL,
  initialTetrisState,
  shapeCells,
  startTetris,
  tickTetris,
} from '../../../src/renderer/src/games/tetris'

describe('renderer/games/tetris engine (R100.3)', () => {
  it('drop interval tightens with level and floors at 80ms', () => {
    expect(dropInterval(1)).toBe(0.8)
    expect(dropInterval(5)).toBeLessThan(dropInterval(2))
    expect(dropInterval(50)).toBeGreaterThanOrEqual(0.08)
  })

  it('shape rotation walks the four orientations of the I piece', () => {
    const flat = shapeCells(0, 0)
    const upright = shapeCells(0, 1)
    expect(flat).toHaveLength(4)
    expect(upright).toHaveLength(4)
    expect(new Set(flat.map((cell) => cell.y)).size).toBe(1)
    expect(new Set(upright.map((cell) => cell.x)).size).toBe(1)
  })

  it('command queue moves, rotates, and hard drop locks + spawns next', () => {
    const state = initialTetrisState()
    startTetris(state)
    state.px = 2
    state.py = 5
    state.commands = ['left']
    tickTetris(state, 0.001)
    expect(state.px).toBe(1)
    state.commands = ['rotate']
    tickTetris(state, 0.001)
    expect(state.rot % 4).not.toBe(0)
    const filledBefore = state.grid.flat().filter((cell) => cell !== 0).length
    state.commands = ['hard']
    tickTetris(state, 0.001)
    expect(state.grid.flat().filter((cell) => cell !== 0).length).toBeGreaterThan(filledBefore)
    expect(state.queue.length).toBeGreaterThanOrEqual(3)
  })

  it('clearing two rows scores 300 and shifts the stack down', () => {
    const state = initialTetrisState()
    startTetris(state)
    state.kind = 1
    state.rot = 0
    state.px = 4
    state.py = 18
    for (let y = 18; y <= 19; y++) {
      for (let x = 0; x < 10; x++) {
        state.grid[y][x] = x === 4 || x === 5 ? 0 : 1
      }
    }
    state.commands = ['hard']
    tickTetris(state, 0.001)
    expect(state.lines).toBe(2)
    expect(state.score).toBe(300)
    expect(state.grid[19].every((cell) => cell === 0)).toBe(true)
  })

  it('7-bag deals every shape once per batch of seven', () => {
    const state = initialTetrisState()
    startTetris(state)
    const seen = new Set<number>()
    for (let i = 0; i < 7; i++) {
      seen.add(state.kind)
      state.commands = ['hard']
      tickTetris(state, 0.001)
    }
    expect(seen.size).toBe(7)
  })
})

import {
  bestPlacement, holdPiece, isTspin, kickTable, tryRotate,
} from '../../../src/renderer/src/games/tetris'

describe('renderer/games/tetris SRS kicks (FR-TE02)', () => {
  it('kick tables cover both rotation directions for all 4 states (JLSTZ + I)', () => {
    for (const table of [kickTable(1), kickTable(0)]) {
      expect(table).toHaveLength(8)
      for (const dir of [1, -1] as const) {
        for (let from = 0; from < 4; from += 1) {
          const to = (from + dir + 4) % 4
          expect(table.some((e) => e.from === from && e.to === to)).toBe(true)
        }
      }
      for (const e of table) expect(e.offsets[0]).toEqual([0, 0]) // no-move first
    }
  })

  it('kicks escape a wall pinch — T rotated at the left edge lands in-bounds', () => {
    const state = initialTetrisState()
    startTetris(state)
    state.kind = 2 // T
    state.rot = 0
    state.px = -1 // T 实心列在 x=0 → 贴左墙
    state.py = 8
    expect(tryRotate(state, 1)).toBe(true)
    expect(state.rot).toBe(1)
    // 踢墙后所有格子仍在板内
    for (const cell of shapeCells(2, 1)) {
      const gx = state.px + cell.x
      expect(gx).toBeGreaterThanOrEqual(0)
      expect(gx).toBeLessThan(10)
    }
  })
})

describe('renderer/games/tetris Hold + lock delay (FR-TE01)', () => {
  it('hold swaps once per piece; second hold is ignored until next lock', () => {
    const state = initialTetrisState()
    startTetris(state)
    const first = state.kind
    state.commands = ['hold']
    tickTetris(state, 0.001)
    expect(state.holdKind).toBe(first)
    expect(state.holdUsed).toBe(true)
    const afterFirstHold = state.kind
    state.commands = ['hold']
    tickTetris(state, 0.001)
    expect(state.kind).toBe(afterFirstHold) // 本块第二次 hold 被忽略
    state.commands = ['hard']
    tickTetris(state, 0.001) // 落锁 → holdUsed 复位
    expect(state.holdUsed).toBe(false)
    const beforeThird = state.kind
    state.commands = ['hold']
    tickTetris(state, 0.001)
    expect(state.kind).toBe(first) // 换回首块
    expect(state.holdKind).toBe(beforeThird) // 槽收走换出的块
    expect(state.holdUsed).toBe(true)
  })

  it('grounded piece waits 0.5s before locking (old engine locked instantly)', () => {
    const state = initialTetrisState()
    startTetris(state)
    for (let x = 0; x < 10; x += 1) state.grid[19][x] = 1
    state.kind = 1 // O
    state.px = 4
    state.py = 17 // 落在地板上(占 17/18 行)
    tickTetris(state, 0.4)
    expect(state.phase).toBe('running')
    expect(state.grid[18][4]).toBe(0)
    tickTetris(state, 0.2) // 累计 0.6s ≥ 0.5 → 锁
    expect(state.grid[18][4]).toBe(2)
  })

  it('15 grounded-move resets exhaust the budget and force-lock', () => {
    const s2 = initialTetrisState()
    startTetris(s2)
    for (let x = 0; x < 10; x += 1) s2.grid[19][x] = 1
    s2.kind = 1
    s2.px = 4
    s2.py = 17
    // 反复左右移动,每次成功都重置 lockTimer;第 15 次后预算耗尽 → 立即锁定
    let locked = false
    for (let i = 0; i < 18 && !locked; i += 1) {
      s2.commands = [i % 2 === 0 ? 'left' : 'right']
      tickTetris(s2, 0.001)
      locked = s2.grid[18][3] !== 0 || s2.grid[18][4] !== 0 || s2.grid[18][5] !== 0
    }
    expect(locked).toBe(true)
    // 对照:无操作静置 0.4s 不会锁(预算未耗尽)
    const s3 = initialTetrisState()
    startTetris(s3)
    for (let x = 0; x < 10; x += 1) s3.grid[19][x] = 1
    s3.kind = 1; s3.px = 4; s3.py = 17
    tickTetris(s3, 0.4)
    expect(s3.grid[18][4]).toBe(0)
  })
})

describe('renderer/games/tetris T-spin / B2B / combo scoring (FR-TE03)', () => {
  /** 构造经典 TSD:T rot1(px=4,py=16),角位程序化填充,行 17/18 由 T 补满双消。 */
  function tspinDoubleState(): ReturnType<typeof initialTetrisState> {
    const state = initialTetrisState()
    startTetris(state)
    // 行19:仅 nub 下方一格支撑(grounded 锁定路径)——不能全满,否则被算进消行变 TST
    state.grid[19][5] = 1
    // 行18:除 col5 外全满(T 的 (5,18) 补)
    for (let x = 0; x < 10; x += 1) state.grid[18][x] = x === 5 ? 0 : 1
    // 行17:除 col5/6 外全满(T 的 (5,17)(6,17) 补)
    for (let x = 0; x < 10; x += 1) state.grid[17][x] = x === 5 || x === 6 ? 0 : 1
    // 行16:只填两个角位(4,16)(6,16),其余空(行16 不消)
    state.grid[16][4] = 1
    state.grid[16][6] = 1
    state.kind = 2 // T
    state.rot = 1 // nub right: cells (5,16)(5,17)(6,17)(5,18)
    state.px = 4
    state.py = 16
    state.lastRotate = true
    state.commands = []
    return state
  }

  it('isTspin: T + lastRotate + ≥3 corners; a move voids it', () => {
    const state = tspinDoubleState()
    expect(isTspin(state)).toBe(true) // 4 角全占
    state.grid[16][4] = 0 // 去掉一角 → 3 角仍成立
    expect(isTspin(state)).toBe(true)
    state.grid[16][6] = 0 // 再去一角 → 2 角不成立
    expect(isTspin(state)).toBe(false)
    const state2 = tspinDoubleState()
    state2.lastRotate = false // 最后操作不是旋转
    expect(isTspin(state2)).toBe(false)
    const state3 = tspinDoubleState()
    state3.kind = 1 // 非 T
    expect(isTspin(state3)).toBe(false)
  })

  it('T-spin double = 1200×level; B2B repeat ×1.5; combo chains', () => {
    const state = tspinDoubleState()
    state.lockTimer = 10 // 直接走超时锁定路径
    tickTetris(state, 0.001)
    expect(state.score).toBe(1200) // TSD × lv1
    expect(state.tspins).toBe(1)
    expect(state.b2b).toBe(true)
    expect(state.lines).toBe(2)

    const s2 = tspinDoubleState()
    s2.b2b = true // 上一局式 B2B 已就位
    s2.combo = 0 // 已连续 1 消
    s2.lockTimer = 10
    tickTetris(s2, 0.001)
    expect(s2.score).toBe(Math.round(1200 * 1.5) + 50 * 1 * 1) // 1800 + combo 50
    expect(s2.tspins).toBe(1)

    // 非资格消行(单行普通) → B2B 清空
    const s3 = initialTetrisState()
    startTetris(s3)
    s3.b2b = true
    for (let x = 0; x < 9; x += 1) s3.grid[19][x] = 1
    s3.grid[18][9] = 0
    s3.kind = 0 // I 横
    s3.rot = 0
    s3.px = 6 // 覆盖 (6..9, 19)
    s3.py = 18
    s3.lastRotate = false
    s3.lockTimer = 10
    s3.commands = []
    tickTetris(s3, 0.001)
    expect(s3.lines).toBe(1)
    expect(s3.b2b).toBe(false)
    // 不消行的落锁 → combo 归 -1
    const s4 = initialTetrisState()
    startTetris(s4)
    s4.combo = 2
    s4.kind = 1; s4.px = 0; s4.py = 18 // 板底(占 18/19 行,贴地板即 grounded)
    s4.lockTimer = 10
    s4.commands = []
    tickTetris(s4, 0.001)
    expect(s4.combo).toBe(-1)
    // 四消 Tetris 保持 B2B 资格并吃 ×1.5
    const s5 = initialTetrisState()
    startTetris(s5)
    s5.b2b = true
    for (let y = 16; y < 20; y += 1) for (let x = 0; x < 10; x += 1) s5.grid[y][x] = (x >= 4 && x <= 7 && y === 19) ? 0 : 1
    // 行 16-19 都满,只挖 19 行 4-7 → I 横补 → 四消
    s5.kind = 0; s5.rot = 0; s5.px = 4; s5.py = 18
    s5.lastRotate = false
    s5.lockTimer = 10
    s5.commands = []
    tickTetris(s5, 0.001)
    expect(s5.lines).toBe(4)
    expect(s5.score).toBe(Math.round(800 * 1.5))
    expect(s5.b2b).toBe(true)
  })
})

describe('renderer/games/tetris placement hint (FR-TE04)', () => {
  it('prefers flat placements away from tall stacks; stored per piece', () => {
    const state = initialTetrisState()
    startTetris(state)
    state.kind = 1 // O
    for (let y = 16; y < 20; y += 1) for (let x = 0; x < 5; x += 1) state.grid[y][x] = 1
    const hint = bestPlacement(state)
    expect(hint).not.toBeNull()
    expect(hint!.px).toBeGreaterThanOrEqual(4) // 避开左半高墙
    expect(hint!.py).toBe(18) // O 落到底(占 18/19 行)
    // 初始状态自带提示,且随 pieceId 对齐
    const fresh = initialTetrisState()
    expect(fresh.hint).not.toBeNull()
    expect(fresh.hintPieceId).toBe(fresh.pieceId)
  })
})

// ── R208 (FR-MP02): 双板对战——垃圾行发送比例与入场规则 ──
describe('FR-MP02 garbage lines', () => {
  it('guideline 比例:1 消不送,2/3/4 消送 1/2/4 行', () => {
    expect(garbageFor(0)).toBe(0)
    expect(garbageFor(1)).toBe(0)
    expect(garbageFor(2)).toBe(1)
    expect(garbageFor(3)).toBe(2)
    expect(garbageFor(4)).toBe(4)
  })

  it('入场:底部插入带单洞实心行,板整体上移,行数守恒', () => {
    const state = initialTetrisState()
    state.phase = 'running'
    // 顶行放一个标记块,验证上移
    state.grid[0][5] = 3
    applyGarbage(state, 2, 4)
    expect(state.grid.length).toBe(20)
    // 标记块被顶出(上移 2 行后越界)
    expect(state.grid[0][5]).toBe(0)
    // 底两行是垃圾行:洞列 4 为空,其余 GARBAGE_CELL
    expect(state.grid[19][4]).toBe(0)
    expect(state.grid[19][0]).toBe(GARBAGE_CELL)
    expect(state.grid[18][7]).toBe(GARBAGE_CELL)
    expect(state.grid[17][7]).toBe(0)
    // 不计分不计消行
    expect(state.lines).toBe(0)
    expect(state.score).toBe(0)
  })

  it('当前块与垃圾行冲突时被上推,不立即判负', () => {
    const state = initialTetrisState()
    state.phase = 'running'
    // 把当前块压到底部行附近,再灌 4 行垃圾
    state.py = 16
    const pyBefore = state.py
    applyGarbage(state, 4, 0)
    expect(state.phase).toBe('running')
    expect(state.py).toBeLessThanOrEqual(pyBefore)
  })

  it('非 running 态不入场(结算后免疫)', () => {
    const state = initialTetrisState()
    state.phase = 'lost'
    applyGarbage(state, 4)
    expect(state.grid[19].every((c) => c === 0)).toBe(true)
describe('renderer/games/tetris FR-G08 short-run matrix (40-line race)', () => {
  function arrangeRace(lines: number, raceLines?: number) {
    const state = initialTetrisState()
    startTetris(state)
    state.raceLines = raceLines
    state.lines = lines
    // O piece dropping into the two gaps of rows 18/19 → double clear
    state.kind = 1
    state.rot = 0
    state.px = 4
    state.py = 18
    for (let y = 18; y <= 19; y++) {
      for (let x = 0; x < 10; x++) {
        state.grid[y][x] = x === 4 || x === 5 ? 0 : 1
      }
    }
    return state
  }

  it('reaching raceLines wins the run (phase won, not lost)', () => {
    const state = arrangeRace(39, 40)
    state.commands = ['hard']
    tickTetris(state, 0.001)
    expect(state.lines).toBe(41)
    expect(state.phase).toBe('won')
    expect(state.phase).not.toBe('lost')
    // a won run settles before the next spawn — the queue is untouched
    expect(state.queue).toHaveLength(3)
  })

  it('without raceLines the same clear keeps the run going (endless scoring)', () => {
    const state = arrangeRace(39, undefined)
    state.commands = ['hard']
    tickTetris(state, 0.001)
    expect(state.lines).toBe(41)
    expect(state.phase).toBe('running')
  })
})
