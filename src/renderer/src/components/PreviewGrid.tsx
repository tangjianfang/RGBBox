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
    canvas.width = Math.floor(bounds.width * pixelRatio)
    canvas.height = Math.floor(bounds.height * pixelRatio)
    context.scale(pixelRatio, pixelRatio)
    context.imageSmoothingEnabled = true
    context.clearRect(0, 0, bounds.width, bounds.height)
    context.fillStyle = '#080d11'
    context.fillRect(0, 0, bounds.width, bounds.height)

    // Each cell fills exactly its share of the canvas — cols×rows covers 100% of the area
    const cellW = bounds.width  / frame.columns
    const cellH = bounds.height / frame.rows
    const gap = Math.max(0.5, Math.min(cellW, cellH) * 0.06)

    frame.pixels.forEach((color, index) => {
      const x = index % frame.columns
      const y = Math.floor(index / frame.columns)
      const rx = x * cellW + gap / 2
      const ry = y * cellH + gap / 2
      const rw = cellW - gap
      const rh = cellH - gap

      context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`
      context.fillRect(rx, ry, rw, rh)
    })
  }, [frame])

  return (
    <div className="preview-frame">
      <canvas ref={canvasRef} aria-label="RGB preview canvas" />
      {!frame && <span className="preview-empty">Starting virtual engine</span>}
    </div>
  )
}
