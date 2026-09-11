/**
 * previewTransform — 纯数学模块：视频工作站预览缩放 + 框选坐标映射（PRD R75.1 / R75.3）。
 *
 * 坐标模型：
 *  - <video> 与冻结帧 canvas 按 containRect() 定位在满尺寸 .video-zoom-layer 内，
 *    内容中心 == 层中心 == 容器中心（transform 前）。
 *  - 层 CSS transform = `translate(offsetX, offsetY) scale(absScale)`（先 scale 后 translate）：
 *      屏幕点 = center + offset + (内容点 − center) × absScale
 *  - absScale 为绝对比例：1 = 1 视频像素对 1 CSS 像素（"1:1"）；
 *    "适应窗口" 的 absScale = fitAbsScale()。
 * 无 DOM 依赖，可独立单测。
 */

export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const MIN_ABS_SCALE = 0.1
export const MAX_ABS_SCALE = 8

export function clampScale(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return MIN_ABS_SCALE
  return Math.min(MAX_ABS_SCALE, Math.max(MIN_ABS_SCALE, s))
}

/** Letterbox "contain" fit：native 等比缩放进 container，居中。 */
export function containRect(container: Size, native: Size): Rect {
  const cw = Math.max(1, container.w)
  const ch = Math.max(1, container.h)
  const nw = Math.max(1, native.w)
  const nh = Math.max(1, native.h)
  const k = Math.min(cw / nw, ch / nh)
  const w = nw * k
  const h = nh * k
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

/** "适应窗口" 时的绝对缩放比。 */
export function fitAbsScale(container: Size, native: Size): number {
  return containRect(container, native).w / Math.max(1, native.w)
}

export interface ViewTransform {
  center: Pt       // 容器中心（内容变换前的中心）
  offset: Pt       // pan 平移（CSS px）
  absScale: number // 绝对缩放（1 = 1:1）
}

/**
 * 锚点缩放：scale s0→s1 时保持 cursor（屏幕坐标）钉在同一内容点上。
 * 推导：q − c = (p − c − t0)/s0；t1 = p − c − (q − c)·s1 = (p − c)(1 − ratio) + t0·ratio，ratio = s1/s0。
 */
export function zoomAtPoint(view: ViewTransform, cursor: Pt, nextScale: number): { offset: Pt; absScale: number } {
  const absScale = clampScale(nextScale)
  const ratio = view.absScale > 0 ? absScale / view.absScale : 1
  return {
    absScale,
    offset: {
      x: (cursor.x - view.center.x) * (1 - ratio) + view.offset.x * ratio,
      y: (cursor.y - view.center.y) * (1 - ratio) + view.offset.y * ratio,
    },
  }
}

/** 平移边界：每轴至少让 `margin` px 的缩放后内容保持可见。 */
export function clampPan(offset: Pt, scaled: Size, container: Size, margin = 80): Pt {
  const clampAxis = (t: number, s: number, c: number): number => {
    const reach = Math.max(0, (s - c) / 2) + margin
    return Math.min(reach, Math.max(-reach, t))
  }
  return {
    x: clampAxis(offset.x, scaled.w, container.w),
    y: clampAxis(offset.y, scaled.h, container.h),
  }
}

/** 屏幕点 → 内容点（transform 前的层内坐标）。 */
export function screenToContent(p: Pt, view: ViewTransform): Pt {
  return {
    x: (p.x - view.center.x - view.offset.x) / view.absScale + view.center.x,
    y: (p.y - view.center.y - view.offset.y) / view.absScale + view.center.y,
  }
}

/** 内容矩形 → 屏幕矩形（框选 UI 用：选区画在屏幕空间）。 */
export function contentRectToScreen(rect: Rect, view: ViewTransform): Rect {
  const p1 = contentToScreen({ x: rect.x, y: rect.y }, view)
  const p2 = contentToScreen({ x: rect.x + rect.w, y: rect.y + rect.h }, view)
  return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y }
}

function contentToScreen(p: Pt, view: ViewTransform): Pt {
  return {
    x: view.center.x + view.offset.x + (p.x - view.center.x) * view.absScale,
    y: view.center.y + view.offset.y + (p.y - view.center.y) * view.absScale,
  }
}

/** 内容点 → 原生视频像素（冻结帧 canvas 覆盖 containRect，等比 k = native.w/content.w）。 */
export function contentToNative(p: Pt, content: Rect, native: Size): Pt {
  const k = native.w / Math.max(1, content.w)
  return { x: (p.x - content.x) * k, y: (p.y - content.y) * k }
}

/** 原生像素选区：归一化（from/to 任意方向）+ 取整 + clamp 进画面。 */
export function nativeSelectionRect(from: Pt, to: Pt, native: Size): Rect {
  const x0 = Math.max(0, Math.min(native.w, Math.min(from.x, to.x)))
  const x1 = Math.max(0, Math.min(native.w, Math.max(from.x, to.x)))
  const y0 = Math.max(0, Math.min(native.h, Math.min(from.y, to.y)))
  const y1 = Math.max(0, Math.min(native.h, Math.max(from.y, to.y)))
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}
