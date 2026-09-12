/**
 * AnnotateOverlay — 微信式就地标注器（PRD R76.2）。
 * 图片停在原处（contain 居中盖在 .video-stage 上），底部浮动工具条：
 * 矩形/椭圆/箭头/画笔/文字/马赛克 + 撤销/重做 + 8 色 + 3 档粗细 +
 * 选中移动/缩放/Delete 删除；✓ 保存（PNG 下载）/ 复制 / × 放弃。
 *
 * 坐标模型：所有 Shape 存**图像原生像素**坐标；指针事件经视图矩形
 * （containRect + 显示比例 k）映射进图内。视图渲染与导出共用
 * renderAnnotations()——视图 ctx 带 k 缩放变换，导出 ctx 恒等变换。
 * R75.2 无水印铁律：导出只画底图 + 用户标注。
 */
import {
  useCallback, useEffect, useMemo, useRef, useState, type JSX,
} from 'react'
import {
  ArrowUpRight, Check, Circle, Copy, Grid3x3, MousePointer2, Pencil,
  Redo2, Square, Trash2, Type, Undo2, X,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { containRect, type Pt, type Rect, type Size } from './previewTransform'
import {
  canRedo, canUndo, commit, handlesFor, hitTest, makeShape, moveShape,
  redo, resizeShape, shapeBBox, undo,
  type Handle, type History, type Shape, type ShapeKind,
} from './annotationModel'
import { buildMosaicTile, renderAnnotations } from './annotationRender'

export interface AnnotateOverlayProps {
  source: HTMLCanvasElement | string   // 冻结帧裁剪结果或照片 dataURL
  onClose: () => void                  // × 放弃
  onSave: (dataUrl: string) => void    // ✓ 保存（View 负责下载）
  onCopy: (dataUrl: string) => void    // 复制（View 走 clipboardWriteImage IPC）
}

type Tool = 'select' | ShapeKind
const TOOLS: Array<{ id: Tool; icon: typeof Square; key: string }> = [
  { id: 'select', icon: MousePointer2, key: 'video.annotate.tool.select' },
  { id: 'rect', icon: Square, key: 'video.annotate.tool.rect' },
  { id: 'ellipse', icon: Circle, key: 'video.annotate.tool.ellipse' },
  { id: 'arrow', icon: ArrowUpRight, key: 'video.annotate.tool.arrow' },
  { id: 'pen', icon: Pencil, key: 'video.annotate.tool.pen' },
  { id: 'text', icon: Type, key: 'video.annotate.tool.text' },
  { id: 'mosaic', icon: Grid3x3, key: 'video.annotate.tool.mosaic' },
]
const PALETTE = ['#ffffff', '#fe4d4d', '#ffa940', '#ffd666', '#46c6a8', '#40a9ff', '#9254de', '#14181f']
const STROKES = [2, 4, 8]
const HANDLE_HIT_PX = 16

type DragState =
  | { kind: 'create'; start: Pt; draft: Shape }
  | { kind: 'move'; start: Pt; orig: Shape }
  | { kind: 'resize'; handle: Handle; orig: Shape }
  | { kind: 'pan'; lastScreen: Pt }   // R77.3: 放大后拖拽空白平移

export function AnnotateOverlay({ source, onClose, onSave, onCopy }: AnnotateOverlayProps): JSX.Element {
  const { t } = useI18n()

  // ── 底图（canvas 直用；dataURL 异步解码） ──────────────────────────────
  const [base, setBase] = useState<HTMLImageElement | HTMLCanvasElement | null>(
    source instanceof HTMLCanvasElement ? source : null,
  )
  const [natural, setNatural] = useState<Size>(
    source instanceof HTMLCanvasElement ? { w: source.width, h: source.height } : { w: 0, h: 0 },
  )
  useEffect(() => {
    if (source instanceof HTMLCanvasElement) {
      setBase(source); setNatural({ w: source.width, h: source.height })
      return
    }
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) { setBase(img); setNatural({ w: img.naturalWidth, h: img.naturalHeight }) } }
    img.src = source
    return () => { alive = false }
  }, [source])

  // ── 布局：overlay 自身尺寸 → contain rect ──────────────────────────────
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [wrapSize, setWrapSize] = useState<Size>({ w: 0, h: 0 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWrapSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view: Rect = useMemo(
    () => (natural.w > 0 && wrapSize.w > 0 ? containRect(wrapSize, natural) : { x: 0, y: 0, w: 0, h: 0 }),
    [natural, wrapSize],
  )
  const k = view.w > 0 ? view.w / Math.max(1, natural.w) : 1

  // ── 状态 ────────────────────────────────────────────────────────────────
  const [hist, setHist] = useState<History>({ past: [], present: [], future: [] })
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>('#46c6a8')
  const [strokeIdx, setStrokeIdx] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ at: Pt; value: string } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)   // 触发重绘
  const shapes = hist.present

  const pushShapes = useCallback((next: Shape[]) => {
    setHist(h => commit(h, next))
  }, [])

  // ── 马赛克底砖（1/12 采样 + 关平滑放大） ────────────────────────────────
  // R77.2: 全尺寸像素化底砖（1:1 图像坐标，修复 R76 越界采样缺陷）
  const mosaicTileRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    mosaicTileRef.current = base && natural.w > 0 ? buildMosaicTile(base, natural) : null
  }, [base, natural])

  // ── 渲染（视图 canvas：底图 + 标注，同一画布） ──────────────────────────
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || view.w === 0) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(wrapSize.w * dpr)
    cv.height = Math.round(wrapSize.h * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * view.x, dpr * view.y)
    if (base) ctx.drawImage(base, 0, 0)
    const draft = dragRef.current?.kind === 'create' ? dragRef.current.draft : null
    renderAnnotations(ctx, draft ? [...shapes, draft] : shapes, {
      selectedId: selectedId ?? undefined,
      mosaicTile: mosaicTileRef.current,
    })
  }, [base, shapes, selectedId, view, wrapSize, k, dragging])

  // ── 指针 → 图像坐标 ────────────────────────────────────────────────────
  const toImage = useCallback((clientX: number, clientY: number): Pt => {
    const r = wrapRef.current?.getBoundingClientRect()
    const px = clientX - (r?.left ?? 0)
    const py = clientY - (r?.top ?? 0)
    return { x: (px - view.x) / k, y: (py - view.y) / k }
  }, [view, k])

  const screenPt = useCallback((clientX: number, clientY: number): Pt => {
    const r = wrapRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }, [])

  /** 手柄屏幕命中（屏幕空间 16px）。 */
  const hitHandle = useCallback((p: Pt): { shape: Shape; handle: Handle } | null => {
    const sel = shapes.find(s => s.id === selectedId)
    if (!sel) return null
    const b = shapeBBox(sel)
    for (const h of handlesFor(sel)) {
      let hx = b.x * k + view.x, hy = b.y * k + view.y
      if (h === 'start') { hx = (sel.x1 ?? 0) * k + view.x; hy = (sel.y1 ?? 0) * k + view.y }
      else if (h === 'end') { hx = (sel.x2 ?? 0) * k + view.x; hy = (sel.y2 ?? 0) * k + view.y }
      else {
        hx = (b.x + (h.includes('e') ? b.w : h === 'n' || h === 's' ? b.w / 2 : 0)) * k + view.x
        hy = (b.y + (h.includes('s') ? b.h : h === 'e' || h === 'w' ? b.h / 2 : 0)) * k + view.y
      }
      if (Math.abs(p.x - hx) <= HANDLE_HIT_PX && Math.abs(p.y - hy) <= HANDLE_HIT_PX) return { shape: sel, handle: h }
    }
    return null
  }, [shapes, selectedId, k, view])

  const strokeWidthImage = STROKES[strokeIdx] / k

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 || !base) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = toImage(e.clientX, e.clientY)
    if (tool === 'select') {
      const hh = hitHandle(screenPt(e.clientX, e.clientY))
      if (hh) {
        dragRef.current = { kind: 'resize', handle: hh.handle, orig: hh.shape }
        setDragging(d => !d)
        return
      }
      const hit = hitTest(shapes, p)
      setSelectedId(hit?.id ?? null)
      if (hit) dragRef.current = { kind: 'move', start: p, orig: hit }
      return
    }
    if (tool === 'text') {
      setTextInput({ at: p, value: '' })
      return
    }
    // 绘制类：新建 draft（pen/mosaic 从单点起步）
    const seed: Partial<Shape> = { color, width: strokeWidthImage, x: p.x, y: p.y, w: 0, h: 0 }
    if (tool === 'arrow') { seed.x1 = p.x; seed.y1 = p.y; seed.x2 = p.x; seed.y2 = p.y }
    if (tool === 'pen' || tool === 'mosaic') { seed.points = [p]; seed.width = strokeWidthImage }
    dragRef.current = { kind: 'create', start: p, draft: makeShape(tool, seed) }
    setDragging(d => !d)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = dragRef.current
    if (!d) return
    const p = toImage(e.clientX, e.clientY)
    if (d.kind === 'create') {
      if (d.draft.kind === 'rect' || d.draft.kind === 'ellipse') {
        d.draft.x = Math.min(d.start.x, p.x); d.draft.y = Math.min(d.start.y, p.y)
        d.draft.w = Math.abs(p.x - d.start.x); d.draft.h = Math.abs(p.y - d.start.y)
      } else if (d.draft.kind === 'arrow') {
        d.draft.x2 = p.x; d.draft.y2 = p.y
      } else if (d.draft.points) {
        d.draft.points = [...d.draft.points, p]
      }
      setDragging(x => !x)  // draft 可变对象，用计数器触发重绘
    } else if (d.kind === 'move') {
      const moved = moveShape(d.orig, p.x - d.start.x, p.y - d.start.y)
      setHist(h => ({ ...h, present: h.present.map(s => (s.id === moved.id ? moved : s)) }))
    } else if (d.kind === 'resize') {
      const resized = resizeShape(d.orig, d.handle, p)
      setHist(h => ({ ...h, present: h.present.map(s => (s.id === resized.id ? resized : s)) }))
    }
  }

  const endDrag = (): void => {
    const d = dragRef.current
    dragRef.current = null
    if (d?.kind === 'create') {
      const s = d.draft
      const b = shapeBBox(s)
      const meaningful = s.kind === 'text' ? true : b.w >= 3 || b.h >= 3 || (s.points?.length ?? 0) > 3
      if (meaningful) {
        pushShapes([...shapes, s])
        setSelectedId(s.id)
      }
      setDragging(x => !x)
    }
  }

  // ── 文字提交 ────────────────────────────────────────────────────────────
  const commitText = useCallback(() => {
    setTextInput(inp => {
      if (inp && inp.value.trim()) {
        const fontSize = STROKES[strokeIdx] * 8 / k
        const s = makeShape('text', {
          x: inp.at.x, y: inp.at.y, w: Math.max(10, fontSize), h: fontSize * 1.2,
          color, text: inp.value,
        })
        setHist(h => commit(h, [...h.present, s]))
        setSelectedId(s.id)
      }
      return null
    })
  }, [color, strokeIdx, k])

  // ── 快捷键：ESC 关闭 / Delete 删除 / Ctrl+Z·Y 撤销重做 ────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setHist(h => commit(h, h.present.filter(s => s.id !== selectedId)))
        setSelectedId(null)
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); setHist(h => undo(h)); setSelectedId(null)
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); setHist(h => redo(h)); setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, selectedId])

  // ── 导出（自然尺寸；无水印） ───────────────────────────────────────────
  const exportDataUrl = useCallback((): string => {
    try {
      const out = document.createElement('canvas')
      out.width = Math.max(1, Math.round(natural.w))
      out.height = Math.max(1, Math.round(natural.h))
      const ctx = out.getContext('2d')
      if (!ctx || !base) return typeof source === 'string' ? source : ''
      ctx.drawImage(base, 0, 0, out.width, out.height)
      renderAnnotations(ctx, shapes, { mosaicTile: mosaicTileRef.current })
      return out.toDataURL('image/png')
    } catch {
      return typeof source === 'string' ? source : ''
    }
  }, [base, natural, shapes, source])

  const doSave = (): void => { const url = exportDataUrl(); if (url) onSave(url) }
  const doCopy = (): void => { const url = exportDataUrl(); if (url) onCopy(url) }

  const toolBtn = (id: Tool, Icon: typeof Square, key: string, idx: number) => (
    <button
      key={id}
      type="button"
      className={`video-annotate-tool video-annotate-btn${tool === id ? ' active' : ''}`}
      title={t(key as never)}
      onClick={() => { setTool(id); setSelectedId(null); setTextInput(null) }}
    >{<Icon size={15} data-idx={idx} />}</button>
  )

  return (
    <div ref={wrapRef} className="video-annotate-overlay">
      <canvas
        ref={canvasRef}
        className="video-annotate-canvas"
        style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {/* 文字输入（DOM textarea 定位覆盖，Enter/失焦提交） */}
      {textInput && (
        <textarea
          className="video-annotate-text-input"
          autoFocus
          value={textInput.value}
          style={{
            left: textInput.at.x * k + view.x,
            top: textInput.at.y * k + view.y,
            color,
            fontSize: STROKES[strokeIdx] * 8,
          }}
          onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() } }}
          placeholder={t('video.annotate.textPlaceholder' as never)}
        />
      )}

      {/* 工具条 */}
      <div className="video-annotate-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        {TOOLS.map((tt, i) => toolBtn(tt.id, tt.icon, tt.key, i))}
        <span className="video-annotate-sep" />
        <button type="button" className="video-annotate-btn" title={t('video.annotate.undo')} disabled={!canUndo(hist)} onClick={() => { setHist(h => undo(h)); setSelectedId(null) }}><Undo2 size={15} /></button>
        <button type="button" className="video-annotate-btn" title={t('video.annotate.redo')} disabled={!canRedo(hist)} onClick={() => { setHist(h => redo(h)); setSelectedId(null) }}><Redo2 size={15} /></button>
        <span className="video-annotate-sep" />
        {PALETTE.map(c => (
          <button
            key={c}
            type="button"
            className={`video-annotate-swatch${color === c ? ' active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => setColor(c)}
          />
        ))}
        {STROKES.map((w, i) => (
          <button
            key={w}
            type="button"
            className={`video-annotate-stroke${strokeIdx === i ? ' active' : ''}`}
            title={`${w}px`}
            onClick={() => setStrokeIdx(i)}
          ><span className={`video-annotate-dot d${w}`} /></button>
        ))}
        <span className="video-annotate-sep" />
        <button type="button" className="video-annotate-btn" title={t('video.annotate.delete')} disabled={!selectedId} onClick={() => { if (selectedId) { setHist(h => commit(h, h.present.filter(s => s.id !== selectedId))); setSelectedId(null) } }}><Trash2 size={15} /></button>
        <span className="video-annotate-flex" />
        <button type="button" className="video-annotate-btn video-annotate-save" title={t('video.annotate.save')} onClick={doSave}><Check size={16} /></button>
        <button type="button" className="video-annotate-btn video-annotate-copy" title={t('video.annotate.copy')} onClick={doCopy}><Copy size={15} /></button>
        <button type="button" className="video-annotate-btn video-annotate-close" title={t('video.annotate.close')} onClick={onClose}><X size={16} /></button>
      </div>

      <p className="video-annotate-hint">{t('video.annotate.hint')}</p>
    </div>
  )
}
