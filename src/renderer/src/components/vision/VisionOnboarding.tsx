import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import type { VisionInputHandle } from '../../hooks/useVisionInput'
import { playSfx } from '../../games/sfx'
import { bumpFunnel, markOnboarded } from '../../vision/onboarding'

// R246: the first-use gesture wizard — a 4-step funnel mounted by the
// assistant the first time it is enabled (and re-openable from Settings /
// the games hub). The steps are deliberately lightweight (the whole flow is
// well under the 3-minute budget; no forced timer — R136.4: nobody gets
// trapped in a wizard):
//
//   1. env precheck — raise a hand (handSeen), a 120px skeleton preview so
//      the user sees what the system sees, the capture acquire p95 line,
//      and a one-click mirror fix (left/right reversed is THE classic
//      first-run camera gotcha).
//   2. calibration — the same stepId/label/statusKey text the game banner
//      shows, inline, with the skip escape hatch.
//   3. three-gesture teaching — pinch / open-palm / chord-menu cards that
//      check off live from the 'vision-input' window bus + geom openness
//      (each completed gesture gets the R141-A confirm blip).
//   4. first task — open the LIGHT ring (chord thumb+index+middle), pick a
//      direction, pinch to apply: the value loop closed once, end to end.
//
// Esc skips from any step; skip AND completion both persist the onboarding
// flag (this component owns the write — the parent only unmounts). Funnel
// counters (opened/calDone/firstCmd) count once per run for diagnostics.

export type OnboardingStep = 'env' | 'cal' | 'gestures' | 'task' | 'done'

type GestureId = 'pinch' | 'palm' | 'menu'

/** Runtime event on the window bus (same widened shape the assistant reads). */
interface BusEvent { kind: string; key: string | null; down: boolean; name?: string; dir?: string }

/** MediaPipe 21-point bone graph (the VisionPad R136.2 set, reused 1:1). */
const HAND_BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const PREVIEW = 120
/** step-1 stability window — handSeen must hold this long before advancing
 *  (readable: the step text + skeleton deserve a beat before cal takes over) */
const ENV_SEEN_MS = 1500
/** open-palm confirmation window — MiniGamesView R138 params (700ms) trimmed. */
const PALM_HOLD_MS = 600
const PALM_POLL_MS = 100
/** default pinch release threshold (calibrated profile.pinchOff overrides). */
const PINCH_OFF_DEFAULT = 0.85

export function VisionOnboarding({ vision, lightApplyTick, onExit, onStepChange }: {
  vision: VisionInputHandle
  /** R246: bumps every time the assistant applied a light effect — step 4's signal */
  lightApplyTick: number
  /** completed=true | skipped=false; the flag is already persisted when this fires */
  onExit: (completed: boolean) => void
  /** the assistant suppresses its own bus consumers except during 'task' */
  onStepChange?: (step: OnboardingStep) => void
}): JSX.Element {
  const { t } = useI18n()
  const [step, setStep] = useState<OnboardingStep>('env')
  const [ges, setGes] = useState<Record<GestureId, boolean>>({ pinch: false, palm: false, menu: false })
  const [envStat, setEnvStat] = useState<{ p95: number | null; n: number }>({ p95: null, n: 0 })
  // funnel milestones count at most once per wizard run (double-active rerenders
  // must not inflate the diagnostics)
  const countedRef = useRef<{ cal: boolean; cmd: boolean }>({ cal: false, cmd: false })
  const palmSinceRef = useRef<number | null>(null)

  const stepRef = useRef(step)
  stepRef.current = step
  const gesRef = useRef(ges)
  gesRef.current = ges
  const visionRef = useRef(vision)
  visionRef.current = vision
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const onStepChangeRef = useRef(onStepChange)
  onStepChangeRef.current = onStepChange

  const exit = useCallback((completed: boolean) => {
    markOnboarded()
    onExitRef.current(completed)
  }, [])

  // the wizard was shown → funnel.opened (once per mount)
  useEffect(() => { bumpFunnel('opened') }, [])
  useEffect(() => { onStepChangeRef.current?.(step) }, [step])

  // step 1 → 2: a hand is in frame and STAYS ~1s — one flicker frame must not
  // skip the step the user is still reading (the hook already dampens loss)
  useEffect(() => {
    if (step !== 'env' || !vision.handSeen) return
    const id = window.setTimeout(() => setStep('cal'), ENV_SEEN_MS)
    return () => window.clearTimeout(id)
  }, [step, vision.handSeen])

  // step 2 → 3: the session reached active (calibration completed OR skipped —
  // both mean the user got through the stage, which is what the funnel measures)
  useEffect(() => {
    if (step !== 'cal' || vision.state !== 'active') return
    if (!countedRef.current.cal) {
      countedRef.current.cal = true
      bumpFunnel('calDone')
    }
    setStep('gestures')
  }, [step, vision.state])

  // step 3 card completions — pinch + chord-menu ride the window bus
  const markGesture = useCallback((g: GestureId) => {
    if (gesRef.current[g]) return
    playSfx('confirm') // R141-A: the recognition blip
    setGes((prev) => (prev[g] ? prev : { ...prev, [g]: true }))
  }, [])

  useEffect(() => {
    const onBus = (ev: Event): void => {
      const e = (ev as CustomEvent<BusEvent>).detail
      if (!e || stepRef.current !== 'gestures') return
      if (e.kind === 'pinch' && e.key === 'Space' && e.down) markGesture('pinch')
      else if (e.kind === 'chord' && e.name === 'menu') markGesture('menu')
    }
    window.addEventListener('vision-input', onBus)
    return () => window.removeEventListener('vision-input', onBus)
  }, [markGesture])

  // step 3 palm card — geom openness (pinch distance above the release
  // threshold) held for PALM_HOLD_MS; polled off React state, VisionPad-style
  useEffect(() => {
    const id = window.setInterval(() => {
      if (stepRef.current !== 'gestures' || gesRef.current.palm) return
      const f = visionRef.current.frameRef.current
      const pinch = f?.geom?.pinch ?? null
      const profile = (f?.profile ?? null) as { pinchOff?: unknown } | null
      const pinchOff = typeof profile?.pinchOff === 'number' ? profile.pinchOff : PINCH_OFF_DEFAULT
      const open = pinch != null && pinch > pinchOff
      const now = performance.now()
      if (open) {
        if (palmSinceRef.current != null && now - palmSinceRef.current >= PALM_HOLD_MS) markGesture('palm')
        else if (palmSinceRef.current == null) palmSinceRef.current = now
      } else {
        palmSinceRef.current = null
      }
    }, PALM_POLL_MS)
    return () => window.clearInterval(id)
  }, [markGesture])

  // step 3 → 4
  useEffect(() => {
    if (step === 'gestures' && ges.pinch && ges.palm && ges.menu) setStep('task')
  }, [step, ges])

  // step 4 → done: the light ring applied an effect (the assistant bumps the
  // tick from its wrapped onApplyLight — same path a real apply takes)
  useEffect(() => {
    if (step !== 'task' || lightApplyTick <= 0) return
    if (!countedRef.current.cmd) {
      countedRef.current.cmd = true
      bumpFunnel('firstCmd')
    }
    playSfx('levelup')
    setStep('done')
  }, [step, lightApplyTick])

  // Esc = skip, from any step (Escape elsewhere closes rings; here it ends the wizard)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') exit(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exit])

  // env telemetry line (~2Hz — statistical, like the banner coach)
  useEffect(() => {
    const id = window.setInterval(() => {
      const acquire = visionRef.current.frameRef.current?.stats?.acquire
      setEnvStat((prev) => {
        const next = { p95: acquire && acquire.n > 0 ? acquire.p95 : null, n: acquire?.n ?? 0 }
        return prev.p95 === next.p95 && prev.n === next.n ? prev : next
      })
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  const stepIndex = step === 'env' ? 0 : step === 'cal' ? 1 : step === 'gestures' ? 2 : step === 'task' ? 3 : 4
  const errKind = vision.error ? (vision.errorKind ?? 'generic') : null
  const calText = vision.state === 'calibrating' && vision.stepId
    ? `${t('games.vision.state.calibrating')} ${vision.stepId === 'center' ? '1' : vision.stepId === 'reach' ? '2' : '3'}/3 · ${t(`games.vision.hint.${vision.stepId}`)}`
    : vision.state === 'active' && !vision.handSeen
      ? t('games.vision.state.searching')
      : vision.label || t(`games.vision.state.${vision.state}`)

  return (
    <div className="vision-onboarding" data-step={step} role="dialog" aria-label={t('games.vision.ob.title')}>
      <div className="vision-ob-card">
        <div className="vision-ob-head">
          <span className="vision-ob-title">{t('games.vision.ob.title')}</span>
          <button type="button" className="vision-ob-skip" data-action="ob-skip" onClick={() => exit(false)}>
            {t('games.vision.ob.skip')} <kbd>Esc</kbd>
          </button>
        </div>
        <div className="vision-ob-steps" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < stepIndex ? 'done' : i === stepIndex ? 'cur' : ''} />
          ))}
        </div>

        {step === 'env' ? (
          <div className="vision-ob-body">
            <SkeletonPreview vision={vision} />
            <div className="vision-ob-copy">
              <p className="vision-ob-line">{t('games.vision.ob.envRaise')}</p>
              <p className="vision-ob-stat">
                {envStat.p95 == null ? t('games.vision.ob.envCamWait') : `${t('games.vision.acquireStat')} p95 ${Math.round(envStat.p95)}ms`}
              </p>
              <p className="vision-ob-q">{t('games.vision.ob.envMirrorQ')}</p>
              <button type="button" className="vision-ob-btn" data-action="ob-mirror" onClick={() => vision.setMirror(!vision.mirror)}>
                ⇄ {t('games.vision.ob.envMirrorBtn')} ({vision.mirror ? t('games.vision.mirrorOn') : t('games.vision.mirrorOff')})
              </button>
            </div>
          </div>
        ) : null}

        {step === 'cal' ? (
          <div className="vision-ob-body">
            <div className="vision-ob-copy">
              <p className="vision-ob-line">{calText}</p>
              <p className="vision-ob-stat">{t('games.vision.postureTip')}</p>
              {errKind ? (
                <p className="vision-ob-error" role="alert">
                  {t(`games.vision.err.${errKind}`)}
                  <button type="button" className="vision-ob-btn" onClick={() => void vision.enable().catch(() => undefined)}>
                    {t('games.vision.err.retry')}
                  </button>
                </p>
              ) : (
                <button type="button" className="vision-ob-skip" data-action="ob-skip-cal" onClick={vision.skipCalibration}>
                  {t('games.vision.skipCalibration')}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {step === 'gestures' ? (
          <div className="vision-ob-gestures">
            {(['pinch', 'palm', 'menu'] as const).map((g) => (
              <div key={g} data-gesture={g} className={`vision-ob-gcard${ges[g] ? ' done' : ''}`}>
                <span className="gname">{t(`games.vision.ob.gesture.${g}`)} {ges[g] ? <span className="tick">✓</span> : null}</span>
                <span className="ghow">{t(`games.vision.ob.gesture.${g}.how`)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {step === 'task' ? (
          <div className="vision-ob-body">
            <div className="vision-ob-copy">
              <p className="vision-ob-line">{t('games.vision.ob.taskHow')}</p>
              <p className="vision-ob-stat">{t('games.vision.lightHint')}</p>
              {errKind ? (
                <p className="vision-ob-error" role="alert">{t(`games.vision.err.${errKind}`)}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="vision-ob-done">
            <span className="vision-ob-check" aria-hidden="true">✓</span>
            <p className="vision-ob-line">{t('games.vision.ob.doneTitle')}</p>
            <p className="vision-ob-stat">{t('games.vision.ob.doneHint')}</p>
            <button type="button" className="vision-ob-btn" data-action="ob-finish" onClick={() => exit(true)}>
              {t('games.vision.ob.doneBtn')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** R246: 120px skeleton mini-preview — the VisionPad bone graph minus the
 *  compass/telemetry chrome, drawn by its own rAF loop reading frameRef
 *  (zero React re-renders; best-effort — never fails the wizard). */
function SkeletonPreview({ vision }: { vision: VisionInputHandle }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const visionRef = useRef(vision)
  visionRef.current = vision

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    const loop = () => {
      try {
        drawSkeleton(ctx, visionRef.current.frameRef.current?.pickedLandmarks ?? null)
      } catch {
        /* drawing is best-effort */
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={canvasRef} className="vision-ob-skeleton" width={PREVIEW} height={PREVIEW} aria-hidden="true" />
}

function drawSkeleton(ctx: CanvasRenderingContext2D, hand: Array<{ x: number; y: number }> | null): void {
  ctx.clearRect(0, 0, PREVIEW, PREVIEW)
  if (!hand || hand.length !== 21) {
    // placeholder: a dashed circle where the hand should appear
    ctx.strokeStyle = 'rgba(148,170,184,0.4)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.arc(PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 14, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    return
  }
  const px = (i: number) => 10 + hand[i].x * (PREVIEW - 20)
  const py = (i: number) => 10 + hand[i].y * (PREVIEW - 20)
  ctx.strokeStyle = 'rgba(103,232,249,0.4)'
  ctx.lineWidth = 1.5
  for (const [a, b] of HAND_BONES) {
    ctx.beginPath()
    ctx.moveTo(px(a), py(a))
    ctx.lineTo(px(b), py(b))
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(226,232,240,0.7)'
  for (let i = 0; i < 21; i++) {
    ctx.beginPath()
    ctx.arc(px(i), py(i), 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}
