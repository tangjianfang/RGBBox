import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  distributeFrameToOverlays,
  extractSubFrame,
  frameForOverlay,
  regionFitFor,
} from '../../../src/renderer/src/domain/overlayDistribution'
import type { DisplayTopology, OverlayConfig, RgbFrame, Scene } from '../../../src/shared/types'

function frame8x4(): RgbFrame {
  const pixels = new Uint8ClampedArray(8 * 4 * 3)
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 251
  return { columns: 8, rows: 4, pixels, generatedAt: 1234 }
}

const twoDisplays: DisplayTopology = {
  displays: [
    { id: 1, label: 'L', bounds: { x: 0, y: 0, width: 960, height: 540 }, scale: 1, isPrimary: true },
    { id: 2, label: 'R', bounds: { x: 960, y: 0, width: 960, height: 540 }, scale: 1, isPrimary: false },
  ],
  virtualBounds: { x: 0, y: 0, width: 1920, height: 540 },
} as unknown as DisplayTopology

describe('domain/overlayDistribution extractSubFrame (R147 P1)', () => {
  it('slices the virtual canvas into each display half with correct pixel offsets', () => {
    const left = extractSubFrame(frame8x4(), 1, twoDisplays)
    const right = extractSubFrame(frame8x4(), 2, twoDisplays)
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.columns).toBe(4)
    expect(left!.rows).toBe(4)
    expect(right!.columns).toBe(4)
    // right half starts at source column 4 → pixel index (4*3)=12 in row 0
    expect(right!.pixels[0]).toBe(frame8x4().pixels[12])
  })

  it('returns null for unknown displays and degenerate virtual bounds', () => {
    expect(extractSubFrame(frame8x4(), 99, twoDisplays)).toBeNull()
    const degenerate = { ...twoDisplays, virtualBounds: { x: 0, y: 0, width: 0, height: 0 } }
    expect(extractSubFrame(frame8x4(), 1, degenerate)).toBeNull()
  })
})

describe('domain/overlayDistribution region fit (R63/R147 P1)', () => {
  it('fullscreen/absent config → stretch; preset regions → contain', () => {
    expect(regionFitFor(undefined)).toBe('stretch')
    expect(regionFitFor({ region: 'fullscreen' } as OverlayConfig)).toBe('stretch')
    expect(regionFitFor({ region: 'top-third' } as OverlayConfig)).toBe('contain')
  })

  it('frameForOverlay returns the SAME instance for stretch, shallow clone for contain', () => {
    const frame = frame8x4()
    expect(frameForOverlay(frame, { region: 'fullscreen' } as OverlayConfig)).toBe(frame)
    const contained = frameForOverlay(frame, { region: 'top-third' } as OverlayConfig)
    expect(contained).not.toBe(frame)
    expect(contained.pixels).toBe(frame.pixels) // shallow — pixel buffer shared
    expect(contained.regionFit).toBe('contain')
  })
})

describe('domain/overlayDistribution distributeFrameToOverlays (R147 P1)', () => {
  const pushFrameToDisplay = vi.fn()
  const pushFrameToOverlays = vi.fn()

  beforeEach(() => {
    pushFrameToDisplay.mockClear()
    pushFrameToOverlays.mockClear()
    ;(globalThis as unknown as { window: unknown }).window = { rgbbox: { pushFrameToDisplay, pushFrameToOverlays } }
  })

  it('does nothing with no open overlays', () => {
    distributeFrameToOverlays(frame8x4(), null, null, [], {})
    expect(pushFrameToOverlays).not.toHaveBeenCalled()
    expect(pushFrameToDisplay).not.toHaveBeenCalled()
  })

  it('broadcasts ONCE when every overlay is fullscreen (fast path)', () => {
    distributeFrameToOverlays(frame8x4(), null, null, [1, 2], {
      1: { region: 'fullscreen' } as OverlayConfig,
      2: { region: 'fullscreen' } as OverlayConfig,
    })
    expect(pushFrameToOverlays).toHaveBeenCalledTimes(1)
    expect(pushFrameToDisplay).not.toHaveBeenCalled()
  })

  it('pushes per-display with a contain fit when any overlay uses a preset region', () => {
    distributeFrameToOverlays(frame8x4(), null, null, [1, 2], {
      1: { region: 'fullscreen' } as OverlayConfig,
      2: { region: 'top-third' } as OverlayConfig,
    })
    expect(pushFrameToOverlays).not.toHaveBeenCalled()
    expect(pushFrameToDisplay).toHaveBeenCalledTimes(2)
    const [id1, frame1] = pushFrameToDisplay.mock.calls[0]
    const [id2, frame2] = pushFrameToDisplay.mock.calls[1]
    expect(id1).toBe(1)
    expect(frame1.regionFit).toBeUndefined() // fullscreen keeps the base frame as-is
    expect(id2).toBe(2)
    expect(frame2.regionFit).toBe('contain')
  })

  it('linked-display mode gives each overlay only its sub-region', () => {
    const scene = { linkedDisplays: [1, 2] } as unknown as Scene
    distributeFrameToOverlays(frame8x4(), scene, twoDisplays, [1, 2], {})
    expect(pushFrameToDisplay).toHaveBeenCalledTimes(2)
    const [id, frame] = pushFrameToDisplay.mock.calls[0]
    expect(id).toBe(1)
    expect(frame.columns).toBe(4) // half of the 8-wide virtual canvas
  })
})



// ── R273: 竖屏/混合 DPI 越界钳制 ─────────────────────────────────────────
describe('overlayDistribution extractSubFrame 竖屏 clamp (R273)', () => {
  it('offsetY+dispRows 超出虚拟画布时 y 钳到最后一行——末行像素=虚拟帧第 rows-1 行,无越界黑行', () => {
    // 8x4 虚拟帧;display 下半延伸到虚拟边界外(bounds.y=270,h=540 → offsetY=2, dispRows=4, 2+4=6 > 4)
    const frame = frame8x4()
    const overflow: DisplayTopology = {
      displays: [{ id: 9, label: 'P', bounds: { x: 0, y: 270, width: 1920, height: 540 }, scale: 1.25, isPrimary: false }],
      virtualBounds: { x: 0, y: 0, width: 1920, height: 540 },
    } as unknown as DisplayTopology
    const sub = extractSubFrame(frame, 9, overflow)
    expect(sub).not.toBeNull()
    // 越界行(y>=rows)钳到 rows-1:末 dst 行 === 源第 3 行(修复前越界读→黑行)
    const srcRow3 = 3 * 8 * 3
    const dstLast = (sub!.rows - 1) * sub!.columns * 3
    for (let i = 0; i < Math.min(sub!.columns, 8) * 3; i++) {
      expect(sub!.pixels[dstLast + i]).toBe(frame.pixels[srcRow3 + Math.min(7, i / 3 | 0) * 3 + (i % 3)])
    }
  })
})
