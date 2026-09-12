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
  /** R78.2: 旋转角（度，绕 bbox 中心，顺时针） */
  rotation?: number
  /** R78.1: 文字对齐 */
  align?: 'left' | 'center' | 'right'
  /** R78.1: 粗体 */
  bold?: boolean
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
  // review-fix(R78): pen/mosaic/text 也要 8 向手柄——否则 resizeShape 的
  // 点列映射/字号同步缩放分支是不可达死代码，text 更是无手柄可抓
  if (s.kind === 'arrow') return ['start', 'end']
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

/** R78.2: 绕中心顺时针旋转点（屏幕 y 向下坐标系，与 canvas rotate 一致）。 */
export function rotatePt(p: Pt, center: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180
  const dx = p.x - center.x
  const dy = p.y - center.y
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  }
}

/** R78.2: 带旋转的顶层优先命中——先把点逆旋转回形状本地坐标系再判定。 */
export function hitTestRotated(shapes: Shape[], p: Pt): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]
    const local = s.rotation ? rotatePt(p, bboxCenter(s), -s.rotation) : p
    if (hitShape(s, local, 4)) return s
  }
  return null
}

function bboxCenter(s: Shape): Pt {
  const b = shapeBBox(s)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export type ReorderDir = 'front' | 'back' | 'forward' | 'backward'

/** R78.1: 图层排序（front 置顶 / back 置底 / forward 上移一位 / backward 下移一位）。 */
export function reorderShape(shapes: Shape[], id: string, dir: ReorderDir): Shape[] {
  const idx = shapes.findIndex(s => s.id === id)
  if (idx < 0) return shapes
  let target = idx
  if (dir === 'front') target = shapes.length - 1
  else if (dir === 'back') target = 0
  else if (dir === 'forward') target = Math.min(shapes.length - 1, idx + 1)
  else target = Math.max(0, idx - 1)
  if (target === idx) return shapes
  const next = [...shapes]
  const [item] = next.splice(idx, 1)
  next.splice(target, 0, item)
  return next
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

/**
 * 手柄缩放（R78.2 扩展语义）：
 *  - arrow：拖端点（不变）；
 *  - 角手柄 + `proportional`：等比缩放（以 x 轴比率为准）——rect/ellipse 保持宽高比，
 *    pen/mosaic 点列按 bbox 比率映射，text 字号同比；
 *  - 边手柄：单轴拉伸（pen/mosaic 点列单轴映射；text 只改 bbox 不改字号）。
 */
export function resizeShape(s: Shape, handle: Handle, p: Pt, opts?: { proportional?: boolean }): Shape {
  if (s.kind === 'arrow') {
    const n = { ...s }
    if (handle === 'start') { n.x1 = p.x; n.y1 = p.y }
    else { n.x2 = p.x; n.y2 = p.y }
    return n
  }
  const b = shapeBBox(s)
  const corner = 'nw ne se sw'.split(' ').includes(handle)
  const proportional = opts?.proportional === true && corner

  // 目标 bbox（在未旋转的本地坐标系里计算；旋转形状的调用方负责先把 p 逆旋转）
  let nx = b.x, ny = b.y, nw = b.w, nh = b.h
  const right = b.x + b.w, bottom = b.y + b.h
  if (handle.includes('w')) { nx = Math.min(p.x, right - MIN_SIZE); nw = right - nx }
  if (handle.includes('e')) { nw = Math.max(MIN_SIZE, p.x - b.x) }
  if (handle.includes('n')) { ny = Math.min(p.y, bottom - MIN_SIZE); nh = bottom - ny }
  if (handle.includes('s')) { nh = Math.max(MIN_SIZE, p.y - b.y) }
  if (proportional) {
    const ratio = b.w > 0 ? nw / b.w : 1
    nh = Math.max(MIN_SIZE, b.h * ratio)
    // 北侧角手柄：顶边跟随比率收缩
    if (handle.includes('n')) ny = bottom - nh
  }

  const mapPoints = (axisOnly?: 'x' | 'y'): Pt[] | undefined => {
    if (!s.points) return undefined
    const kx = b.w > 0 ? nw / b.w : 1
    const ky = b.h > 0 ? nh / b.h : 1
    return s.points.map(pt => ({
      x: axisOnly === 'y' ? pt.x : nx + (pt.x - b.x) * kx,
      y: axisOnly === 'x' ? pt.y : ny + (pt.y - b.y) * ky,
    }))
  }

  if (s.kind === 'pen' || s.kind === 'mosaic') {
    const axisOnly = proportional ? undefined : handle.includes('e') || handle.includes('w') ? 'x' : 'y'
    return { ...s, points: mapPoints(axisOnly) }
  }
  // text
  if (proportional && s.w > 0) {
    const ratio = nw / s.w
    return { ...s, x: nx, y: ny, w: nw, h: nh, width: Math.max(8, s.width * ratio) }
  }
  return { ...s, x: nx, y: ny, w: nw, h: nh }
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
