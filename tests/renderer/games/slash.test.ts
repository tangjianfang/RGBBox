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

// R203: 三心制 + 连锁块。

describe('slash hearts (FR-SL01)', () => {
  it('missed block costs a heart; three misses end the run; casual starts at 5', () => {
    const s = initialSlashState()
    s.phase = 'running'
    expect(s.hearts).toBe(3)
    for (let round = 0; round < 3; round += 1) {
      s.blocks.push({ id: s.nextId++, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false }) // 已越圈
      tickSlash(s, 0.016)
    }
    expect(s.hearts).toBe(0)
    expect(s.phase).toBe('lost')
    // 休闲档
    const casual = initialSlashState()
    casual.hearts = 5
    casual.maxHearts = 5
    casual.phase = 'running'
    casual.blocks.push({ id: casual.nextId++, dir: 0, t: 1.2, speed: 1, hue: 200, bonus: false })
    tickSlash(casual, 0.016)
    expect(casual.hearts).toBe(4)
    expect(casual.phase).toBe('running')
  })
})

describe('slash chain blocks (FR-SL02)', () => {
  it('hitting a block detonates same-dir neighbors near the ring for +5 each', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.blocks.push({ id: 1, dir: 2, t: 0.9, speed: 1, hue: 200, bonus: false })
    s.blocks.push({ id: 2, dir: 2, t: 0.8, speed: 1, hue: 210, bonus: false }) // 同向近圈 → 连锁
    s.blocks.push({ id: 3, dir: 4, t: 0.85, speed: 1, hue: 120, bonus: false }) // 异向 → 保留
    const before = s.score
    const out = slashCut(s, 2)
    expect(out).toBe('hit')
    expect(s.score).toBeGreaterThan(before)
    expect(s.blocks.some((b) => b.id === 3)).toBe(true)
    expect(s.blocks.some((b) => b.id === 2)).toBe(false)
  })
})

// M3(FR-SL04): 假动作块。
describe('slash feint blocks (FR-SL04)', () => {
  it('a feint block flips its direction once at t≈0.85', () => {
    const s = initialSlashState()
    s.phase = 'running'
    s.timeLeft = 30 // >15s 进度 → 允许 feint
    s.blocks.push({ id: 1, dir: 0, t: 0.7, speed: 1, hue: 200, bonus: false, feint: true })
    tickSlash(s, 0.16) // t ≈ 0.86 ≥ 0.85 → flip
    expect(s.blocks[0].dir).toBe(4) // 0 → 4(翻转)
    const flippedDir = s.blocks[0].dir
    tickSlash(s, 0.1)
    expect(s.blocks[0].dir).toBe(flippedDir) // 只翻一次
  })
})
