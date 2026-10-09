// @vitest-environment happy-dom
// R136: useVisionInput as the client of the hidden vision host window. The
// transport is the (mocked, cross-instance) BroadcastChannel 'rgbbox-vision'
// — this suite plays the HOST side: answers init with ready, then scripts
// events / snapshots / profile-save messages.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useVisionInput } from '../../../src/renderer/src/hooks/useVisionInput'
import { visionAssetBase } from '../../../src/renderer/src/hooks/visionAssetBase'
import { I18nProvider, useI18n, type Lang } from '../../../src/renderer/src/i18n'
import type { VisionEvent, VisionFrame } from '../../../src/renderer/src/vision/vision_input'
import { setupRendererMocks } from '../_helpers'

// setup.ts globally stubs the i18n module (t = key echo). The R235 case needs
// the REAL tables + provider (asserts concrete zh/en values and a runtime
// language switch) — restore the actual module for this file only.
vi.mock('../../../src/renderer/src/i18n', async (importOriginal) => importOriginal())

interface HostMessage { type: string; [key: string]: unknown }

class FakeHost {
  channel: BroadcastChannel
  received: HostMessage[] = []
  constructor() {
    this.channel = new BroadcastChannel('rgbbox-vision')
    this.channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as HostMessage
      this.received.push(msg)
      if (msg.type === 'init') this.send({ type: 'ready', delegate: 'GPU' })
    }
  }
  send(msg: unknown): void {
    this.channel.postMessage(msg)
  }
  dispose(): void {
    this.channel.close()
  }
}

let host: FakeHost
let rgbbox: ReturnType<typeof setupRendererMocks>

beforeEach(() => {
  rgbbox = setupRendererMocks()
  localStorage.clear()
  host = new FakeHost()
  cleanup()
})

afterEach(() => {
  host.dispose()
})

describe('renderer/hooks/useVisionInput (R136 host client)', () => {
  it('visionAssetBase: document-relative over http, media://app for packaged file://', () => {
    expect(visionAssetBase('http:')).toBe(document.baseURI)
    expect(visionAssetBase('file:')).toBe('media://app/')
  })

  it('enable(): opens the host window and ships the full R136 init config', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    expect(rgbbox.visionHostOpen).toHaveBeenCalled()
    expect(result.current.enabled).toBe(true)
    const init = host.received.find((m) => m.type === 'init') as { cfg: Record<string, unknown> }
    expect(init).toBeTruthy()
    expect(String(init.cfg.bundleUrl)).toContain('vision_bundle.js')
    expect(String(init.cfg.handModel)).toContain('hand_landmarker.task')
    expect(init.cfg.numHands).toBe(2)
    expect(init.cfg.mode).toBe('synthetic')
    expect((init.cfg.sessionCfg as { requireFace: boolean }).requireFace).toBe(false)
    expect((init.cfg.sessionCfg as { faceEveryN: number }).faceEveryN).toBe(3)
    expect(init.cfg.mirror).toBe(true)
    expect(init.cfg.maxFps).toBe(60) // R142-L1: 60fps full-frame
    expect((init.cfg.camera as { width: number }).width).toBe(640)
    expect((init.cfg.camera as { height: number }).height).toBe(480)
    await act(() => result.current.disable())
    // R228: disable RELEASES (refcounted host) — no stop, no window close
    expect(host.received.some((m) => m.type === 'release')).toBe(true)
    expect(host.received.some((m) => m.type === 'stop')).toBe(false)
    expect(rgbbox.visionHostClose).not.toHaveBeenCalled()
  })

  it('host events normalize into held/queue + window bus (keyless events reach the bus only)', async () => {
    const bus = vi.fn()
    window.addEventListener('vision-input', bus)
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => {
      host.send({ type: 'events', events: [
        { kind: 'direction', key: 'ArrowLeft', down: true } as VisionEvent,
        { kind: 'pinch', key: 'Space', down: true } as VisionEvent,
        { kind: 'offhand', name: 'pause', down: true } as unknown as VisionEvent,
      ] })
    })
    expect(result.current.heldRef.current.has('arrowleft')).toBe(true)
    expect(result.current.heldRef.current.has('space')).toBe(true)
    expect(result.current.queueRef.current).toEqual(['arrowleft', 'space'])
    expect(bus).toHaveBeenCalledTimes(3)
    // R142-L4: chord events become discrete pseudo-keys (never held keys)
    act(() => {
      host.send({ type: 'events', events: [
        { kind: 'chord', key: null, name: 'confirm', down: true } as unknown as VisionEvent,
        { kind: 'chord', key: null, name: 'select', down: true } as unknown as VisionEvent,
      ] })
    })
    expect(result.current.queueRef.current).toEqual(['arrowleft', 'space', 'chord:confirm', 'chord:select'])
    expect(result.current.heldRef.current.has('chord:confirm')).toBe(false)
    expect(bus).toHaveBeenCalledTimes(5)
    await act(() => result.current.disable())
    window.removeEventListener('vision-input', bus)
  })

  it('snapshots: state changes publish INSTANTLY, label text stays ~4Hz-throttled (R136.2)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    const geom = { palm: { x: 0.51, y: 0.54 }, pinch: 1.1, scale: 0.18 }
    act(() => host.send({ type: 'snapshot', snapshot: { state: 'searching', label: 'a', geom: null } }))
    expect(result.current.state).toBe('searching')
    act(() => host.send({ type: 'snapshot', snapshot: { state: 'calibrating', label: 'b', stepId: 'center', geom } }))
    expect(result.current.state).toBe('calibrating')
    expect(result.current.stepId).toBe('center')
    expect(result.current.handSeen).toBe(true)
    expect(result.current.label).toBe('a') // throttled text
    expect(result.current.frameRef.current?.geom).toEqual(geom) // ref is live
    await act(() => result.current.disable())
  })

  it('handSeen loss needs 5 consecutive handless frames (R138 jitter guard)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    const geom = { palm: { x: 0.51, y: 0.54 }, pinch: 1.1, scale: 0.18 }
    const snap = (g: unknown) => host.send({ type: 'snapshot', snapshot: { state: 'active', label: 'x', geom: g } })
    act(() => snap(geom))
    expect(result.current.handSeen).toBe(true) // presence publishes instantly
    // detection flicker: 4 handless frames (below the threshold) → still seen
    for (let i = 0; i < 4; i++) act(() => snap(null))
    expect(result.current.handSeen).toBe(true)
    // hand returns → counter resets, no flap
    act(() => snap(geom))
    for (let i = 0; i < 3; i++) act(() => snap(null))
    expect(result.current.handSeen).toBe(true)
    // 5 consecutive handless frames → publish the loss
    for (let i = 0; i < 5; i++) act(() => snap(null))
    expect(result.current.handSeen).toBe(false)
    await act(() => result.current.disable())
  })

  it('mirror + sensitivity controls round-trip to the host AND localStorage (R136.2/.3)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => result.current.setMirror(false))
    expect(host.received.some((m) => m.type === 'mirror' && m.m === false)).toBe(true)
    expect(localStorage.getItem('rgbbox:visionMirror')).toBe('0')
    act(() => result.current.setSensitivity('sport'))
    const settings = host.received.find((m) => m.type === 'settings') as { patch: { confirmMs: number } }
    expect(settings.patch.confirmMs).toBe(0)
    expect(localStorage.getItem('rgbbox:visionSensitivity')).toBe('sport')
    await act(() => result.current.disable())
  })

  it('skipCalibration and resumeActive message the host (forceReady paths)', async () => {
    localStorage.setItem('vgi-profile-v2', JSON.stringify({ center: { x: 0.5, y: 0.55 }, pinchOn: 0.4, pinchOff: 0.7 }))
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => result.current.skipCalibration())
    expect(host.received.some((m) => m.type === 'forceReady' && m.profile === undefined)).toBe(true)
    act(() => result.current.resumeActive())
    const fr = host.received.filter((m) => m.type === 'forceReady').pop() as { profile: { center: { x: number } } }
    expect(fr.profile.center.x).toBe(0.5)
    expect(host.received.some((m) => m.type === 'pause' && m.p === false)).toBe(true)
    await act(() => result.current.disable())
  })

  it('profile-save from the host lands in localStorage', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => host.send({ type: 'profile-save', profile: { center: { x: 0.6, y: 0.5 } } }))
    expect(JSON.parse(localStorage.getItem('vgi-profile-v2') ?? '{}').center.x).toBe(0.6)
    await act(() => result.current.disable())
  })

  it('a failed host init rejects enable() and cleans up', async () => {
    host.dispose()
    const failing = new FakeHost()
    failing.channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as HostMessage
      failing.received.push(msg)
      if (msg.type === 'init') failing.send({ type: 'error', message: 'wasm boom' })
    }
    const { result } = renderHook(() => useVisionInput())
    let caught: unknown = null
    await act(async () => {
      try {
        await result.current.enableSynthetic()
      } catch (err) {
        caught = err
      }
    })
    expect((caught as Error).message).toBe('wasm boom')
    expect(result.current.enabled).toBe(false)
    // R230: the REAL error is visible via both surfaces — no stale
    // "models ready" fake error on the status chips
    expect(result.current.error).toBe('wasm boom')
    expect(result.current.label).toBe('wasm boom')
    // R227.4: the failed attempt must roll the half-built state back — a
    // leaked channelRef used to turn every later enable() into a silent
    // no-op (the dead-button bug). Retry has to actually retry.
    failing.channel.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as HostMessage
      failing.received.push(msg)
      if (msg.type === 'init') failing.send({ type: 'ready', delegate: 'GPU' })
    }
    await act(async () => {
      await result.current.enableSynthetic()
    })
    expect(result.current.enabled).toBe(true)
    expect(failing.received.filter((m) => m.type === 'init').length).toBeGreaterThanOrEqual(2)
    failing.dispose()
  })

  it('R227.4: rapid double-enable shares ONE startup (single init, single channel)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(async () => {
      const a = result.current.enableSynthetic()
      const b = result.current.enableSynthetic()
      await Promise.all([a, b])
    })
    expect(result.current.enabled).toBe(true)
    expect(host.received.filter((m) => m.type === 'init').length).toBe(1)
    await act(() => result.current.disable())
  })

  it('R228: unmounting RELEASES the session (no stop, no window close — refcounted host)', async () => {
    const { result, unmount } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    unmount()
    // release (not stop): the shared host may serve another consumer
    expect(host.received.some((m) => m.type === 'release')).toBe(true)
    expect(host.received.some((m) => m.type === 'stop')).toBe(false)
    expect(rgbbox.visionHostClose).not.toHaveBeenCalled()
  })

  it('R228: two consumers coexist — second enable ready, disable is release-only, enable sends acquire', async () => {
    const a = renderHook(() => useVisionInput())
    await act(async () => { await a.result.current.enableSynthetic() })
    const b = renderHook(() => useVisionInput())
    await act(async () => { await b.result.current.enableSynthetic() })
    expect(a.result.current.enabled).toBe(true)
    expect(b.result.current.enabled).toBe(true)
    // both inits answered ready (FakeHost replies to every init — matching the
    // R228 host behavior that unblocked the eternal-hang defect)
    expect(host.received.filter((m) => m.type === 'init').length).toBe(2)
    expect(host.received.filter((m) => m.type === 'acquire').length).toBe(2)
    // one consumer leaving must not stop anything
    await act(async () => { await a.result.current.disable() })
    expect(host.received.some((m) => m.type === 'stop')).toBe(false)
    expect(b.result.current.enabled).toBe(true)
    await act(async () => { await b.result.current.disable() })
    expect(host.received.filter((m) => m.type === 'release').length).toBe(2)
  })

  it('frameRef snapshot type surface (compile-time contract)', () => {
    const frame: Partial<VisionFrame> = { state: 'active', stepProgress: 0.5 }
    expect(frame.state).toBe('active')
  })

  it('R230: code-style key names normalize to the passthrough vocabulary (KeyE→e, ShiftLeft→shift, KeyF→f)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => {
      host.send({ type: 'events', events: [
        { kind: 'direction', key: 'KeyE', down: true },
        { kind: 'direction', key: 'ShiftLeft', down: true },
        { kind: 'pinch', key: 'KeyF', down: true },
      ] })
    })
    expect([...result.current.heldRef.current].sort()).toEqual(['e', 'f', 'shift'])
    await act(() => result.current.disable())
  })

  it('setCapturePrecision posts the capture-mode switch (R141-B)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    act(() => result.current.setCapturePrecision(true))
    const msg = host.received.find((m) => m.type === 'capture') as { camera: { width: number; height: number } }
    expect(msg.camera).toEqual({ width: 960, height: 540, frameRate: 60 })
    act(() => result.current.setCapturePrecision(false))
    const msgs = host.received.filter((m) => m.type === 'capture')
    expect((msgs[1] as { camera: { width: number } }).camera.width).toBe(640)
    await act(() => result.current.disable())
  })

  // R235 ────────────────────────────────────────────────────────────────────
  // Engine i18n: the hook injects the key-mode messages table (engine emits
  // stable codes) and localizes every incoming code through t() at the
  // component layer — per-consumer language, switchable at runtime. Text
  // that hits no key passes through verbatim (R227 real-error compat).
  it('R235: engine status codes localize via t() (zh default, en after switch); unknown text passes through', async () => {
    // the label publish is ~4Hz-throttled on performance.now() — own the clock
    const nowSpy = vi.spyOn(performance, 'now')
    let now = 1_000_000
    nowSpy.mockImplementation(() => now)
    try {
      const { result } = renderHook(() => useVisionInput(), { wrapper: I18nWrapper })
      await act(() => result.current.enableSynthetic())
      // the init ships the key-mode messages table → the engine emits codes
      const init = host.received.find((m) => m.type === 'init') as { cfg: { sessionCfg: { messages: Record<string, string> } } }
      expect(init.cfg.sessionCfg.messages['state.active']).toBe('state.active')
      // snapshot label 'state.active' → the zh i18n value (first publish)
      act(() => host.send({ type: 'snapshot', snapshot: { state: 'active', label: 'state.active' } }))
      expect(result.current.label).toBe('已激活')
      // switch to en → the NEXT snapshot renders English (per-consumer lang)
      act(() => switchLang('en'))
      now += 300
      act(() => host.send({ type: 'snapshot', snapshot: { state: 'active', label: 'state.active' } }))
      expect(result.current.label).toBe('Vision active')
      // status messages map through the same key set
      act(() => switchLang('zh'))
      act(() => host.send({ type: 'status', s: 'models.ready' }))
      expect(result.current.label).toBe('模型就绪')
      // structured retry status → localized reason with interpolated params
      now += 300
      act(() => host.send({
        type: 'snapshot',
        snapshot: {
          state: 'calibrating', stepId: 'center', label: 'cal.stepLabel',
          statusKey: 'cal.center.jitter.retry', statusParams: { sigma: '0.123' },
        },
      }))
      expect(result.current.label).toBe('手抖动过大(σ=0.123),请支撑手肘重试')
      expect(result.current.statusKey).toBe('cal.center.jitter.retry')
      // unknown text passes through verbatim — real error messages (R227)
      now += 300
      act(() => host.send({ type: 'status', s: 'frame error (2): boom' }))
      expect(result.current.label).toBe('frame error (2): boom')
      // a key code with a dynamic tail keeps the detail (GPU fallback)
      now += 300
      act(() => host.send({ type: 'status', s: 'models.gpu-fallback (WebGPU boom)' }))
      expect(result.current.label).toContain('GPU')
      expect(result.current.label).toContain('WebGPU boom')
      await act(() => result.current.disable())
    } finally {
      nowSpy.mockRestore()
    }
  })
})

// R235 test harness: mounts the real I18nProvider and captures setLang so a
// test can flip the language mid-session without remounting the hook.
let switchLang: (l: Lang) => void = () => {}
function LangProbe(): null {
  const { setLang, lang } = useI18n()
  switchLang = setLang
  void lang
  return null
}
function I18nWrapper({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <I18nProvider>
      <LangProbe />
      {children}
    </I18nProvider>
  )
}

