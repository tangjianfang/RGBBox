/**
 * FR-G03(R206): 共享画布 HUD 模块 —— 画布内按钮绘制 + 指针 hit-test + 底板。
 * 四作共用,统一字号与 accent 体系,替换 td.ts/tetris.ts 两份重复 drawOverlay。
 */

export interface HudButton {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  /** accent 色(默认主题青)。 */
  color?: string
  /** 键盘等价提示(如 "1" / "Esc")。 */
  key?: string
}

export function drawHudButton(ctx: CanvasRenderingContext2D, b: HudButton, hovered: boolean): void {
  ctx.save()
  ctx.fillStyle = hovered ? 'rgba(103, 232, 249, 0.16)' : 'rgba(103, 232, 249, 0.08)'
  ctx.strokeStyle = hovered ? (b.color ?? '#67e8f9') : 'rgba(103, 232, 249, 0.35)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#e2f8ff'
  ctx.font = '600 13px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.key ? 7 : 0))
  if (b.key !== undefined) {
    ctx.fillStyle = 'rgba(159, 183, 193, 0.9)'
    ctx.font = '500 10px Inter, sans-serif'
    ctx.fillText(b.key, b.x + b.w / 2, b.y + b.h / 2 + 9)
  }
  ctx.restore()
}

export function hitTest(buttons: HudButton[], mx: number, my: number): HudButton | null {
  for (const b of buttons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b
  }
  return null
}

/** 面板底板(画布内浮层背景)。 */
export function drawHudPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.82): void {
  ctx.save()
  ctx.fillStyle = `rgba(5, 10, 14, ${alpha})`
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.22)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 12)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** 全屏退出角标(3s 无操作自动隐藏由调用方控制)。 */
export function drawExitBadge(ctx: CanvasRenderingContext2D, label: string): void {
  ctx.save()
  ctx.fillStyle = 'rgba(5, 10, 14, 0.7)'
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(12, 12, 108, 28, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#9fb7c1'
  ctx.font = '600 11px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 66, 26)
  ctx.restore()
}
