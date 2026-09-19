import { useEffect, useRef, type JSX } from 'react'
import { useI18n } from '../../i18n'
import type { VisionInputHandle } from '../../hooks/useVisionInput'

// R136.2: big, immediate status banner across the top of the game canvas.
// Text rides React state (published INSTANTLY on state/handSeen/stepId
// changes by the hook — no 4Hz throttle); the calibration progress bar is
// driven by the pad-style rAF loop reading frameRef so it animates at
// display rate without re-renders. Includes the skip-calibration escape
// hatch (R136.4) — a frustrated first-time user should never be trapped.
export function VisionBanner({ vision }: { vision: VisionInputHandle }): JSX.Element {
  const { t } = useI18n()
  const barRef = useRef<HTMLDivElement | null>(null)
  const frameRef = vision.frameRef
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const bar = barRef.current
      if (bar) bar.style.width = `${Math.round(Math.min(1, Math.max(0, frameRef.current?.stepProgress ?? 0)) * 100)}%`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [frameRef])

  const state = vision.state
  const kind = state === 'active' ? (vision.handSeen ? 'active' : 'lost') : state
  const text = state === 'calibrating' && vision.stepId
    ? `${t('games.vision.state.calibrating')} ${vision.stepId === 'center' ? '1' : vision.stepId === 'reach' ? '2' : '3'}/3 · ${t(`games.vision.hint.${vision.stepId}`)}`
    : state === 'active' && !vision.handSeen
      ? t('games.vision.state.searching')
      : vision.label || t(`games.vision.state.${state}`)

  return (
    <div className={`vision-banner ${kind}`} role="status">
      <span className="vision-banner-dot" aria-hidden="true" />
      <span className="vision-banner-text">{text}</span>
      {state === 'calibrating' ? (
        <button type="button" className="vision-banner-skip" onClick={vision.skipCalibration}>
          {t('games.vision.skipCalibration')}
        </button>
      ) : null}
      <div className="vision-banner-progress" aria-hidden="true"><div ref={barRef} /></div>
    </div>
  )
}
