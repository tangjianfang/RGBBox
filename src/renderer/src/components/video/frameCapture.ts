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
