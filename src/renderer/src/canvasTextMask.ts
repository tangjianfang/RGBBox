/**
 * Canvas-based text mask renderer (renderer process only).
 * Supports any Unicode text including CJK characters.
 *
 * Returns a flat boolean array of size cols×rows.
 * mask[y*cols + x] === true → foreground pixel.
 */

const cache = new Map<string, boolean[]>()

export function computeTextMask(
  text: string,
  cols: number,
  rows: number,
  xNorm: number,
  yNorm: number,
  scale: number,
  weight = 400
): boolean[] {
  const s = Math.max(1, Math.round(scale))
  const w = Math.min(900, Math.max(100, Math.round(weight / 100) * 100))
  const key = `${text}|${cols}|${rows}|${xNorm.toFixed(3)}|${yNorm.toFixed(3)}|${s}|${w}`
  const cached = cache.get(key)
  if (cached) return cached

  // Canvas oversampling: 32 canvas-pixels per grid cell (constant, independent of s).
  // Scale s is applied through fontSize instead.
  const cellPx = 32
  const canvasW = cols * cellPx
  const canvasH = rows * cellPx

  const offscreen = new OffscreenCanvas(canvasW, canvasH)
  const ctx = offscreen.getContext('2d')!

  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#ffffff'

  // Match the bitmap font's visual size: bitmap chars are 7 cells tall at scale=1.
  // So font height = 7 * s * cellPx canvas-pixels.
  const fontSize = Math.max(6, Math.round(7 * s * cellPx))
  ctx.font = `${w} ${fontSize}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  const textX = xNorm * canvasW
  const textY = yNorm * canvasH
  ctx.fillText(text, textX, textY)

  // Sample each cell: if any pixel in the cell is bright → mask true
  const imageData = ctx.getImageData(0, 0, canvasW, canvasH)
  const data = imageData.data
  const mask = new Array<boolean>(cols * rows).fill(false)

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      let lit = false
      const x0 = gx * cellPx
      const y0 = gy * cellPx
      outer: for (let py = 0; py < cellPx; py++) {
        for (let px = 0; px < cellPx; px++) {
          const idx = ((y0 + py) * canvasW + (x0 + px)) * 4
          // Alpha channel > 32 counts as lit
          if (data[idx + 3] > 32) {
            lit = true
            break outer
          }
        }
      }
      mask[gy * cols + gx] = lit
    }
  }

  cache.set(key, mask)
  return mask
}
