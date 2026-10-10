// @vitest-environment happy-dom
// R275 mask 缓存治理 — LRU 上限 + cellPx 自适应降采样。
import { describe, it, expect, vi } from 'vitest'
import { cellPxFor, textMaskCacheSize, computeTextMask } from '../../src/renderer/src/canvasTextMask'

// happy-dom 无 OffscreenCanvas——stub 最小面(缓存行为测试不关心像素内容)
vi.stubGlobal('OffscreenCanvas', class {
  getContext() {
    return {
      clearRect() {}, fillStyle: '', font: '', textBaseline: '', textAlign: '',
      fillText() {},
      getImageData: (_: number, __: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    }
  }
})

describe('canvasTextMask 缓存治理 (R275)', () => {
  it('cellPxFor:网格规模降采样——小网格 32/中 16/大 8(231MB 瞬时分配消灭)', () => {
    expect(cellPxFor(100, 60)).toBe(32)   // 6k cells
    expect(cellPxFor(160, 90)).toBe(16)   // 14.4k cells
    expect(cellPxFor(317, 178)).toBe(8)   // 56k cells(诊断报告场景)
  })

  it('LRU:连续不同 key 33 个 → 缓存条目 ≤32(拖动文字不再无限泄漏)', () => {
    // 每次偏移一点 xNorm → 新 key;cols/rows 取小网格避免降采样路径干扰
    for (let i = 0; i < 33; i++) {
      computeTextMask('灯', 20, 10, i * 0.001, 0.5, 1)
    }
    expect(textMaskCacheSize()).toBeLessThanOrEqual(32)
  })

  it('命中不重算:同参数二次调用缓存复用(条目数不增)', () => {
    const before = textMaskCacheSize()
    computeTextMask('同', 20, 10, 0.42, 0.5, 1)
    const mid = textMaskCacheSize()
    computeTextMask('同', 20, 10, 0.42, 0.5, 1)
    expect(textMaskCacheSize()).toBe(mid)
    expect(mid).toBeGreaterThanOrEqual(before)
  })
})
