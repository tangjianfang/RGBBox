import { useEffect, useRef, type JSX } from 'react'
import { PreviewGl } from '../gl/previewGl'
import { useI18n } from '../i18n'
import type { Profile, RgbFrame } from '../../../shared/types'

/**
 * R74: fullscreen light-effect screensaver window (route `?screensaver=1`).
 *
 * Renders "the effect the user configured" — the last SAVED working profile
 * (profileStore's active profile, same thing `getDefaultProfile` returns) —
 * through the exact same pure engine call (`renderPreviewFrame`) and GL
 * renderer (`PreviewGl`, smooth style) the overlays use, so the screensaver
 * looks identical to the workspace projection. Runs at 30fps: the engine
 * computes a columns×rows grid, which is cheap, and the poll in the main
 * process closes this window within seconds of real user input.
 *
 * Exit paths: ESC (handled in the main process's before-input-event), any
 * click here, or the system idle timer resetting (main-process poll closes
 * the windows). Windows' secure lock screen cannot be replaced by any app —
 * this is the documented equivalent behaviour (see PRD R74).
 */

const FPS = 30

export function ScreensaverView(_props: { displayId: number }): JSX.Element {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    let gl: PreviewGl | null = null
    let ctx2d: CanvasRenderingContext2D | null = null
    let frameTimer: number | null = null

    const fit = (): void => {
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round((canvas.clientWidth || window.innerWidth) * dpr))
      const h = Math.max(1, Math.round((canvas.clientHeight || window.innerHeight) * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
    }

    const initGl = (): void => {
      try {
        // Opaque fullscreen → the same `overlay=false` rendering path as the
        // in-app preview panel and fullscreen overlays (R65).
        gl = new PreviewGl(canvas, false)
      } catch {
        gl = null
        ctx2d = canvas.getContext('2d')
      }
    }

    fit()
    initGl()

    // 2D fallback: paint the grid cells directly (no WebGL available).
    const draw2d = (frame: RgbFrame): void => {
      if (!ctx2d) return
      const cw = canvas.width / frame.columns
      const ch = canvas.height / frame.rows
      for (let y = 0; y < frame.rows; y++) {
        for (let x = 0; x < frame.columns; x++) {
          const p = (y * frame.columns + x) * 3
          ctx2d.fillStyle = `rgb(${frame.pixels[p]},${frame.pixels[p + 1]},${frame.pixels[p + 2]})`
          ctx2d.fillRect(Math.floor(x * cw), Math.floor(y * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1)
        }
      }
    }

    const draw = (frame: RgbFrame): void => {
      if (gl) {
        gl.setRenderStyle(frame.renderStyle ?? 'smooth')
        gl.setGap((frame.showGap ?? false) ? 0.06 : 0)
        gl.setFit(frame.regionFit ?? 'stretch')
        gl.drawFrame(frame)
      } else {
        draw2d(frame)
      }
    }

    void window.rgbbox.getDefaultProfile().then((profile: Profile) => {
      if (disposed) return
      frameTimer = window.setInterval(() => {
        void window.rgbbox.renderPreviewFrame(profile).then(draw).catch(() => { /* skip frame */ })
      }, 1000 / FPS)
    }).catch(() => { /* no profile → stay dark; main closes on activity */ })

    const ro = new ResizeObserver(() => {
      fit()
      // Resize fires a WebGL context-lost; recreate like OverlayCanvas does.
      gl?.dispose()
      gl = null
      initGl()
    })
    ro.observe(canvas)

    return () => {
      disposed = true
      if (frameTimer != null) window.clearInterval(frameTimer)
      ro.disconnect()
      gl?.dispose()
      gl = null
    }
  }, [])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#05080a', cursor: 'none' }}
      onClick={() => window.close()}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '4px 14px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.55)',
        color: 'rgba(255,255,255,0.75)',
        fontSize: '0.75rem',
        pointerEvents: 'none',
        animation: 'overlayHintFade 3s ease 1.5s forwards',
        whiteSpace: 'nowrap'
      }}>
        {t('overlay.hint')}
      </div>
    </div>
  )
}
