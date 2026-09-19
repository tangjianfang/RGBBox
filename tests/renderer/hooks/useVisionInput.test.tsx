// @vitest-environment happy-dom
// R131: useVisionInput — event normalization, held/queue refs, throttle,
// lifecycle (enable/disable/unmount) and asset-base selection. The vision
// module itself is a controlled fake; the hook under test is real.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useVisionInput, visionAssetBase } from '../../../src/renderer/src/hooks/useVisionInput'
import type { VisionEvent, VisionFrame } from '../../../src/renderer/src/vision/vision_input'

interface FakeVisionInput {
  opts: {
    config: {
      wasmBase: string
      handModel: string
      faceModel: string | null
      numHands: number
      maxFps: number
      session: Record<string, unknown>
      preferLowRes: boolean
      cameraLowRes: { width: { ideal: number }; height: { ideal: number }; frameRate: { ideal: number } }
    }
    onEvent: (event: VisionEvent) => void
    onFrame: (frame: Partial<VisionFrame>) => void
  }
  init(): Promise<void>
  startCamera(): Promise<void>
  startSynthetic(): void
  stop(): void
  inited: boolean
  cameraStarted: boolean
  syntheticStarted: boolean
  stopped: boolean
  settings: Record<string, number | null> | null
  forceReadyArg: Record<string, unknown> | null | undefined
  session: { profile: Record<string, unknown> | null; forceReady(p?: Record<string, unknown>): void }
}

const visionState = vi.hoisted(() => ({
  instances: [] as FakeVisionInput[],
  failInit: false,
  // R133: persisted calibration to simulate a returning user (profile skip)
  seedProfile: null as Record<string, unknown> | null,
}))

vi.mock('../../../src/renderer/src/vision/vision_input.js', () => ({
  VisionInput: class {
    opts: any
    inited = false
    cameraStarted = false
    syntheticStarted = false
    stopped = false
    settings: Record<string, number | null> | null = null
    forceReadyArg: Record<string, unknown> | null | undefined
    session: { profile: Record<string, unknown> | null; forceReady(p?: Record<string, unknown>): void }
    constructor(opts: any) {
      this.opts = opts
      this.session = {
        profile: visionState.seedProfile,
        forceReady: (p?: Record<string, unknown>) => {
          this.forceReadyArg = p ?? null
          if (p) this.session.profile = p
        },
      }
      visionState.instances.push(this as unknown as FakeVisionInput)
    }
    async init() {
      if (visionState.failInit) throw new Error('boom')
      this.inited = true
    }
    async startCamera() { this.cameraStarted = true }
    startSynthetic() { this.syntheticStarted = true }
    stop() { this.stopped = true }
    setPaused() { /* noop */ }
    recalibrate() { /* noop */ }
    applySettings(patch: Record<string, number | null>) { this.settings = patch }
  },
}))

beforeEach(() => {
  visionState.instances.length = 0
  visionState.failInit = false
  visionState.seedProfile = null
  cleanup()
})

describe('renderer/hooks/useVisionInput (R131)', () => {
  it('visionAssetBase: document-relative over http, media://app for packaged file://', () => {
    expect(visionAssetBase('http:')).toBe(document.baseURI)
    expect(visionAssetBase('https:')).toBe(document.baseURI)
    expect(visionAssetBase('file:')).toBe('media://app/')
  })

  it('enable(): lazy-loads the module, starts the camera with absolute asset URLs, hides the video', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    expect(result.current.enabled).toBe(true)
    expect(visionState.instances.length).toBe(1)
    const fake = visionState.instances[0]
    expect(fake.inited).toBe(true)
    expect(fake.cameraStarted).toBe(true)
    expect(fake.opts.config.wasmBase).toContain('vendor/mediapipe')
    expect(fake.opts.config.handModel).toContain('models/hand_landmarker.task')
    const video = document.querySelector('body > video')
    expect(video).toBeTruthy()
    expect((video as HTMLElement).style.display).toBe('none')
    await act(() => result.current.disable())
  })

  it('enable() runs the R134/R135 budget: dual-hand, face @1/3 rate, 30fps cap, 640×360@60 capture', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const cfg = visionState.instances[0].opts.config
    expect(cfg.faceModel).toContain('face_landmarker.task') // R135: face modifiers back
    expect(cfg.numHands).toBe(2) // R135: dual-hand
    expect(cfg.maxFps).toBe(30)
    expect(cfg.preferLowRes).toBe(true)
    expect((cfg.cameraLowRes.width as { ideal: number }).ideal).toBe(640)
    expect((cfg.cameraLowRes.height as { ideal: number }).ideal).toBe(360)
    expect((cfg.cameraLowRes.frameRate as { ideal: number }).ideal).toBe(60)
    expect(cfg.session.requireFace).toBe(false)
    expect(cfg.session.faceEveryN).toBe(3)
    expect((cfg.session.dualHand as { enabled: boolean }).enabled).toBe(true)
    await act(() => result.current.disable())
  })

  it('events normalize to game key names: held set + discrete queue + window bus', async () => {
    const bus = vi.fn()
    window.addEventListener('vision-input', bus)
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const fake = visionState.instances[0]
    act(() => {
      fake.opts.onEvent({ kind: 'direction', key: 'ArrowLeft', down: true, dir: 'left' })
      fake.opts.onEvent({ kind: 'pinch', key: 'Space', down: true })
      fake.opts.onEvent({ kind: 'direction', key: 'ArrowLeft', down: false, dir: 'left' })
    })
    expect(result.current.heldRef.current.has('arrowleft')).toBe(false) // released
    expect(result.current.heldRef.current.has('space')).toBe(true)
    expect(result.current.queueRef.current).toEqual(['arrowleft', 'space'])
    expect(bus).toHaveBeenCalledTimes(3)
    // bookkeeping events (no key) never reach the game-facing refs
    act(() => fake.opts.onEvent({ kind: 'face', key: null, down: false, name: 'calibrated' }))
    expect(result.current.queueRef.current.length).toBe(2)
    window.removeEventListener('vision-input', bus)
    await act(() => result.current.disable())
  })

  it('onFrame publishes at most ~4Hz (first frame wins, immediate follow-ups throttled)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const fake = visionState.instances[0]
    act(() => fake.opts.onFrame({ state: 'searching', label: 'looking…' }))
    expect(result.current.state).toBe('searching')
    expect(result.current.label).toBe('looking…')
    act(() => fake.opts.onFrame({ state: 'calibrating', label: '校准 1/3', stepId: 'center' }))
    expect(result.current.state).toBe('searching') // throttled (<250ms later)
    await act(() => result.current.disable())
  })

  it('frameRef updates EVERY frame (pad overlay path) and handSeen follows geom presence (R132)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const fake = visionState.instances[0]
    const geom = { palm: { x: 0.51, y: 0.54 }, pinch: 1.1, scale: 0.18 }
    // first onFrame publishes immediately — carries the hand geometry
    act(() => fake.opts.onFrame({ state: 'active', label: 'a', geom }))
    expect(result.current.handSeen).toBe(true)
    expect(result.current.frameRef.current?.geom).toEqual(geom)
    // a handless frame lands in the ref instantly, while the throttled React
    // state keeps the last published value — exactly the split the pad needs
    act(() => fake.opts.onFrame({ state: 'active', label: 'b', geom: null, stepProgress: 0.5 }))
    expect(result.current.frameRef.current?.geom).toBeNull()
    expect(result.current.frameRef.current?.stepProgress).toBe(0.5)
    expect(result.current.handSeen).toBe(true) // still the throttled value
    await act(() => result.current.disable())
    expect(result.current.frameRef.current).toBeNull()
  })

  it('disable() stops the engine, clears every held key and removes the video element', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const fake = visionState.instances[0]
    act(() => fake.opts.onEvent({ kind: 'pinch', key: 'Space', down: true }))
    expect(result.current.heldRef.current.size).toBe(1)
    act(() => result.current.disable())
    expect(fake.stopped).toBe(true)
    expect(result.current.enabled).toBe(false)
    expect(result.current.state).toBe('idle')
    expect(result.current.heldRef.current.size).toBe(0)
    expect(result.current.queueRef.current.length).toBe(0)
    expect(document.querySelector('body > video')).toBeNull()
  })

  it('enableSynthetic(): same pipeline, synthetic source instead of the camera (E2E seam)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enableSynthetic())
    const fake = visionState.instances[0]
    expect(fake.inited).toBe(true)
    expect(fake.syntheticStarted).toBe(true)
    expect(fake.cameraStarted).toBe(false)
    expect(result.current.enabled).toBe(true)
    await act(() => result.current.disable())
  })

  it('applySettings passes through live tuning (Tetris 4-way / Survival 8-way)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    act(() => result.current.applySettings({ dirs: 4 }))
    expect(visionState.instances[0].settings).toEqual({ dirs: 4 })
    await act(() => result.current.disable())
  })

  it('a stored calibration profile skips the wizard (R133 returning-user path)', async () => {
    const profile = { center: { x: 0.5, y: 0.55 }, pinchOn: 0.4, pinchOff: 0.7 }
    visionState.seedProfile = profile
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    expect(visionState.instances[0].forceReadyArg).toEqual(profile)
    await act(() => result.current.disable())
  })

  it('no stored profile → no forceReady (first-time user gets the wizard)', async () => {
    const { result } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    expect(visionState.instances[0].forceReadyArg).toBeUndefined()
    await act(() => result.current.disable())
  })

  it('a failed enable() tears down completely and surfaces the error', async () => {
    visionState.failInit = true
    const { result } = renderHook(() => useVisionInput())
    // catch inside act — a rejected act() promise skips React's flush
    let caught: unknown = null
    await act(async () => {
      try {
        await result.current.enable()
      } catch (err) {
        caught = err
      }
    })
    expect((caught as Error).message).toBe('boom')
    expect(result.current.enabled).toBe(false)
    expect(result.current.state).toBe('idle')
    expect(result.current.label).toContain('boom')
    expect(document.querySelector('body > video')).toBeNull()
  })

  it('unmounting stops the camera (leaving the games view)', async () => {
    const { result, unmount } = renderHook(() => useVisionInput())
    await act(() => result.current.enable())
    const fake = visionState.instances[0]
    unmount()
    expect(fake.stopped).toBe(true)
  })
})
