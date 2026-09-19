import { useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import type { VisionInputHandle } from '../../hooks/useVisionInput'
import { envAdvice, type EnvAdvice } from '../../vision/envCoach'

// R136.2: big, immediate status banner across the top of the game canvas.
// Text rides React state (published INSTANTLY on state/handSeen/stepId
// changes by the hook — no 4Hz throttle); the calibration progress bar is
// driven by the pad-style rAF loop reading frameRef so it animates at
// display rate without re-renders. Includes the skip-calibration escape
// hatch (R136.4) — a frustrated first-time user should never be trapped.
//
// R141-B: posture guidance while calibrating (elbow supported — supported
// gestures measurably reduce fatigue) and the environment coach line
// (lighting / camera fps / distance advice from the pipeline telemetry).
export function VisionBanner({ vision }: { vision: VisionInputHandle }): JSX.Element {
  const { t } = useI18n()
  const barRef = useRef<HTMLDivElement | null>(null)
  const [advice, setAdvice] = useState<EnvAdvice>(null)
  const frameRef = vision.frameRef
  useEffect(() => {
    let raf = 0
    let lastCoachMs = 0
    const loop = () => {
      const now = performance.now()
      const bar = barRef.current
      if (bar) bar.style.width = `${Math.round(Math.min(1, Math.max(0, frameRef.current?.stepProgress ?? 0)) * 100)}%`
      // coach re-evaluates at ~1Hz — telemetry is statistical
      if (now - lastCoachMs >= 1000) {
        lastCoachMs = now
        const stats = frameRef.current?.stats as { acquire?: { p95: number; n: number }; cam?: { fps?: number } | null } | undefined
        const next = envAdvice({
          acquireP95: stats?.acquire?.p95,
          camFps: stats?.cam?.fps ?? undefined,
          handLost: vision.state === 'active' && !vision.handSeen,
          samples: stats?.acquire?.n ?? 0,
        })
        setAdvice((prev) => (prev === next ? prev : next))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [frameRef, vision.state, vision.handSeen])

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
        <span className="vision-banner-posture">{t('games.vision.postureTip')}</span>
      ) : null}
      {state === 'calibrating' ? (
        <button type="button" className="vision-banner-skip" onClick={vision.skipCalibration}>
          {t('games.vision.skipCalibration')}
        </button>
      ) : null}
      {advice ? <span className="vision-banner-advice">{t(`games.vision.env.${advice}`)}</span> : null}
      <div className="vision-banner-progress" aria-hidden="true"><div ref={barRef} /></div>
    </div>
  )
}
