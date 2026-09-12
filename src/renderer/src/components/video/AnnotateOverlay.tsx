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
  AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpRight, ArrowUpToLine,
  Bold, Check, ChevronDown, ChevronUp, Circle, Copy, Grid3x3, MousePointer2, Pencil,
  Redo2, Square, Trash2, Type, Undo2, X, ScanText,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { clampPan, clampScale, containRect, zoomAtPoint, type Pt, type Rect, type Size } from './previewTransform'
import {
  canRedo, canUndo, commit, handlesFor, hitTestRotated, makeShape, moveShape,
  redo, reorderShape, resizeShape, rotatePt, shapeBBox, undo,
  type Handle, type History, type Shape, type ShapeKind,
} from './annotationModel'
import { buildMosaicTile, measureTextBlock, renderAnnotations } from './annotationRender'
import { cropToDataUrl } from './frameCapture'

export interface AnnotateOverlayProps {
  source: HTMLCanvasElement | string   // 冻结帧裁剪结果或照片 dataURL
  onClose: () => void                  // × 放弃
  onSave: (dataUrl: string) => void    // ✓ 保存（View 负责下载）
  onCopy: (dataUrl: string) => void    // 复制（View 走 clipboardWriteImage IPC）
}

/** R78.1: Enter 提交判定（IME 组合中的 Enter/空格属于输入法，不提交）。 */
export function shouldCommitText(ev: { key: string; shiftKey?: boolean; isComposing?: boolean }): boolean {
  return ev.key === 'Enter' && !ev.shiftKey && ev.isComposing !== true
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
const FONT_SIZES = [12, 16, 20, 24, 32, 48]
const HANDLE_HIT_PX = 16
const ROTATE_OFFSET_PX = 22
/** 无 canvas 环境的导出兜底（1×1 透明 PNG；生产路径永远走真 canvas）。 */
const FALLBACK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

type DragState =
  | { kind: 'create'; start: Pt; draft: Shape }
  | { kind: 'move'; start: Pt; orig: Shape }
  | { kind: 'resize'; handle: Handle; orig: Shape; proportional: boolean }
  | { kind: 'rotate'; orig: Shape; centerScreen: Pt; startAngle: number }
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

  // ── 状态 ────────────────────────────────────────────────────────────────
  const [hist, setHist] = useState<History>({ past: [], present: [], future: [] })
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>('#46c6a8')
  const [strokeIdx, setStrokeIdx] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ at: Pt; value: string } | null>(null)
  const [zoomState, setZoomState] = useState<{ z: number; offset: Pt } | null>(null)
  const [dragging, setDragging] = useState(false)   // 触发重绘
  // R78.1: 文字排版默认值（作用于新建；选中文本时 applyTextProp 同步改选中项）
  const [textDefault, setTextDefault] = useState<{ align: 'left' | 'center' | 'right'; bold: boolean }>({ align: 'left', bold: false })
  // R78.1: Ctrl+V 落点（最近一次画布指针图像坐标）
  const lastPtRef = useRef<Pt>({ x: 0, y: 0 })
  // R78.1: 双击编辑已有文字时，提交时替换该形状而非新增
  const replaceIdRef = useRef<string | null>(null)
  // review-fix(R78): 拖拽/旋转开始前的快照——结束时入历史（否则 Ctrl+Z 会整形状消失）
  const preDragPresentRef = useRef<Shape[] | null>(null)
  // R78.3: OCR 面板
  const [ocr, setOcr] = useState<{ status: 'idle' | 'running' | 'done' | 'failed'; text: string; hint?: string }>({ status: 'idle', text: '' })
  // R79.2: 框选识别（图像坐标区域；active = 框选模式中）
  const [ocrRegionActive, setOcrRegionActive] = useState(false)
  const [ocrRegionDraft, setOcrRegionDraft] = useState<{ start: Pt; end: Pt } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const shapes = hist.present
  const selectedShape = shapes.find(s => s.id === selectedId) ?? null

  // R77.3: 视图 = contain-fit 矩形绕容器中心缩放 z + 平移 offset（zoom=null 即 fit）
  const fit: Rect = useMemo(
    () => (natural.w > 0 && wrapSize.w > 0 ? containRect(wrapSize, natural) : { x: 0, y: 0, w: 0, h: 0 }),
    [natural, wrapSize],
  )
  const view: Rect = useMemo(() => {
    const zz = zoomState?.z ?? 1
    const off = zoomState?.offset ?? { x: 0, y: 0 }
    const c = { x: wrapSize.w / 2, y: wrapSize.h / 2 }
    return {
      x: c.x + (fit.x - c.x) * zz + off.x,
      y: c.y + (fit.y - c.y) * zz + off.y,
      w: fit.w * zz,
      h: fit.h * zz,
    }
  }, [fit, zoomState, wrapSize])
  const z = zoomState?.z ?? 1
  const k = view.w > 0 ? view.w / Math.max(1, natural.w) : 1

  const pushShapes = useCallback((next: Shape[]) => {
    setHist(h => commit(h, next))
  }, [])

  // ── 马赛克底砖（1/12 采样 + 关平滑放大） ────────────────────────────────
  // R77.2: 全尺寸像素化底砖（1:1 图像坐标，修复 R76 越界采样缺陷）
  const mosaicTileRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    mosaicTileRef.current = base && natural.w > 0 ? buildMosaicTile(base, natural) : null
  }, [base, natural])

  // R77.3: 滚轮直接缩放（无需 Ctrl、步进 ×1.06、锚点=鼠标、绝对比例 clamp 10%–800%）
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      // review-fix: 工具条/文字输入框/OCR 面板/字号行等控件上的滚轮留给控件自身，不缩放
      const t = e.target as HTMLElement | null
      if (t && typeof t.closest === 'function' &&
        t.closest('.video-annotate-toolbar, .video-annotate-toolbar2, .video-annotate-ocr-panel, textarea, select, input')) return
      e.preventDefault()
      if (fit.w === 0 || natural.w === 0) return
      const fitK = fit.w / Math.max(1, natural.w)
      const curAbs = fitK * (zoomState?.z ?? 1)
      const nextAbs = clampScale(curAbs * (e.deltaY < 0 ? 1.06 : 1 / 1.06))
      if (nextAbs === curAbs) return
      // review-fix: 极小图（fitK>8）时 clamp 会反向——放大不得变小、缩小不得变大
      if (e.deltaY < 0 && nextAbs < curAbs) return
      if (e.deltaY > 0 && nextAbs > curAbs) return
      const r = el.getBoundingClientRect()
      const cursor = { x: e.clientX - r.left, y: e.clientY - r.top }
      const c = { x: el.clientWidth / 2, y: el.clientHeight / 2 }
      const out = zoomAtPoint({ center: c, offset: zoomState?.offset ?? { x: 0, y: 0 }, absScale: curAbs }, cursor, nextAbs)
      setZoomState({ z: nextAbs / fitK, offset: out.offset })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [fit, natural, zoomState])

  // ── 渲染（视图 canvas：底图 + 标注，同一画布） ──────────────────────────
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || view.w === 0) return
    const dpr = window.devicePixelRatio || 1
    // review-fix: 尺寸未变不重设（重设会清空+重分配 backing store，打字时逐帧抖动）
    const cw = Math.round(wrapSize.w * dpr)
    const ch = Math.round(wrapSize.h * dpr)
    if (cv.width !== cw) cv.width = cw
    if (cv.height !== ch) cv.height = ch
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

  /** 手柄屏幕命中（屏幕空间 16px；R78.2: 过旋转变换 + 旋转柄）。 */
  const hitHandle = useCallback((p: Pt): { shape: Shape; handle: Handle | 'rotate' } | null => {
    const sel = shapes.find(s => s.id === selectedId)
    if (!sel) return null
    const b = shapeBBox(sel)
    const rot = sel.rotation ?? 0
    const cScr: Pt = { x: (b.x + b.w / 2) * k + view.x, y: (b.y + b.h / 2) * k + view.y }
    // 旋转柄：顶部中点沿旋转后上方偏移（review-fix: text 同样可旋转）
    {
      const rLocal: Pt = { x: cScr.x, y: (b.y) * k + view.y - ROTATE_OFFSET_PX }
      const rPos = rot ? rotatePt(rLocal, cScr, rot) : rLocal
      if (Math.abs(p.x - rPos.x) <= HANDLE_HIT_PX && Math.abs(p.y - rPos.y) <= HANDLE_HIT_PX) {
        return { shape: sel, handle: 'rotate' }
      }
    }
    for (const h of handlesFor(sel)) {
      let hx = b.x * k + view.x, hy = b.y * k + view.y
      if (h === 'start') { hx = (sel.x1 ?? 0) * k + view.x; hy = (sel.y1 ?? 0) * k + view.y }
      else if (h === 'end') { hx = (sel.x2 ?? 0) * k + view.x; hy = (sel.y2 ?? 0) * k + view.y }
      else {
        hx = (b.x + (h.includes('e') ? b.w : h === 'n' || h === 's' ? b.w / 2 : 0)) * k + view.x
        hy = (b.y + (h.includes('s') ? b.h : h === 'e' || h === 'w' ? b.h / 2 : 0)) * k + view.y
      }
      const pos = rot ? rotatePt({ x: hx, y: hy }, cScr, rot) : { x: hx, y: hy }
      if (Math.abs(p.x - pos.x) <= HANDLE_HIT_PX && Math.abs(p.y - pos.y) <= HANDLE_HIT_PX) return { shape: sel, handle: h }
    }
    return null
  }, [shapes, selectedId, k, view])

  const strokeWidthImage = STROKES[strokeIdx] / k

  /** R79.5: 手柄方向光标——45° 步进的 4 态周期（review-fix: 四角全算角；周期 90°）。 */
  const handleCursor = (handle: Handle, rotation: number): string => {
    if (handle === 'start' || handle === 'end') return 'move'
    // 周期：nwse →(45°)→ ew →(45°)→ nesw →(45°)→ ns →(45°)→ nwse
    const CYCLE = ['nwse', 'ew', 'nesw', 'ns']
    const idx0 = handle === 'nw' || handle === 'se' ? 0
      : handle === 'e' || handle === 'w' ? 1
      : handle === 'ne' || handle === 'sw' ? 2 : 3
    const bucket = ((Math.round(rotation / 45) % 4) + 4) % 4
    return `${CYCLE[(idx0 + bucket) % 4]}-resize`
  }

  /** R79.5: 空闲态 hover 上下文光标（直写 canvas style）。 */
  const updateHoverCursor = (imgPt: Pt, sp: Pt): void => {
    const cv = canvasRef.current
    if (!cv) return
    let cursor = 'default'
    if (ocrRegionActive) cursor = 'crosshair'
    else {
      const hh = hitHandle(sp)
      if (hh) cursor = hh.handle === 'rotate' ? 'grab' : handleCursor(hh.handle, hh.shape.rotation ?? 0)
      else if (hitTestRotated(shapes, imgPt)) cursor = 'move'
      else if (tool !== 'select') cursor = 'crosshair'
      else if (z > 1.001) cursor = 'grab'
    }
    cv.style.cursor = cursor
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    // review-fix: 恢复严格守卫——底图未解码时 natural={0,0}，此时放置文字会把屏幕坐标
    // 当图像坐标存下，解码后位置错乱（文字等 base 就绪后再放）
    if (e.button !== 0 || !base) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = toImage(e.clientX, e.clientY)
    lastPtRef.current = p
    const sp = screenPt(e.clientX, e.clientY)
    // R78.2: 旋转柄/手柄优先（任意工具下都可直接抓选中形状的手柄）
    const hh = hitHandle(sp)
    if (hh) {
      preDragPresentRef.current = shapes
      if (hh.handle === 'rotate') {
        const b = shapeBBox(hh.shape)
        const cScr: Pt = { x: (b.x + b.w / 2) * k + view.x, y: (b.y + b.h / 2) * k + view.y }
        dragRef.current = {
          kind: 'rotate', orig: hh.shape, centerScreen: cScr,
          startAngle: (Math.atan2(sp.y - cScr.y, sp.x - cScr.x) * 180) / Math.PI,
        }
        setDragging(d => !d)
        return
      }
      // 角手柄等比、边手柄单轴
      dragRef.current = { kind: 'resize', handle: hh.handle, orig: hh.shape, proportional: hh.handle.length === 2 }
      setDragging(d => !d)
      return
    }
    const hit = hitTestRotated(shapes, p)
    if (tool === 'select') {
      setSelectedId(hit?.id ?? null)
      if (hit) {
        preDragPresentRef.current = shapes
        dragRef.current = { kind: 'move', start: p, orig: hit }
      } else if (z > 1.001) {
        // R77.3: 放大后选择工具拖拽空白 = 平移视图
        dragRef.current = { kind: 'pan', lastScreen: sp }
      }
      return
    }
    if (tool === 'text') {
      // R78.2: 点中已有文字 → 选中编辑（双击进文字编辑在 onDoubleClick）
      if (hit) { setSelectedId(hit.id); return }
      setTextInput({ at: p, value: '' })
      return
    }
    // R78.2: 绘制工具点中已有形状 → 选中 + 拖动编辑（点空白才新建）
    if (hit) {
      setSelectedId(hit.id)
      preDragPresentRef.current = shapes
      dragRef.current = { kind: 'move', start: p, orig: hit }
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
    const p = toImage(e.clientX, e.clientY)
    const d = dragRef.current
    if (!d) {
      // R79.5: 空闲态 hover 手势光标（直写 style，避免逐帧 setState）
      updateHoverCursor(p, screenPt(e.clientX, e.clientY))
      return
    }
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
      // 旋转形状：先把指针逆旋转到本地坐标系再缩放
      let local = p
      if (d.orig.rotation) {
        const b = shapeBBox(d.orig)
        local = rotatePt(p, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, -d.orig.rotation)
      }
      const resized = resizeShape(d.orig, d.handle, local, { proportional: d.proportional })
      setHist(h => ({ ...h, present: h.present.map(s => (s.id === resized.id ? resized : s)) }))
    } else if (d.kind === 'rotate') {
      const sp = screenPt(e.clientX, e.clientY)
      let deg = (d.orig.rotation ?? 0) + (Math.atan2(sp.y - d.centerScreen.y, sp.x - d.centerScreen.x) * 180) / Math.PI - d.startAngle
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      const rotated = { ...d.orig, rotation: ((deg % 360) + 360) % 360 }
      setHist(h => ({ ...h, present: h.present.map(s => (s.id === rotated.id ? rotated : s)) }))
    } else if (d.kind === 'pan') {
      const sp = screenPt(e.clientX, e.clientY)
      const dx = sp.x - d.lastScreen.x
      const dy = sp.y - d.lastScreen.y
      d.lastScreen = sp
      setZoomState(zs => {
        const zz = zs?.z ?? 1
        return {
          z: zz,
          offset: clampPan(
            { x: (zs?.offset.x ?? 0) + dx, y: (zs?.offset.y ?? 0) + dy },
            { w: fit.w * zz, h: fit.h * zz },
            wrapSize,
            60,
          ),
        }
      })
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
    } else if (d && (d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate')) {
      // review-fix(R78): 拖拽结束把"拖前快照"入历史——Ctrl+Z 只回退本操作，不吞形状
      const pre = preDragPresentRef.current
      preDragPresentRef.current = null
      if (pre) setHist(h => (h.present === pre ? h : { past: [...h.past.slice(-49), pre], present: h.present, future: [] }))
    }
  }

  // ── 文字输入开关（review-fix: 统一清理 replaceIdRef，防取消后陈旧替换） ──
  const closeTextInput = useCallback(() => {
    replaceIdRef.current = null
    setTextInput(null)
  }, [])

  // ── 文字提交（review-fix: 纯函数体——StrictMode 双调用不再产生重复形状） ──
  const commitText = useCallback(() => {
    const inp = textInput
    const replaceId = replaceIdRef.current
    replaceIdRef.current = null
    setTextInput(null)
    if (!inp || !inp.value.trim()) return
    const orig = replaceId ? hist.present.find(s => s.id === replaceId) : undefined
    const fontSize = orig?.width ?? STROKES[strokeIdx] * 8 / k
    const bold = orig?.bold ?? textDefault.bold
    const text = inp.value
    // review-fix(R78): w/h 用真实测量值（对齐偏移与命中 bbox 依赖它）
    const m = measureTextBlock(text, Math.max(10, fontSize), bold)
    const s = makeShape('text', {
      x: inp.at.x, y: inp.at.y, w: Math.max(10, m.w), h: Math.max(10, m.h),
      width: Math.max(10, fontSize),
      color: orig?.color ?? color, text,
      align: orig?.align ?? textDefault.align, bold,
    })
    setHist(h => commit(h, replaceId ? h.present.map(x => (x.id === replaceId ? s : x)) : [...h.present, s]))
    setSelectedId(s.id)
  }, [textInput, closeTextInput, hist.present, color, strokeIdx, k, textDefault])

  /** R78.1: 把排版属性应用到选中的文字标注（无选中则记为下次默认）；重测尺寸并入历史。 */
  const applyTextProp = useCallback((patch: Partial<Shape>) => {
    setTextDefault(d => ({ ...d, ...patch }) as { align: 'left' | 'center' | 'right'; bold: boolean })
    if (selectedId) {
      setHist(h => commit(h, h.present.map(s => {
        if (s.id !== selectedId || s.kind !== 'text') return s
        const next = { ...s, ...patch }
        const m = measureTextBlock(next.text ?? '', Math.max(8, next.width), next.bold)
        return { ...next, w: Math.max(10, m.w), h: Math.max(10, m.h) }
      })))
    }
  }, [selectedId])

  /** R78.1: 图层排序。 */
  const doReorder = useCallback((dir: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedId) return
    setHist(h => commit(h, reorderShape(h.present, selectedId, dir)))
  }, [selectedId])

  // ── 快捷键：ESC 关闭 / Delete 删除 / Ctrl+Z·Y 撤销重做 / Ctrl+C·V 文本 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      // review-fix(R78): SELECT 也算输入控件（字号下拉聚焦时 Delete 不应删形状）
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        // R78.1: IME 组合中的 ESC 属于输入法（关候选窗），不收输入框
        if ((e as KeyboardEvent & { isComposing?: boolean }).isComposing) return
        e.stopPropagation()
        // R79.2: 框选识别模式中 ESC 只退出框选（draft 随 active 一同清理）
        if (ocrRegionActive) {
          setOcrRegionActive(false)
          setOcrRegionDraft(null)
          return
        }
        // R77.2: 文字输入中 ESC 只收起输入框，不再关闭整个标注器（丢标注）
        if (textInput) { closeTextInput(); return }
        // review-fix(R78): 其他输入面（OCR 结果框/字号下拉）聚焦时 ESC 不关标注器
        if (typing) return
        onClose()
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setHist(h => commit(h, h.present.filter(s => s.id !== selectedId)))
        setSelectedId(null)
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault(); setHist(h => undo(h)); setSelectedId(null)
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault(); setHist(h => redo(h)); setSelectedId(null)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedId) {
        // R78.1: 选中文字标注 → 复制为剪贴板纯文本
        const sel = shapes.find(s => s.id === selectedId)
        if (sel?.kind === 'text' && sel.text) {
          e.preventDefault()
          void window.rgbbox.clipboardWriteText(sel.text)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        // R78.1: 粘贴剪贴板文本 → 在鼠标位置建文字标注（进编辑态）
        e.preventDefault()
        void window.rgbbox.clipboardReadText().then((txt) => {
          if (txt) setTextInput({ at: lastPtRef.current, value: txt })
        }).catch(() => { /* best-effort */ })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, selectedId, textInput, shapes, closeTextInput, ocrRegionActive])

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

  // ── R78.3/R79.2: OCR ───────────────────────────────────────────────────
  const setOcrText = (v: string): void => setOcr(o => (o.status === 'done' ? { ...o, text: v } : o))
  const recognizeDataUrl = useCallback((dataUrl: string) => {
    setOcr({ status: 'running', text: '' })
    window.rgbbox.ocrRecognize(dataUrl)
      .then(r => setOcr(r.ok ? { status: 'done', text: r.text } : { status: 'failed', text: '', hint: r.hint }))
      .catch(() => setOcr({ status: 'failed', text: '', hint: 'engine' }))
  }, [])
  const runOcr = useCallback(() => { recognizeDataUrl(exportDataUrl()) }, [recognizeDataUrl, exportDataUrl])

  /** R79.2: 区域裁剪导出（同步；无 canvas 环境回退：字符串源→原样，canvas 源→兜底 PNG）。 */
  const exportRegionDataUrl = useCallback((r: { x: number; y: number; w: number; h: number }): string => {
    if (!base) return typeof source === 'string' ? source : FALLBACK_PNG
    return cropToDataUrl(base, r, typeof source === 'string' ? source : FALLBACK_PNG)
  }, [base, source])

  /** R79.2: 完成框选 → 立即识别所选区域；拖选过小回退整图识别（一键 OCR 语义 + 有反馈）。 */
  const finishOcrRegion = useCallback((a: Pt, b: Pt) => {
    const rect = {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
    }
    if (rect.w >= 8 && rect.h >= 8) recognizeDataUrl(exportRegionDataUrl(rect))
    else runOcr()
  }, [recognizeDataUrl, exportRegionDataUrl, runOcr])

  // ── R78.1: 文字工具行的当前值（选中项优先，否则默认值） ────────────────
  const selText = selectedShape?.kind === 'text' ? selectedShape : null
  const alignNow = selText?.align ?? textDefault.align
  const boldNow = selText?.bold ?? textDefault.bold
  const fontNow = (() => {
    const css = selText ? Math.round(selText.width * k) : STROKES[strokeIdx] * 8
    return FONT_SIZES.reduce((best, f) => (Math.abs(f - css) < Math.abs(best - css) ? f : best), FONT_SIZES[0])
  })()

  const toolBtn = (id: Tool, Icon: typeof Square, key: string, idx: number) => (
    <button
      key={id}
      type="button"
      className={`video-annotate-tool video-annotate-btn${tool === id ? ' active' : ''}`}
      title={t(key as never)}
      onClick={() => { setTool(id); setSelectedId(null); closeTextInput() }}
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
        onDoubleClick={(e) => {
          const hit = hitTestRotated(shapes, toImage(e.clientX, e.clientY))
          // R78.1: 双击文字标注 = 原地编辑（提交时替换）
          if (hit?.kind === 'text' && hit.text) {
            replaceIdRef.current = hit.id
            setTextInput({ at: { x: hit.x, y: hit.y }, value: hit.text })
            return
          }
          // R77.3: 选择工具下双击空白 = 复位缩放
          if (tool === 'select' && !hit) setZoomState(null)
        }}
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
          onKeyDown={(e) => {
            // R78.1: IME 组合中的按键（Enter/空格确认候选词）交给输入法，不提交
            if (shouldCommitText({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) {
              e.preventDefault()
              commitText()
            }
          }}
          placeholder={t('video.annotate.textPlaceholder' as never)}
        />
      )}

      {/* R79.2: 框选识别遮罩（暗幕挖洞 + 选框 + 提示） */}
      {(ocrRegionActive || ocrRegionDraft) && (() => {
        const W = wrapSize.w || 1, H = wrapSize.h || 1
        const r = ocrRegionDraft
          ? {
              x: Math.min(ocrRegionDraft.start.x, ocrRegionDraft.end.x) * k + view.x,
              y: Math.min(ocrRegionDraft.start.y, ocrRegionDraft.end.y) * k + view.y,
              w: Math.abs(ocrRegionDraft.end.x - ocrRegionDraft.start.x) * k,
              h: Math.abs(ocrRegionDraft.end.y - ocrRegionDraft.start.y) * k,
            }
          : null
        const mask = r
          ? `M0 0H${W}V${H}H0Z M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`
          : `M0 0H${W}V${H}H0Z`
        return (
          <>
            {/* review-fix: 指针事件挂在 SVG 上（遮罩必然拦截画布，绑画布 = 真机拖不动） */}
            <svg
              className="video-ocr-region-mask"
              width={W}
              height={H}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture?.(e.pointerId)
                setOcrRegionDraft({ start: toImage(e.clientX, e.clientY), end: toImage(e.clientX, e.clientY) })
              }}
              onPointerMove={(e) => {
                setOcrRegionDraft(d => (d ? { ...d, end: toImage(e.clientX, e.clientY) } : d))
              }}
              onPointerUp={() => {
                setOcrRegionDraft(d => {
                  if (d) finishOcrRegion(d.start, d.end)
                  return null
                })
                setOcrRegionActive(false)
              }}
              onPointerCancel={() => { setOcrRegionDraft(null); setOcrRegionActive(false) }}
            >
              <path d={mask} fill="rgba(0,0,0,0.5)" fillRule="evenodd" />
              {r && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#46c6a8" strokeWidth="1.5" />}
            </svg>
            <p className="video-annotate-hint" style={{ bottom: 120 }}>{t('video.annotate.ocrRegionHint' as never)}</p>
          </>
        )
      })()}

      {/* R78.3: OCR 面板 */}
      {ocr.status !== 'idle' && (
        <div className="video-annotate-ocr-panel" data-testid="ocr-panel">
          <div className="video-annotate-ocr-head">
            <span className="video-annotate-title">{t('video.annotate.ocr')}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="video-annotate-btn video-annotate-ocr-full" title={t('video.annotate.ocrFullImage')} disabled={ocr.status === 'running'} onClick={runOcr}><ScanText size={14} /></button>
              <button type="button" className="video-annotate-btn" title={t('video.annotate.ocrClose')} onClick={() => setOcr({ status: 'idle', text: '' })}><X size={14} /></button>
            </div>
          </div>
          {ocr.status === 'running' && <p className="video-annotate-ocr-loading">{t('video.annotate.ocrRunning')}</p>}
          {ocr.status === 'failed' && <p className="video-annotate-ocr-loading">{t(ocr.hint === 'nolangpack' ? 'video.annotate.ocrNoLang' : 'video.annotate.ocrFailed')}</p>}
          {ocr.status === 'done' && (
            <>
              <textarea
                className="video-annotate-ocr-text"
                value={ocr.text}
                onChange={(e) => setOcrText(e.target.value)}
              />
              <p className="video-annotate-ocr-meta">{ocr.text.split('\n').filter(l => l.trim()).length} {t('video.annotate.ocrLines')}</p>
              <button
                type="button"
                className="video-btn video-annotate-ocr-copyall"
                onClick={() => { void window.rgbbox.clipboardWriteText(ocr.text) }}
              ><Copy size={13} /> {t('video.annotate.ocrCopyAll')}</button>
            </>
          )}
        </div>
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
        {/* R78.1: 图层排序（选中任意标注可用） */}
        <button type="button" className="video-annotate-btn video-annotate-layer" title={t('video.annotate.layer.front')} disabled={!selectedId} onClick={() => doReorder('front')}><ArrowUpToLine size={14} /></button>
        <button type="button" className="video-annotate-btn video-annotate-layer" title={t('video.annotate.layer.forward')} disabled={!selectedId} onClick={() => doReorder('forward')}><ChevronUp size={14} /></button>
        <button type="button" className="video-annotate-btn video-annotate-layer" title={t('video.annotate.layer.backward')} disabled={!selectedId} onClick={() => doReorder('backward')}><ChevronDown size={14} /></button>
        <button type="button" className="video-annotate-btn video-annotate-layer" title={t('video.annotate.layer.back')} disabled={!selectedId} onClick={() => doReorder('back')}><ArrowDownToLine size={14} /></button>
        <span className="video-annotate-sep" />
        <button type="button" className="video-annotate-btn" title={t('video.annotate.delete')} disabled={!selectedId} onClick={() => { if (selectedId) { setHist(h => commit(h, h.present.filter(s => s.id !== selectedId))); setSelectedId(null) } }}><Trash2 size={15} /></button>
        <span className="video-annotate-flex" />
        <button type="button" className="video-annotate-btn video-annotate-ocr" title={t('video.annotate.ocrRegion')} disabled={ocr.status === 'running' || !base} onClick={() => { if (!base) return; setOcrRegionActive(true); setSelectedId(null) }}><ScanText size={15} /></button>
        <button type="button" className="video-annotate-btn video-annotate-save" title={t('video.annotate.save')} onClick={doSave}><Check size={16} /></button>
        <button type="button" className="video-annotate-btn video-annotate-copy" title={t('video.annotate.copy')} onClick={doCopy}><Copy size={15} /></button>
        <button type="button" className="video-annotate-btn video-annotate-close" title={t('video.annotate.close')} onClick={onClose}><X size={16} /></button>
      </div>

      {/* R78.1: 文字排版工具行（选中文字标注或文字工具激活时出现） */}
      {(tool === 'text' || selectedShape?.kind === 'text') && (
        <div className="video-annotate-toolbar2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={`video-annotate-btn${alignNow === 'left' ? ' active' : ''}`} title={t('video.annotate.align.left')} onClick={() => applyTextProp({ align: 'left' })}><AlignLeft size={14} /></button>
          <button type="button" className={`video-annotate-btn${alignNow === 'center' ? ' active' : ''}`} title={t('video.annotate.align.center')} onClick={() => applyTextProp({ align: 'center' })}><AlignCenter size={14} /></button>
          <button type="button" className={`video-annotate-btn${alignNow === 'right' ? ' active' : ''}`} title={t('video.annotate.align.right')} onClick={() => applyTextProp({ align: 'right' })}><AlignRight size={14} /></button>
          <span className="video-annotate-sep" />
          <select
            className="video-annotate-fontsize"
            title={t('video.annotate.fontSize')}
            value={fontNow}
            onChange={(e) => {
              const css = Number(e.target.value)
              if (selectedShape?.kind === 'text') {
                // review-fix(R78): 入历史 + 重测 bbox（对齐/命中依赖）
                setHist(h => commit(h, h.present.map(s => {
                  if (s.id !== selectedShape.id || s.kind !== 'text') return s
                  const width = css / k
                  const m = measureTextBlock(s.text ?? '', Math.max(8, width), s.bold)
                  return { ...s, width, w: Math.max(10, m.w), h: Math.max(10, m.h) }
                })))
              }
            }}
          >
            {FONT_SIZES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button type="button" className={`video-annotate-btn${boldNow ? ' active' : ''}`} title={t('video.annotate.bold')} onClick={() => applyTextProp({ bold: !boldNow })}><Bold size={14} /></button>
        </div>
      )}

      <p className="video-annotate-hint">{t('video.annotate.hint')}</p>
    </div>
  )
}
