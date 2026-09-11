/**
 * annotationModel — 就地标注器的形状模型与历史栈（PRD R76.1）。
 * 全部纯函数、无 DOM；坐标一律为图像原生像素空间。
 */
import type { Pt, Rect } from './previewTransform'

export type ShapeKind = 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic'

export interface Shape {
  id: string
  kind: ShapeKind
  /** bbox（rect/ellipse/text 直接使用；arrow/pen/mosaic 由 shapeBBox 派生，绘制不依赖它） */
  x: number
  y: number
  w: number
  h: number
  color: string
  /** 线宽（text 时为字号基准） */
  width: number
  /** arrow 两端点（图像坐标） */
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  /** pen/mosaic 笔画点列 */
  points?: Pt[]
  /** text 内容 */
  text?: string
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'start' | 'end'

const BBOX_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const MIN_SIZE = 8
const HIT_TOL = 6
let idSeed = 0

export function makeShape(kind: ShapeKind, seed: Partial<Shape>): Shape {
  return {
    id: seed.id ?? `sh-${Date.now().toString(36)}-${idSeed++}`,
    kind,
    x: 0, y: 0, w: 0, h: 0,
    color: seed.color ?? '#46c6a8',
    width: seed.width ?? 3,
    ...seed,
  }
}

export function shapeBBox(s: Shape): Rect {
  if (s.kind === 'arrow') {
    const x1 = s.x1 ?? 0, y1 = s.y1 ?? 0, x2 = s.x2 ?? 0, y2 = s.y2 ?? 0
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
  }
  if (s.kind === 'pen' || s.kind === 'mosaic') {
    const pts = s.points ?? []
    if (pts.length === 0) return { x: s.x, y: s.y, w: 0, h: 0 }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
  }
  return { x: s.x, y: s.y, w: s.w, h: s.h }
}

export function handlesFor(s: Shape): Handle[] {
  if (s.kind === 'arrow') return ['start', 'end']
  if (s.kind === 'pen' || s.kind === 'mosaic' || s.kind === 'text') return []
  return BBOX_HANDLES
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function hitShape(s: Shape, p: Pt, tol: number): boolean {
  if (s.kind === 'arrow') {
    return distToSegment(p, { x: s.x1 ?? 0, y: s.y1 ?? 0 }, { x: s.x2 ?? 0, y: s.y2 ?? 0 }) <= s.width + HIT_TOL
  }
  if (s.kind === 'pen') {
    const pts = s.points ?? []
    for (let i = 1; i < pts.length; i++) {
      if (distToSegment(p, pts[i - 1], pts[i]) <= s.width + HIT_TOL) return true
    }
    return pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= s.width + HIT_TOL
  }
  if (s.kind === 'mosaic') {
    const b = shapeBBox(s)
    return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol
  }
  const b = shapeBBox(s)
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

/** 顶层优先命中。 */
export function hitTest(shapes: Shape[], p: Pt): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(shapes[i], p, 4)) return shapes[i]
  }
  return null
}

/** 平移（深拷贝，含 bbox/端点/点列）。 */
export function moveShape(s: Shape, dx: number, dy: number): Shape {
  const n: Shape = { ...s, x: s.x + dx, y: s.y + dy }
  if (s.x1 !== undefined) n.x1 = s.x1 + dx
  if (s.y1 !== undefined) n.y1 = s.y1 + dy
  if (s.x2 !== undefined) n.x2 = s.x2 + dx
  if (s.y2 !== undefined) n.y2 = s.y2 + dy
  if (s.points) n.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
  return n
}

/** 手柄缩放：bbox 类 8 向（min 8）；arrow 拖端点；pen/mosaic/text 不支持（返回原样）。 */
export function resizeShape(s: Shape, handle: Handle, p: Pt): Shape {
  if (s.kind === 'arrow') {
    const n = { ...s }
    if (handle === 'start') { n.x1 = p.x; n.y1 = p.y }
    else { n.x2 = p.x; n.y2 = p.y }
    return n
  }
  if (s.kind === 'pen' || s.kind === 'mosaic' || s.kind === 'text') return s
  let { x, y, w, h } = s
  const right = x + w, bottom = y + h
  if (handle.includes('w')) { x = Math.min(p.x, right - MIN_SIZE); w = right - x }
  if (handle.includes('e')) { w = Math.max(MIN_SIZE, p.x - x) }
  if (handle.includes('n')) { y = Math.min(p.y, bottom - MIN_SIZE); h = bottom - y }
  if (handle.includes('s')) { h = Math.max(MIN_SIZE, p.y - y) }
  return { ...s, x, y, w, h }
}

// ── 历史栈（快照式；标注数组很小，成本可忽略；各限 50 帧） ──────────────────

export interface History {
  past: Shape[][]
  present: Shape[]
  future: Shape[][]
}

export const emptyHistory: History = { past: [], present: [], future: [] }

export function commit(h: History, shapes: Shape[]): History {
  if (h.past.length === 0 && h.present.length === 0 && h.future.length === 0) {
    return { past: [], present: shapes, future: [] }
  }
  return { past: [...h.past.slice(-49), h.present], present: shapes, future: [] }
}

export function undo(h: History): History {
  if (h.past.length === 0) return h
  const prev = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, 50) }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present].slice(-50), present: next, future: rest }
}

export function canUndo(h: History): boolean { return h.past.length > 0 }
export function canRedo(h: History): boolean { return h.future.length > 0 }
