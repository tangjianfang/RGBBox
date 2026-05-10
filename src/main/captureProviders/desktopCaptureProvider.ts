import { desktopCapturer } from 'electron'
import { performance } from 'node:perf_hooks'
import type { CaptureImage, CaptureProvider, CaptureRequest, CaptureProviderResult } from './types'

type ScreenSource = Awaited<ReturnType<typeof desktopCapturer.getSources>>[number]

function findSourceForDisplay(sources: ScreenSource[], displayId: number): ScreenSource | undefined {
  return (
    sources.find((source) => source.display_id === String(displayId)) ??
    sources.find((source) => source.name.includes(String(displayId)))
  )
}

export const desktopCaptureProvider: CaptureProvider = {
  kind: 'desktop-capturer',
  async isAvailable() {
    return { available: true }
  },
  async capture(request: CaptureRequest): Promise<CaptureProviderResult> {
    const startedAt = performance.now()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: request.thumbnailSize
    })

    const images: CaptureImage[] = []
    if (sources.length === 0) {
      return { images, durationMs: performance.now() - startedAt }
    }

    for (const display of request.displays) {
      const source = findSourceForDisplay(sources, display.id) ?? (request.allowSingleFallback ? sources[0] : undefined)
      if (!source) continue

      const thumb = source.thumbnail
      const size = thumb.getSize()
      if (size.width === 0 || size.height === 0) continue

      images.push({
        display,
        bitmap: thumb.getBitmap() as unknown as Buffer,
        width: size.width,
        height: size.height
      })
    }

    return { images, durationMs: performance.now() - startedAt }
  }
}