import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── electron mocks ────────────────────────────────────────────────────────
const mockScreenDisplays: any[] = []
vi.mock('electron', () => ({
  screen: {
    getPrimaryDisplay: () => mockScreenDisplays[0],
    getAllDisplays: () => mockScreenDisplays
  }
}))

// ─── captureProviders mock ────────────────────────────────────────────────
const mockCaptureResult: any = { images: [], durationMs: 0 }
vi.mock('../../src/main/captureProviders', () => ({
  captureWithProvider: vi.fn(async () => mockCaptureResult)
}))

// Import after mocks
const { captureScreenFrame, captureVirtualScreenFrame } = await import('../../src/main/screenCapture')
import type { DisplayInfo, DisplayTopology, RgbFrame } from '../../src/shared/types'

beforeEach(() => {
  mockScreenDisplays.length = 0
  mockCaptureResult.images = []
  mockCaptureResult.durationMs = 0
})

function makeDisplay(id: number, x: number, y: number, w: number, h: number): DisplayInfo {
  return {
    id,
    label: `Display ${id}`,
    bounds: { x, y, width: w, height: h },
    workArea: { x, y, width: w, height: h },
    scaleFactor: 1,
    rotation: 0,
    primary: id === 1
  }
}

function makeCapturedImage(display: DisplayInfo, w: number, h: number, fillRgb: [number, number, number]): any {
  const bitmap = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    bitmap[i * 4 + 0] = fillRgb[2] // B
    bitmap[i * 4 + 1] = fillRgb[1] // G
    bitmap[i * 4 + 2] = fillRgb[0] // R
    bitmap[i * 4 + 3] = 255 // A
  }
  return { display, bitmap, width: w, height: h }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('main/screenCapture', () => {
  describe('captureScreenFrame', () => {
    it('returns null when display is not found', async () => {
      mockScreenDisplays.length = 0
      const result = await captureScreenFrame(99, 10, 5)
      expect(result).toBeNull()
    })

    it('returns null when capture returns no image', async () => {
      mockScreenDisplays.push(makeDisplay(1, 0, 0, 1920, 1080))
      mockCaptureResult.images = []
      const result = await captureScreenFrame(1, 10, 5)
      expect(result).toBeNull()
    })

    it('captures a display and downsamples to the requested grid', async () => {
      mockScreenDisplays.push(makeDisplay(1, 0, 0, 1920, 1080))
      // 80x45 thumbnail, all red
      mockCaptureResult.images = [makeCapturedImage(mockScreenDisplays[0], 80, 45, [255, 0, 0])]
      const frame = await captureScreenFrame(1, 10, 5)
      expect(frame).not.toBeNull()
      expect(frame!.columns).toBe(10)
      expect(frame!.rows).toBe(5)
      expect(frame!.pixels).toHaveLength(10 * 5 * 3)
      // All pixels should be red (255, 0, 0)
      for (let i = 0; i < frame!.pixels.length; i += 3) {
        expect(frame!.pixels[i]).toBe(255)
        expect(frame!.pixels[i + 1]).toBe(0)
        expect(frame!.pixels[i + 2]).toBe(0)
      }
    })

    it('returns null when capture throws (permission denied)', async () => {
      mockScreenDisplays.push(makeDisplay(1, 0, 0, 1920, 1080))
      const { captureWithProvider } = await import('../../src/main/captureProviders')
      vi.mocked(captureWithProvider).mockRejectedValueOnce(new Error('permission denied'))
      const result = await captureScreenFrame(1, 10, 5)
      expect(result).toBeNull()
    })

    it('picks the right displayId from getAllDisplays()', async () => {
      mockScreenDisplays.push(makeDisplay(1, 0, 0, 1920, 1080))
      mockScreenDisplays.push(makeDisplay(2, 1920, 0, 1920, 1080))
      mockCaptureResult.images = [makeCapturedImage(mockScreenDisplays[1], 80, 45, [0, 0, 255])]
      const frame = await captureScreenFrame(2, 10, 5)
      expect(frame).not.toBeNull()
      // All blue
      expect(frame!.pixels[2]).toBe(255) // B
    })
  })

  describe('captureVirtualScreenFrame', () => {
    it('returns null when topology has no displays', async () => {
      const topology: DisplayTopology = {
        displays: [],
        virtualBounds: { x: 0, y: 0, width: 0, height: 0 },
        platform: 'linux',
        detectedAt: ''
      }
      const result = await captureVirtualScreenFrame(topology, 10, 5)
      expect(result).toBeNull()
    })

    it('returns null when virtualBounds has zero area', async () => {
      const topology: DisplayTopology = {
        displays: [makeDisplay(1, 0, 0, 0, 0)],
        virtualBounds: { x: 0, y: 0, width: 0, height: 0 },
        platform: 'linux',
        detectedAt: ''
      }
      const result = await captureVirtualScreenFrame(topology, 10, 5)
      expect(result).toBeNull()
    })

    it('returns null when no images are captured', async () => {
      const topology: DisplayTopology = {
        displays: [makeDisplay(1, 0, 0, 1920, 1080)],
        virtualBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        platform: 'linux',
        detectedAt: ''
      }
      mockCaptureResult.images = []
      const result = await captureVirtualScreenFrame(topology, 10, 5)
      expect(result).toBeNull()
    })

    it('places each pixel from the correct display when virtual spans multiple displays', async () => {
      const displays = [makeDisplay(1, 0, 0, 1920, 1080), makeDisplay(2, 1920, 0, 1920, 1080)]
      const topology: DisplayTopology = {
        displays,
        virtualBounds: { x: 0, y: 0, width: 3840, height: 1080 },
        platform: 'linux',
        detectedAt: ''
      }
      // Display 1 = red, display 2 = blue
      mockCaptureResult.images = [
        makeCapturedImage(displays[0], 80, 45, [255, 0, 0]),
        makeCapturedImage(displays[1], 80, 45, [0, 0, 255])
      ]
      const frame = await captureVirtualScreenFrame(topology, 20, 5)
      expect(frame).not.toBeNull()
      expect(frame!.columns).toBe(20)
      expect(frame!.rows).toBe(5)
      // Left half should be red, right half should be blue
      const cols = frame!.columns
      // Sample a pixel in the left half and a pixel in the right half
      const leftPx = frame!.pixels[0] // R of first pixel (left half)
      const rightPx = frame!.pixels[(0 * cols + Math.floor(cols * 0.75)) * 3] // R of right-half pixel
      expect(leftPx).toBe(255) // red dominant
      expect(rightPx).toBe(0) // blue dominant (R=0)
    })

    it('handles negative virtual coordinates', async () => {
      const displays = [
        makeDisplay(1, 0, 0, 1920, 1080),
        makeDisplay(2, -1920, 0, 1920, 1080) // to the left
      ]
      const topology: DisplayTopology = {
        displays,
        virtualBounds: { x: -1920, y: 0, width: 3840, height: 1080 },
        platform: 'linux',
        detectedAt: ''
      }
      mockCaptureResult.images = [
        makeCapturedImage(displays[0], 80, 45, [255, 0, 0]),
        makeCapturedImage(displays[1], 80, 45, [0, 255, 0])
      ]
      const frame = await captureVirtualScreenFrame(topology, 20, 5)
      expect(frame).not.toBeNull()
      // First sampled column should be from display 2 (left of origin)
      // When x=0 in virtual, virtualX = -1920 + 0.5/20 * 3840 = -1920 + 96 = -1824
      // Display 2 spans [-1920, 0), so -1824 is in display 2 → green
      expect(frame!.pixels[1]).toBeGreaterThan(100) // G dominant
    })

    it('skips pixels that fall outside any display', async () => {
      // Virtual bounds that exceed display bounds
      const topology: DisplayTopology = {
        displays: [makeDisplay(1, 100, 100, 1000, 500)],
        virtualBounds: { x: 0, y: 0, width: 2000, height: 1000 },
        platform: 'linux',
        detectedAt: ''
      }
      mockCaptureResult.images = [makeCapturedImage(topology.displays[0], 80, 45, [128, 128, 128])]
      const frame = await captureVirtualScreenFrame(topology, 10, 5)
      expect(frame).not.toBeNull()
      // Pixels outside the display should remain 0 (untouched)
      // (verify some pixels are 0, since not all virtual pixels hit the display)
      let zeroCount = 0
      for (let i = 0; i < frame!.pixels.length; i++) {
        if (frame!.pixels[i] === 0) zeroCount++
      }
      expect(zeroCount).toBeGreaterThan(0)
    })
  })
})
