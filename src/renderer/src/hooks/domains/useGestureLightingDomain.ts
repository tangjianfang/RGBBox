import { useCallback, useEffect, useRef, useState } from 'react'
import type { EffectKind, EffectLayer } from '../../../../shared/types'
import type { VisionFrame } from '../../vision/vision_input'
import { loadMacroMap, resolveMacro } from '../../domain/gestureMacro'
import { PARAM_META } from '../../domain/paramMeta'
import { playSfx } from '../../games/sfx'

/**
 * R247: 灯效环 v2 — the gesture-lighting domain (domain-hook pattern per
 * useScheduleDomain). Three gestures layered onto the R229 light ring, all
 * consumed from the SAME `vision-input` window bus + the vision frameRef:
 *
 * ① 亮度连续调节 — pinch held ≥600ms enters adjust mode; palm.y (hand up =
 *    brighter) maps continuously into the layer's brightness-like parameter
 *    (clamped to its paramMeta min/max), written live via
 *    updateSelectedLayer; pinch up fixes the value. While adjusting,
 *    direction/pinch vocabulary belongs to the adjust gesture (the ring UI
 *    suppresses its own consumption).
 * ② 张掌定格 — the off-hand open-palm hold (bus `offhand pause`, the engine's
 *    deliberate-hold trigger ≈1s) freezes the light: the vision stream is
 *    paused (vision.setPaused(true)) and the frozen kind remembered; a second
 *    palm resumes and restores the frozen kind if anything changed it.
 *    While paused the engine keeps watching the off hand for the resume
 *    palm, so the toggle round-trips.
 * ③ double-pinch 撤销 — off-hand pinch while the primary pinch is held
 *    (both pinches in a <900ms window) undoes the last effect switch:
 *    selectEffect(prevKind), surfaced through App's applied-toast channel.
 *
 * 防误触: every switch-class action (undo / freeze toggle) arms an 800ms
 * cooldown that swallows repeat triggers; a confirm blip (R141-A sfx
 * precedent) fires on each committed action.
 */
export const ADJUST_HOLD_MS = 600
export const ACTION_COOLDOWN_MS = 800
export const DOUBLE_PINCH_WINDOW_MS = 900
export const ADJUST_TICK_MS = 33

/** brightness-like parameter priority — first numeric key present wins */
const BRIGHTNESS_KEYS = ['brightness', 'intensity', 'baseBrightness', 'shimmerIntensity', 'heat', 'particleIntensity'] as const

export interface BrightnessParam { key: string; min: number; max: number }

/** Resolve the layer's brightness parameter + its [min,max] (paramMeta, else 0..1). */
export function resolveBrightnessParam(layer: EffectLayer | null): BrightnessParam | null {
  if (!layer) return null
  for (const key of BRIGHTNESS_KEYS) {
    if (typeof layer.parameters[key] === 'number') {
      const meta = PARAM_META[key]
      const min = meta ? Math.min(meta.min, meta.max) : 0
      const max = meta ? Math.max(meta.min, meta.max) : 1
      return { key, min, max }
    }
  }
  return null
}

/** palm.y (0=top … 1=bottom, normalized) → parameter value: hand UP = brighter. */
export function palmYToBrightness(y: number, min: number, max: number): number {
  const t = Math.min(1, Math.max(0, 1 - y))
  return Math.round((min + t * (max - min)) * 1000) / 1000
}

interface BusDetail { kind: string; key: string | null; name?: string; down: boolean; dir?: string }

export function useGestureLightingDomain(args: {
  /** 灯效驾驶模式 gate — assistant on + vision live + no competing gesture UI */
  enabled: boolean
  selectedLayer: EffectLayer | null
  /** switch the light (App wires selectEffect + the applied-toast channel) */
  selectEffect: (kind: EffectKind) => void
  /** live parameter writes (App's updateSelectedLayer) */
  updateSelectedLayer: (patch: Partial<EffectLayer>) => void
  /** R229 curated kinds — freeze-restore only trusts known kinds */
  curatedKinds: EffectKind[]
  frameRef: { readonly current: Partial<VisionFrame> | null }
  /** vision host pause (挂起渲流) */
  setPaused: (p: boolean) => void
  /** R306/T9: the macro table's scene column this domain resolves against
   *  (the active view mapped to a SCENES id; games never mounts this hook) */
  sceneId?: string
}): { adjustPercent: number | null; frozen: boolean } {
  const { enabled, selectedLayer, selectEffect, updateSelectedLayer, curatedKinds, frameRef, setPaused, sceneId = 'workspace' } = args
  const [adjustPercent, setAdjustPercent] = useState<number | null>(null)
  const [frozen, setFrozen] = useState(false)

  // live-prop refs — the bus subscription must never go stale
  const layerRef = useRef(selectedLayer)
  layerRef.current = selectedLayer
  const selectRef = useRef(selectEffect)
  selectRef.current = selectEffect
  const updateRef = useRef(updateSelectedLayer)
  updateRef.current = updateSelectedLayer
  const setPausedRef = useRef(setPaused)
  setPausedRef.current = setPaused
  // R306/T9: discrete macro reader state — scene + per-gesture cooldowns
  const sceneIdRef = useRef(sceneId)
  sceneIdRef.current = sceneId
  const macroCoolRef = useRef<Record<string, number>>({})
  const curatedRef = useRef(curatedKinds)
  curatedRef.current = curatedKinds

  // prev-kind tracking for undo: an A→B transition remembers A (the undo
  // itself re-arms B, so a second undo walks back — classic undo toggle).
  const lastKindRef = useRef<EffectKind | null>(null)
  const prevKindRef = useRef<EffectKind | null>(null)
  if (selectedLayer && selectedLayer.kind !== lastKindRef.current) {
    prevKindRef.current = lastKindRef.current
    lastKindRef.current = selectedLayer.kind
  }

  const st = useRef({
    holdTimer: null as number | null,
    tickTimer: null as number | null,
    pairTimer: null as number | null,
    spacePinchDown: false,
    adjusting: false,
    lastWritten: Number.NaN,
    undoCooling: false,
    freezeCooling: false,
    frozen: false,
    frozenKind: null as EffectKind | null,
  })

  const enterAdjust = useCallback(() => {
    const s = st.current
    s.holdTimer = null
    const layer = layerRef.current
    const bp = resolveBrightnessParam(layer)
    if (!bp) return // no brightness-like param → the hold is a silent no-op
    s.adjusting = true
    s.lastWritten = Number.NaN
    playSfx('tick')
    const write = (): void => {
      const cur = layerRef.current
      if (!cur) return
      const y = frameRef.current?.geom?.palm?.y
      if (typeof y !== 'number') return // hand lost → hold the value
      const value = palmYToBrightness(y, bp.min, bp.max)
      if (value === s.lastWritten) return
      s.lastWritten = value
      updateRef.current({ parameters: { ...cur.parameters, [bp.key]: value } })
      const span = bp.max - bp.min
      setAdjustPercent(span > 0 ? Math.min(1, Math.max(0, (value - bp.min) / span)) : 1)
    }
    write()
    s.tickTimer = window.setInterval(write, ADJUST_TICK_MS)
  }, [frameRef])

  const exitAdjust = useCallback(() => {
    const s = st.current
    if (s.tickTimer !== null) { window.clearInterval(s.tickTimer); s.tickTimer = null }
    s.adjusting = false
    setAdjustPercent(null)
    playSfx('confirm') // 定值确认音
  }, [])

  const fireUndo = useCallback(() => {
    const s = st.current
    const prev = prevKindRef.current
    const cur = layerRef.current
    if (!prev || !cur || prev === cur.kind) return
    selectRef.current(prev)
    playSfx('confirm')
    s.undoCooling = true
    window.setTimeout(() => { st.current.undoCooling = false }, ACTION_COOLDOWN_MS)
  }, [])

  const toggleFreeze = useCallback(() => {
    const s = st.current
    if (s.adjusting) return
    if (s.frozen) {
      s.frozen = false
      setFrozen(false)
      setPausedRef.current(false)
      const remember = s.frozenKind
      const cur = layerRef.current
      if (remember && cur && cur.kind !== remember && curatedRef.current.includes(remember)) {
        selectRef.current(remember)
      }
    } else {
      s.frozen = true
      s.frozenKind = layerRef.current?.kind ?? null
      setFrozen(true)
      setPausedRef.current(true)
    }
    playSfx('confirm')
    s.freezeCooling = true
    window.setTimeout(() => { st.current.freezeCooling = false }, ACTION_COOLDOWN_MS)
  }, [])

  // R306/T9: execute a discrete macro action. v1 executes the three the
  // lighting domain can honestly perform — curated paging (next/prev through
  // curatedKinds via selectEffect) and brightness stepping (±0.1 into the
  // layer's brightness-like param, clamped; swipe side gives the sign).
  // Any other action is a no-op here: the default table never binds one to
  // dir8/张合, and neither do the shipped v1 presets.
  const fireMacroAction = useCallback((action: string, dir?: string): void => {
    const layer = layerRef.current
    const kinds = curatedRef.current
    if (action === 'nextCurated' || action === 'prevCurated') {
      if (!layer || kinds.length === 0) return
      const idx = kinds.indexOf(layer.kind)
      const base = idx === -1 ? 0 : idx
      const next = action === 'nextCurated' ? (base + 1) % kinds.length : (base - 1 + kinds.length) % kinds.length
      selectRef.current(kinds[next])
      return
    }
    if (action === 'brightnessStep' && layer) {
      const bp = resolveBrightnessParam(layer)
      if (!bp) return
      const sign = dir != null && (dir.includes('left') || dir.includes('down')) ? -1 : 1
      const curRaw = layer.parameters[bp.key]
      const cur = typeof curRaw === 'number' ? curRaw : bp.min
      const value = Math.min(bp.max, Math.max(bp.min, cur + 0.1 * sign))
      updateRef.current({ parameters: { ...layer.parameters, [bp.key]: value } })
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onVisionEvent = (ev: Event): void => {
      const detail = (ev as CustomEvent<BusDetail>).detail
      if (!detail) return
      const s = st.current
      if (detail.kind === 'pinch' && detail.key === 'Space') {
        if (detail.down) {
          if (s.frozen) return // paused stream sends none anyway — belt & braces
          s.spacePinchDown = true
          if (s.pairTimer === null) {
            s.pairTimer = window.setTimeout(() => {
              st.current.pairTimer = null
              st.current.spacePinchDown = false
            }, DOUBLE_PINCH_WINDOW_MS)
          }
          if (s.holdTimer === null && !s.adjusting) {
            s.holdTimer = window.setTimeout(() => enterAdjust(), ADJUST_HOLD_MS)
          }
        } else {
          s.spacePinchDown = false
          if (s.pairTimer !== null) { window.clearTimeout(s.pairTimer); s.pairTimer = null }
          if (s.holdTimer !== null) { window.clearTimeout(s.holdTimer); s.holdTimer = null }
          if (s.adjusting) exitAdjust()
        }
        return
      }
      // ── R306/T9: the discrete macro reader ────────────────────────────────
      // dir8 + 双手张合 resolve through the STORED macro table (presets change
      // behavior, the default table preserves it exactly — its cells are none).
      // pinch/palm/chords deliberately keep their existing owners: pinch is the
      // analog adjust + ring confirm, palm has no engine event (deferred),
      // chords are the menu/ring UI. 'explicit-mode' guard passes because this
      // hook only runs with the assistant (the explicit mode) enabled.
      const macroGesture = detail.kind === 'direction' ? 'dir8' : detail.kind === 'hands' ? 'double-pinch' : null
      if (macroGesture && detail.down === true) {
        const cell = resolveMacro(loadMacroMap(), macroGesture, sceneIdRef.current)
        const now = performance.now()
        if (cell.action !== 'none'
          && now - (macroCoolRef.current[macroGesture] ?? Number.NEGATIVE_INFINITY) >= cell.cooldownMs) {
          macroCoolRef.current[macroGesture] = now
          fireMacroAction(cell.action, detail.dir)
        }
        return
      }
      if (detail.kind !== 'offhand') return
      if (detail.name === 'pinch' && detail.down) {
        // double-pinch: off-hand pinch while the primary pinch is held (<900ms window)
        if (s.spacePinchDown && !s.adjusting && !s.frozen && !s.undoCooling) {
          s.spacePinchDown = false
          if (s.pairTimer !== null) { window.clearTimeout(s.pairTimer); s.pairTimer = null }
          if (s.holdTimer !== null) { window.clearTimeout(s.holdTimer); s.holdTimer = null }
          fireUndo()
        }
      } else if (detail.name === 'pause' && detail.down) {
        if (s.freezeCooling || s.adjusting) return
        toggleFreeze()
      }
    }
    window.addEventListener('vision-input', onVisionEvent)
    return () => {
      window.removeEventListener('vision-input', onVisionEvent)
      const s = st.current
      if (s.holdTimer !== null) { window.clearTimeout(s.holdTimer); s.holdTimer = null }
      if (s.pairTimer !== null) { window.clearTimeout(s.pairTimer); s.pairTimer = null }
      if (s.tickTimer !== null) { window.clearInterval(s.tickTimer); s.tickTimer = null }
      s.adjusting = false
      s.spacePinchDown = false
      setAdjustPercent(null)
      if (s.frozen) { s.frozen = false; setFrozen(false); setPausedRef.current(false) }
    }
  }, [enabled, enterAdjust, exitAdjust, fireUndo, toggleFreeze, fireMacroAction])

  return { adjustPercent, frozen }
}
