import { desktopCapturer, screen } from 'electron'
import type { RgbColor, RgbFrame } from '../shared/types'

/**
 * Capture a display's screen content and downsample it to the requested grid size.
 * Returns null when capture fails (e.g., permission denied on macOS).
 *
 * desktopCapturer.getSources() returns NativeImage thumbnails in BGRA format.
 */
export async function captureScreenFrame(
  displayId: number,
  columns: number,
  rows: number
): Promise<RgbFrame | null> {
  try {
    // Request thumbnails at 4× grid size for decent sampling quality
    const thumbW = Math.max(columns * 4, 80)
    const thumbH = Math.max(rows * 4, 45)

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: thumbW, height: thumbH }
    })

    if (sources.length === 0) return null

    // Match source to the requested display
    const allDisplays = screen.getAllDisplays()
    const targetDisplay = allDisplays.find((d) => d.id === displayId)
    if (!targetDisplay) return null

    // Electron sets source.display_id to the display's id string on most platforms
    const source =
      sources.find((s) => s.display_id === String(displayId)) ??
      sources.find((s) => s.name.includes(String(displayId))) ??
      sources[0]

    if (!source) return null

    const thumb = source.thumbnail
    const size = thumb.getSize()

    if (size.width === 0 || size.height === 0) return null

    // getBitmap() → raw BGRA Buffer. Cast because Electron typedefs may mark it void.
    const bitmap = thumb.getBitmap() as unknown as Buffer
    const pixels: RgbColor[] = []

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const px = Math.min(size.width - 1, Math.floor((x + 0.5) * size.width / columns))
        const py = Math.min(size.height - 1, Math.floor((y + 0.5) * size.height / rows))
        const idx = (py * size.width + px) * 4

        pixels.push({
          r: bitmap[idx + 2], // BGRA layout
          g: bitmap[idx + 1],
          b: bitmap[idx + 0]
        })
      }
    }

    return { columns, rows, pixels, generatedAt: Date.now() }
  } catch {
    return null
  }
}
