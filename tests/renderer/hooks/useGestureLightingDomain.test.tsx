// @vitest-environment happy-dom
// R247: 灯效环 v2 domain — continuous brightness adjust (pinch hold ≥600ms,
// palm.y → brightness param, clamped via paramMeta), open-palm freeze/resume
// (vision.setPaused), and double-pinch undo (offhand+Space within 900ms) with
// the 800ms per-action cooldown. Driven straight off the vision-input bus +
// a synthetic frameRef, exactly the surfaces the app wires.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import {
  useGestureLightingDomain,
  resolveBrightnessParam,
  palmYToBrightness,
} from '../../../src/renderer/src/hooks/domains/useGestureLightingDomain'
import type { EffectKind, EffectLayer } from '../../../src/shared/types'
import { buildPresetMap, persistMacroMap } from '../../../src/renderer/src/domain/gestureMacro'
import type { VisionFrame } from '../../../src/renderer/src/vision/vision_input'

beforeEach(() => {
  vi.useFakeTimers()
  cleanup()
})
afterEach(() => vi.useRealTimers())

const KINDS: EffectKind[] = ['aurora', 'rainbow', 'wave']

function layer(kind: EffectKind, parameters: EffectLayer['parameters']): EffectLayer {
  return { id: 'l1', name: kind, kind, enabled: true, opacity: 1, blendMode: 'normal', parameters }
}

function fireVision(detail: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new CustomEvent('vision-input', { detail }))
  })
}

function advance(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

interface Harness {
  rerenderWith(layer: EffectLayer | null, enabled?: boolean): void
  setGeom(y: number | null): void
  selectEffect: ReturnType<typeof vi.fn>
  updateSelectedLayer: ReturnType<typeof vi.fn>
  setPaused: ReturnType<typeof vi.fn>
  frameRef: { current: Partial<VisionFrame> | null }
}

function mountHook(initial: EffectLayer | null, enabled = true, sceneId = 'workspace'): Harness & { result: { current: { adjustPercent: number | null; frozen: boolean } } } {
  const selectEffect = vi.fn()
  const updateSelectedLayer = vi.fn()
  const setPaused = vi.fn()
  const frameRef: { current: Partial<VisionFrame> | null } = { current: null }
  const utils = renderHook(
    ({ layer: l, on }: { layer: EffectLayer | null; on: boolean }) =>
      useGestureLightingDomain({
        enabled: on,
        sceneId,
        selectedLayer: l,
        selectEffect,
        updateSelectedLayer,
        curatedKinds: KINDS,
        frameRef,
        setPaused,
      }),
    { initialProps: { layer: initial, on: enabled } },
  )
  return {
    ...utils,
    selectEffect,
    updateSelectedLayer,
    setPaused,
    frameRef,
    rerenderWith: (l, on) => utils.rerender({ layer: l, on: on ?? enabled }),
    setGeom: (y) => {
      frameRef.current = y == null
        ? { state: 'active', geom: null }
        : { state: 'active', geom: { palm: { x: 0.5, y }, pinch: 1.1, scale: 0.18 } }
    },
  }
}

const pinchDown = (): void => fireVision({ kind: 'pinch', key: 'Space', down: true })
const pinchUp = (): void => fireVision({ kind: 'pinch', key: 'Space', down: false })
const offPinch = (): void => fireVision({ kind: 'offhand', name: 'pinch', key: 'KeyF', down: true })
const palm = (): void => fireVision({ kind: 'offhand', name: 'pause', key: null, down: true })

describe('renderer/hooks/domains/useGestureLightingDomain (R247 灯效环 v2)', () => {
  describe('pure helpers', () => {
    it('resolveBrightnessParam picks the highest-priority numeric brightness key with paramMeta ranges', () => {
      expect(resolveBrightnessParam(layer('fire', { heat: 0.9, hueShift: 20 }))).toEqual({ key: 'heat', min: 0.3, max: 1.5 })
      expect(resolveBrightnessParam(layer('rainbow', { intensity: 0.5 }))).toEqual({ key: 'intensity', min: 0, max: 1 })
      // unknown key without paramMeta falls back to the 0..1 type tolerance
      expect(resolveBrightnessParam(layer('rainbow', { brightness: 0.4 }))).toEqual({ key: 'brightness', min: 0, max: 1 })
      expect(resolveBrightnessParam(layer('rainbow', { speed: 1 }))).toBeNull()
      expect(resolveBrightnessParam(null)).toBeNull()
    })

    it('palmYToBrightness maps hand-up → brighter and clamps to [min,max]', () => {
      expect(palmYToBrightness(0, 0, 1)).toBe(1)
      expect(palmYToBrightness(1, 0, 1)).toBe(0)
      expect(palmYToBrightness(0.5, 0, 1)).toBe(0.5)
      expect(palmYToBrightness(0, 0.3, 1.5)).toBe(1.5)
      expect(palmYToBrightness(1, 0.3, 1.5)).toBe(0.3)
      expect(palmYToBrightness(-0.5, 0, 1)).toBe(1) // clamped input
      expect(palmYToBrightness(1.4, 0, 1)).toBe(0)
    })
  })

  describe('brightness continuous adjust', () => {
    it('pinch held ≥600ms enters adjust; palm.y writes continuously; pinch up fixes the value', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5, speed: 1 }))
      h.setGeom(0.6)
      pinchDown()
      advance(599)
      expect(h.updateSelectedLayer).not.toHaveBeenCalled()
      expect(h.result.current.adjustPercent).toBeNull()
      advance(1) // ≥600ms gate crossed
      expect(h.updateSelectedLayer).toHaveBeenCalledTimes(1)
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith({ parameters: { intensity: 0.4, speed: 1 } })
      expect(h.result.current.adjustPercent).toBeCloseTo(0.4)

      h.setGeom(0.2) // hand up → brighter
      advance(33)
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith({ parameters: { intensity: 0.8, speed: 1 } })
      h.setGeom(1) // hand down → dimmest (clamped)
      advance(33)
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith({ parameters: { intensity: 0, speed: 1 } })
      expect(h.updateSelectedLayer).toHaveBeenCalledTimes(3)

      pinchUp()
      expect(h.result.current.adjustPercent).toBeNull()
      const calls = h.updateSelectedLayer.mock.calls.length
      h.setGeom(0.1)
      advance(200)
      expect(h.updateSelectedLayer).toHaveBeenCalledTimes(calls) // no writes after exit
    })

    it('a pinch released before 600ms never adjusts (tap ≠ hold)', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5 }))
      h.setGeom(0.5)
      pinchDown()
      advance(300)
      pinchUp()
      advance(1000)
      expect(h.updateSelectedLayer).not.toHaveBeenCalled()
      expect(h.result.current.adjustPercent).toBeNull()
    })

    it('clamps into non-0..1 param ranges (heat 0.3–1.5)', () => {
      const h = mountHook(layer('fire', { heat: 0.9 }))
      h.setGeom(0)
      pinchDown()
      advance(600)
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith({ parameters: { heat: 1.5 } })
      h.setGeom(1)
      advance(33)
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith({ parameters: { heat: 0.3 } })
      pinchUp()
    })

    it('no brightness-like parameter → hold is a silent no-op', () => {
      const h = mountHook(layer('rainbow', { speed: 1 }))
      h.setGeom(0.5)
      pinchDown()
      advance(700)
      pinchUp()
      expect(h.updateSelectedLayer).not.toHaveBeenCalled()
      expect(h.result.current.adjustPercent).toBeNull()
    })
  })

  describe('double-pinch undo', () => {
    it('offhand pinch while the primary pinch is held undoes to the previous kind', () => {
      // aurora → rainbow transition remembered prevKind=aurora
      const h = mountHook(layer('aurora', { intensity: 0.5 }))
      h.rerenderWith(layer('rainbow', { intensity: 0.5 }))
      pinchDown()
      offPinch()
      expect(h.selectEffect).toHaveBeenCalledTimes(1)
      expect(h.selectEffect).toHaveBeenCalledWith('aurora')
      // the undo consumed the hold — 600ms later nothing adjusts
      advance(700)
      expect(h.updateSelectedLayer).not.toHaveBeenCalled()
      pinchUp()
    })

    it('800ms cooldown swallows a second double-pinch; after it, undo re-arms', () => {
      const h = mountHook(layer('aurora', { intensity: 0.5 }))
      h.rerenderWith(layer('rainbow', { intensity: 0.5 }))
      pinchDown(); offPinch(); pinchUp()
      expect(h.selectEffect).toHaveBeenCalledTimes(1)
      // ring back to aurora → rainbow again, prevKind tracks again
      h.rerenderWith(layer('aurora', { intensity: 0.5 }))
      h.rerenderWith(layer('rainbow', { intensity: 0.5 }))
      pinchDown(); offPinch() // inside the cooldown
      expect(h.selectEffect).toHaveBeenCalledTimes(1)
      pinchUp()
      advance(800)
      pinchDown(); offPinch(); pinchUp()
      expect(h.selectEffect).toHaveBeenCalledTimes(2)
    })

    it('offhand pinch after the primary pinch released (outside the window) does not undo', () => {
      const h = mountHook(layer('aurora', { intensity: 0.5 }))
      h.rerenderWith(layer('rainbow', { intensity: 0.5 }))
      pinchDown()
      pinchUp()
      offPinch()
      expect(h.selectEffect).not.toHaveBeenCalled()
    })
  })

  describe('open-palm freeze / resume', () => {
    it('palm pauses the vision stream; second palm resumes and restores the frozen kind', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5 }))
      palm()
      expect(h.setPaused).toHaveBeenLastCalledWith(true)
      expect(h.result.current.frozen).toBe(true)
      // something else swapped the light while frozen
      h.rerenderWith(layer('wave', { intensity: 0.5 }))
      palm() // inside the 800ms cooldown → ignored
      expect(h.result.current.frozen).toBe(true)
      advance(800)
      palm()
      expect(h.setPaused).toHaveBeenLastCalledWith(false)
      expect(h.result.current.frozen).toBe(false)
      expect(h.selectEffect).toHaveBeenCalledWith('rainbow') // frozen kind restored
    })

    it('resume keeps the current kind when it never changed', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5 }))
      palm()
      advance(800)
      palm()
      expect(h.setPaused).toHaveBeenLastCalledWith(false)
      expect(h.selectEffect).not.toHaveBeenCalled()
    })
  })

  describe('mode gate', () => {
    it('disabled consumes nothing; re-enabling works fresh', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5 }), false)
      h.setGeom(0.5)
      pinchDown()
      advance(700)
      palm()
      offPinch()
      expect(h.updateSelectedLayer).not.toHaveBeenCalled()
      expect(h.setPaused).not.toHaveBeenCalled()
      expect(h.selectEffect).not.toHaveBeenCalled()
      pinchUp()

      h.rerenderWith(layer('rainbow', { intensity: 0.5 }), true)
      pinchDown()
      advance(600)
      expect(h.updateSelectedLayer).toHaveBeenCalledTimes(1)
      pinchUp()
    })

    it('disabling mid-adjust exits cleanly (no zombie interval writes)', () => {
      const h = mountHook(layer('rainbow', { intensity: 0.5 }))
      h.setGeom(0.5)
      pinchDown()
      advance(600)
      expect(h.result.current.adjustPercent).not.toBeNull()
      h.rerenderWith(layer('rainbow', { intensity: 0.5 }), false)
      const calls = h.updateSelectedLayer.mock.calls.length
      h.setGeom(0.1)
      advance(300)
      expect(h.updateSelectedLayer).toHaveBeenCalledTimes(calls)
      expect(h.result.current.adjustPercent).toBeNull()
    })
  })

  // ── R306/T9: the discrete macro reader — dir8 + 张合 resolve through the
  // stored macro table (presets change behavior; the default table preserves
  // it exactly), cooldowns enforced, games scenes exempt. ──────────────────
  it('R306/T9: present preset — dir8 pages next through curated, 张合 pages back, cooldown enforced', () => {
    persistMacroMap(buildPresetMap('present')) // dir8=nextCurated(600), double-pinch=prevCurated(600)
    try {
      const h = mountHook(layer('aurora', { brightness: 0.5 }))
      fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
      expect(h.selectEffect).toHaveBeenCalledWith('rainbow')
      fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
      expect(h.selectEffect).toHaveBeenCalledTimes(1) // inside the 600ms cooldown
      advance(700)
      fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
      // the harness layer is static ('aurora' — selectEffect is a mock), so
      // paging is base-anchored: next → rainbow again
      expect(h.selectEffect).toHaveBeenLastCalledWith('rainbow')
      advance(700)
      fireVision({ kind: 'hands', name: 'together', key: null, down: true })
      expect(h.selectEffect).toHaveBeenLastCalledWith('wave') // prev from base 0 wraps to the last
    } finally { localStorage.clear() }
  })

  it('R306/T9: brightnessStep maps swipe side onto the layer param (right/up +0.1, left/down −0.1)', () => {
    persistMacroMap(buildPresetMap('light-drive')) // dir8=brightnessStep(400)
    try {
      const h = mountHook(layer('aurora', { brightness: 0.5 }))
      fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
      expect(h.updateSelectedLayer).toHaveBeenCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({ brightness: 0.6 }),
      }))
      advance(500)
      fireVision({ kind: 'direction', key: 'ArrowLeft', dir: 'left', down: true })
      // static harness layer: steps are anchored at 0.5 → left writes 0.4
      expect(h.updateSelectedLayer).toHaveBeenLastCalledWith(expect.objectContaining({
        parameters: expect.objectContaining({ brightness: 0.4 }),
      }))
    } finally { localStorage.clear() }
  })

  it('R306/T9: the DEFAULT table fires nothing (behavior preservation) and games scenes are exempt', () => {
    persistMacroMap(buildPresetMap('party'))
    try {
      const games = mountHook(layer('aurora', { brightness: 0.5 }), true, 'games')
      fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
      fireVision({ kind: 'hands', name: 'apart', key: null, down: true })
      expect(games.selectEffect).not.toHaveBeenCalled()
      expect(games.updateSelectedLayer).not.toHaveBeenCalled()
    } finally { localStorage.clear() }
    // no stored table at all → the shipped default: dir8/张合 are inert
    const h = mountHook(layer('aurora', { brightness: 0.5 }))
    fireVision({ kind: 'direction', key: 'ArrowRight', dir: 'right', down: true })
    fireVision({ kind: 'hands', name: 'apart', key: null, down: true })
    expect(h.selectEffect).not.toHaveBeenCalled()
    expect(h.updateSelectedLayer).not.toHaveBeenCalled()
  })
})
