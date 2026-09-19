import { useEffect, useRef, type JSX } from 'react'
import type { VisionInputHandle } from '../../hooks/useVisionInput'
import { createCursorState, cursorStep, type CursorState } from '../../vision/cursor'

// R142-L3: the relative-cursor overlay — a display-rate rAF loop advances the
// cursor from the PREDICTED palm (frameRef, never throttled), draws a dot +
// ring over the game canvas, hit-tests interactive elements for a hover
// highlight, and CLICKS the hovered element on the rising edge of a pinch.
// Zero React re-renders; the game loop never sees this work.
export function VisionCursor({ vision, wrapRef, stateRef }: { vision: VisionInputHandle; wrapRef: React.RefObject<HTMLDivElement | null>; stateRef?: React.RefObject<CursorState> }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const localStateRef = useRef(createCursorState())
  const cursorRef = stateRef ?? localStateRef
  const pinchWasDownRef = useRef(false)
  const hoveredRef = useRef<Element | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const setHover = (el: Element | null) => {
      if (hoveredRef.current === el) return
      hoveredRef.current?.classList?.remove('vision-hover')
      hoveredRef.current = el
      el?.classList?.add('vision-hover')
    }

    let raf = 0
    const loop = () => {
      try {
        const now = performance.now()
        const frame = vision.frameRef.current
        const geom = frame?.geomPredicted ?? frame?.geom
        const pinchOff = (frame?.profile?.pinchOff as number | undefined) ?? 0.85
        const openPalm = geom != null && geom.pinch > pinchOff
        const s = cursorStep(cursorRef.current, geom ? geom.palm : null, openPalm, now)

        // draw (overlay-sized canvas, cleared per frame)
        const rect = wrap.getBoundingClientRect()
        if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
          canvas.width = Math.max(1, Math.round(rect.width))
          canvas.height = Math.max(1, Math.round(rect.height))
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const px = s.x * canvas.width
        const py = s.y * canvas.height
        ctx.strokeStyle = s.frozen ? 'rgba(251,191,36,0.9)' : 'rgba(103,232,249,0.9)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, s.frozen ? 14 : 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = s.frozen ? '#fbbf24' : '#67e8f9'
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()

        // hover: interactive elements under the cursor inside this wrap
        const el = document.elementFromPoint(rect.left + px, rect.top + py)
        const interactive = el?.closest?.('button, a[href], input, select, [role="button"]') ?? null
        const inWrap = interactive != null && wrap.contains(interactive)
        setHover(inWrap ? interactive : null)

        // click on pinch rising edge while hovering
        const pinchDown = vision.heldRef.current.has('space')
        if (pinchDown && !pinchWasDownRef.current && inWrap && interactive) {
          ;(interactive as HTMLElement).click()
        }
        pinchWasDownRef.current = pinchDown
      } catch {
        // never take the game down for cursor drawing
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      hoveredRef.current?.classList?.remove('vision-hover')
    }
  }, [vision.frameRef, vision.heldRef, wrapRef])

  return <canvas ref={canvasRef} className="vision-cursor" aria-hidden="true" />
}
