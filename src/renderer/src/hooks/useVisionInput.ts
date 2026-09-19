// R131: camera gesture input for the mini games — third input source beside
// keyboard and gamepad (same R103 polling model: events are written into refs
// each frame; nothing is injected at the OS level).
//
// The vision module is plain JS loaded lazily so the MediaPipe bundle + models
// never touch the main bundle. Asset base: dev server serves them from
// public/; the packaged file:// build must go through the media://app
// privileged protocol (fetch of local files is blocked on file:// origins).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VisionEvent, VisionFrame, VisionInput, VisionInputOptions } from '../vision/vision_input'

export type VisionState = 'idle' | 'searching' | 'calibrating' | 'active' | 'paused'

/**
 * Absolute URL base for the vision assets (ends with '/').
 * - dev / http(s): document-relative → vite serves src/renderer/public at '/'
 * - packaged file://: media://app/ maps to out/renderer (see main mediaProtocol)
 */
export function visionAssetBase(protocol: string = window.location.protocol): string {
  return protocol === 'file:' ? 'media://app/' : document.baseURI
}

export interface VisionInputHandle {
  enable(): Promise<void>
  /** Camera-free variant for tests/E2E — synthetic landmarks, identical pipeline. */
  enableSynthetic(): Promise<void>
  disable(): void
  recalibrate(): void
  setPaused(paused: boolean): void
  /** Unpause without re-running the calibration wizard (TD round-trip). */
  resumeActive(): void
  /** Live direction-ring tuning — Tetris runs 4-way (diagonals snap), Survival 8-way. */
  applySettings(patch: Record<string, number | null>): void
  enabled: boolean
  label: string
  state: VisionState
  /** active calibration step while calibrating, else null */
  stepId: 'center' | 'reach' | 'pinch' | null
  /** live hand detection (geom present) — synced at the same ~4Hz as state/label */
  handSeen: boolean
  /**
   * Latest per-frame snapshot, updated EVERY frame (not throttled) — the
   * VisionPad overlay reads this from its own rAF loop with zero re-renders.
   */
  frameRef: { readonly current: Partial<VisionFrame> | null }
  /** normalized held keys ('arrowleft' … 'space'), same names as MiniGamesView.normalizeKey */
  heldRef: { readonly current: Set<string> }
  /** discrete commands ('arrowleft'|'arrowright'|'arrowup'|'space') drained per frame by pollVision */
  queueRef: { readonly current: string[] }
}

export function useVisionInput(): VisionInputHandle {
  const viRef = useRef<VisionInput | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState('')
  const [state, setState] = useState<VisionState>('idle')
  const [stepId, setStepId] = useState<'center' | 'reach' | 'pinch' | null>(null)
  const [handSeen, setHandSeen] = useState(false)
  // game-facing state (normalized key names)
  const heldRef = useRef<Set<string>>(new Set())
  const queueRef = useRef<string[]>([])
  // per-frame snapshot for the pad overlay (never throttled)
  const frameRef = useRef<Partial<VisionFrame> | null>(null)
  // ≥4Hz throttle for React state sync — onFrame fires at camera fps
  const lastPublishRef = useRef(0)

  const onEvent = useCallback((event: VisionEvent) => {
    // R135: the diagnostics/E2E bus carries EVERY event — offhand pause and
    // hands-apart/together carry no key but are future-R-N semantics.
    window.dispatchEvent(new CustomEvent<VisionEvent>('vision-input', { detail: event }))
    if (!event.key) return
    const norm = event.key === 'Space' ? 'space' : event.key.toLowerCase()
    if (event.down) {
      heldRef.current.add(norm)
      queueRef.current.push(norm)
    } else {
      heldRef.current.delete(norm)
    }
  }, [])

  const onFrame = useCallback((frame: Partial<VisionFrame>) => {
    frameRef.current = frame
    const now = performance.now()
    if (now - lastPublishRef.current < 250) return
    lastPublishRef.current = now
    setState(frame.state as VisionState)
    setLabel(frame.label ?? '')
    setStepId(frame.state === 'calibrating' ? frame.stepId ?? null : null)
    setHandSeen(frame.geom != null)
  }, [])

  const start = useCallback(async (mode: 'camera' | 'synthetic') => {
    if (viRef.current) return
    const video = document.createElement('video')
    video.style.display = 'none'
    document.body.appendChild(video)
    videoRef.current = video
    try {
      const { VisionInput: VisionInputCtor } = await import('../vision/vision_input.js')
      const base = visionAssetBase()
      const vi = new VisionInputCtor({
        video,
        config: {
          wasmBase: new URL('vendor/mediapipe', base).href,
          handModel: new URL('models/hand_landmarker.task', base).href,
          // R135 (research P0-2): the face pipeline is back for modifier keys
          // (brow=Shift / jaw=E / smile=Enter). The R132 faceless cut is
          // reversed at 1/3 rate — face is a slow signal, adaptFaceRate
          // throttles further under load (p95 > 55ms → everyN escalates).
          faceModel: new URL('models/face_landmarker.task', base).href,
          // R135 (guide §3.6): dual-hand — off-hand pinch → KeyF (games
          // consume keys.has('f') when a skill mapping lands), off-hand
          // open-palm pause + hands apart/together ride the event bus.
          numHands: 2,
          maxFps: 30,
          // R134 (upstream v2 / PERFORMANCE_RESEARCH): 640×360 capture — hand
          // inference scales with pixels, this halves it vs 640×480 on the GPU
          // path with no precision loss (model input is 192/224px).
          preferLowRes: true,
          cameraLowRes: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 60, min: 15 } },
          // calibration profile survives enable/disable cycles
          session: {
            storage: localStorage,
            requireFace: false,
            faceEveryN: 3,
            dualHand: { enabled: true, primaryHand: 'Right', offPinchKey: 'KeyF' },
          },
          pinch: { key: 'Space' },
        },
        onEvent,
        onFrame,
        onStatus: (status) => setLabel(status),
      } satisfies VisionInputOptions)
      viRef.current = vi
      await vi.init()
      if (mode === 'synthetic') vi.startSynthetic()
      else await vi.startCamera()
      // R133: session.start() restores the persisted profile but still drops
      // to searching → the full 3-step wizard reruns on EVERY enable. With a
      // stored profile (returning user) re-enter active directly — the
      // hand-loss grace + recalibrate button cover drift; first-time users
      // still get the wizard.
      const stored = vi.session.profile
      if (stored && Object.keys(stored).length > 0) vi.session.forceReady(stored)
      setEnabled(true)
    } catch (err) {
      // camera denied / model load failure — tear down fully so the user can retry
      video.remove()
      videoRef.current = null
      viRef.current = null
      setEnabled(false)
      setState('idle')
      setStepId(null)
      setHandSeen(false)
      setLabel(err instanceof Error ? err.message : String(err))
      throw err
    }
  }, [onEvent, onFrame])

  const enable = useCallback(() => start('camera'), [start])

  /** Camera-free pipeline exercise: synthetic landmarks drive the identical session (tests / E2E). */
  const enableSynthetic = useCallback(() => start('synthetic'), [start])

  const disable = useCallback(() => {
    viRef.current?.stop()
    viRef.current = null
    heldRef.current.clear()
    queueRef.current.length = 0
    videoRef.current?.remove()
    videoRef.current = null
    setEnabled(false)
    setState('idle')
    setStepId(null)
    setHandSeen(false)
    frameRef.current = null
    setLabel('')
  }, [])

  const recalibrate = useCallback(() => viRef.current?.recalibrate(), [])

  const setPaused = useCallback((paused: boolean) => viRef.current?.setPaused(paused), [])

  /**
   * R133: unpause AND skip the re-calibration wizard — unparking from the TD
   * screen would otherwise drop the session to searching and demand the full
   * 3-step wizard again. The persisted calibration profile is still valid, so
   * re-enter active directly; the hand-loss grace handles the tracking gap.
   */
  const resumeActive = useCallback(() => {
    const vi = viRef.current
    if (!vi) return
    vi.setPaused(false)
    vi.session.forceReady(vi.session.profile ?? undefined)
  }, [])

  const applySettings = useCallback((patch: Record<string, number | null>) => {
    viRef.current?.applySettings(patch)
  }, [])

  // leaving the games view unmounts the hook → stop the camera, release keys
  useEffect(() => disable, [disable])

  return { enable, enableSynthetic, disable, recalibrate, setPaused, resumeActive, applySettings, enabled, label, state, stepId, handSeen, frameRef, heldRef, queueRef }
}
