import { useEffect, useRef, useState, type JSX } from 'react'
import type { RgbFrame } from '../../../shared/types'
import { PreviewGl } from '../gl/previewGl'

interface PreviewGridProps {
  /**
   * Ref to the latest frame produced by the worker.
   * Using a ref instead of state means new frames never trigger a React re-render;
   * the component's own rAF loop polls the ref on every vsync.
   */
  frameRef: React.RefObject<RgbFrame | null>
  /** Show dark grid lines between cells (default false). */
  showGap?: boolean
  /** When a ripple layer is active, called with normalised (0..1) click coordinates. */
  onRippleClick?: (nx: number, ny: number) => void
  /**
   * When > 1, draws vertical boundary lines dividing the preview into that many
   * display slots (shown at 1/N, 2/N, … of the canvas width).
   */
  displayCount?: number
}

/**
 * Initialise (or reinitialise) a PreviewGl renderer for a canvas.
 *
 * IMPORTANT: setting canvas.width / canvas.height on an already-contextualised
 * canvas fires a WebGL context-lost event, making all subsequent GL calls no-ops.
 * The correct resize pattern is:
 *   1. Dispose the old PreviewGl (which detaches the context).
 *   2. Set canvas.width / canvas.height to new physical dimensions.
 *   3. Construct a new PreviewGl.
 */
function initGl(canvas: HTMLCanvasElement): PreviewGl | null {
  const pr = window.devicePixelRatio || 1
  const w  = Math.floor(canvas.offsetWidth  * pr)
  const h  = Math.floor(canvas.offsetHeight * pr)
  // Skip if the container hasn't been laid out yet (zero dimensions).
  if (!w || !h) return null
  canvas.width  = w
  canvas.height = h
  try {
    return new PreviewGl(canvas)
  } catch (err) {
    console.warn('[PreviewGrid] WebGL init failed:', err)
    return null
  }
}

export function PreviewGrid({ frameRef, showGap = false, onRippleClick, displayCount = 1 }: PreviewGridProps): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null)
  const glRef      = useRef<PreviewGl | null>(null)
  const rafRef     = useRef<number | null>(null)
  const drawnRef   = useRef<RgbFrame | null>(null)
  const [started, setStarted] = useState(false)
  // Stable ref so the rAF loop closure can set started without stale-closure issues.
  const startedRef = useRef(false)

  // Apply gap setting whenever it changes (without remounting the GL context).
  useEffect(() => {
    glRef.current?.setGap(showGap ? 0.06 : 0.0)
  }, [showGap])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Initial WebGL context setup ───────────────────────────────────────
    // canvas.width/height are set inside initGl() BEFORE the GL context is
    // created, so there is no context-lost risk at init time.
    glRef.current = initGl(canvas)

    // ── ResizeObserver: recreate GL context on canvas size change ─────────
    // We MUST dispose the old context and create a new one because setting
    // canvas.width/canvas.height fires a WebGL context-lost event that makes
    // all future GL calls silent no-ops on the old context.
    const ro = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      glRef.current?.dispose()
      glRef.current = initGl(canvas)
      // Restart the rAF loop after reinitialising.
      rafRef.current = requestAnimationFrame(loop)
    })
    ro.observe(canvas)

    // ── requestAnimationFrame render loop ────────────────────────────────
    const loop = (): void => {
      const frame = frameRef.current
      if (frame && frame !== drawnRef.current) {
        drawnRef.current = frame
        glRef.current?.drawFrame(frame)
        if (!startedRef.current) {
          startedRef.current = true
          setStarted(true)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      glRef.current?.dispose()
      glRef.current    = null
      drawnRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      {displayCount > 1 && Array.from({ length: displayCount - 1 }, (_, i) => (
        <div
          key={i}
          className="display-boundary"
          style={{ left: `${((i + 1) / displayCount) * 100}%` }}
          aria-hidden="true"
        />
      ))}
      {!started && <span className="preview-empty">Starting virtual engine</span>}
    </div>
  )
}

