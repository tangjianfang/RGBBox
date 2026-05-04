import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { RgbFrame } from '../../../shared/types'

interface Props {
  displayId: number
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

// Module-level cache: reuse OffscreenCanvas and ImageData to avoid per-frame allocations.
let _offscreen: OffscreenCanvas | null = null
let _offCtx: OffscreenCanvasRenderingContext2D | null = null
let _imgData: ImageData | null = null

function drawFrame(canvas: HTMLCanvasElement, frame: RgbFrame): void {
  const { columns, rows, pixels } = frame

  // Lazy-create or resize the offscreen canvas at frame resolution.
  if (!_offscreen || _offscreen.width !== columns || _offscreen.height !== rows) {
    _offscreen = new OffscreenCanvas(columns, rows)
    _offCtx = _offscreen.getContext('2d')
    _imgData = null
  }
  if (!_offCtx) return

  // Reuse ImageData buffer; only allocate when resolution changes.
  if (!_imgData) {
    _imgData = _offCtx.createImageData(columns, rows)
  }

  // RGB (packed 3-byte) → RGBA typed-array write — single tight loop, no string allocs.
  const data = _imgData.data
  for (let i = 0, len = columns * rows; i < len; i++) {
    const s = i * 3
    const d = i * 4
    data[d]     = pixels[s]
    data[d + 1] = pixels[s + 1]
    data[d + 2] = pixels[s + 2]
    data[d + 3] = 255
  }
  _offCtx.putImageData(_imgData, 0, 0)

  // Scale the small frame up to the full overlay canvas in one GPU-accelerated blit.
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(_offscreen, 0, 0, canvas.width, canvas.height)
}

export function OverlayCanvas({ displayId }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Esc key: close this overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.rgbbox.closeOverlay(displayId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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
        ESC 退出 · 右键菜单
      </div>
    </div>
  )
}
