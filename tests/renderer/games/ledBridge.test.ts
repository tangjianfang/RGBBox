// R258 LED bridge — game events → LED frame generation.
// Pure logic tests: no DOM, no Electron. onEvent stamps performance.now()
// internally, so tests anchor to that and pass relative offsets.
import { describe, it, expect } from 'vitest'
import { createLedBridge } from '../../../src/renderer/src/games/ledBridge'

const COLS = 33, ROWS = 19
const now = () => performance.now()

describe('games/ledBridge (R258 LED 联动 v1)', () => {
  it('idle: no effects → dark frame, hasActive=false', () => {
    const b = createLedBridge()
    const { pixels, hasActive } = b.generateFrame(now(), COLS, ROWS)
    expect(hasActive).toBe(false)
    expect(pixels.every((v) => v < 20)).toBe(true)
  })

  it('kill: radial wave — center bright at t=0, effect present mid-flight, gone after expiry', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'kill', enemyColor: [255, 0, 0] })
    // immediately after: wave at center, full intensity
    const { pixels: p0, hasActive: a0 } = b.generateFrame(t0 + 1, COLS, ROWS)
    expect(a0).toBe(true)
    const ci = (Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2)) * 3
    expect(p0[ci]).toBeGreaterThan(100)
    // mid-flight: wave traveled outward, still active
    const { hasActive: a1 } = b.generateFrame(t0 + 80, COLS, ROWS)
    expect(a1).toBe(true)
    // after expiry: gone
    const { hasActive: a2 } = b.generateFrame(t0 + 1000, COLS, ROWS)
    expect(a2).toBe(false)
  })

  it('boss-enter: persistent red breathing until boss-exit', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'boss-enter' })
    const { hasActive: a1 } = b.generateFrame(t0 + 100, COLS, ROWS)
    expect(a1).toBe(true)
    const { hasActive: a2 } = b.generateFrame(t0 + 60000, COLS, ROWS)
    expect(a2).toBe(true) // persists
    b.onEvent({ type: 'boss-exit' })
    const { hasActive: done } = b.generateFrame(t0 + 61000, COLS, ROWS)
    expect(done).toBe(false)
  })

  it('levelup: rainbow ring — pixels have visible color mid-effect', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'levelup' })
    const { pixels } = b.generateFrame(t0 + 340, COLS, ROWS)
    // sample a ring-ish area (quarter point)
    const idx = (Math.floor(ROWS / 3) * COLS + Math.floor(COLS / 3)) * 3
    const r = pixels[idx], g = pixels[idx + 1]
    expect(r + g).toBeGreaterThan(15) // some color visible (not just ambient)
  })

  it('evolve: full white flash at start', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'evolve' })
    const { pixels } = b.generateFrame(t0 + 10, COLS, ROWS)
    const ci = (Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2)) * 3
    expect(pixels[ci]).toBeGreaterThan(180)
    expect(pixels[ci + 1]).toBeGreaterThan(180)
    expect(pixels[ci + 2]).toBeGreaterThan(180)
  })

  it('death: frame darkens over 2s', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'kill' }) // some brightness
    b.onEvent({ type: 'death' })
    const { pixels } = b.generateFrame(t0 + 1500, COLS, ROWS) // 1.5s into fade
    const max = Math.max(...pixels)
    expect(max).toBeLessThan(150) // dimming
  })

  it('multiple simultaneous effects coexist', () => {
    const b = createLedBridge()
    const t0 = now()
    b.onEvent({ type: 'boss-enter' })
    b.onEvent({ type: 'kill' })
    const { hasActive } = b.generateFrame(t0 + 50, COLS, ROWS)
    expect(hasActive).toBe(true)
  })

  it('reset clears everything including persistent boss', () => {
    const b = createLedBridge()
    b.onEvent({ type: 'boss-enter' })
    b.onEvent({ type: 'kill' })
    b.reset()
    const { hasActive } = b.generateFrame(now() + 200, COLS, ROWS)
    expect(hasActive).toBe(false)
  })
})
