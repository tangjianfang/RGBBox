import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import { isViewReachable, type View } from '../../hooks/tabNavigation'
import { CARD_VIEWS, getTabMeta } from '../shellModules'
import { useVisionInput } from '../../hooks/useVisionInput'
import { useGestureLightingDomain } from '../../hooks/domains/useGestureLightingDomain'
import type { EffectKind, EffectLayer } from '../../../../shared/types'
import { VisionCursor } from './VisionCursor'
import { VisionLightControl } from './VisionLightControl'
import { VisionOnboarding, type OnboardingStep } from './VisionOnboarding'
import { createCursorState } from '../../vision/cursor'
import {
  isOnboarded, readFunnel, ONBOARDING_RESET_EVENT,
} from '../../vision/onboarding'

// R140 P1 / R142-E4b: the app-wide gesture assistant. Owns its OWN vision
// host lifecycle (the hidden window is single-instance in main; when the
// games view is open its hook owns it — the assistant stays off there), and
// mounts the relative cursor over the WHOLE window: hover highlight + pinch
// click (VisionCursor), finger-chord commands, and the 8-direction radial
// quick menu for view navigation. Explicit mode only (anti-Midas-touch):
// a floating toggle pill + a full-window badge while active.

const ASSISTANT_KEY = 'rgbbox:visionAssistant'

/**
 * R243: radial slots are DATA-DRIVEN — dashboard + every reachable CARD_VIEW
 * (the hardcoded 8-slot list silently went stale as modules were added).
 * The ring supports 8 directions; extras fall into the '·' placeholder slots.
 */
function radialSlots(model3dEnabled: boolean): Array<{ view: View | null }> {
  const views: View[] = ['workspace', 'diagnostics', 'dashboard',
    ...CARD_VIEWS.filter((v) => v !== 'workspace' && v !== 'diagnostics' && isViewReachable(v, model3dEnabled))]
  const seen = new Set<View>()
  const uniq = views.filter((v) => !seen.has(v) && seen.add(v))
  return [...uniq.map((view) => ({ view })),
    ...Array.from({ length: Math.max(0, 8 - uniq.length) }, () => ({ view: null }))]
}

export function VisionAssistant({ activeView, onNavigate, rootRef, curatedKinds = [], onApplyLight = () => {}, model3dEnabled = false, selectedLayer = null, onUpdateLightLayer = () => {} }: {
  activeView: View
  onNavigate: (view: View) => void
  rootRef: React.RefObject<HTMLElement | null>
  /** R229: curated effect kinds for the LIGHT ring (favorites + recents first) */
  curatedKinds?: EffectKind[]
  /** R229: apply a light effect from the ring (no view switch) */
  onApplyLight?: (kind: EffectKind) => void
  /** R243: module reachability for the radial slots (same source as the rail) */
  model3dEnabled?: boolean
  /** R247: the live selected layer — brightness-param resolution + undo prev-kind */
  selectedLayer?: EffectLayer | null
  /** R247: live parameter writes for continuous brightness adjust */
  onUpdateLightLayer?: (patch: Partial<EffectLayer>) => void
}): JSX.Element {
  const { t } = useI18n()
  const vision = useVisionInput()
  const cursorStateRef = useRef(createCursorState())
  // R243: slots follow module reachability (e.g. model3d off → slot dims out)
  const MENU_SLOTS = radialSlots(model3dEnabled)
  const [assistantOn, setAssistantOn] = useState(() => {
    try { return localStorage.getItem(ASSISTANT_KEY) === '1' } catch { return false }
  })
  const [menuOpen, setMenuOpen] = useState(false)
  // R229: light-ring open state — the cursor must not click through it
  const [lightOpen, setLightOpen] = useState(false)
  const [menuSel, setMenuSel] = useState(4) // default highlight: left = effects
  const [textMode, setTextMode] = useState(false)
  const [trainer, setTrainer] = useState<{ phrase: string; pos: number; hits: number; misses: number } | null>(null)
  const [typed, setTyped] = useState('')
  // R246: first-use onboarding — open until completed/skipped once; the
  // Settings「重看」entry + games hub re-arm it via the reset event.
  const [onboardOpen, setOnboardOpen] = useState(() => !isOnboarded())
  const [onboardStep, setOnboardStep] = useState<OnboardingStep | null>(null)
  const [lightApplyTick, setLightApplyTick] = useState(0)
  const onboardActive = assistantOn && activeView !== 'games' && onboardOpen
  const onboardRef = useRef(onboardActive)
  onboardRef.current = onboardActive

  const TRAIN_PHRASE = 'the quick brown fox'

  // R247: 灯效环 v2 domain — brightness adjust / freeze / undo. Same mode gate
  // as the light ring itself (assistant on, vision live, outside games), plus
  // the two competing gesture UIs (radial menu picks, chord text typing)
  // suspend it so their pinch/palm vocabulary is never double-consumed.
  const gesture = useGestureLightingDomain({
    enabled: assistantOn && vision.enabled && activeView !== 'games' && !menuOpen && !textMode,
    selectedLayer,
    selectEffect: onApplyLight,
    updateSelectedLayer: onUpdateLightLayer,
    curatedKinds,
    frameRef: vision.frameRef,
    setPaused: vision.setPaused,
  })

  const toggleTextMode = useCallback(() => {
    setTextMode((on) => {
      const next = !on
      vision.setChordTextMode(next)
      if (!next) { setTyped(''); setTrainer(null) }
      else setTrainer({ phrase: TRAIN_PHRASE, pos: 0, hits: 0, misses: 0 })
      return next
    })
  }, [vision])

  const toggle = useCallback(() => {
    setAssistantOn((on) => {
      const next = !on
      try { localStorage.setItem(ASSISTANT_KEY, next ? '1' : '0') } catch { /* non-fatal */ }
      if (!next) vision.disable()
      return next
    })
  }, [vision])

  // R246: wrap the apply callback so the wizard's step 4 learns a light was
  // applied through the exact same path a real apply takes (tick = counter).
  const applyLight = useCallback((kind: EffectKind) => {
    onApplyLight(kind)
    setLightApplyTick((n) => n + 1)
  }, [onApplyLight])

  // the wizard persists the flag itself; the assistant just closes + re-arms
  const exitOnboarding = useCallback(() => {
    setOnboardOpen(false)
    setOnboardStep(null)
  }, [])

  // Settings「重看体感向导」/ games hub → re-open the wizard (same window, so
  // the storage event never fires — the reset event is the poke)
  useEffect(() => {
    const onReset = (): void => setOnboardOpen(true)
    window.addEventListener(ONBOARDING_RESET_EVENT, onReset)
    return () => window.removeEventListener(ONBOARDING_RESET_EVENT, onReset)
  }, [])

  // enable the pipeline when the assistant is on (and we're outside games,
  // where the games view owns the host)
  useEffect(() => {
    if (!assistantOn || activeView === 'games') return
    if (!vision.enabled) void vision.enable().catch((err) => console.warn('[vision]', err))
  }, [assistantOn, activeView, vision.enabled, vision.enable])

  // off inside the games view — the games hook owns the lifecycle there
  useEffect(() => {
    if (activeView === 'games' && vision.enabled) vision.disable()
  }, [activeView, vision.enabled, vision.disable])

  // R227.5: the camera follows window visibility — minimized/hidden-to-tray
  // must NEVER keep the camera + 60Hz inference running (privacy + battery:
  // the camera light staying on while the window is gone was a P0). The
  // main process pushes definitive visibility (R43 mainWindowVisibilityChanged
  // — the Page Visibility API is unreliable after R38's occlusion tweaks).
  // On return, the enable-effect above restores the session if still wanted.
  useEffect(() => {
    if (typeof window.rgbbox?.onMainWindowVisibilityChanged !== 'function') return
    return window.rgbbox.onMainWindowVisibilityChanged((visible) => {
      if (!visible && vision.enabled) vision.disable()
    })
  }, [vision.enabled, vision.disable])

  // chord + direction bindings (window bus — the events carry all kinds)
  useEffect(() => {
    if (!vision.enabled) return
    const onVisionEvent = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ kind: string; key: string | null; name?: string; down: boolean; dir?: string }>).detail
      if (!detail) return
      // R246: while the onboarding wizard is open it owns the gesture space —
      // no radial/back/pinch-confirm behind the overlay (the light ring alone
      // stays live, and only for the wizard's own task step)
      if (onboardRef.current) return
      if (detail.kind === 'chord' && detail.name === 'menu') setMenuOpen((open) => !open)
      else if (textMode && detail.kind === 'chord' && detail.name?.startsWith('char:')) {
        const ch = detail.name.slice(5)
        setTyped((t) => t + ch)
        // insert into a focused text field if there is one
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const start = el.selectionStart ?? el.value.length
          el.value = el.value.slice(0, start) + ch + el.value.slice(el.selectionEnd ?? start)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        setTrainer((tr) => {
          if (!tr) return tr
          const want = tr.phrase[tr.pos]
          if (want === ch) return { ...tr, pos: tr.pos + 1, hits: tr.hits + 1 }
          return { ...tr, misses: tr.misses + 1 }
        })
      }
      else if (detail.kind === 'chord' && detail.name === 'back') {
        setMenuOpen(false)
        onNavigate('dashboard')
      } else if (menuOpen && detail.kind === 'pinch' && detail.key === 'Space' && detail.down) {
        // R143.4: event-driven confirm (cursor clicks suppressed while open)
        const slot = MENU_SLOTS[menuSel].view
        setMenuOpen(false)
        if (slot) onNavigate(slot)
      } else if (menuOpen && detail.kind === 'direction' && detail.down && detail.dir) {
        const idx = DIR_INDEX[detail.dir]
        if (idx != null) setMenuSel(idx)
      }
    }
    window.addEventListener('vision-input', onVisionEvent)
    return () => window.removeEventListener('vision-input', onVisionEvent)
  }, [vision.enabled, menuOpen, menuSel, onNavigate])

  // R246: E2E seam (the games __rgbboxVision / AI-lab __rgbboxVisionLab
  // precedent) — verification scripts run the camera-free synthetic pipeline
  // through the assistant and read the onboarding funnel from outside. The
  // synthetic enable happens BEFORE assistant-on so the enable-effect above
  // never races a second (camera) start.
  const onboardStepRef = useRef<OnboardingStep | null>(null)
  onboardStepRef.current = onboardStep
  const visionProbeRef = useRef(vision)
  visionProbeRef.current = vision
  useEffect(() => {
    const w = window as unknown as {
      __rgbboxAssistant?: {
        startSynthetic(): Promise<boolean>
        onboarded(): boolean
        funnel(): { opened: number; calDone: number; firstCmd: number }
        step(): string | null
        probe(): { state: string; handSeen: boolean; enabled: boolean; error: string | null }
      }
    }
    w.__rgbboxAssistant = {
      async startSynthetic(): Promise<boolean> {
        try {
          await vision.enableSynthetic()
        } catch {
          return false
        }
        try { localStorage.setItem(ASSISTANT_KEY, '1') } catch { /* non-fatal */ }
        setAssistantOn(true)
        return true
      },
      onboarded: () => isOnboarded(),
      funnel: () => readFunnel(),
      step: () => onboardStepRef.current,
      probe: () => {
        const v = visionProbeRef.current
        return { state: v.state, handSeen: v.handSeen, enabled: v.enabled, error: v.error }
      },
    }
    return () => { w.__rgbboxAssistant = undefined }
  }, [vision.enableSynthetic])


  return (
    <>
      {/* floating toggle — always visible outside the games view */}
      {activeView !== 'games' ? (
        <button
          type="button"
          className={`vision-assistant-pill ${assistantOn ? 'on' : ''}`}
          aria-label={assistantOn ? t('games.vision.assistantOff') : t('games.vision.assistantOn')}
          title={assistantOn ? t('games.vision.assistantOff') : t('games.vision.assistantOn')}
          onClick={toggle}
        >
          👁 {t('games.vision.assistant')}
        </button>
      ) : null}

      {assistantOn && vision.enabled && activeView !== 'games' ? (
        <button
          type="button"
          className={`vision-assistant-pill textmode ${textMode ? 'on' : ''}`}
          style={{ bottom: '54px' }}
          aria-label={t('games.vision.chordText')}
          title={t('games.vision.chordTextHint')}
          onClick={toggleTextMode}
        >
          ⌨ {t('games.vision.chordText')}
        </button>
      ) : null}

      {textMode ? (
        <div className='vision-chord-posture'>{t('games.vision.chordPosture')}</div>
      ) : null}

      {textMode && trainer ? (
        <div className='vision-chord-trainer'>
          <strong>{t('games.vision.chordTrainer')}</strong>
          <p className='vision-chord-target'>{trainer.phrase.slice(0, trainer.pos)}<em>{trainer.phrase[trainer.pos] ?? '✓'}</em>{trainer.phrase.slice(trainer.pos + 1)}</p>
          <small>{`✓ ${trainer.hits} · ✗ ${trainer.misses}${typed ? ` · ${t('games.vision.chordTyped')}: ${typed}` : ''}`}</small>
        </div>
      ) : null}

      {assistantOn && vision.enabled && activeView !== 'games' ? (
        <>
          <div className="vision-assistant-badge">{t('games.vision.assistantBadge')}</div>
          {/* already inside the non-games + assistant-on branch above —
              `active` just mirrors it for the bus subscription; R246: muted
              while the wizard owns the gestures, EXCEPT during its task step
              (the first light apply must go through the real ring) */}
          <VisionLightControl
            active={!onboardActive || onboardStep === 'task'}
            curatedKinds={curatedKinds}
            onApplyEffect={applyLight}
            onOpenChange={setLightOpen}
            adjustPercent={gesture.adjustPercent}
            frozen={gesture.frozen}
          />
          <VisionCursor vision={vision} wrapRef={rootRef as React.RefObject<HTMLDivElement | null>} stateRef={cursorStateRef} suppressClick={menuOpen || lightOpen || onboardActive} />
        </>
      ) : null}

      {/* R246: first-use wizard — mounted while the assistant is on and not
          yet onboarded (covers a failed enable too: the wizard shows the
          classified error + retry instead of a dead overlay) */}
      {onboardActive ? (
        <VisionOnboarding
          vision={vision}
          lightApplyTick={lightApplyTick}
          onExit={exitOnboarding}
          onStepChange={setOnboardStep}
        />
      ) : null}

      {menuOpen ? (
        <div className="vision-radial" role="dialog" aria-label={t('games.vision.radialTitle')}>
          {MENU_SLOTS.map((slot, i) => (
            <button
              key={i}
              type="button"
              className={`vision-radial-item ${i === menuSel ? 'sel' : ''}`}
              style={{ transform: `translate(${Math.cos((i * 45 - 90) * Math.PI / 180) * 96}px, ${Math.sin((i * 45 - 90) * Math.PI / 180) * 96}px)` }}
              onMouseEnter={() => setMenuSel(i)}
              onClick={() => { setMenuOpen(false); if (slot.view) onNavigate(slot.view) }}
            >
              {slot.view ? t(getTabMeta(slot.view).labelKey) : '·'}
            </button>
          ))}
          <span className="vision-radial-hint">{t('games.vision.radialHint')}</span>
        </div>
      ) : null}
    </>
  )
}

const DIR_INDEX: Record<string, number> = {
  right: 0, 'up-right': 1, up: 2, 'up-left': 3, left: 4, 'down-left': 5, down: 6, 'down-right': 7,
}
