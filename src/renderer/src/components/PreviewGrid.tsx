import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { RgbFrame } from '../../../shared/types'

interface PreviewGridProps {
  frame: RgbFrame | null
}

export function PreviewGrid({ frame }: PreviewGridProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !frame) {
      return
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    const pixelRatio = window.devicePixelRatio || 1
    const bounds = canvas.getBoundingClientRect()
    const pw = Math.floor(bounds.width * pixelRatio)
    const ph = Math.floor(bounds.height * pixelRatio)
    canvas.width = pw
    canvas.height = ph

    // Each cell fills exactly its share of the canvas — cols×rows covers 100% of the area.
    // We operate in physical pixels (no ctx.scale) and use a single putImageData call
    // instead of N fillRect calls, which is significantly faster at large grid sizes.
    const cellW = pw / frame.columns
    const cellH = ph / frame.rows
    const gap = Math.max(0.5, Math.min(cellW, cellH) * 0.06)

    const imageData = context.createImageData(pw, ph)
    const data = imageData.data

    // Fill background (dark)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 8; data[i + 1] = 13; data[i + 2] = 17; data[i + 3] = 255
    }

    for (let row = 0; row < frame.rows; row++) {
      for (let col = 0; col < frame.columns; col++) {
        const i3 = (row * frame.columns + col) * 3
        const r = frame.pixels[i3]
        const g = frame.pixels[i3 + 1]
        const b = frame.pixels[i3 + 2]

        const x0 = Math.round(col * cellW + gap / 2)
        const y0 = Math.round(row * cellH + gap / 2)
        const x1 = Math.round(col * cellW + cellW - gap / 2)
        const y1 = Math.round(row * cellH + cellH - gap / 2)

        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const idx = (py * pw + px) * 4
            data[idx] = r
            data[idx + 1] = g
            data[idx + 2] = b
            data[idx + 3] = 255
          }
        }
      }
    }

    context.putImageData(imageData, 0, 0)
  }, [frame])

  return (
    <div className="preview-frame">
      <canvas ref={canvasRef} aria-label="RGB preview canvas" />
      {!frame && <span className="preview-empty">Starting virtual engine</span>}
    </div>
  )
}
