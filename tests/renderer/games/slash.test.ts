import { describe, expect, it } from 'vitest'
import {
  initialSlashState, startSlash, tickSlash, slash as slashCut, bomb, blockPos, RUN_SECONDS,
} from  '../../../src/renderer/src/games/slash'

function runToZone(state: { blocks: Array<{ t: number; speed: number }>; timeLeft: number }): void {
  // advance until the first block is inside the strike window
  for (let i = 0; i < 600; i++) {
    tickSlash(state, 1 / 60)
    if (state.blocks[0]?.t >= 0.75) return
  }
}

describe('games/slash (R142-E4)', () => {
  it('starts a fresh run and counts down to a loss at time zero', () => {
    const s = initialSlashState()
    startSlash(s)
    expect(s.phase).toBe('running')
    expect(s.score).toBe(0)
    tickSlash(s, RUN_SECONDS + 0.1)
    expect(s.phase).toBe('lost')
    expect(s.timeLeft).toBe(0)
  })

  it('spawns blocks over time and they approach the strike ring', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60) // 4s
    expect(s.blocks.length).toBeGreaterThan(0)
    expect(s.blocks[0].t).toBeGreaterThan(0)
    const p = blockPos(s.blocks[0])
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(900)
  })

  it('a matching slash kills the block, scores, builds combo and momentum streaks', () => {
    const s = initialSlashState()
    startSlash(s)
    runToZone(s)
    const block = s.blocks[0]
    const before = s.streaks.length
    expect(slashCut(s, block.dir)).toBe('hit')
    expect(s.blocks.some((b) => b.id === block.id)).toBe(false)
    expect(s.score).toBeGreaterThan(0)
    expect(s.combo).toBe(1)
    expect(s.streaks.length).toBeGreaterThan(before) // blade trail carries inertia
  })

  it('a wrong-direction slash in the zone breaks the combo but kills nothing', () => {
    const s = initialSlashState()
    startSlash(s)
    runToZone(s)
    const block = s.blocks[0]
    s.combo = 4
    const wrongDir = (block.dir + 1) % 8
    expect(slashCut(s, wrongDir)).toBe('wrong')
    expect(s.combo).toBe(0)
    expect(s.blocks.some((b) => b.id === block.id)).toBe(true)
  })

  it('a slash with nothing in the zone is a harmless miss', () => {
    const s = initialSlashState()
    startSlash(s)
    expect(s.blocks.length).toBe(0)
    expect(slashCut(s, 0)).toBe('miss')
  })

  it('an un-cut block crossing the ring breaks the combo and clears it', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60)
    expect(s.blocks.length).toBeGreaterThan(0)
    s.combo = 3
    for (let i = 0; i < 600 && s.combo !== 0; i++) tickSlash(s, 1 / 60)
    expect(s.combo).toBe(0)
  })

  it('pinch bomb clears all in-flight blocks once per cooldown', () => {
    const s = initialSlashState()
    startSlash(s)
    for (let i = 0; i < 240; i++) tickSlash(s, 1 / 60)
    expect(s.blocks.length).toBeGreaterThan(0)
    expect(bomb(s)).toBe(true)
    expect(s.blocks.length).toBe(0)
    for (let i = 0; i < 120; i++) tickSlash(s, 1 / 60) // refill a little
    expect(bomb(s)).toBe(false) // cooldown active
  })
})
