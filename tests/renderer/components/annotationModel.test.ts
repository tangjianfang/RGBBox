import { describe, it, expect } from 'vitest'
import {
  makeShape, shapeBBox, handlesFor, hitTest, moveShape, resizeShape,
  commit, undo, redo, canUndo, canRedo, emptyHistory, distToSegment,
  reorderShape, rotatePt, hitTestRotated, hitShapeBorder,
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

  it('handlesFor: bbox shapes (incl. pen/mosaic/text, R78 review-fix) 8, arrow endpoints', () => {
    expect(handlesFor(makeShape('rect', {})).length).toBe(8)
    expect(handlesFor(makeShape('arrow', {}))).toEqual(['start', 'end'])
    expect(handlesFor(makeShape('pen', {})).length).toBe(8)
    expect(handlesFor(makeShape('text', {})).length).toBe(8)
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

  // ── R78: rotation / reorder / proportional resize ──────────────────────

  it('reorderShape: four directions', () => {
    const a = makeShape('rect', { id: 'a' }), b = makeShape('rect', { id: 'b' }), c = makeShape('rect', { id: 'c' })
    expect(reorderShape([a, b, c], 'a', 'front').map(s => s.id)).toEqual(['b', 'c', 'a'])
    expect(reorderShape([a, b, c], 'c', 'back').map(s => s.id)).toEqual(['c', 'a', 'b'])
    expect(reorderShape([a, b, c], 'a', 'forward').map(s => s.id)).toEqual(['b', 'a', 'c'])
    expect(reorderShape([a, b, c], 'c', 'backward').map(s => s.id)).toEqual(['a', 'c', 'b'])
    // 边界：已在顶/底或 id 不存在 → 原样
    expect(reorderShape([a, b], 'a', 'back').map(s => s.id)).toEqual(['a', 'b'])
    expect(reorderShape([a], 'nope', 'front').map(s => s.id)).toEqual(['a'])
  })

  it('rotatePt rotates clockwise around center (90° up→right)', () => {
    const c = { x: 10, y: 10 }
    // (10, 0) 在中心正上方；顺时针 90° 应到正右 (20, 10)
    const out = rotatePt({ x: 10, y: 0 }, c, 90)
    expect(out.x).toBeCloseTo(20)
    expect(out.y).toBeCloseTo(10)
  })

  it('hitTestRotated hits a rotated rect at the rotated position', () => {
    // 100×100 rect at origin，绕中心 (50,50) 转 45° → 命中原 bbox 角附近的点、未命中旋转后空出的边中点
    const s = makeShape('rect', { x: 0, y: 0, w: 100, h: 100, rotation: 45 })
    // 旋转后正右方向 (50+70.7, 50) 处是形状对角线延伸 → 命中
    expect(hitTestRotated([s], { x: 50 + 60, y: 50 })?.id).toBe(s.id)
    // 原 bbox 上边中点 (50, 1)：旋转 45° 后该点已转出形状（距中心 49，旋转后位置仍在半径 49 的圆上，
    // 但形状现在是以中心为圆心、半对角 70.7 的旋转正方形——(50,1) 逆旋 45° 落在对角线上 → 命中）。
    // 换一个确定未命中点：距中心 80 的点（超出旋转正方形最大半径 70.7）
    expect(hitTestRotated([s], { x: 50 + 80, y: 50 })).toBeNull()
  })

  it('proportional corner resize keeps aspect for rect, maps pen points, scales text font', () => {
    const r = resizeShape(makeShape('rect', { x: 0, y: 0, w: 100, h: 50 }), 'se', { x: 50, y: 25 }, { proportional: true })
    // 等比：以 w 比例 0.5 为准 → h 同比 25
    expect(r).toMatchObject({ w: 50, h: 25 })
    const p = resizeShape(
      makeShape('pen', { points: [{ x: 0, y: 0 }, { x: 100, y: 40 }] }),
      'se', { x: 50, y: 999 }, { proportional: true },
    )
    // pen bbox 100×40 → 等比 w=50 → 点列按 0.5 映射
    expect(p.points![0]).toEqual({ x: 0, y: 0 })
    expect(p.points![1].x).toBeCloseTo(50)
    expect(p.points![1].y).toBeCloseTo(20)
    const t = resizeShape(makeShape('text', { x: 0, y: 0, w: 100, h: 20, width: 32, text: 'a' }), 'se', { x: 50, y: 999 }, { proportional: true })
    expect(t.w).toBe(50)
    expect(t.width).toBeCloseTo(16)   // 字号同比
  })

  it('edge stretch maps pen points on one axis', () => {
    const p = resizeShape(
      makeShape('pen', { points: [{ x: 10, y: 10 }, { x: 60, y: 30 }] }),
      'e', { x: 110, y: 0 },
    )
    // pen bbox x:10..60 → 右边拉到 110 → x 轴 ×2（10→60 变 10→110），y 不变
    expect(p.points![0].x).toBe(10)
    expect(p.points![1].x).toBeCloseTo(110)
    expect(p.points![1].y).toBeCloseTo(30)
  })

  it('makeShape passes through rotation/align/bold', () => {
    const s = makeShape('text', { rotation: 30, align: 'center', bold: true, text: 'x' })
    expect(s.rotation).toBe(30)
    expect(s.align).toBe('center')
    expect(s.bold).toBe(true)
  })

  it('R79.12: hitShapeBorder maps border band to directional handles', () => {
    const r = makeShape('rect', { x: 100, y: 100, w: 200, h: 100 })   // bbox (100,100)-(300,200)
    // 边中点 → 单轴柄；框内贴边与框外贴边（≤tol）都算
    expect(hitShapeBorder([r], { x: 300, y: 150 }, 6)?.handle).toBe('e')
    expect(hitShapeBorder([r], { x: 200, y: 100 }, 6)?.handle).toBe('n')
    expect(hitShapeBorder([r], { x: 104, y: 150 }, 6)?.handle).toBe('w')
    expect(hitShapeBorder([r], { x: 305, y: 150 }, 6)?.handle).toBe('e')
    expect(hitShapeBorder([r], { x: 307, y: 150 }, 6)).toBeNull()
    // 角区（两轴同时近边）→ 等比角柄
    expect(hitShapeBorder([r], { x: 102, y: 102 }, 6)?.handle).toBe('nw')
    expect(hitShapeBorder([r], { x: 297, y: 198 }, 6)?.handle).toBe('se')
    // 中心不命中（体内走 move 语义）；边的延长线远端不命中
    expect(hitShapeBorder([r], { x: 200, y: 150 }, 6)).toBeNull()
    expect(hitShapeBorder([r], { x: 305, y: 250 }, 6)).toBeNull()
  })

  it('R79.12: hitShapeBorder is rotation-aware and skips pen/arrow; topmost wins', () => {
    // 旋转 90°：本地系右边框转到屏幕下方 (200, 250)
    const rot = makeShape('rect', { x: 100, y: 100, w: 200, h: 100, rotation: 90 })
    expect(hitShapeBorder([rot], { x: 200, y: 250 }, 6)?.handle).toBe('e')
    // pen/arrow 不参与（笔迹边框语义不成立）
    const pen = makeShape('pen', { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }] })
    expect(hitShapeBorder([pen], { x: 25, y: 0 }, 6)).toBeNull()
    const arrow = makeShape('arrow', { x1: 0, y1: 0, x2: 50, y2: 0 })
    expect(hitShapeBorder([arrow], { x: 25, y: 0 }, 6)).toBeNull()
    // 顶层优先：同位置叠两个矩形，返回数组末位（顶层）
    const a = makeShape('rect', { x: 100, y: 100, w: 200, h: 100 })
    const b = makeShape('rect', { x: 100, y: 100, w: 200, h: 100 })
    expect(hitShapeBorder([a, b], { x: 300, y: 150 }, 6)?.shape).toBe(b)
  })
})
