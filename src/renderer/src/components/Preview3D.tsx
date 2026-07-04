import { useEffect, useRef, type JSX } from 'react'
import type { EffectLayer, RgbFrame } from '../../../shared/types'
import { is3DEffect } from '../../../shared/types'
import { EFFECT3D_CHANNEL, Effect3DGl } from '../gl/effect3dGl'
import type { Effect3DKind } from '../../../shared/types'

interface Preview3DProps {
  /** The active 3D effect layer. Re-mounts the WebGL context when kind changes. */
  layer: EffectLayer
  /** LED grid width — used for readLEDs sampling. */
  columns: number
  /** LED grid height — used for readLEDs sampling. */
  rows: number
  /**
   * Called once per rendered frame with sampled LED colors.
   * The caller stores this in a ref and pushes it to overlay windows.
   */
  onFrame: (frame: RgbFrame) => void
}

/**
 * Full-canvas WebGL preview for 3D lighting effects.
 *
 * Renders a GLSL raymarching shader at the canvas's native pixel resolution.
 * After each frame, samples the rendered image at LED grid positions via
 * readPixels and reports the result through `onFrame`, so physical overlays
 * receive the correct colors without any CPU-side per-pixel loop.
 *
 * Replaces PreviewGrid when `is3DEffect(layer.kind)` is true.
 */
export function Preview3D({ layer, columns, rows, onFrame }: Preview3DProps): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null)
  const glRef      = useRef<Effect3DGl | null>(null)
  const rafRef     = useRef<number | null>(null)
  const startRef   = useRef(performance.now())

  /* Stable refs so the rAF loop always reads the latest values without needing
   * to be recreated when parameters or the onFrame callback change. */
  const layerRef   = useRef(layer)
  layerRef.current = layer
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const colsRef    = useRef(columns)
  colsRef.current  = columns
  const rowsRef    = useRef(rows)
  rowsRef.current  = rows

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !is3DEffect(layer.kind)) return

    const pr = window.devicePixelRatio || 1
    // R36: broadcast this effect's live uniforms so any open overlay window
    // can render the identical raymarched scene at its own full resolution
    // instead of the readLEDs()-downsampled LED grid (see effect3dGl.ts).
    const channel = new BroadcastChannel(EFFECT3D_CHANNEL)

    /** Initialise (or re-initialise) the WebGL context. */
    const initGl = (): Effect3DGl | null => {
      const w = Math.floor(canvas.offsetWidth  * pr)
      const h = Math.floor(canvas.offsetHeight * pr)
      if (!w || !h) return null
      canvas.width  = w
      canvas.height = h
      try {
        return new Effect3DGl(canvas, layer.kind as Effect3DKind)
      } catch (err) {
        console.warn('[Preview3D] WebGL init failed:', err)
        return null
      }
    }

    glRef.current = initGl()

    /** Core render loop. */
    const startLoop = (): void => {
      const loop = (): void => {
        const gl = glRef.current
        if (!gl) return
        const t   = (performance.now() - startRef.current) / 1000
        const p   = layerRef.current.parameters
        const params: [number, number, number, number] = [
          (p.speed     as number) ?? 0.5,
          (p.hueShift  as number) ?? 0,
          (p.intensity as number) ?? 1,
          (p.density   as number) ?? 0.5,
        ]
        const detail: [number, number, number, number] = [
          (p.gridDensity       as number) ?? 0.5,
          (p.scanSpeed         as number) ?? 1,
          (p.particleIntensity as number) ?? 1,
          (p.glitchAmount      as number) ?? 0,
        ]
        const extra: [number, number, number, number] = [
          (p.flickerAmount as number) ?? 0.35,
          (p.hologramDepth as number) ?? 0.5,
          (p.saturation    as number) ?? 1,
          (p.scanWidth     as number) ?? 0.5,
        ]
        gl.draw(t, params, detail, extra)
        channel.postMessage({ kind: layerRef.current.kind as Effect3DKind, t, params, detail, extra })
        const pixels = gl.readLEDs(colsRef.current, rowsRef.current)
        onFrameRef.current({ columns: colsRef.current, rows: rowsRef.current, pixels, generatedAt: Date.now() })
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    if (glRef.current) startLoop()

    /* Reinitialise on canvas resize (e.g., window resize). */
    const ro = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      glRef.current?.dispose()
      glRef.current = null
      const newGl = initGl()
      glRef.current = newGl
      if (newGl) startLoop()
    })
    ro.observe(canvas)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      channel.close()
      glRef.current?.dispose()
      glRef.current = null
    }
  // Re-mount when the effect kind changes; parameter changes update via layerRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.kind])

  return (
    <div className="preview-frame">
      <canvas ref={canvasRef} className="preview-3d" aria-label="3D RGB preview" />
    </div>
  )
}
