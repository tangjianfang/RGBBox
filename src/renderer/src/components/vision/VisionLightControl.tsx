import { useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../../i18n'
import { presetLabel } from '../../domain/presetI18n'
import { effectPresets } from '../../../../shared/defaultProfile'
import type { EffectKind } from '../../../../shared/types'

/**
 * R229: 手势控灯 v1 — the LIGHT ring. The gesture assistant could control
 * everything EXCEPT the lights (REVIEW-VISION 08's decisive finding); this
 * closes the value loop: chord `light` (thumb+index+middle) opens an 8-slot
 * radial of the curated effects (favorites + recents — the ones worth
 * reaching for), directions pick, pinch applies. No view switch: swapping
 * the room's light must never steal the screen you're working on.
 *
 * Consumes the SAME `vision-input` window bus the assistant uses (that bus
 * IS the gesture-primitive layer — R228.5), so it stays "one component, one
 * subscription" and needs zero engine changes.
 */

/** ring slot order mirrors the direction ring (0=right … 7=down-right) */
const DIR_SLOT: Record<string, number> = {
  right: 0, 'up-right': 1, up: 2, 'up-left': 3,
  left: 4, 'down-left': 5, down: 6, 'down-right': 7,
}

export function VisionLightControl({ active, curatedKinds, onApplyEffect, onOpenChange, adjustPercent = null, frozen = false }: {
  active: boolean
  curatedKinds: EffectKind[]
  onApplyEffect: (kind: EffectKind) => void
  onOpenChange?: (open: boolean) => void
  /** R247: live 0..1 brightness while the pinch-hold adjust mode is active */
  adjustPercent?: number | null
  /** R247: light frozen via the open-palm hold (vision stream paused) */
  frozen?: boolean
}): JSX.Element | null {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const [flash, setFlash] = useState<EffectKind | null>(null)
  const selRef = useRef(sel)
  selRef.current = sel
  const openRef = useRef(open)
  openRef.current = open
  // R247: while adjusting, the pinch/direction vocabulary IS the adjust
  // gesture — the ring must not also consume it (方向事件忽略，防误触).
  const adjustingRef = useRef(false)
  adjustingRef.current = adjustPercent != null

  useEffect(() => { onOpenChange?.(open) }, [open, onOpenChange])

  // curatedKinds can change while the ring is open (applying adds a recent) —
  // resolve labels per render from the CURRENT list, capped at 8 slots.
  const slots = curatedKinds.slice(0, 8)
  const labelOf = (kind: EffectKind): string => {
    const preset = effectPresets.find((p) => p.kind === kind)
    return preset ? presetLabel(preset, t) : kind
  }

  useEffect(() => {
    if (!active) return
    const apply = (): void => {
      const kind = slots[selRef.current]
      if (!kind) return
      onApplyEffect(kind)
      setFlash(kind)
      window.setTimeout(() => setFlash(null), 1500)
      setOpen(false)
    }
    const onVisionEvent = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ kind: string; key: string | null; name?: string; down: boolean; dir?: string }>).detail
      if (!detail) return
      if (detail.kind === 'chord' && detail.name === 'light' && detail.down) {
        setOpen((o) => !o)
        return
      }
      if (!openRef.current) return
      if (adjustingRef.current) return // R247: adjust owns pinch/direction while active
      if (detail.kind === 'chord' && detail.down && (detail.name === 'cancel' || detail.name === 'back')) setOpen(false)
      else if (detail.kind === 'pinch' && detail.key === 'Space' && detail.down) apply()
      else if (detail.kind === 'direction' && detail.down && detail.dir && DIR_SLOT[detail.dir] != null) {
        setSel(DIR_SLOT[detail.dir])
      }
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape' && openRef.current) setOpen(false) }
    window.addEventListener('vision-input', onVisionEvent)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('vision-input', onVisionEvent)
      window.removeEventListener('keydown', onKey)
    }
  }, [active, slots, onApplyEffect])

  // leaving the active context closes the ring (games view takes over, etc.)
  useEffect(() => { if (!active) setOpen(false) }, [active])

  if (!active) return null
  // R247: the adjust ring + frozen badge render independently of the radial —
  // the adjust gesture continues after the apply closed the ring (pinch-hold),
  // and the freeze state must stay visible with the ring shut.
  const RING_C = 2 * Math.PI * 52
  const pct = adjustPercent == null ? 0 : Math.round(adjustPercent * 100)
  return (
    <>
      {frozen ? (
        <div className="vision-light-frozen" role="status">⏸ {t('games.vision.lightFrozen')}</div>
      ) : null}
      {adjustPercent != null ? (
        <div className="vision-light-adjust" role="status" aria-label={t('games.vision.lightAdjust')}>
          <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
            <circle className="track" cx="60" cy="60" r="52" />
            <circle
              className="fill"
              cx="60" cy="60" r="52"
              strokeDasharray={`${adjustPercent * RING_C} ${RING_C}`}
            />
          </svg>
          <span className="vision-light-adjust-num">{pct}</span>
          <span className="vision-light-adjust-label">{t('games.vision.lightAdjust')}</span>
        </div>
      ) : null}
      {!open ? null : (
        <div className="vision-radial light" role="dialog" aria-label={t('games.vision.lightRing')}>
          {slots.map((kind, i) => (
            <button
              key={kind}
              type="button"
              className={`vision-radial-item ${i === sel ? 'sel' : ''}`}
              style={{ transform: `translate(${Math.cos((i * 45 - 90) * Math.PI / 180) * 96}px, ${Math.sin((i * 45 - 90) * Math.PI / 180) * 96}px)` }}
              onMouseEnter={() => setSel(i)}
              onClick={() => { onApplyEffect(kind); setOpen(false) }}
            >
              {labelOf(kind)}
            </button>
          ))}
          <span className="vision-radial-hint">
            {flash
              ? `✨ ${t('games.vision.lightApply')}: ${labelOf(flash)}`
              : t('games.vision.lightHint')}
          </span>
        </div>
      )}
    </>
  )
}
