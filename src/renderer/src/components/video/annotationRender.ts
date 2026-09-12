/**
 * annotationRender — 标注绘制（PRD R76.2 抽取 / R77.2 修复）。
 *
 * 所有绘制在**图像原生坐标系**进行（调用方负责 ctx 变换）；模块从
 * AnnotateOverlay 抽出以便 mock-ctx 单测。R77.2 修复：
 *  ① text 的 ctx.font 去掉非法 token `inherit`（R76 中赋值被静默忽略，
 *    回退 10px 默认字体 → 文字经视图缩放后不可见）；
 *  ② 马赛克底砖改为**全尺寸**像素化画布（buildMosaicTile），
 *    采样源矩形与图像坐标 1:1（R76 中 1/12 尺寸底砖配原图坐标 → 越界
 *    采样输出透明）。
 */
import { handlesFor, shapeBBox, type Shape } from './annotationModel'

export interface RenderOpts {
  selectedId?: string
  mosaicTile?: CanvasImageSource | null
}

let measureCtx: CanvasRenderingContext2D | null | undefined

/**
 * R78 review-fix: 文字块真实尺寸（w 决定对齐偏移与命中 bbox）。
 * 无 canvas 环境（happy-dom）回退按字数 × 0.6 字宽估算。
 */
export function measureTextBlock(text: string, fontSize: number, bold?: boolean): { w: number; h: number } {
  const lines = text.split('\n')
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d')
  }
  let w = 0
  if (measureCtx) {
    measureCtx.font = `${bold ? '700 ' : ''}${Math.max(8, fontSize)}px system-ui, sans-serif`
    for (const line of lines) w = Math.max(w, measureCtx.measureText(line).width)
  } else {
    w = Math.max(1, ...lines.map(l => l.length)) * fontSize * 0.6
  }
  return { w: Math.ceil(w), h: Math.ceil(lines.length * fontSize * 1.25) }
}

/**
 * 马赛克底砖：全尺寸像素化画布（缩小 1/12 采样 → 关平滑放大回原尺寸）。
 * 返回的画布与图像像素 1:1 对齐，可直接以图像坐标采样。
 */
export function buildMosaicTile(base: CanvasImageSource, natural: { w: number; h: number }): HTMLCanvasElement | null {
  if (natural.w <= 0 || natural.h <= 0) return null
  const f = 12
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.ceil(natural.w / f))
  small.height = Math.max(1, Math.ceil(natural.h / f))
  const sctx = small.getContext('2d')
  if (!sctx) return null
  // 缩小时保留平滑（取平均色），放大时关闭平滑（保留马赛克块感）
  sctx.drawImage(base, 0, 0, small.width, small.height)
  const full = document.createElement('canvas')
  full.width = Math.max(1, Math.round(natural.w))
  full.height = Math.max(1, Math.round(natural.h))
  const fctx = full.getContext('2d')
  if (!fctx) return null
  fctx.imageSmoothingEnabled = false
  fctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, full.width, full.height)
  return full
}

/**
 * 马赛克笔画印章：bbox±r 区域的底砖贴图，经 destination-in 只保留圆头
 * 粗线笔画路径。返回贴回主画布的左上角（图像坐标）。
 */
export function buildMosaicStamp(tile: CanvasImageSource, s: Shape): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  const pts = s.points ?? []
  if (pts.length === 0) return null
  const b = shapeBBox(s)
  const r = s.width / 2 + 2
  const tmp = document.createElement('canvas')
  tmp.width = Math.max(1, Math.ceil(b.w + r * 2))
  tmp.height = Math.max(1, Math.ceil(b.h + r * 2))
  const tc = tmp.getContext('2d')
  if (!tc) return null
  // tile 为全尺寸（R77.2），源矩形即图像坐标
  tc.drawImage(tile, b.x - r, b.y - r, b.w + r * 2, b.h + r * 2, 0, 0, tmp.width, tmp.height)
  tc.globalCompositeOperation = 'destination-in'
  tc.strokeStyle = '#fff'
  tc.lineWidth = s.width + 4
  tc.lineCap = 'round'
  tc.lineJoin = 'round'
  tc.beginPath()
  tc.moveTo(pts[0].x - b.x + r, pts[0].y - b.y + r)
  for (let i = 1; i < pts.length; i++) tc.lineTo(pts[i].x - b.x + r, pts[i].y - b.y + r)
  if (pts.length === 1) tc.lineTo(pts[0].x - b.x + r + 0.01, pts[0].y - b.y + r)
  tc.stroke()
  return { canvas: tmp, x: b.x - r, y: b.y - r }
}

/** R78.2: 旋转包装——rotation=0 直通；否则绕 bbox 中心转（与命中数学一致）。 */
function withRotation(ctx: CanvasRenderingContext2D, s: Shape, draw: () => void): void {
  const deg = s.rotation ?? 0
  if (!deg) { draw(); return }
  const b = shapeBBox(s)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

export function renderAnnotations(ctx: CanvasRenderingContext2D | null, shapes: Shape[], opts: RenderOpts = {}): void {
  if (!ctx) return
  const { selectedId, mosaicTile } = opts
  for (const s of shapes) {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = Math.max(1, s.width)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    withRotation(ctx, s, () => {
      if (s.kind === 'rect') {
        ctx.strokeRect(s.x, s.y, s.w, s.h)
      } else if (s.kind === 'ellipse') {
        ctx.beginPath()
        ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(1, s.w / 2), Math.max(1, s.h / 2), 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (s.kind === 'arrow') {
        const x1 = s.x1 ?? 0, y1 = s.y1 ?? 0, x2 = s.x2 ?? 0, y2 = s.y2 ?? 0
        const L = s.width * 3 + 6
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const bx = x2 - Math.cos(ang) * L * 0.8, by = y2 - Math.sin(ang) * L * 0.8
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(bx, by)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x2, y2)
        ctx.lineTo(x2 - Math.cos(ang - Math.PI / 6) * L, y2 - Math.sin(ang - Math.PI / 6) * L)
        ctx.lineTo(x2 - Math.cos(ang + Math.PI / 6) * L, y2 - Math.sin(ang + Math.PI / 6) * L)
        ctx.closePath()
        ctx.fill()
      } else if (s.kind === 'pen') {
        const pts = s.points ?? []
        if (pts.length === 1) {
          ctx.beginPath()
          ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (pts.length > 1) {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
          ctx.stroke()
        }
      } else if (s.kind === 'text' && s.text) {
        // R77.2: 非法 token 'inherit' 已移除；R78.1: 粗体前缀
        ctx.font = `${s.bold ? '700 ' : ''}${Math.max(8, Math.round(s.width))}px system-ui, sans-serif`
        ctx.textBaseline = 'top'
        s.text.split('\n').forEach((line, i) => {
          let x = s.x
          if (s.align === 'center' || s.align === 'right') {
            const m = ctx.measureText(line)
            const lw = m && typeof m.width === 'number' ? m.width : 0
            x = s.align === 'center' ? s.x + Math.max(0, (s.w - lw) / 2) : s.x + Math.max(0, s.w - lw)
          }
          ctx.fillText(line, x, s.y + i * s.width * 1.25)
        })
      } else if (s.kind === 'mosaic' && mosaicTile) {
        const stamp = buildMosaicStamp(mosaicTile, s)
        if (stamp) ctx.drawImage(stamp.canvas, stamp.x, stamp.y)
      }
    })
  }
  // 选中态：虚线框 + 手柄（画在同一旋转变换内）
  const sel = shapes.find(s => s.id === selectedId)
  if (sel) {
    const b = shapeBBox(sel)
    withRotation(ctx, sel, () => {
      ctx.save()
      ctx.strokeStyle = '#4fc3f7'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6)
      ctx.restore()
      for (const h of handlesFor(sel)) {
        let hx = b.x, hy = b.y
        if (h === 'start') { hx = sel.x1 ?? hx; hy = sel.y1 ?? hy }
        else if (h === 'end') { hx = sel.x2 ?? hx; hy = sel.y2 ?? hy }
        else {
          if (h.includes('e')) hx = b.x + b.w
          if (h.includes('s')) hy = b.y + b.h
          if (h === 'n' || h === 's') hx = b.x + b.w / 2
          if (h === 'e' || h === 'w') hy = b.y + b.h / 2
        }
        ctx.fillStyle = '#4fc3f7'
        ctx.fillRect(hx - 4, hy - 4, 8, 8)
      }
    })
  }
}
