import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import type { RgbFrame } from '../../../shared/types'

interface PreviewGridProps {
  frame: RgbFrame | null
  /** When a ripple layer is active, called with normalised (0..1) click coordinates. */
  onRippleClick?: (nx: number, ny: number) => void
}

export function PreviewGrid({ frame, onRippleClick }: PreviewGridProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Track physical canvas dimensions; updated only on actual resize, not every frame.
  const sizeRef = useRef({ pw: 0, ph: 0 })
  // Reuse ImageData buffer; reallocated only when canvas size changes.
  const imgDataRef = useRef<ImageData | null>(null)

  // ResizeObserver: resize the canvas backing buffer and invalidate cached ImageData.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const applySize = (): void => {
      const pixelRatio = window.devicePixelRatio || 1
      const bounds = canvas.getBoundingClientRect()
      const pw = Math.floor(bounds.width * pixelRatio)
      const ph = Math.floor(bounds.height * pixelRatio)
      if (pw === sizeRef.current.pw && ph === sizeRef.current.ph) return
      canvas.width = pw
      canvas.height = ph
      sizeRef.current = { pw, ph }
      imgDataRef.current = null  // force re-allocation on next render
    }

    applySize()
    const ro = new ResizeObserver(applySize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Render: only pixel writes + a single putImageData, no layout queries or canvas resizes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frame) return
    const context = canvas.getContext('2d')
    if (!context) return

    const { pw, ph } = sizeRef.current
    if (pw === 0 || ph === 0) return

    // Each cell fills exactly its share of the canvas — cols×rows covers 100% of the area.
    // We operate in physical pixels (no ctx.scale) and use a single putImageData call
    // instead of N fillRect calls, which is significantly faster at large grid sizes.
    const cellW = pw / frame.columns
    const cellH = ph / frame.rows
    const gap = Math.max(0.5, Math.min(cellW, cellH) * 0.06)

    // Allocate ImageData only when resolution changes; reuse across frames to reduce GC.
    if (!imgDataRef.current || imgDataRef.current.width !== pw || imgDataRef.current.height !== ph) {
      imgDataRef.current = context.createImageData(pw, ph)
      // Pre-fill background once; gap pixels keep this color for the lifetime of the buffer.
      const bg = imgDataRef.current.data
      for (let i = 0; i < bg.length; i += 4) {
        bg[i] = 8; bg[i + 1] = 13; bg[i + 2] = 17; bg[i + 3] = 255
      }
    }
    const imageData = imgDataRef.current
    const data = imageData.data

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
      <canvas
        ref={canvasRef}
        aria-label="RGB preview canvas"
        style={onRippleClick ? { cursor: 'crosshair' } : undefined}
        onClick={onRippleClick ? (e) => {
          const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect()
          const nx = (e.clientX - rect.left) / rect.width
          const ny = (e.clientY - rect.top) / rect.height
          onRippleClick(Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny)))
        } : undefined}
      />
      {!frame && <span className="preview-empty">Starting virtual engine</span>}
    </div>
  )
}
