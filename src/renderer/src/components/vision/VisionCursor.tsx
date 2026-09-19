import { useEffect, useRef, type JSX } from 'react'
import type { VisionInputHandle } from '../../hooks/useVisionInput'
import { createCursorState, cursorIntegrate, cursorSnapshot, type CursorState } from '../../vision/cursor'
import { fingerStates } from '../../vision/fingerChords.js'

// R142-L3 + R143: the relative-cursor overlay. Two clocks:
//  - SNAPSHOTS (inference rate) feed cursorSnapshot → local velocity + anchor
//  - EVERY DISPLAY FRAME runs cursorIntegrate (client-side prediction, netcode
//    style) so the cursor moves at 60fps even between snapshots — this is
//    what removes the stutter; the pipeline latency hides behind the integrator.
// Clutch is a sustained FIST (R143.2) — an open palm is the natural resting
// shape and must never freeze the cursor.
export function VisionCursor({ vision, wrapRef, stateRef, suppressClick }: { vision: VisionInputHandle; wrapRef: React.RefObject<HTMLDivElement | null>; stateRef?: React.RefObject<CursorState>; suppressClick?: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const localStateRef = useRef(createCursorState())
  const cursorRef = stateRef ?? localStateRef
  const pinchWasDownRef = useRef(false)
  const hoveredRef = useRef<Element | null>(null)
  const lastFrameRef = useRef<unknown>(null)

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
    let lastDraw = performance.now()
    const loop = () => {
      try {
        const now = performance.now()
        const dtSec = Math.min(0.05, (now - lastDraw) / 1000)
        lastDraw = now
        const frame = vision.frameRef.current
        // feed the authoritative snapshot only when it CHANGED (per-inference)
        if (frame != null && frame !== lastFrameRef.current) {
          lastFrameRef.current = frame
          const geom = frame.geomPredicted ?? frame.geom
          const lm = frame.pickedLandmarks
          let fist = false
          if (geom != null && Array.isArray(lm) && lm.length === 21) {
            const f = fingerStates(lm as Array<{ x: number; y: number; z: number }>)
            fist = !f.thumb && !f.index && !f.middle && !f.ring && !f.pinky
          }
          cursorSnapshot(cursorRef.current, geom ? geom.palm : null, fist, now)
        }
        // display-rate prediction — every frame, snapshot or not
        cursorIntegrate(cursorRef.current, dtSec)
        const s = cursorRef.current

        // draw
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

        // click on pinch rising edge while hovering (R143.4: suppressible)
        const pinchDown = vision.heldRef.current.has('space')
        if (!suppressClick && pinchDown && !pinchWasDownRef.current && inWrap && interactive) {
          ;(interactive as HTMLElement).click()
        }
        pinchWasDownRef.current = pinchDown
      } catch {
        // never take the app down for cursor drawing
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      hoveredRef.current?.classList?.remove('vision-hover')
    }
  }, [vision.frameRef, vision.heldRef, wrapRef, suppressClick])

  return <canvas ref={canvasRef} className="vision-cursor" aria-hidden="true" />
}
