import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { RgbFrame } from '../../../shared/types'
import { PreviewGl } from '../gl/previewGl'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

export function OverlayCanvas({ displayId }: Props): JSX.Element {
  const { t } = useI18n()
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

    // ── Helper: set canvas physical size then (re-)create the GL context ──
    // Overlay canvas covers the entire display, so no devicePixelRatio scaling
    // is applied — we want 1 CSS pixel = 1 physical pixel here.
    const initGl = (): PreviewGl | null => {
      const w = canvas.offsetWidth  || window.innerWidth
      const h = canvas.offsetHeight || window.innerHeight
      if (!w || !h) return null
      canvas.width  = w
      canvas.height = h
      try {
        return new PreviewGl(canvas, true /* overlay */)
      } catch (err) {
        console.warn('[OverlayCanvas] WebGL init failed:', err)
        return null
      }
    }

    // ── Initial WebGL context ────────────────────────────────────────────
    glRef.current = initGl()

    // ── ResizeObserver: recreate GL context (setting canvas dimensions ───
    //   fires a WebGL context-lost event; must dispose + recreate)
    const ro = new ResizeObserver(() => {
      glRef.current?.dispose()
      glRef.current = initGl()
    })
    ro.observe(canvas)

    // ── Frame subscription (IPC callback, no React state) ────────────────
    const unsubscribe = window.rgbbox.onOverlayFrame((frame: RgbFrame) => {
      glRef.current?.setGap((frame.showGap ?? false) ? 0.06 : 0.0)
      glRef.current?.setRenderStyle(frame.renderStyle ?? 'smooth')
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
        {t('overlay.hint')}
      </div>
    </div>
  )
}
