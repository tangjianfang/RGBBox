// R306/T10: the shared 21-point hand skeleton renderer. Extracted from
// VisionPad's inline overlay (R136.2) so the replay card draws EXACTLY what
// the live pad draws — one bone graph, one visual language.
//
// Pure canvas helper — no DOM/Electron imports beyond the 2D context type.

/** MediaPipe's 21-point hand bone graph (wrist→fingers + palm arch). */
export const HAND_BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

export interface SkeletonRect { x: number; y: number; w: number; h: number }
export interface SkeletonStyle {
  bone: string
  point: string
  pointRadius: number
  lineWidth: number
}

export const PAD_SKELETON_STYLE: Readonly<SkeletonStyle> = Object.freeze({
  bone: 'rgba(103,232,249,0.28)',
  point: 'rgba(226,232,240,0.55)',
  pointRadius: 1.6,
  lineWidth: 1.5,
})

/** Draw one hand's skeleton into a normalized-coordinate rect (landmarks are
 *  0..1 in selfie space; the rect maps them onto the canvas). */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  lm: ReadonlyArray<{ x: number; y: number }>,
  rect: SkeletonRect,
  style: SkeletonStyle = PAD_SKELETON_STYLE,
): void {
  if (!Array.isArray(lm) || lm.length !== 21) return
  const px = (i: number) => rect.x + lm[i].x * rect.w
  const py = (i: number) => rect.y + lm[i].y * rect.h
  ctx.strokeStyle = style.bone
  ctx.lineWidth = style.lineWidth
  ctx.beginPath()
  for (const [a, b] of HAND_BONES) {
    ctx.moveTo(px(a), py(a))
    ctx.lineTo(px(b), py(b))
  }
  ctx.stroke()
  ctx.fillStyle = style.point
  for (let i = 0; i < 21; i++) {
    ctx.beginPath()
    ctx.arc(px(i), py(i), Math.max(0.5, style.pointRadius), 0, Math.PI * 2)
    ctx.fill()
  }
}
