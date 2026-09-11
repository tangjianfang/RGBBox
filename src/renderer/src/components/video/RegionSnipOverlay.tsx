/**
 * RegionSnipOverlay — 框选局部截图的屏幕空间 SVG 覆盖层（PRD R75.3）。
 * 冻结帧 canvas 由消费方渲染在 zoom 层内（继承同一 transform），
 * 本组件只负责：暗幕遮罩（evenodd 挖洞）、选框、8 手柄、原生尺寸标注、
 * 拖拽（新建/移动/缩放）与 ESC/Enter。选区状态用内容坐标存储，渲染时映射屏幕。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  contentRectToScreen, contentToNative, nativeSelectionRect,
  screenToContent, type Pt, type Rect, type Size, type ViewTransform,
} from './previewTransform'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const MIN_NATIVE = 8
const HANDLE_HIT_PX = 12
const HANDLERS: Array<{ id: Handle; fx: number; fy: number; cursor: string }> = [
  { id: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' }, { id: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' }, { id: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' }, { id: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' }, { id: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
]

interface DragSession { kind: 'new' | 'move' | 'resize'; handle?: Handle; startContent: Pt; orig: Rect }

export interface RegionSnipOverlayProps {
  view: ViewTransform
  contentRect: Rect       // 冻结帧在层内的 contain rect（内容坐标）
  nativeSize: Size
  wrapSize: Size
  onConfirm: (sel: Rect) => void  // 原生像素选区（≥8×8 才触发）
  onCancel: () => void
}

function resizeRect(orig: Rect, handle: Handle, p: Pt): Rect {
  let { x, y, w, h } = orig
  const right = x + w
  const bottom = y + h
  if (handle.includes('w')) { x = Math.min(p.x, right - MIN_NATIVE); w = right - x }
  if (handle.includes('e')) { w = Math.max(MIN_NATIVE, p.x - x) }
  if (handle.includes('n')) { y = Math.min(p.y, bottom - MIN_NATIVE); h = bottom - y }
  if (handle.includes('s')) { h = Math.max(MIN_NATIVE, p.y - y) }
  return { x, y, w, h }
}

export function RegionSnipOverlay({ view, contentRect, nativeSize, wrapSize, onConfirm, onCancel }: RegionSnipOverlayProps): JSX.Element {
  const [sel, setSel] = useState<Rect | null>(null)
  const dragRef = useRef<DragSession | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const toContent = useCallback((clientX: number, clientY: number): Pt => {
    const r = svgRef.current?.getBoundingClientRect()
    return screenToContent({ x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }, view)
  }, [view])

  const confirm = useCallback(() => {
    if (!sel) return
    const from = contentToNative({ x: sel.x, y: sel.y }, contentRect, nativeSize)
    const to = contentToNative({ x: sel.x + sel.w, y: sel.y + sel.h }, contentRect, nativeSize)
    const nat = nativeSelectionRect(from, to, nativeSize)
    if (nat.w >= MIN_NATIVE && nat.h >= MIN_NATIVE) onConfirm(nat)
  }, [sel, contentRect, nativeSize, onConfirm])

  // ESC/Enter（capture 阶段优先，压过播放器快捷键）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      else if (e.key === 'Enter') { e.stopPropagation(); confirm() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel, confirm])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const p = toContent(e.clientX, e.clientY)
    // 手柄命中判定在屏幕空间（12px），选区状态是内容坐标 → 换算后再比
    const screenSel = sel ? contentRectToScreen(sel, view) : null
    const svg = svgRef.current
    const svgBox = svg?.getBoundingClientRect()
    const sx = e.clientX - (svgBox?.left ?? 0)
    const sy = e.clientY - (svgBox?.top ?? 0)
    const hitHandle = HANDLERS.find(hd => {
      if (!screenSel) return false
      const hx = screenSel.x + screenSel.w * hd.fx
      const hy = screenSel.y + screenSel.h * hd.fy
      return Math.abs(sx - hx) <= HANDLE_HIT_PX && Math.abs(sy - hy) <= HANDLE_HIT_PX
    })
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (hitHandle && sel) {
      dragRef.current = { kind: 'resize', handle: hitHandle.id, startContent: p, orig: sel }
    } else if (sel && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h) {
      dragRef.current = { kind: 'move', startContent: p, orig: sel }
    } else {
      dragRef.current = { kind: 'new', startContent: p, orig: { x: p.x, y: p.y, w: 0, h: 0 } }
      setSel(null)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = dragRef.current
    if (!d) return
    const p = toContent(e.clientX, e.clientY)
    if (d.kind === 'new') {
      setSel({
        x: Math.min(d.startContent.x, p.x), y: Math.min(d.startContent.y, p.y),
        w: Math.abs(p.x - d.startContent.x), h: Math.abs(p.y - d.startContent.y),
      })
    } else if (d.kind === 'move') {
      setSel({ ...d.orig, x: d.orig.x + (p.x - d.startContent.x), y: d.orig.y + (p.y - d.startContent.y) })
    } else if (d.kind === 'resize' && d.handle) {
      setSel(resizeRect(d.orig, d.handle, p))
    }
  }

  const endDrag = (): void => { dragRef.current = null }

  const screenSel = sel ? contentRectToScreen(sel, view) : null
  const nativeLabel = (() => {
    if (!sel) return null
    const from = contentToNative({ x: sel.x, y: sel.y }, contentRect, nativeSize)
    const to = contentToNative({ x: sel.x + sel.w, y: sel.y + sel.h }, contentRect, nativeSize)
    const nat = nativeSelectionRect(from, to, nativeSize)
    return `${nat.w}×${nat.h}`
  })()

  const maskPath = screenSel
    ? `M0 0H${wrapSize.w}V${wrapSize.h}H0Z M${screenSel.x} ${screenSel.y}H${screenSel.x + screenSel.w}V${screenSel.y + screenSel.h}H${screenSel.x}Z`
    : `M0 0H${wrapSize.w}V${wrapSize.h}H0Z`

  return (
    <svg
      ref={svgRef}
      className="video-snip-svg"
      width={wrapSize.w}
      height={wrapSize.h}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => { e.stopPropagation(); confirm() }}
    >
      <path d={maskPath} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
      {screenSel && (
        <>
          <rect x={screenSel.x} y={screenSel.y} width={screenSel.w} height={screenSel.h}
            fill="none" stroke="#46c6a8" strokeWidth="1.5" />
          {HANDLERS.map(hd => (
            <rect key={hd.id}
              x={screenSel.x + screenSel.w * hd.fx - 4} y={screenSel.y + screenSel.h * hd.fy - 4}
              width="8" height="8" fill="#46c6a8" stroke="#05090b" strokeWidth="1"
              style={{ cursor: hd.cursor }} />
          ))}
          <text x={screenSel.x} y={Math.max(14, screenSel.y - 6)} className="video-snip-label">
            {nativeLabel}
          </text>
        </>
      )}
    </svg>
  )
}
