import { describe, it, expect } from 'vitest'
import {
  makeShape, shapeBBox, handlesFor, hitTest, moveShape, resizeShape,
  commit, undo, redo, canUndo, canRedo, emptyHistory, distToSegment,
} from '../../../src/renderer/src/components/video/annotationModel'

describe('annotationModel', () => {
  it('makeShape fills defaults and keeps seed fields', () => {
    const s = makeShape('rect', { x: 5, y: 6, w: 10, h: 20 })
    expect(s.id).toBeTruthy(); expect(s.kind).toBe('rect')
    expect(s.x).toBe(5); expect(s.w).toBe(10); expect(s.h).toBe(20)
    expect(typeof s.color).toBe('string'); expect(s.width).toBeGreaterThan(0)
  })

  it('shapeBBox derives from arrow endpoints and pen points', () => {
    const a = makeShape('arrow', { x1: 10, y1: 20, x2: 30, y2: 60 })
    expect(shapeBBox(a)).toEqual({ x: 10, y: 20, w: 20, h: 40 })
    const p = makeShape('pen', { points: [{ x: 0, y: 0 }, { x: 50, y: 24 }] })
    expect(shapeBBox(p)).toEqual({ x: 0, y: 0, w: 50, h: 24 })
  })

  it('handlesFor: bbox shapes 8, arrow endpoints, pen/mosaic/text none', () => {
    expect(handlesFor(makeShape('rect', {})).length).toBe(8)
    expect(handlesFor(makeShape('arrow', {}))).toEqual(['start', 'end'])
    expect(handlesFor(makeShape('pen', {}))).toEqual([])
    expect(handlesFor(makeShape('text', {}))).toEqual([])
  })

  it('hitTest prefers topmost and hits arrow within tolerance', () => {
    const bottom = makeShape('rect', { x: 0, y: 0, w: 100, h: 100 })
    const top = makeShape('rect', { x: 50, y: 50, w: 60, h: 60 })
    expect(hitTest([bottom, top], { x: 60, y: 60 })?.id).toBe(top.id)
    expect(hitTest([bottom, top], { x: 10, y: 10 })?.id).toBe(bottom.id)
    expect(hitTest([bottom, top], { x: 300, y: 300 })).toBeNull()
    const arrow = makeShape('arrow', { x1: 0, y1: 0, x2: 100, y2: 0 })
    expect(hitTest([arrow], { x: 50, y: 6 })?.id).toBe(arrow.id)
    expect(hitTest([arrow], { x: 50, y: 20 })).toBeNull()
  })

  it('moveShape translates bbox, endpoints and points', () => {
    const a = moveShape(makeShape('arrow', { x1: 0, y1: 0, x2: 10, y2: 10 }), 5, 5)
    expect(a.x1).toBe(5); expect(a.y2).toBe(15)
    const p = moveShape(makeShape('pen', { points: [{ x: 1, y: 2 }] }), 1, 1)
    expect(p.points![0]).toEqual({ x: 2, y: 3 })
    const r = moveShape(makeShape('rect', { x: 0, y: 0, w: 5, h: 5 }), 2, 3)
    expect(r.x).toBe(2); expect(r.y).toBe(3)
  })

  it('resizeShape: bbox corner + arrow endpoint, min size 8', () => {
    const r = resizeShape(makeShape('rect', { x: 0, y: 0, w: 100, h: 100 }), 'se', { x: 40, y: 30 })
    expect(r).toMatchObject({ x: 0, y: 0, w: 40, h: 30 })
    const a = resizeShape(makeShape('arrow', { x1: 0, y1: 0, x2: 100, y2: 100 }), 'start', { x: 10, y: 20 })
    expect(a).toMatchObject({ x1: 10, y1: 20, x2: 100, y2: 100 })
    const tiny = resizeShape(makeShape('rect', { x: 0, y: 0, w: 100, h: 100 }), 'se', { x: 3, y: 3 })
    expect(tiny.w).toBeGreaterThanOrEqual(8); expect(tiny.h).toBeGreaterThanOrEqual(8)
  })

  it('history commit/undo/redo', () => {
    const s1 = [makeShape('rect', {})]
    const s2 = [makeShape('rect', {}), makeShape('ellipse', {})]
    let h = commit(emptyHistory, s1)
    expect(canUndo(h)).toBe(false)      // 初始帧不可撤销
    h = commit(h, s2)
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present.length).toBe(1)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present.length).toBe(2)
  })

  it('distToSegment perpendicular and on-line cases', () => {
    expect(distToSegment({ x: 5, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(10)
    expect(distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
  })
})
