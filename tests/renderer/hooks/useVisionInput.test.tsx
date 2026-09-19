// @vitest-environment happy-dom
// R136: useVisionInput as the client of the hidden vision host window. The
// transport is the (mocked, cross-instance) BroadcastChannel 'rgbbox-vision'
// — this suite plays the HOST side: answers init with ready, then scripts
// events / snapshots / profile-save messages.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useVisionInput } from '../../../src/renderer/src/hooks/useVisionInput'
import { visionAssetBase } from '../../../src/renderer/src/hooks/visionAssetBase'
import type { VisionEvent, VisionFrame } from '../../../src/renderer/src/vision/vision_input'
import { setupRendererMocks } from '../_helpers'

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
    await act(() => result.current.disable())
    expect(host.received.some((m) => m.type === 'stop')).toBe(true)
    expect(rgbbox.visionHostClose).toHaveBeenCalled()
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
      if ((ev.data as HostMessage).type === 'init') failing.send({ type: 'error', message: 'wasm boom' })
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
    failing.dispose()
  })

  it('unmounting stops the host (stop + window close)', async () => {
    const { result, unmount } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    unmount()
    expect(host.received.some((m) => m.type === 'stop')).toBe(true)
    expect(rgbbox.visionHostClose).toHaveBeenCalled()
  })

  it('frameRef snapshot type surface (compile-time contract)', () => {
    const frame: Partial<VisionFrame> = { state: 'active', stepProgress: 0.5 }
    expect(frame.state).toBe('active')
  })
})
