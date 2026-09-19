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
    config: { wasmBase: string; handModel: string; faceModel: string }
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
}

const visionState = vi.hoisted(() => ({ instances: [] as FakeVisionInput[], failInit: false }))

vi.mock('../../../src/renderer/src/vision/vision_input.js', () => ({
  VisionInput: class {
    opts: any
    inited = false
    cameraStarted = false
    syntheticStarted = false
    stopped = false
    settings: Record<string, number | null> | null = null
    constructor(opts: any) {
      this.opts = opts
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
    expect(fake.opts.config.faceModel).toContain('models/face_landmarker.task')
    const video = document.querySelector('body > video')
    expect(video).toBeTruthy()
    expect((video as HTMLElement).style.display).toBe('none')
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
