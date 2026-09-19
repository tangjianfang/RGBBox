import { describe, expect, it } from 'vitest'
import { createCursorState, cursorStep, hitTest, DEFAULT_CURSOR_CONFIG } from '../../../src/renderer/src/vision/cursor'

describe('vision/cursor (R142-L3)', () => {
  it('relative deltas: palm moves right → cursor moves right, proportionally to gain', () => {
    const s = createCursorState(0.5, 0.5)
    cursorStep(s, { x: 0.5, y: 0.5 }, false, 0) // baseline
    cursorStep(s, { x: 0.51, y: 0.5 }, false, 33)
    expect(s.x).toBeGreaterThan(0.5)
    expect(s.y).toBe(0.5)
  })

  it('dynamic gain: the SAME delta at high speed moves the cursor further', () => {
    const slow = createCursorState(0.5, 0.5)
    cursorStep(slow, { x: 0.5, y: 0.5 }, false, 0)
    cursorStep(slow, { x: 0.515, y: 0.5 }, false, 1000) // slow (long dt)
    const fast = createCursorState(0.5, 0.5)
    cursorStep(fast, { x: 0.5, y: 0.5 }, false, 0)
    cursorStep(fast, { x: 0.515, y: 0.5 }, false, 16) // fast (short dt)
    expect(fast.x - 0.5).toBeGreaterThan(slow.x - 0.5)
  })

  it('tremor dead zone: sub-threshold jitter does not move the cursor', () => {
    const s = createCursorState(0.5, 0.5)
    cursorStep(s, { x: 0.5, y: 0.5 }, false, 0)
    for (let i = 0; i < 50; i++) {
      cursorStep(s, { x: 0.5 + (i % 2 ? 1 : -1) * 0.001, y: 0.5 }, false, 33 * (i + 1))
    }
    expect(s.x).toBeCloseTo(0.5, 5)
  })

  it('clutch: sustained open palm freezes the cursor while the hand moves', () => {
    const s = createCursorState(0.5, 0.5)
    cursorStep(s, { x: 0.5, y: 0.5 }, false, 0)
    let t = 0
    for (let i = 0; i < 20; i++) cursorStep(s, { x: 0.5, y: 0.5 }, true, (t += 33)) // hold open
    expect(s.frozen).toBe(true)
    const beforeX = s.x
    for (let i = 0; i < 10; i++) cursorStep(s, { x: 0.5 + 0.02 * (i + 1), y: 0.5 }, true, (t += 33))
    expect(s.x).toBe(beforeX) // frozen through hand relocation
    // pinch closes → unfrozen, cursor continues from where it was
    cursorStep(s, { x: 0.7, y: 0.5 }, false, (t += 33))
    expect(s.frozen).toBe(false)
    expect(s.x).toBe(beforeX)
  })

  it('clamps to the screen and re-baselines after hand loss', () => {
    const s = createCursorState(0.9, 0.5)
    cursorStep(s, { x: 0.9, y: 0.5 }, false, 0)
    for (let i = 0; i < 30; i++) cursorStep(s, { x: 0.95 + i * 0.005, y: 0.5 }, false, 33 * (i + 1))
    expect(s.x).toBeLessThanOrEqual(1)
    cursorStep(s, null, false, 2000)
    // hand returns at a new position → baseline resets, no jump
    const xBefore = s.x
    cursorStep(s, { x: 0.2, y: 0.5 }, false, 2033)
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
