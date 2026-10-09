import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import { isViewReachable, type View } from '../../hooks/tabNavigation'
import { CARD_VIEWS, getTabMeta } from '../shellModules'
import { useVisionInput } from '../../hooks/useVisionInput'
import type { EffectKind } from '../../../../shared/types'
import { VisionCursor } from './VisionCursor'
import { VisionLightControl } from './VisionLightControl'
import { createCursorState } from '../../vision/cursor'

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

export function VisionAssistant({ activeView, onNavigate, rootRef, curatedKinds = [], onApplyLight = () => {}, model3dEnabled = false }: {
  activeView: View
  onNavigate: (view: View) => void
  rootRef: React.RefObject<HTMLElement | null>
  /** R229: curated effect kinds for the LIGHT ring (favorites + recents first) */
  curatedKinds?: EffectKind[]
  /** R229: apply a light effect from the ring (no view switch) */
  onApplyLight?: (kind: EffectKind) => void
  /** R243: module reachability for the radial slots (same source as the rail) */
  model3dEnabled?: boolean
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

  const TRAIN_PHRASE = 'the quick brown fox'

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

  // enable the pipeline when the assistant is on (and we're outside games,
  // where the games view owns the host)
  useEffect(() => {
    if (!assistantOn || activeView === 'games') return
    if (!vision.enabled) void vision.enable().catch(() => undefined)
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
              `active` just mirrors it for the bus subscription */}
          <VisionLightControl
            active
            curatedKinds={curatedKinds}
            onApplyEffect={onApplyLight}
            onOpenChange={setLightOpen}
          />
          <VisionCursor vision={vision} wrapRef={rootRef as React.RefObject<HTMLDivElement | null>} stateRef={cursorStateRef} suppressClick={menuOpen || lightOpen} />
        </>
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
