import { describe, it, expect } from 'vitest'
import { swapBgraToRgba } from '../../../../src/renderer/src/components/video/frameCapture'

describe('swapBgraToRgba (R130.3)', () => {
  it('swaps R and B per pixel, keeps G and A (BGRA little-endian → ImageData RGBA)', () => {
    // BGRA 字节序 [B,G,R,A]：px0=蓝(255,0,0,255) px1=红(0,0,255,128) px2=(7,9,11,255)
    const bgra = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128, 7, 9, 11, 255])
    const rgba = swapBgraToRgba(bgra)
    expect([...rgba]).toEqual([0, 0, 255, 255, 255, 0, 0, 128, 11, 9, 7, 255])
  })

  it('does not mutate the input buffer (IPC 载荷只读)', () => {
    const bgra = new Uint8Array([255, 1, 2, 255])
    swapBgraToRgba(bgra)
    expect([...bgra]).toEqual([255, 1, 2, 255])
  })

  it('handles empty buffer', () => {
    expect(swapBgraToRgba(new Uint8Array(0)).length).toBe(0)
  })
})
