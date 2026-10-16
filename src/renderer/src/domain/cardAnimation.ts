/**
 * R301: 效果库卡片渲染资源预算 —— 纯域，零 DOM/React 依赖。
 *
 * 根因背景（PRD-0002 R301.1）：卡片资源占用 = 同屏动画卡数 × 帧率 × 每卡每帧成本，
 * 三个因子此前全部无上限（rAF 跟随显示器刷新率、首屏 ~18 卡同挂、CPU 卡每帧
 * 1296 次 fillRect + 字符串分配）。本模块把三个因子钉上预算：
 *   ① 帧率预算 —— performanceMode（battery/balanced/extreme）首次接入真实行为；
 *   ② 活跃卡预算 —— 超限按比例「降帧」而非冻结（一半卡片冻死的观感代价不可接受）；
 *   ③ CPU 卡帧组装 —— ImageData 直写路径的纯数学部分（边缘 AA 权重）。
 */

export type CardPerformanceMode = 'battery' | 'balanced' | 'extreme'

/** 三档基础帧率；extreme = 不限（跟随显示器刷新率，即 R301 之前的行为）。 */
export const CARD_FPS_BY_MODE: Record<CardPerformanceMode, number> = {
  battery: 10,
  balanced: 20,
  extreme: Number.POSITIVE_INFINITY
}

export function cardFpsForMode(mode: CardPerformanceMode): number {
  return CARD_FPS_BY_MODE[mode] ?? CARD_FPS_BY_MODE.balanced
}

/** 同屏活跃卡片预算：可见卡数超过该值后，所有可见卡按比例降帧。 */
export const CARD_COUNT_BUDGET = 12

/** 降帧下限：任何模式下卡片保持可感的活动（2fps 是「还活着」的最低节奏）。 */
export const CARD_FPS_FLOOR = 2

/**
 * 自适应有效帧率：`fps = max(FLOOR, base × min(1, budget / visibleCount))`。
 * extreme（Infinity）恒不限——用户明确要极致时不过问预算。
 */
export function effectiveCardFps(baseFps: number, visibleCount: number): number {
  if (!Number.isFinite(baseFps)) return baseFps
  if (visibleCount <= CARD_COUNT_BUDGET) return baseFps
  return Math.max(CARD_FPS_FLOOR, baseFps * (CARD_COUNT_BUDGET / visibleCount))
}

/**
 * rAF 时间门：距上次绘制是否已到下一帧。1ms 容差抵消 rAF 回调时机抖动，
 * 避免 49.9ms 时刻被拒到下一个整周期（节流 3× 时不该偶发 2× 节奏）。
 */
export function shouldDrawCardFrame(
  lastDrawMs: number,
  nowMs: number,
  baseFps: number,
  visibleCount: number
): boolean {
  const fps = effectiveCardFps(baseFps, visibleCount)
  if (!Number.isFinite(fps)) return true
  return nowMs - lastDrawMs >= 1000 / fps - 1
}

// ── 可见卡片计数（模块级注册表；EffectsView 的 useCardVisible 进出登记） ──

let visibleCardCount = 0

export function enterVisibleCard(): void {
  visibleCardCount += 1
}

export function exitVisibleCard(): void {
  visibleCardCount = Math.max(0, visibleCardCount - 1)
}

export function getVisibleCardCount(): number {
  return visibleCardCount
}

/** 测试缝：复位计数（仅测试使用）。 */
export function resetVisibleCardCount(): void {
  visibleCardCount = 0
}

// ── CPU 卡 ImageData 帧组装（R301.2 ③ 的纯数学部分） ─────────────────────
//
// 旧渲染几何（fillRect 路径，视觉契约）：240×135 画布上 48×27 网格、cell 5px，
// fillRect 起点偏移 0.25px、宽 4.5px → 每个 cell 的局部 col/row 0 与 4 被覆盖
// 75%，其余 100%；0.5px「gap」由两条 25% 未覆盖边缘拼成（AA 混合到背景色）。
// ImageData 路径用同几何的权重表直写像素，逐位复刻（见 composeCardFramePixels）。

export const CARD_GRID_COLS = 48
export const CARD_GRID_ROWS = 27
export const CARD_CELL_PX = 5 // 240/48 = 135/27
export const CARD_CANVAS_W = CARD_GRID_COLS * CARD_CELL_PX // 240
export const CARD_CANVAS_H = CARD_GRID_ROWS * CARD_CELL_PX // 135

/** 卡片画布背景色 '#080d11'（旧路径 ctx.fillStyle = '#080d11' 的原值）。 */
export const CARD_BG_RGB: readonly [number, number, number] = [8, 13, 17]

/** 轴向覆盖权重：局部坐标 0..4 → [0.75, 1, 1, 1, 0.75]。 */
const AXIS_WEIGHTS = [0.75, 1, 1, 1, 0.75] as const

/** 5×5 组合权重（wx × wy），索引 = localY * 5 + localX。 */
export const CARD_CELL_WEIGHTS: readonly number[] = (() => {
  const out: number[] = []
  for (let ly = 0; ly < CARD_CELL_PX; ly++) {
    for (let lx = 0; lx < CARD_CELL_PX; lx++) {
      out.push(AXIS_WEIGHTS[lx] * AXIS_WEIGHTS[ly])
    }
  }
  return out
})()

/**
 * 把 48×27 网格色写入 240×135 RGBA 缓冲（长度须为 CARD_CANVAS_W×H×4）。
 * 值 = cellColor × f + 背景 × (1−f)，f 为该像素的组合覆盖权重——与旧
 * fillRect+AA 渲染逐位等价（Uint8ClampedArray 自动取整钳位，同 canvas 语义）。
 */
export function composeCardFramePixels(
  gridRgb: ArrayLike<{ r: number; g: number; b: number }>,
  out: Uint8ClampedArray
): void {
  const bgR = CARD_BG_RGB[0]
  const bgG = CARD_BG_RGB[1]
  const bgB = CARD_BG_RGB[2]
  let o = 0
  for (let py = 0; py < CARD_CANVAS_H; py++) {
    const gy = (py / CARD_CELL_PX) | 0
    const rowBase = gy * CARD_GRID_COLS
    const wRow = (py % CARD_CELL_PX) * CARD_CELL_PX
    for (let px = 0; px < CARD_CANVAS_W; px++) {
      const gx = (px / CARD_CELL_PX) | 0
      const c = gridRgb[rowBase + gx]
      const f = CARD_CELL_WEIGHTS[wRow + (px % CARD_CELL_PX)]
      const inv = 1 - f
      out[o] = c.r * f + bgR * inv
      out[o + 1] = c.g * f + bgG * inv
      out[o + 2] = c.b * f + bgB * inv
      out[o + 3] = 255
      o += 4
    }
  }
}
