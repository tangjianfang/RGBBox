import { useEffect, useRef, type JSX, type RefObject } from 'react'
import type { EffectLayer, RgbFrame } from '../../../shared/types'
import { is3DEffect } from '../../../shared/types'
import { EFFECT3D_CHANNEL, Effect3DGl } from '../gl/effect3dGl'
import { startFrameDriver, stopFrameDriver } from '../domain/frameDriver'
import { createDrive3D, feedDrive3D, modulateParams3D } from '../gl/audioDrive3d'
import type { AudioData } from '../hooks/useAudioAnalyzer'
import type { Effect3DKind } from '../../../shared/types'

interface Preview3DProps {
  /** The active 3D effect layer. Re-mounts the WebGL context when kind changes. */
  layer: EffectLayer
  /** R271: hover 预览期间 3D 帧不 postMessage 到 overlay 通道(worker 路径同款防护)。 */
  suppressOverlayPost?: boolean
  /** LED grid width — used for readLEDs sampling. */
  columns: number
  /** LED grid height — used for readLEDs sampling. */
  rows: number
  /**
   * R287: 灯效音频引擎同源数据(App 的 useAudioAnalyzer ref,60Hz)。
   * 每帧读取 {active, beat, level} 做 u_params 调制——节拍加速/色相跳跃/
   * 响度提亮;音频关/静音时驱动=0,行为与现状逐位一致。不传则完全不调制。
   */
  audioRef?: RefObject<AudioData | null>
  /**
   * Called once per rendered frame with sampled LED colors.
   * The caller stores this in a ref and pushes it to overlay windows.
   */
  onFrame: (frame: RgbFrame) => void
  /**
   * R61: aspect ratio (width/height) the preview box should be locked to —
   * see the matching prop on `PreviewGrid` for the full rationale (the real
   * overlay output always matches the physical target display's aspect
   * ratio, so a hardcoded 16:9 preview box looks visibly distorted relative
   * to the real output on any non-16:9 display). Defaults to 16/9.
   */
  aspectRatio?: number
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
export function Preview3D({ layer, suppressOverlayPost = false, columns, rows, onFrame, aspectRatio = 16 / 9, audioRef }: Preview3DProps): JSX.Element {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null)
  const glRef      = useRef<Effect3DGl | null>(null)
  const rafRef     = useRef<number | null>(null)
  // R287: 音频驱动包络状态(节拍脉冲),帧循环独占,不进 React 状态
  const driveRef   = useRef(createDrive3D())
  const audioInRef = useRef(audioRef)
  audioInRef.current = audioRef
  // R271: overlay 投递抑制(loop 每帧读 ref)
  const suppressOverlayPostRef = useRef(suppressOverlayPost)
  useEffect(() => { suppressOverlayPostRef.current = suppressOverlayPost }, [suppressOverlayPost])
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
        // R287: 音频调制 u_params(纯 JS 侧,零 GLSL)——广播携带调制后值,
        // overlay 窗(参数透传)自动随拍。音频关 → 驱动 0 → 恒等返回。
        const ad = audioInRef.current?.current ?? null
        const pulse = feedDrive3D(driveRef.current, ad && ad.active ? ad : null, performance.now())
        const driven = modulateParams3D(params, { pulse, energy: ad && ad.active ? ad.level : 0 })
        gl.draw(t, driven, detail, extra)
        if (!suppressOverlayPostRef.current) channel.postMessage({ kind: layerRef.current.kind as Effect3DKind, t, params: driven, detail, extra })
        const pixels = gl.readLEDs(colsRef.current, rowsRef.current)
        onFrameRef.current({ columns: colsRef.current, rows: rowsRef.current, pixels, generatedAt: Date.now() })
        // R270: rAF 改 setTimeout 自调度——最小化/遮挡时 rAF 停摆,overlay 激活的
        // 3D 帧曾冻在最后一帧(R42.5 旧账);与 useEngineLoop R147 P2 同哲学。
        rafRef.current = startFrameDriver(loop)
      }
      rafRef.current = startFrameDriver(loop)
    }

    if (glRef.current) startLoop()

    /* Reinitialise on canvas resize (e.g., window resize). */
    const ro = new ResizeObserver(() => {
      stopFrameDriver(rafRef.current)
      glRef.current?.dispose()
      glRef.current = null
      const newGl = initGl()
      glRef.current = newGl
      if (newGl) startLoop()
    })
    ro.observe(canvas)

    return () => {
      stopFrameDriver(rafRef.current)
      ro.disconnect()
      channel.close()
      glRef.current?.dispose()
      glRef.current = null
    }
  // Re-mount when the effect kind changes; parameter changes update via layerRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer.kind])

  return (
    <div className="preview-frame" style={{ aspectRatio }}>
      <canvas ref={canvasRef} className="preview-3d" aria-label="3D RGB preview" />
    </div>
  )
}
