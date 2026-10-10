// spatialGrid (R263 #8) — 统一空间哈希网格,替换 survival tick 三处 O(n²)。
// 纯工具、无引擎依赖:buildGrid 每 tick 重建(敌数组是 mutated 的,增量维护不值),
// gridNear 返回候选粗筛集(半径覆盖 3×3 cell),调用方自行精筛距离。
// key = cx * 65536 + cy(世界 1800×1040 / cell 64 ≈ 29×17,安全无碰撞)。

export interface GridItem {
  x: number
  y: number
}

export type SpatialGrid<T extends GridItem> = Map<number, T[]>

export function cellKey(cx: number, cy: number): number {
  return cx * 65536 + cy
}

export function buildGrid<T extends GridItem>(items: readonly T[], cell: number): SpatialGrid<T> {
  const grid: SpatialGrid<T> = new Map()
  for (const item of items) {
    const key = cellKey(Math.floor(item.x / cell), Math.floor(item.y / cell))
    const bucket = grid.get(key)
    if (bucket) bucket.push(item)
    else grid.set(key, [item])
  }
  return grid
}

/** 半径 r 内的候选集(粗筛:覆盖 ⌈r/cell⌉+1 的 cell 环;调用方精筛距离)。 */
export function gridNear<T extends GridItem>(grid: SpatialGrid<T>, x: number, y: number, r: number, cell: number): T[] {
  const span = Math.ceil(r / cell)
  const cx = Math.floor(x / cell)
  const cy = Math.floor(y / cell)
  const out: T[] = []
  for (let ix = cx - span; ix <= cx + span; ix++) {
    for (let iy = cy - span; iy <= cy + span; iy++) {
      const bucket = grid.get(cellKey(ix, iy))
      if (bucket) out.push(...bucket)
    }
  }
  return out
}
