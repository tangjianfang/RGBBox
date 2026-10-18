// R309 (evolve #3 / Tier 2): direct unit cover for vision/skeleton.ts —
// the shared hand-bone graph BOTH the live pad and the replay card draw.
// Node env: the 2d context is a recording stub — the tests assert OUR
// geometry mapping and graph integrity, never canvas rendering itself.
import { describe, it, expect } from 'vitest'
import { HAND_BONES, drawHandSkeleton } from '../../../src/renderer/src/vision/skeleton'

/** records every primitive; stroke()/fill() mark path flushes */
function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const ctx = {
    moveTo: (x: number, y: number) => calls.push(`M${x.toFixed(2)},${y.toFixed(2)}`),
    lineTo: (x: number, y: number) => calls.push(`L${x.toFixed(2)},${y.toFixed(2)}`),
    arc: (x: number, y: number) => calls.push(`A${x.toFixed(2)},${y.toFixed(2)}`),
    stroke: () => calls.push('S'),
    fill: () => calls.push('F'),
    beginPath: () => calls.push('B'),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('vision/skeleton (R309, evolve #3)', () => {
  it('HAND_BONES covers ALL 21 MediaPipe landmarks — no orphan point, no out-of-range index', () => {
    expect(HAND_BONES.length).toBe(21) // 4 fingers ×4 + thumb chain 4 + palm arch 2 + wrist-pinky arch... = the canonical 21-bone graph
    const seen = new Set<number>()
    for (const [a, b] of HAND_BONES) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(21)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(21)
      expect(a).not.toBe(b)
      seen.add(a)
      seen.add(b)
    }
    // every landmark is connected — an orphan index would silently vanish from the drawing
    expect(seen.size).toBe(21)
  })

  it('maps normalized landmarks into the rect: bones as one stroke path, one arc per landmark', () => {
    const lm = Array.from({ length: 21 }, (_, i) => ({ x: i / 20, y: (20 - i) / 40 }))
    const { ctx, calls } = recordingCtx()
    drawHandSkeleton(ctx, lm, { x: 10, y: 20, w: 100, h: 40 })
    // one beginPath+stroke for the bone graph, then per-point arcs
    expect(calls.filter((c) => c === 'S').length).toBe(1)
    expect(calls.filter((c) => c.startsWith('A')).length).toBe(21)
    // first landmark (x=0,y=0.5) → rect (10,40); last (x=1,y=0) → (110,20)
    expect(calls).toContain('A10.00,40.00')
    expect(calls).toContain('A110.00,20.00')
    // bone graph: one beginPath, then M(a)L(b) per bone, single stroke at the end
    expect(calls.slice(0, 6)).toEqual(['B', 'M10.00,40.00', 'L15.00,39.00', 'M15.00,39.00', 'L20.00,38.00', 'M20.00,38.00'])
    expect(calls[calls.length - 1]).not.toBe('S') // arcs follow the stroke
  })

  it('a malformed hand (≠21 points) is a silent no-op — zero canvas calls', () => {
    const { ctx, calls } = recordingCtx()
    drawHandSkeleton(ctx, Array.from({ length: 20 }, () => ({ x: 0, y: 0 })), { x: 0, y: 0, w: 10, h: 10 })
    expect(calls).toEqual([])
    drawHandSkeleton(ctx, [], { x: 0, y: 0, w: 10, h: 10 })
    expect(calls).toEqual([])
  })
})
