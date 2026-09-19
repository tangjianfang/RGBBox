import { describe, expect, it } from 'vitest'
import { createCursorState, cursorSnapshot, cursorIntegrate, hitTest } from '../../../src/renderer/src/vision/cursor'

describe('vision/cursor (R143: prediction integrator + fist clutch)', () => {
  it('relative deltas: authoritative snapshots set velocity + anchor', () => {
    const s = createCursorState(0.5, 0.5)
    cursorSnapshot(s, { x: 0.5, y: 0.5 }, false, 0) // baseline
    cursorSnapshot(s, { x: 0.51, y: 0.5 }, false, 33)
    expect(s.anchorX).toBeGreaterThan(0.5)
    expect(s.velX).toBeGreaterThan(0)
    expect(s.y).toBe(0.5)
  })

  it('R143.1: the cursor advances EVERY display frame BETWEEN snapshots', () => {
    const s = createCursorState(0.5, 0.5)
    cursorSnapshot(s, { x: 0.5, y: 0.5 }, false, 0)
    cursorSnapshot(s, { x: 0.56, y: 0.5 }, false, 33) // decisive right move
    const x0 = s.x
    // three display frames with NO new snapshot — the integrator keeps moving
    cursorIntegrate(s, 1 / 60)
    const x1 = s.x
    cursorIntegrate(s, 1 / 60)
    cursorIntegrate(s, 1 / 60)
    expect(x1).toBeGreaterThan(x0) // moved without a snapshot
    expect(s.x).toBeGreaterThan(x1)
    // velocity decays toward the anchor — no runaway drift
    for (let i = 0; i < 120; i++) cursorIntegrate(s, 1 / 60)
    expect(Math.abs(s.x - s.anchorX)).toBeLessThan(0.01)
  })

  it('R143.2: OPEN PALM never clutches — a relaxed hand keeps the cursor live', () => {
    const s = createCursorState(0.5, 0.5)
    // open palm fed as a plain (non-fist) snapshot for a long time
    for (let i = 0; i < 30; i++) cursorSnapshot(s, { x: 0.5, y: 0.5 }, false, i * 33)
    expect(s.frozen).toBe(false)
  })

  it('R143.2: sustained FIST clutches (freeze) and unclutches on open', () => {
    const s = createCursorState(0.5, 0.5)
    cursorSnapshot(s, { x: 0.5, y: 0.5 }, false, 0)
    for (let i = 0; i < 12; i++) cursorSnapshot(s, { x: 0.5, y: 0.5 }, true, 33 * (i + 1))
    expect(s.frozen).toBe(true)
    expect(s.velX).toBe(0)
    // fist held while the hand relocates → cursor does not move
    for (let i = 0; i < 10; i++) cursorSnapshot(s, { x: 0.8, y: 0.5 }, true, 500 + 33 * i)
    expect(s.x).toBeCloseTo(0.5, 5)
    cursorSnapshot(s, { x: 0.8, y: 0.5 }, false, 900)
    expect(s.frozen).toBe(false)
  })

  it('dynamic gain: the SAME delta at high speed anchors further', () => {
    const slow = createCursorState(0.5, 0.5)
    cursorSnapshot(slow, { x: 0.5, y: 0.5 }, false, 0)
    cursorSnapshot(slow, { x: 0.515, y: 0.5 }, false, 1000)
    const fast = createCursorState(0.5, 0.5)
    cursorSnapshot(fast, { x: 0.5, y: 0.5 }, false, 0)
    cursorSnapshot(fast, { x: 0.515, y: 0.5 }, false, 16)
    expect(fast.anchorX - 0.5).toBeGreaterThan(slow.anchorX - 0.5)
  })

  it('tremor dead zone + hand-loss re-baseline (no jump on reacquire)', () => {
    const s = createCursorState(0.5, 0.5)
    cursorSnapshot(s, { x: 0.5, y: 0.5 }, false, 0)
    for (let i = 0; i < 50; i++) {
      cursorSnapshot(s, { x: 0.5 + (i % 2 ? 1 : -1) * 0.001, y: 0.5 }, false, 33 * (i + 1))
    }
    expect(s.x).toBeCloseTo(0.5, 5)
    cursorSnapshot(s, null, false, 2000)
    const xBefore = s.x
    cursorSnapshot(s, { x: 0.2, y: 0.5 }, false, 2033)
    expect(s.x).toBe(xBefore)
  })

  it('hitTest picks the containing rect', () => {
    const rects = [
      { item: 'a', x: 0.0, y: 0.0, w: 0.4, h: 1.0 },
      { item: 'b', x: 0.6, y: 0.2, w: 0.3, h: 0.3 },
    ]
    expect(hitTest({ x: 0.2, y: 0.5 }, rects)).toBe('a')
    expect(hitTest({ x: 0.7, y: 0.3 }, rects)).toBe('b')
    expect(hitTest({ x: 0.5, y: 0.5 }, rects)).toBeNull()
  })
})
