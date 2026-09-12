import { describe, it, expect } from 'vitest'
import {
  boxesFromProbMap, ctcGreedyDecode, ctcIdxToString, detInputSize,
  mapBoxToOriginal, rgbaToCHW, sortBoxesReadingOrder, type ProbBox,
} from '../../src/main/rapidOcrPure'

describe('rapidOcrPure (R82)', () => {
  it('ctcGreedyDecode: drops blank, merges repeats, keeps blank-separated repeats', () => {
    const C = 4   // 0=blank, 1='A', 2='B', 3='C'
    // 逐 timestep 的 argmax 序列：[blank, A, A, blank, A, B, B] → "AAB"
    const steps = 7
    const probs = new Float32Array(steps * C)
    const seq = [0, 1, 1, 0, 1, 2, 2]
    seq.forEach((c, t) => { probs[t * C + c] = 0.9 })
    expect(ctcGreedyDecode(probs, steps, C)).toEqual([1, 1, 2])
    expect(ctcIdxToString([1, 1, 2], ['blank', 'A', 'B', 'C'])).toBe('AAB')
    // 全 blank → 空
    const allBlank = new Float32Array(3 * C)
    for (let t = 0; t < 3; t++) allBlank[t * C] = 1
    expect(ctcGreedyDecode(allBlank, 3, C)).toEqual([])
  })

  it('boxesFromProbMap: finds two blobs, filters noise', () => {
    const w = 40, h = 20
    const prob = new Float32Array(w * h)
    const fill = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) prob[y * w + x] = 0.9
    }
    fill(2, 2, 20, 8)     // 块1
    fill(25, 10, 35, 17)  // 块2
    fill(30, 1, 31, 2)    // 噪声（2×2，count=4 < 6 被滤）
    const boxes = boxesFromProbMap(prob, w, h, 0.3)
    expect(boxes.length).toBe(2)
    expect(boxes.some(b => b.x === 2 && b.w === 19)).toBe(true)
    expect(boxes.some(b => b.x === 25 && b.h === 8)).toBe(true)
  })

  it('detInputSize caps at 960 and snaps to /32', () => {
    expect(detInputSize(1920, 1080)).toEqual({ w: 960, h: 544 })   // 1080*0.5=540→544
    expect(detInputSize(640, 480)).toEqual({ w: 640, h: 480 })     // 不放大，恰为 32 倍数
    expect(detInputSize(601, 400)).toEqual({ w: 608, h: 416 })     // 601→608（19×32）
  })

  it('mapBoxToOriginal scales back and clamps with padding', () => {
    // 2× 缩放：map 上的 (10,10,20,5) → 原图 (20,20,40,10) + 扩边
    const b = mapBoxToOriginal({ x: 10, y: 10, w: 20, h: 5 }, 50, 50, 100, 100)
    expect(b.x).toBeLessThan(20)
    expect(b.y).toBeLessThan(20)
    expect(b.w).toBeGreaterThanOrEqual(40)
    expect(b.h).toBeGreaterThan(10)
    // 边界 clamp：不越出原图
    const edge = mapBoxToOriginal({ x: 49, y: 49, w: 1, h: 1 }, 50, 50, 100, 100)
    expect(edge.x + edge.w).toBeLessThanOrEqual(100)
    expect(edge.y + edge.h).toBeLessThanOrEqual(100)
  })

  it('sortBoxesReadingOrder groups rows then sorts left→right', () => {
    const boxes: ProbBox[] = [
      { x: 50, y: 10, w: 10, h: 10 },   // 第1行右
      { x: 10, y: 40, w: 10, h: 10 },   // 第2行左
      { x: 10, y: 12, w: 10, h: 10 },   // 第1行左
      { x: 30, y: 42, w: 10, h: 10 },   // 第2行右
    ]
    const sorted = sortBoxesReadingOrder(boxes)
    expect(sorted.map(b => b.x)).toEqual([10, 50, 10, 30])
  })

  it('rgbaToCHW: constant color normalizes exactly; BGRA swaps R/B; rect crops', () => {
    // 2×2 纯红图（R=255,G=0,B=0），BGRA 源
    const px = Buffer.from([
      0, 0, 255, 255, 0, 0, 255, 255,
      0, 0, 255, 255, 0, 0, 255, 255,
    ])
    const out = rgbaToCHW(px, 2, 2, 2, 2, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], true)
    // R 通道（c=0）= (1-0.5)/0.5 = 1；G/B = -1
    expect(out[0]).toBeCloseTo(1)
    expect(out[4]).toBeCloseTo(-1)   // G 通道首像素
    // rect 采样：全图 rect 等价
    const outRect = rgbaToCHW(px, 2, 2, 2, 2, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], true, { x: 0, y: 0, w: 2, h: 2 })
    expect(outRect[0]).toBeCloseTo(1)
  })
})
