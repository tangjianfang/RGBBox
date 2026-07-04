import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { Effect3DKind, RgbFrame } from '../../../shared/types'
import { EFFECT3D_CHANNEL, Effect3DGl, type Effect3DMessage } from '../gl/effect3dGl'
import { PreviewGl } from '../gl/previewGl'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

// R36: how long after the last 3D-effect broadcast we keep suppressing the
// LED-grid frame draw. Generous relative to the ~16ms broadcast cadence, so a
// single dropped message doesn't cause a visible flash back to the grid, but
// short enough that switching to a 2D effect resumes normal rendering quickly.
const EFFECT3D_FRESHNESS_MS = 500

export function OverlayCanvas({ displayId }: Props): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef     = useRef<PreviewGl | null>(null)
  // R36: 3D-effect direct-render state (see effect3dGl.ts EFFECT3D_CHANNEL)
  const effect3dGlRef  = useRef<Effect3DGl | null>(null)
  const effect3dKindRef = useRef<Effect3DKind | null>(null)
  const last3dAtRef     = useRef(0)

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
      // The 3D renderer shares the same (now-recreated) GL context; drop it
      // so it's lazily rebuilt against the fresh context on the next broadcast.
      effect3dGlRef.current?.dispose()
      effect3dGlRef.current = null
      effect3dKindRef.current = null
    })
    ro.observe(canvas)

    // ── R36: 3D effect direct-render subscription ────────────────────────
    // Renders the identical raymarched scene locally at this overlay's own
    // full physical resolution, instead of waiting for the readLEDs()-
    // downsampled LED-grid frame pushed over IPC below.
    const effect3dChannel = new BroadcastChannel(EFFECT3D_CHANNEL)
    effect3dChannel.onmessage = (event: MessageEvent<Effect3DMessage>) => {
      const { kind, t: time, params, detail, extra } = event.data
      const c = canvasRef.current
      if (!c) return
      if (!effect3dGlRef.current || effect3dKindRef.current !== kind) {
        effect3dGlRef.current?.dispose()
        try {
          effect3dGlRef.current = new Effect3DGl(c, kind)
          effect3dKindRef.current = kind
        } catch (err) {
          console.warn('[OverlayCanvas] Effect3DGl init failed:', err)
          effect3dGlRef.current = null
          effect3dKindRef.current = null
        }
      }
      effect3dGlRef.current?.draw(time, params, detail, extra)
      last3dAtRef.current = performance.now()
    }

    // ── Frame subscription (IPC callback, no React state) ────────────────
    const unsubscribe = window.rgbbox.onOverlayFrame((frame: RgbFrame) => {
      // R36: while a 3D effect is actively broadcasting its own full-resolution
      // render (above), skip drawing the LED-grid-quantized frame so it doesn't
      // flicker/overwrite the sharper direct render.
      if (performance.now() - last3dAtRef.current < EFFECT3D_FRESHNESS_MS) return
      glRef.current?.setGap((frame.showGap ?? false) ? 0.06 : 0.0)
      glRef.current?.setRenderStyle(frame.renderStyle ?? 'smooth')
      glRef.current?.drawFrame(frame)
    })

    return () => {
      ro.disconnect()
      unsubscribe()
      effect3dChannel.close()
      glRef.current?.dispose()
      glRef.current = null
      effect3dGlRef.current?.dispose()
      effect3dGlRef.current = null
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
