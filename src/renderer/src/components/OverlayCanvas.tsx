import { useCallback, useEffect, useRef, type JSX } from 'react'
import { effectPresets } from '../../../shared/defaultProfile'
import type { Effect3DKind, RgbFrame } from '../../../shared/types'
import { EFFECT3D_CHANNEL, Effect3DGl, type Effect3DMessage } from '../gl/effect3dGl'
import { EFFECT2D_CHANNEL, EffectGl, type Effect2DMessage } from '../gl/effectGl'
import { PreviewGl } from '../gl/previewGl'
import { useI18n } from '../i18n'

interface Props {
  displayId: number
  /**
   * R65: true for fullscreen-region overlays (window created opaque —
   * `overlayManager.ts#openOverlay`'s `transparent:false` path), false for
   * non-fullscreen preset-third/custom regions (window created transparent,
   * needed so their letterbox bars — R63 — show the desktop through). Drives
   * which `PreviewGl` rendering path this canvas uses: opaque overlays reuse
   * the exact same `overlay=false` path as the in-app "RGB 画布预览" panel.
   */
  opaque?: boolean
}

// Effect list passed to the native context menu
const OVERLAY_EFFECTS = effectPresets.map((p) => ({ kind: p.kind, label: p.label }))

// R36: how long after the last 3D-effect broadcast we keep suppressing the
// LED-grid frame draw. Generous relative to the ~16ms broadcast cadence, so a
// single dropped message doesn't cause a visible flash back to the grid, but
// short enough that switching to a 2D effect resumes normal rendering quickly.
const EFFECT3D_FRESHNESS_MS = 500
const EFFECT2D_FRESHNESS_MS = 500

export function getOverlayCanvasBackingSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): { width: number; height: number } {
  const pixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return {
    width: Math.floor(cssWidth * pixelRatio),
    height: Math.floor(cssHeight * pixelRatio),
  }
}

export function OverlayCanvas({ displayId, opaque = false }: Props): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef     = useRef<PreviewGl | null>(null)
  // R36: 3D-effect direct-render state (see effect3dGl.ts EFFECT3D_CHANNEL)
  const effect3dGlRef  = useRef<Effect3DGl | null>(null)
  const effect3dKindRef = useRef<Effect3DKind | null>(null)
  const last3dAtRef     = useRef(0)
  const effect2dGlRef    = useRef<EffectGl | null>(null)
  const last2dAtRef      = useRef(0)

  // R48.1: frame-arrival timing accumulator. Always running (cost is one
  // performance.now() diff + a capped push per frame), but only read when the
  // --perf-selftest harness sends a collect request — zero overhead in normal
  // use. Lets the harness measure the overlay's actual presentation cadence
  // (inter-frame p95/max, delivery fps), which CPU% can't see.
  const timingAccRef = useRef({
    intervals: [] as number[],
    prevArrival: null as number | null,
    firstArrival: null as number | null,
    lastArrival: null as number | null,
    framesReceived: 0,
  })

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
    const initGl = (): PreviewGl | null => {
      const cssWidth = canvas.offsetWidth  || window.innerWidth
      const cssHeight = canvas.offsetHeight || window.innerHeight
      if (!cssWidth || !cssHeight) return null
      const { width, height } = getOverlayCanvasBackingSize(cssWidth, cssHeight, window.devicePixelRatio || 1)
      if (!width || !height) return null
      canvas.width  = width
      canvas.height = height
      try {
        // R65: opaque (fullscreen) overlays use the exact same `overlay=false`
        // rendering path as the in-app preview panel — no alpha context, no GL
        // blending, opaque background. Only non-fullscreen regions still need
        // the transparent/alpha-blended `overlay=true` path (R63 letterbox).
        return new PreviewGl(canvas, !opaque)
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
      effect2dGlRef.current?.dispose()
      effect2dGlRef.current = null
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

    const effect2dChannel = opaque ? new BroadcastChannel(EFFECT2D_CHANNEL) : null
    if (effect2dChannel) {
      effect2dChannel.onmessage = (event: MessageEvent<Effect2DMessage>) => {
        const c = canvasRef.current
        if (!c) return
        if (!effect2dGlRef.current) {
          try {
            effect2dGlRef.current = new EffectGl(c)
          } catch (err) {
            console.warn('[OverlayCanvas] EffectGl init failed:', err)
            effect2dGlRef.current = null
          }
        }
        if (effect2dGlRef.current?.render(event.data.layer, event.data.t)) {
          last2dAtRef.current = performance.now()
        }
      }
    }

    // ── Frame subscription (IPC callback, no React state) ────────────────
    const unsubscribe = window.rgbbox.onOverlayFrame((frame: RgbFrame) => {
      // R48.1: stamp arrival time for the harness's presentation-layer cadence
      // measurement. Done before the 3D-skip short-circuit so timing reflects
      // actual frame delivery, not whether we drew it.
      const now = performance.now()
      const acc = timingAccRef.current
      if (acc.firstArrival == null) acc.firstArrival = now
      acc.lastArrival = now
      acc.framesReceived++
      if (acc.prevArrival != null) {
        acc.intervals.push(now - acc.prevArrival)
        if (acc.intervals.length > 1000) acc.intervals.shift()
      }
      acc.prevArrival = now

      // R36: while a 3D effect is actively broadcasting its own full-resolution
      // render (above), skip drawing the LED-grid-quantized frame so it doesn't
      // flicker/overwrite the sharper direct render.
      if (now - last3dAtRef.current < EFFECT3D_FRESHNESS_MS) return
      if (now - last2dAtRef.current < EFFECT2D_FRESHNESS_MS) return
      glRef.current?.setGap((frame.showGap ?? false) ? 0.06 : 0.0)
      glRef.current?.setRenderStyle(frame.renderStyle ?? 'smooth')
      glRef.current?.setFit(frame.regionFit ?? 'stretch')
      glRef.current?.drawFrame(frame)
    })

    return () => {
      ro.disconnect()
      unsubscribe()
      effect3dChannel.close()
      effect2dChannel?.close()
      glRef.current?.dispose()
      glRef.current = null
      effect3dGlRef.current?.dispose()
      effect3dGlRef.current = null
      effect2dGlRef.current?.dispose()
      effect2dGlRef.current = null
    }
  }, [opaque])

  // R48.1: respond to the --perf-selftest harness's collect-timing request.
  // Computes a snapshot of the frame-arrival buffer, reports it back via the
  // dedicated IPC channel, then clears the buffer so the next scenario is
  // measured independently. Inert in normal use — only fires when the harness
  // explicitly asks.
  useEffect(() => {
    return window.rgbbox.onPerfSelfTestCollectTiming((requestId: number) => {
      const acc = timingAccRef.current
      const sorted = acc.intervals.slice().sort((a, b) => a - b)
      const pct = (p: number): number => {
        if (sorted.length === 0) return 0
        const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p))
        return sorted[idx] ?? 0
      }
      const elapsedMs = acc.firstArrival != null && acc.lastArrival != null
        ? acc.lastArrival - acc.firstArrival
        : 0
      window.rgbbox.reportPerfSelfTestTiming({
        requestId,
        framesReceived: acc.framesReceived,
        elapsedMs,
        intervalP50Ms: pct(0.5),
        intervalP95Ms: pct(0.95),
        intervalMaxMs: sorted.length ? sorted[sorted.length - 1] : 0,
        intervalMeanMs: sorted.length
          ? sorted.reduce((a, b) => a + b, 0) / sorted.length
          : 0,
      })
      // Reset for the next measurement window.
      acc.intervals = []
      acc.prevArrival = null
      acc.firstArrival = null
      acc.lastArrival = null
      acc.framesReceived = 0
    })
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
