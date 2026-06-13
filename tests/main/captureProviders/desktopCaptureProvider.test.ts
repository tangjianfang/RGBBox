import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── electron mock ────────────────────────────────────────────────────────
const mockGetSources = vi.fn()
vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: (...args: any[]) => mockGetSources(...args)
  }
}))

const { desktopCaptureProvider } = await import('../../../../src/main/captureProviders/desktopCaptureProvider')
import type { CaptureRequest, DisplayInfo } from '../../../../src/shared/types'

beforeEach(() => {
  mockGetSources.mockReset()
})

function makeDisplay(id: number): DisplayInfo {
  return {
    id,
    label: `Display ${id}`,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    rotation: 0,
    primary: id === 1
  }
}

function makeSource(displayId: number, width: number, height: number) {
  const bitmap = Buffer.alloc(width * height * 4)
  const thumbnail = {
    getSize: () => ({ width, height }),
    getBitmap: () => bitmap
  }
  return {
    display_id: String(displayId),
    name: `Screen ${displayId}`,
    thumbnail
  }
}

describe('main/captureProviders/desktopCaptureProvider', () => {
  it('has kind "desktop-capturer"', () => {
    expect(desktopCaptureProvider.kind).toBe('desktop-capturer')
  })

  it('isAvailable always returns { available: true }', async () => {
    const r = await desktopCaptureProvider.isAvailable()
    expect(r).toEqual({ available: true })
  })

  it('calls desktopCapturer.getSources with types=["screen"] and the requested thumbnailSize', async () => {
    mockGetSources.mockResolvedValue([])
    await desktopCaptureProvider.capture({
      displays: [makeDisplay(1)],
      thumbnailSize: { width: 100, height: 50 }
    })
    expect(mockGetSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 100, height: 50 }
    })
  })

  it('returns empty images array when no sources', async () => {
    mockGetSources.mockResolvedValue([])
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(1)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.images).toEqual([])
    expect(typeof result.durationMs).toBe('number')
  })

  it('captures an image for each display that has a matching source', async () => {
    const sources = [makeSource(1, 80, 45), makeSource(2, 80, 45)]
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(1), makeDisplay(2)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.images).toHaveLength(2)
    expect(result.images[0].display.id).toBe(1)
    expect(result.images[1].display.id).toBe(2)
  })

  it('skips a display if no matching source is found (no fallback)', async () => {
    const sources = [makeSource(1, 80, 45)]
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(1), makeDisplay(2)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].display.id).toBe(1)
  })

  it('uses fallback (sources[0]) when allowSingleFallback=true and no exact match', async () => {
    const sources = [makeSource(1, 80, 45)] // only source 1 exists, but we ask for display 99
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(99)],
      thumbnailSize: { width: 80, height: 45 },
      allowSingleFallback: true
    })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].display.id).toBe(99) // mapped onto requested display
  })

  it('does NOT use fallback when allowSingleFallback=false', async () => {
    const sources = [makeSource(1, 80, 45)]
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(99)],
      thumbnailSize: { width: 80, height: 45 },
      allowSingleFallback: false
    })
    expect(result.images).toHaveLength(0)
  })

  it('skips displays where the matching source has 0x0 thumbnail', async () => {
    const sources = [makeSource(1, 0, 0), makeSource(2, 80, 45)]
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(1), makeDisplay(2)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].display.id).toBe(2)
  })

  it('falls back to source.name match if display_id does not match', async () => {
    const sources = [
      {
        display_id: 'something-else',
        name: 'Screen 7',
        thumbnail: {
          getSize: () => ({ width: 80, height: 45 }),
          getBitmap: () => Buffer.alloc(80 * 45 * 4)
        }
      }
    ]
    mockGetSources.mockResolvedValue(sources)
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(7)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.images).toHaveLength(1)
    expect(result.images[0].display.id).toBe(7)
  })

  it('durationMs is a non-negative number', async () => {
    mockGetSources.mockResolvedValue([])
    const result = await desktopCaptureProvider.capture({
      displays: [makeDisplay(1)],
      thumbnailSize: { width: 80, height: 45 }
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
