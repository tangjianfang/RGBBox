import { screen } from 'electron'
import type { DisplayInfo, DisplayTopology, RgbFrame } from '../shared/types'
import { captureWithProvider } from './captureProviders'

interface CapturedDisplay {
  display: DisplayInfo
  bitmap: Buffer
  width: number
  height: number
}

function toDisplayInfo(display: Electron.Display): DisplayInfo {
  return {
    id: display.id,
    label: display.label,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    primary: display.id === screen.getPrimaryDisplay().id
  }
}

function readSample(captured: CapturedDisplay, relX: number, relY: number): [number, number, number] {
  const px = Math.min(captured.width - 1, Math.max(0, Math.floor(relX * captured.width)))
  const py = Math.min(captured.height - 1, Math.max(0, Math.floor(relY * captured.height)))
  const idx = (py * captured.width + px) * 4
  return [captured.bitmap[idx + 2], captured.bitmap[idx + 1], captured.bitmap[idx]]
}

async function captureDisplayImages(
  displays: DisplayInfo[],
  thumbnailSize: { width: number; height: number },
  allowSingleFallback = false
): Promise<CapturedDisplay[]> {
  const result = await captureWithProvider({ displays, thumbnailSize, allowSingleFallback })
  return result.images
}

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
    const thumbW = Math.max(columns * 4, 80)
    const thumbH = Math.max(rows * 4, 45)
    const allDisplays = screen.getAllDisplays()
    const targetDisplay = allDisplays.find((d) => d.id === displayId)
    if (!targetDisplay) return null

    const captured = (await captureDisplayImages([toDisplayInfo(targetDisplay)], { width: thumbW, height: thumbH }, true))[0]
    if (!captured) return null

    const pixels = new Uint8ClampedArray(columns * rows * 3)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const p3 = (y * columns + x) * 3
        const [r, g, b] = readSample(captured, (x + 0.5) / columns, (y + 0.5) / rows)
        pixels[p3] = r
        pixels[p3 + 1] = g
        pixels[p3 + 2] = b
      }
    }

    return { columns, rows, pixels, generatedAt: Date.now() }
  } catch {
    return null
  }
}

export async function captureVirtualScreenFrame(
  topology: DisplayTopology,
  columns: number,
  rows: number
): Promise<RgbFrame | null> {
  try {
    const vb = topology.virtualBounds
    if (topology.displays.length === 0 || vb.width === 0 || vb.height === 0) return null

    const thumbW = Math.max(columns * 4, 80)
    const thumbH = Math.max(rows * 4, 45)
    const captured = await captureDisplayImages(topology.displays, { width: thumbW, height: thumbH })
    if (captured.length === 0) return null

    const byDisplayId = new Map(captured.map((entry) => [entry.display.id, entry]))
    const pixels = new Uint8ClampedArray(columns * rows * 3)

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const virtualX = vb.x + ((x + 0.5) / columns) * vb.width
        const virtualY = vb.y + ((y + 0.5) / rows) * vb.height
        const display = topology.displays.find((candidate) => (
          virtualX >= candidate.bounds.x &&
          virtualX < candidate.bounds.x + candidate.bounds.width &&
          virtualY >= candidate.bounds.y &&
          virtualY < candidate.bounds.y + candidate.bounds.height
        ))

        if (!display) continue

        const displayCapture = byDisplayId.get(display.id)
        if (!displayCapture) continue

        const relX = (virtualX - display.bounds.x) / Math.max(1, display.bounds.width)
        const relY = (virtualY - display.bounds.y) / Math.max(1, display.bounds.height)
        const [r, g, b] = readSample(displayCapture, relX, relY)
        const p3 = (y * columns + x) * 3
        pixels[p3] = r
        pixels[p3 + 1] = g
        pixels[p3 + 2] = b
      }
    }

    return { columns, rows, pixels, generatedAt: Date.now() }
  } catch {
    return null
  }
}
