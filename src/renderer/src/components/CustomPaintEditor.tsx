import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'

type FillMode = 'solid' | 'gradient' | 'rainbow' | 'random'

interface CustomPaintEditorProps {
  columns: number
  rows: number
  pixelData: string[]
  onChange: (pixels: string[]) => void
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((hNorm / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (hNorm < 60) { r = c; g = x; b = 0 }
  else if (hNorm < 120) { r = x; g = c; b = 0 }
  else if (hNorm < 180) { r = 0; g = c; b = x }
  else if (hNorm < 240) { r = 0; g = x; b = c }
  else if (hNorm < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgbArr(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`
}

function lerpHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgbArr(from)
  const [r2, g2, b2] = hexToRgbArr(to)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export function CustomPaintEditor({ columns, rows, pixelData, onChange }: CustomPaintEditorProps): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fillMode, setFillMode] = useState<FillMode>('solid')
  const [color1, setColor1] = useState('#ff4f87')
  const [color2, setColor2] = useState('#37d5ff')
  const [selecting, setSelecting] = useState(false)
  const [selStart, setSelStart] = useState<{ x: number; y: number } | null>(null)
  const [selEnd, setSelEnd] = useState<{ x: number; y: number } | null>(null)

  const totalPixels = columns * rows

  // Ensure pixelData has correct length
  const pixels = pixelData.length === totalPixels ? pixelData : Array.from({ length: totalPixels }, (_, i) => pixelData[i] || '#000000')

  const cellSize = Math.min(Math.floor(480 / columns), Math.floor(280 / rows), 32)
  const canvasWidth = columns * cellSize
  const canvasHeight = rows * cellSize

  // Draw the grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Draw pixels
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const idx = y * columns + x
        ctx.fillStyle = pixels[idx] || '#000000'
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1)
      }
    }

    // Draw selection overlay
    if (selStart && selEnd) {
      const minX = Math.min(selStart.x, selEnd.x)
      const maxX = Math.max(selStart.x, selEnd.x)
      const minY = Math.min(selStart.y, selEnd.y)
      const maxY = Math.max(selStart.y, selEnd.y)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.strokeRect(minX * cellSize, minY * cellSize, (maxX - minX + 1) * cellSize, (maxY - minY + 1) * cellSize)
      ctx.setLineDash([])
      // Semi-transparent highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fillRect(minX * cellSize, minY * cellSize, (maxX - minX + 1) * cellSize, (maxY - minY + 1) * cellSize)
    }
  }, [pixels, columns, rows, cellSize, canvasWidth, canvasHeight, selStart, selEnd])

  const getCellFromEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / cellSize)
    const y = Math.floor((e.clientY - rect.top) / cellSize)
    if (x < 0 || x >= columns || y < 0 || y >= rows) return null
    return { x, y }
  }, [cellSize, columns, rows])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = getCellFromEvent(e)
    if (!cell) return
    setSelecting(true)
    setSelStart(cell)
    setSelEnd(cell)
  }, [getCellFromEvent])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selecting) return
    const cell = getCellFromEvent(e)
    if (cell) setSelEnd(cell)
  }, [selecting, getCellFromEvent])

  const handleMouseUp = useCallback(() => {
    setSelecting(false)
  }, [])

  const applyFill = useCallback(() => {
    if (!selStart || !selEnd) return
    const minX = Math.min(selStart.x, selEnd.x)
    const maxX = Math.max(selStart.x, selEnd.x)
    const minY = Math.min(selStart.y, selEnd.y)
    const maxY = Math.max(selStart.y, selEnd.y)
    const width = maxX - minX + 1
    const height = maxY - minY + 1
    const newPixels = [...pixels]

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const idx = (minY + dy) * columns + (minX + dx)
        let color: string
        switch (fillMode) {
          case 'solid':
            color = color1
            break
          case 'gradient': {
            const total = width * height
            const t = total > 1 ? (dy * width + dx) / (total - 1) : 0
            color = lerpHex(color1, color2, t)
            break
          }
          case 'rainbow': {
            const total = width * height
            const t = total > 1 ? (dy * width + dx) / (total - 1) : 0
            color = hslToHex(t * 360, 1, 0.5)
            break
          }
          case 'random':
            color = hslToHex(Math.random() * 360, 0.8 + Math.random() * 0.2, 0.4 + Math.random() * 0.2)
            break
          default:
            color = color1
        }
        newPixels[idx] = color
      }
    }
    onChange(newPixels)
  }, [selStart, selEnd, fillMode, color1, color2, pixels, columns, onChange])

  const clearSelection = useCallback(() => {
    if (!selStart || !selEnd) return
    const minX = Math.min(selStart.x, selEnd.x)
    const maxX = Math.max(selStart.x, selEnd.x)
    const minY = Math.min(selStart.y, selEnd.y)
    const maxY = Math.max(selStart.y, selEnd.y)
    const newPixels = [...pixels]
    for (let dy = 0; dy <= maxY - minY; dy++) {
      for (let dx = 0; dx <= maxX - minX; dx++) {
        newPixels[(minY + dy) * columns + (minX + dx)] = '#000000'
      }
    }
    onChange(newPixels)
    setSelStart(null)
    setSelEnd(null)
  }, [selStart, selEnd, pixels, columns, onChange])

  const clearAll = useCallback(() => {
    onChange(Array.from({ length: totalPixels }, () => '#000000'))
    setSelStart(null)
    setSelEnd(null)
  }, [totalPixels, onChange])

  return (
    <div className="custom-paint-editor">
      <h4 className="custom-paint-title">{t('customPaint.title' as Parameters<typeof t>[0])}</h4>
      <p className="custom-paint-hint">{t('customPaint.selectHint' as Parameters<typeof t>[0])}</p>

      <div className="custom-paint-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="custom-paint-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      <div className="custom-paint-toolbar">
        <div className="custom-paint-modes">
          {(['solid', 'gradient', 'rainbow', 'random'] as FillMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`custom-paint-mode-btn ${fillMode === mode ? 'active' : ''}`}
              onClick={() => setFillMode(mode)}
            >
              {t(`customPaint.fill${mode.charAt(0).toUpperCase() + mode.slice(1)}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        <div className="custom-paint-colors">
          <label className="custom-paint-color-label">
            {fillMode === 'gradient' ? t('customPaint.colorFrom' as Parameters<typeof t>[0]) : t('customPaint.color' as Parameters<typeof t>[0])}
            <input type="color" value={color1} onChange={(e) => setColor1(e.target.value)} />
          </label>
          {fillMode === 'gradient' && (
            <label className="custom-paint-color-label">
              {t('customPaint.colorTo' as Parameters<typeof t>[0])}
              <input type="color" value={color2} onChange={(e) => setColor2(e.target.value)} />
            </label>
          )}
        </div>

        <div className="custom-paint-actions">
          <button type="button" className="custom-paint-btn primary" onClick={applyFill} disabled={!selStart}>
            {t('customPaint.apply' as Parameters<typeof t>[0])}
          </button>
          <button type="button" className="custom-paint-btn" onClick={clearSelection} disabled={!selStart}>
            {t('customPaint.clear' as Parameters<typeof t>[0])}
          </button>
          <button type="button" className="custom-paint-btn" onClick={clearAll}>
            {t('customPaint.clearAll' as Parameters<typeof t>[0])}
          </button>
        </div>
      </div>
    </div>
  )
}
