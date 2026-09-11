import { describe, it, expect } from 'vitest'
import {
  clampScale, containRect, fitAbsScale, zoomAtPoint, clampPan,
  screenToContent, contentRectToScreen, contentToNative, nativeSelectionRect,
  MIN_ABS_SCALE, MAX_ABS_SCALE,
} from '../../../src/renderer/src/components/video/previewTransform'

describe('previewTransform', () => {
  it('clampScale clamps to [0.1, 8] and guards non-finite', () => {
    expect(clampScale(0.01)).toBe(MIN_ABS_SCALE)
    expect(clampScale(99)).toBe(MAX_ABS_SCALE)
    expect(clampScale(2.5)).toBe(2.5)
    expect(clampScale(NaN)).toBe(MIN_ABS_SCALE)
    expect(clampScale(0)).toBe(MIN_ABS_SCALE)
  })

  it('containRect letterboxes 16:9 video in 4:3 container, centered', () => {
    // container 800x600, native 1920x1080: fit by width (800/1920 < 600/1080)
    // → w=800, h=1080*(800/1920)=450, centered vertically at y=75
    const r = containRect({ w: 800, h: 600 }, { w: 1920, h: 1080 })
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(75)
    expect(r.w).toBeCloseTo(800)
    expect(r.h).toBeCloseTo(450)
  })

  it('containRect taller-than-container video pillarboxes', () => {
    const r = containRect({ w: 800, h: 600 }, { w: 600, h: 1200 })
    expect(r).toEqual({ x: 250, y: 0, w: 300, h: 600 })
  })

  it('fitAbsScale = containRect.w / native.w', () => {
    expect(fitAbsScale({ w: 800, h: 600 }, { w: 1920, h: 1080 })).toBeCloseTo(800 / 1920)
  })

  it('zoomAtPoint keeps the cursor pinned to the same content point', () => {
    const view = { center: { x: 400, y: 300 }, offset: { x: 10, y: -5 }, absScale: 0.5 }
    const cursor = { x: 500, y: 350 }
    const before = screenToContent(cursor, view)
    const out = zoomAtPoint(view, cursor, 1.0)
    const after = screenToContent(cursor, { ...view, ...out })
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(out.absScale).toBe(1.0)
  })

  it('zoomAtPoint at center scales offset by the scale ratio', () => {
    const view = { center: { x: 100, y: 100 }, offset: { x: 20, y: 10 }, absScale: 1 }
    const out = zoomAtPoint(view, { x: 100, y: 100 }, 2)
    expect(out.offset).toEqual({ x: 40, y: 20 })
  })

  it('clampPan keeps scaled content within reach + margin', () => {
    // scaled 2000 wide in container 800 → reach = (2000-800)/2 + 80 = 680
    expect(clampPan({ x: 9999, y: 0 }, { w: 2000, h: 600 }, { w: 800, h: 600 })).toEqual({ x: 680, y: 0 })
    // content smaller than container: only the margin wiggle is allowed
    expect(clampPan({ x: -50, y: 50 }, { w: 400, h: 400 }, { w: 800, h: 600 })).toEqual({ x: -50, y: 50 })
  })

  it('screenToContent/contentRectToScreen are inverse-consistent', () => {
    const view = { center: { x: 400, y: 300 }, offset: { x: 30, y: 40 }, absScale: 2 }
    const p = { x: 500, y: 350 }
    const q = screenToContent(p, view)
    const r = contentRectToScreen({ x: q.x, y: q.y, w: 10, h: 5 }, view)
    expect(r.x).toBeCloseTo(p.x)
    expect(r.y).toBeCloseTo(p.y)
    expect(r.w).toBeCloseTo(20)
    expect(r.h).toBeCloseTo(10)
  })

  it('contentToNative maps content coords into native pixels over the contain rect', () => {
    // content rect 0,75,800,450 covering native 1920x1080 → k = 1920/800 = 2.4
    const p = contentToNative({ x: 400, y: 300 }, { x: 0, y: 75, w: 800, h: 450 }, { w: 1920, h: 1080 })
    expect(p.x).toBeCloseTo(960)
    expect(p.y).toBeCloseTo((300 - 75) * 2.4)
  })

  it('nativeSelectionRect normalizes, rounds and clamps to frame', () => {
    const r = nativeSelectionRect({ x: 1900, y: -20 }, { x: 100, y: 50 }, { w: 1920, h: 1080 })
    expect(r).toEqual({ x: 100, y: 0, w: 1800, h: 50 })
  })
})
