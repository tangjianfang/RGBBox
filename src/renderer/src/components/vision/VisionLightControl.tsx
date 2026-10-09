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

export function VisionLightControl({ active, curatedKinds, onApplyEffect, onOpenChange }: {
  active: boolean
  curatedKinds: EffectKind[]
  onApplyEffect: (kind: EffectKind) => void
  onOpenChange?: (open: boolean) => void
}): JSX.Element | null {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const [flash, setFlash] = useState<EffectKind | null>(null)
  const selRef = useRef(sel)
  selRef.current = sel
  const openRef = useRef(open)
  openRef.current = open

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

  if (!active || !open) return null
  return (
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
  )
}
