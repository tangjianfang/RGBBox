import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { RgbFrame } from '../../../shared/types'

interface Props {
  displayId: number
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

function drawFrame(canvas: HTMLCanvasElement, frame: RgbFrame): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { columns, rows, pixels } = frame
  const w = canvas.width
  const h = canvas.height

  // Use square cells: compute the largest cell size that fits the grid inside the canvas,
  // then centre the grid (letterbox/pillarbox) so cells are always square.
  const cellSize = Math.min(w / columns, h / rows)
  const gap = Math.max(1, cellSize * 0.06)
  const totalW = cellSize * columns
  const totalH = cellSize * rows
  const offsetX = (w - totalW) / 2
  const offsetY = (h - totalH) / 2

  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < pixels.length; i++) {
    const px = pixels[i]
    const col = i % columns
    const row = Math.floor(i / columns)
    const rx = offsetX + col * cellSize + gap / 2
    const ry = offsetY + row * cellSize + gap / 2
    const rw = cellSize - gap
    const rh = cellSize - gap

    ctx.fillStyle = `rgb(${px.r},${px.g},${px.b})`
    ctx.fillRect(rx, ry, rw, rh)
  }
}

export function OverlayCanvas({ displayId }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Double-click: close this overlay
  const handleDoubleClick = useCallback(() => {
    window.rgbbox.closeOverlay(displayId)
  }, [displayId])

  // Right-click: show native context menu with effects + exit
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.rgbbox.showOverlayContextMenu(displayId, OVERLAY_EFFECTS)
  }, [displayId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    resizeObserver.observe(canvas)

    canvas.width = canvas.offsetWidth || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight

    const unsubscribe = window.rgbbox.onOverlayFrame((frame: RgbFrame) => {
      drawFrame(canvas, frame)
    })

    return () => {
      resizeObserver.disconnect()
      unsubscribe()
    }
  }, [])

  return (
    <div
      style={{ position: 'fixed', inset: 0, cursor: 'default' }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          display: 'block',
          pointerEvents: 'none'
        }}
      />
      {/* Hint strip – fades out after a few seconds via CSS animation */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 14px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.55)',
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        pointerEvents: 'none',
        animation: 'overlayHintFade 3s ease 1.5s forwards',
        whiteSpace: 'nowrap'
      }}>
        双击退出 · 右键菜单
      </div>
    </div>
  )
}
