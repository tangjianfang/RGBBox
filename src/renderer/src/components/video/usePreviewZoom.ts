/**
 * usePreviewZoom — 视频工作站预览缩放 hook（PRD R75.1）。
 * 数学全部来自 previewTransform.ts；本 hook 只负责 DOM 事件与状态机：
 *   fit（适应窗口，自动跟随容器/视频尺寸）↔ free（用户缩放/平移）。
 * 消费方结构约定：
 *   <div ref={wrapRef} class="video-preview-wrap">          ← wheel/pan 事件挂这里
 *     <div class="video-zoom-layer" style={layerStyle} onDoubleClick={reset}>
 *       <video style={{position:'absolute', left/top/width/height: contentRect}}/>
 *     </div>
 *   </div>
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import {
  clampPan, clampScale, containRect, fitAbsScale,
  zoomAtPoint, type Pt, type Rect, type Size, type ViewTransform,
} from './previewTransform'

const PAN_THRESHOLD_PX = 4
const ZOOM_STEP = 1.1

export interface UsePreviewZoom {
  absScale: number                 // 当前绝对缩放（1 = 1:1）
  fitScale: number                 // 适应窗口时的绝对缩放
  percent: number                  // Math.round(absScale*100)
  mode: 'fit' | 'free'
  canPan: boolean
  layerStyle: CSSProperties
  contentRect: Rect                // video/冻结帧在层内的定位
  containerSize: Size
  view: ViewTransform              // 框选坐标映射用
  setNativeSize: (s: Size) => void
  zoomBy: (factor: number, cursor?: Pt) => void
  reset: () => void
  oneToOne: () => void
}

export function usePreviewZoom(wrapRef: RefObject<HTMLElement | null>): UsePreviewZoom {
  const [native, setNativeState] = useState<Size>({ w: 0, h: 0 })
  const [container, setContainer] = useState<Size>({ w: 0, h: 0 })
  const [free, setFree] = useState<{ absScale: number; offset: Pt } | null>(null)

  const setNativeSize = useCallback((s: Size) => setNativeState(s), [])

  // 容器尺寸：mount 量一次 + ResizeObserver 跟随（happy-dom 无 RO 则跳过）
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setContainer({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [wrapRef])

  const hasVideo = native.w > 0 && native.h > 0 && container.w > 0 && container.h > 0
  const rect = useMemo(
    () => (hasVideo ? containRect(container, native) : { x: 0, y: 0, w: 0, h: 0 }),
    [hasVideo, container, native],
  )
  const fit = useMemo(() => (hasVideo ? fitAbsScale(container, native) : 1), [hasVideo, container, native])
  const mode: 'fit' | 'free' = free ? 'free' : 'fit'
  const absScale = free ? free.absScale : fit
  const offset: Pt = free ? free.offset : { x: 0, y: 0 }
  const canPan = free !== null && free.absScale > fit * 1.005
  const center: Pt = { x: container.w / 2, y: container.h / 2 }
  const view: ViewTransform = { center, offset, absScale }

  const setFreeClamped = useCallback(
    (next: { absScale: number; offset: Pt }) => {
      const scaled = { w: rect.w * next.absScale, h: rect.h * next.absScale }
      setFree({ absScale: next.absScale, offset: clampPan(next.offset, scaled, container) })
    },
    [rect, container],
  )

  const zoomBy = useCallback(
    (factor: number, cursor?: Pt) => {
      if (!hasVideo) return
      const cur = free ?? { absScale: fit, offset: { x: 0, y: 0 } }
      const nextScale = clampScale(cur.absScale * factor)
      const anchor = cursor ?? center // 无锚点（按钮）时以中心为锚
      setFreeClamped(zoomAtPoint({ center, offset: cur.offset, absScale: cur.absScale }, anchor, nextScale))
    },
    [hasVideo, free, fit, center, setFreeClamped],
  )

  const reset = useCallback(() => setFree(null), [])
  const oneToOne = useCallback(() => {
    if (!hasVideo) return
    setFree({ absScale: 1, offset: { x: 0, y: 0 } })
  }, [hasVideo])

  // Ctrl+滚轮缩放：原生监听（passive:false 才能 preventDefault；触控板捏合在 Chromium 亦带 ctrlKey）
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [wrapRef, zoomBy])

  // 平移拖拽：4px 阈值放行单击（播放器包装层 onClick=播放/暂停 不受影响）
  const panRef = useRef<{ id: number; last: Pt; dragged: boolean } | null>(null)
  const canPanRef = useRef(canPan)
  canPanRef.current = canPan
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const local = (e: PointerEvent): Pt => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e: PointerEvent): void => {
      if (!canPanRef.current || e.button !== 0) return
      panRef.current = { id: e.pointerId, last: local(e), dragged: false }
    }
    const onMove = (e: PointerEvent): void => {
      const st = panRef.current
      if (!st || e.pointerId !== st.id) return
      const p = local(e)
      const dx = p.x - st.last.x
      const dy = p.y - st.last.y
      if (!st.dragged && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return
      st.last = p
      st.dragged = true
      setFree((prev) => {
        const cur = prev ?? { absScale: fit, offset: { x: 0, y: 0 } }
        const scaled = { w: rect.w * cur.absScale, h: rect.h * cur.absScale }
        return { absScale: cur.absScale, offset: clampPan({ x: cur.offset.x + dx, y: cur.offset.y + dy }, scaled, container) }
      })
    }
    const onUp = (e: PointerEvent): void => {
      if (panRef.current && e.pointerId === panRef.current.id) panRef.current = null
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [wrapRef, fit, rect, container])

  const layerStyle: CSSProperties = free
    ? {
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${absScale})`,
        cursor: canPan ? 'grab' : 'default',
      }
    : { transform: 'none' }

  return {
    absScale, fitScale: fit, percent: Math.round(absScale * 100), mode, canPan,
    layerStyle, contentRect: rect, containerSize: container, view,
    setNativeSize, zoomBy, reset, oneToOne,
  }
}
