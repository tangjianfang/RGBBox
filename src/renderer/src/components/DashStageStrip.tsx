import { useEffect, useRef, type JSX } from 'react'
import { renderEffectPixel } from '../../../engine/effects'
import { is3DEffect, type EffectKind, type EffectLayer } from '../../../shared/types'
import { cardFpsForMode, shouldDrawCardFrame, type CardPerformanceMode } from '../domain/cardAnimation'

/**
 * R303: 仪表盘「灯效舞台条」——当前灯效的实时颜色带（Hero）。
 *
 * 用 renderEffectPixel 在 64×8 的宽幅网格上直渲当前效果（与效果库 CPU 卡
 * 同款调用先例），LED 格 1px gap；运行中按 performanceMode 走 R301 时间门
 * 节流（缩略图级帧率足够——它是环境身份指示，不是保真预览）；暂停 = 定格
 * 压暗；3D kind 无 CPU case（R292 已删，直渲会落入 default 泛用动画冒充
 * 3D 效果）→ 静态暗台兜底，身份由读数行的效果名承担。
 *
 * 舞台条独立于 useEngineLoop 的 worker 管道（R42 引擎门不动），也不进
 * 效果库的可见卡计数——它是仪表盘上的单一元素。
 */

const COLS = 64
const ROWS = 8
const CELL = 10 // backing px per cell
const GAP = 1 // LED gap
const W = COLS * CELL // 640
const H = ROWS * CELL // 80
/** 舞台底色 = tokens.css --stage-bg 的字面量（canvas 读不到 CSS 变量；卡片侧 #080d11 同款先例）。 */
const STAGE_BG = '#0a0f13'

export interface DashStageStripProps {
  kind: EffectKind
  parameters: EffectLayer['parameters']
  running: boolean
  performanceMode?: CardPerformanceMode
}

export function DashStageStrip({ kind, parameters, running, performanceMode }: DashStageStripProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    canvas.width = W
    canvas.height = H

    const layer: EffectLayer = {
      id: 'dash-stage',
      name: 'stage',
      kind,
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      parameters
    }

    const drawFrame = (t: number, dim: boolean): void => {
      ctx.fillStyle = STAGE_BG
      ctx.fillRect(0, 0, W, H)
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = renderEffectPixel(layer, { x, y, columns: COLS, rows: ROWS, now: t })
          ctx.fillStyle = dim
            ? `rgb(${(c.r * 0.3) | 0},${(c.g * 0.3) | 0},${(c.b * 0.3) | 0})`
            : `rgb(${c.r},${c.g},${c.b})`
          ctx.fillRect(x * CELL, y * CELL, CELL - GAP, CELL - GAP)
        }
      }
    }

    // 3D kind：静态暗台（诚实兜底，见组件 docblock）
    if (is3DEffect(kind)) {
      drawFrame(0, true)
      return undefined
    }

    // 暂停：定格压暗一帧
    if (!running) {
      drawFrame(0, true)
      return undefined
    }

    const fps = cardFpsForMode(performanceMode ?? 'balanced')
    const start = performance.now()
    let lastDraw = 0
    const draw = (): void => {
      const wall = performance.now()
      if (!shouldDrawCardFrame(lastDraw, wall, fps, 1)) {
        animRef.current = requestAnimationFrame(draw)
        return
      }
      lastDraw = wall
      drawFrame((wall - start) / 1000, false)
      animRef.current = requestAnimationFrame(draw)
    }
    animRef.current = requestAnimationFrame(draw)
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    }
  }, [kind, parameters, running, performanceMode])

  return <canvas ref={canvasRef} className="dash-stage-strip" aria-hidden="true" />
}
