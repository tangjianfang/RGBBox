/**
 * frameCapture — 从 video 元素抓当前帧到 canvas（PRD R75.3）。
 * 烘焙 CSS filter 与镜像（与拍照 capturePhoto 的处理一致）。
 * 注意：绝不叠加任何文字/logo（R75.2 无水印铁律）。
 */

export function freezeVideoFrame(
  source: HTMLVideoElement,
  filterCssValue: string,
  mirrored: boolean,
): HTMLCanvasElement | null {
  if (!source.videoWidth || !source.videoHeight) return null
  const canvas = document.createElement('canvas')
  canvas.width = source.videoWidth
  canvas.height = source.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.filter = filterCssValue
    if (mirrored) {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  } catch {
    return null
  }
  return canvas
}

/**
 * R79.2（review 抽取）: 把已加载的图源裁剪为 dataURL。
 * 无 canvas 环境（happy-dom）返回 fallback；无水印（只搬运像素）。
 */
export function cropToDataUrl(
  source: HTMLImageElement | HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  fallback: string,
): string {
  try {
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(rect.w))
    out.height = Math.max(1, Math.round(rect.h))
    const ctx = out.getContext('2d')
    if (!ctx) return fallback
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height)
    return out.toDataURL('image/png') || fallback
  } catch {
    return fallback
  }
}
