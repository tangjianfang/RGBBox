import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { RgbFrame } from '../../../shared/types'
import { PreviewGl } from '../gl/previewGl'

interface Props {
  displayId: number
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

export function OverlayCanvas({ displayId }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef     = useRef<PreviewGl | null>(null)

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

    // ── Initial size + resize handling ──────────────────────────────────
    const applySize = (): void => {
      const w = canvas.offsetWidth  || window.innerWidth
      const h = canvas.offsetHeight || window.innerHeight
      if (canvas.width === w && canvas.height === h) return
      canvas.width  = w
      canvas.height = h
      glRef.current?.resize(w, h)
    }
    applySize()
    const ro = new ResizeObserver(applySize)
    ro.observe(canvas)

    // ── WebGL renderer ───────────────────────────────────────────────────
    // The overlay canvas covers the entire display (e.g. 1920×1080).
    // The frame texture is only columns×rows (e.g. 320×180).
    // WebGL scales the texture to fill the screen in a single draw call.
    let gl: PreviewGl | null = null
    try {
      gl = new PreviewGl(canvas)
      glRef.current = gl
    } catch (err) {
      console.warn('[OverlayCanvas] WebGL unavailable:', err)
    }

    // ── Frame subscription (IPC callback, no React state) ────────────────
    const unsubscribe = window.rgbbox.onOverlayFrame((frame: RgbFrame) => {
      glRef.current?.drawFrame(frame)
    })

    return () => {
      ro.disconnect()
      unsubscribe()
      glRef.current?.dispose()
      glRef.current = null
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
