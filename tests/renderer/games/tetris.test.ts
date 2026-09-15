import { describe, it, expect } from 'vitest'
import {
  dropInterval,
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
