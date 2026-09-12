/**
 * rapidOcrPure — R82: RapidOCR（PP-OCRv4 ONNX）推理的纯函数层。
 * 无 electron / onnxruntime 依赖，node 单测直接覆盖；
 * 坐标/张量约定与 rapidOcrService 的会话层对接：
 *  - det：sigmoid 概率图 [1,1,H,W] → 阈值 0.3 → 连通域 bbox（截图文本
 *    轴对齐，不做 DB 多边形 unclip，按高度比例扩边补偿 shrink）
 *  - rec：softmax [1,T,C] → CTC 贪心解码（blank=0，charset=['blank',...dict,' ']）
 */

export interface ProbBox { x: number; y: number; w: number; h: number }

export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const
export const REC_MEAN_HALF = [0.5, 0.5, 0.5] as const
export const REC_STD_HALF = [0.5, 0.5, 0.5] as const

/** CTC 贪心解码：返回字符索引序列（去 blank、合并相邻重复）。 */
export function ctcGreedyDecode(probs: Float32Array, steps: number, numClasses: number): number[] {
  const idx: number[] = []
  let prev = -1
  for (let t = 0; t < steps; t++) {
    const base = t * numClasses
    let best = 0
    let bestP = -1
    for (let c = 0; c < numClasses; c++) {
      const p = probs[base + c]
      if (p > bestP) { bestP = p; best = c }
    }
    if (best !== 0 && best !== prev) idx.push(best)
    prev = best
  }
  return idx
}

export function ctcIdxToString(idx: number[], charset: string[]): string {
  return idx.map((i) => charset[i] ?? '').join('')
}

/** 概率图 → 文本框（4 邻接连通域 bbox；过滤噪声小域）。 */
export function boxesFromProbMap(prob: Float32Array, w: number, h: number, thresh: number): ProbBox[] {
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) mask[i] = prob[i] > thresh ? 1 : 0
  const visited = new Uint8Array(w * h)
  const boxes: ProbBox[] = []
  const stack: number[] = []
  for (let seed = 0; seed < w * h; seed++) {
    if (!mask[seed] || visited[seed]) continue
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0
    stack.push(seed)
    visited[seed] = 1
    while (stack.length > 0) {
      const p = stack.pop() as number
      const px = p % w
      const py = (p / w) | 0
      count++
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
      if (px > 0 && mask[p - 1] && !visited[p - 1]) { visited[p - 1] = 1; stack.push(p - 1) }
      if (px < w - 1 && mask[p + 1] && !visited[p + 1]) { visited[p + 1] = 1; stack.push(p + 1) }
      if (py > 0 && mask[p - w] && !visited[p - w]) { visited[p - w] = 1; stack.push(p - w) }
      if (py < h - 1 && mask[p + w] && !visited[p + w]) { visited[p + w] = 1; stack.push(p + w) }
    }
    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    if (bw < 3 || bh < 2 || count < 6) continue   // 噪声过滤
    boxes.push({ x: minX, y: minY, w: bw, h: bh })
  }
  return boxes
}

/** det 输入尺寸：最长边 ≤ maxSide，且为 32 的倍数。 */
export function detInputSize(w: number, h: number, maxSide = 960): { w: number; h: number } {
  const r = Math.min(1, maxSide / Math.max(w, h))
  return {
    w: Math.max(32, Math.min(maxSide, Math.round((w * r) / 32) * 32)),
    h: Math.max(32, Math.min(maxSide, Math.round((h * r) / 32) * 32)),
  }
}

/** 概率图坐标框 → 原图坐标（等比映射 + DB shrink 高度扩边补偿 + clamp）。 */
export function mapBoxToOriginal(b: ProbBox, mapW: number, mapH: number, imgW: number, imgH: number): ProbBox {
  const sx = imgW / mapW
  const sy = imgH / mapH
  const x = b.x * sx
  const y = b.y * sy
  const w = b.w * sx
  const h = b.h * sy
  const padY = Math.max(2, h * 0.25)
  const padX = Math.max(2, w * 0.06)
  const nx = Math.max(0, x - padX)
  const ny = Math.max(0, y - padY)
  return {
    x: nx,
    y: ny,
    w: Math.min(imgW - nx, w + padX * 2),
    h: Math.min(imgH - ny, h + padY * 2),
  }
}

/** 阅读序排序：按 y 中心聚行（行高 0.6 容差），行内按 x。 */
export function sortBoxesReadingOrder(boxes: ProbBox[]): ProbBox[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
  const rows: ProbBox[][] = []
  for (const b of sorted) {
    const row = rows.find((r) => {
      const ref = r[r.length - 1]
      return Math.abs(ref.y + ref.h / 2 - (b.y + b.h / 2)) < Math.max(ref.h, b.h) * 0.6
    })
    if (row) row.push(b)
    else rows.push([b])
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x)
  return rows.flat()
}

/**
 * RGBA/BGRA 像素 → NCHW float32（双线性 resize + 归一化）。
 * `rect` 可选：只采样源图的子区域（rec 逐框裁剪），双线性在 rect 内进行。
 */
export function rgbaToCHW(
  px: Uint8Array | Buffer,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mean: readonly number[],
  std: readonly number[],
  bgra = false,
  rect?: ProbBox,
): Float32Array {
  const rx = rect ? Math.max(0, Math.floor(rect.x)) : 0
  const ry = rect ? Math.max(0, Math.floor(rect.y)) : 0
  const rw = rect ? Math.min(srcW - rx, Math.ceil(rect.w)) : srcW
  const rh = rect ? Math.min(srcH - ry, Math.ceil(rect.h)) : srcH
  const out = new Float32Array(3 * dstW * dstH)
  const plane = dstW * dstH
  for (let dy = 0; dy < dstH; dy++) {
    const sy0 = ((dy + 0.5) * rh) / dstH - 0.5
    const syA = Math.max(0, Math.floor(sy0))
    const syB = Math.min(rh - 1, syA + 1)
    const fy = sy0 - syA
    for (let dx = 0; dx < dstW; dx++) {
      const sx0 = ((dx + 0.5) * rw) / dstW - 0.5
      const sxA = Math.max(0, Math.floor(sx0))
      const sxB = Math.min(rw - 1, sxA + 1)
      const fx = sx0 - sxA
      for (let c = 0; c < 3; c++) {
        const sc = bgra ? 2 - c : c   // BGRA 源：R↔B 交换
        const p11 = ((ry + syA) * srcW + rx + sxA) * 4 + sc
        const p12 = ((ry + syA) * srcW + rx + sxB) * 4 + sc
        const p21 = ((ry + syB) * srcW + rx + sxA) * 4 + sc
        const p22 = ((ry + syB) * srcW + rx + sxB) * 4 + sc
        const v =
          px[p11] * (1 - fx) * (1 - fy) + px[p12] * fx * (1 - fy) +
          px[p21] * (1 - fx) * fy + px[p22] * fx * fy
        out[c * plane + dy * dstW + dx] = (v / 255 - mean[c]) / std[c]
      }
    }
  }
  return out
}
