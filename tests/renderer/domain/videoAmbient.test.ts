// R299 video-ambient — RGBA→RGB 帧转换纯域单测（TDD 先红后绿）。
import { describe, it, expect } from 'vitest'
import { rgbFrameFromImageData } from '../../../src/renderer/src/domain/videoAmbient'

describe('domain/videoAmbient 帧转换 (R299)', () => {
  it('RGBA ImageData → RGB RgbFrame(逐像素去 alpha 通道)', () => {
    // 2×2:红/绿/蓝/白
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ])
    const f = rgbFrameFromImageData({ data: rgba, width: 2, height: 2 }, 1000)
    expect(f.columns).toBe(2)
    expect(f.rows).toBe(2)
    expect(Array.from(f.pixels)).toEqual([
      255, 0, 0,
      0, 255, 0,
      0, 0, 255,
      255, 255, 255,
    ])
    expect(f.generatedAt).toBe(1000)
  })

  it('空数据返回 null(视频未就绪 caller 自行跳过)', () => {
    expect(rgbFrameFromImageData({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 0)).toBeNull()
  })
})
