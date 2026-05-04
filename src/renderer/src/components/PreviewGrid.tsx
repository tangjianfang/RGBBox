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
  /** When a ripple layer is active, called with normalised (0..1) click coordinates. */
  onRippleClick?: (nx: number, ny: number) => void
}

export function PreviewGrid({ frameRef, onRippleClick }: PreviewGridProps): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null)
  const glRef      = useRef<PreviewGl | null>(null)
  const rafRef     = useRef<number | null>(null)
  const drawnRef   = useRef<RgbFrame | null>(null)  // last frame actually drawn
  const [started, setStarted] = useState(false)     // shown-once: "starting" overlay

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Resize handling ──────────────────────────────────────────────────
    const applySize = (): void => {
      const pr = window.devicePixelRatio || 1
      const w  = Math.floor(canvas.offsetWidth  * pr)
      const h  = Math.floor(canvas.offsetHeight * pr)
      if (canvas.width === w && canvas.height === h) return
      canvas.width  = w
      canvas.height = h
      glRef.current?.resize(w, h)
    }
    applySize()
    const ro = new ResizeObserver(applySize)
    ro.observe(canvas)

    // ── WebGL renderer ───────────────────────────────────────────────────
    let gl: PreviewGl | null = null
    try {
      gl = new PreviewGl(canvas)
      glRef.current = gl
    } catch (err) {
      console.warn('[PreviewGrid] WebGL unavailable:', err)
    }

    // ── requestAnimationFrame render loop ────────────────────────────────
    // Reads frameRef.current on every vsync — completely bypasses React.
    const loop = (): void => {
      const frame = frameRef.current
      if (frame && frame !== drawnRef.current) {
        drawnRef.current = frame
        glRef.current?.drawFrame(frame)
        if (!started) setStarted(true)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      glRef.current?.dispose()
      glRef.current  = null
      drawnRef.current = null
    }
  // frameRef is a stable object; eslint-disable is intentional here.
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
      {!started && <span className="preview-empty">Starting virtual engine</span>}
    </div>
  )
}

