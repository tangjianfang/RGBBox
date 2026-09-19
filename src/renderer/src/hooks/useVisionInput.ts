// R136: vision input client. The whole detection pipeline (camera capture,
// MediaPipe wasm, session engines) lives in a HIDDEN HOST WINDOW — its own
// renderer process — so it can never starve the game window's main thread.
// This hook talks to it over the same-origin BroadcastChannel ('rgbbox-vision').
//
// Mirror + sensitivity are user-correctable at runtime (persisted in
// localStorage); the calibration profile is persisted through the channel.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VisionEvent, VisionFrame } from '../vision/vision_input'
import { visionAssetBase } from './visionAssetBase'

export type VisionState = 'idle' | 'searching' | 'calibrating' | 'active' | 'paused'
export type VisionSensitivity = 'standard' | 'fast' | 'sport'

const PROFILE_KEY = 'vgi-profile-v2'
const MIRROR_KEY = 'rgbbox:visionMirror'
const SENSITIVITY_KEY = 'rgbbox:visionSensitivity'

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

function readSensitivity(): VisionSensitivity {
  try {
    const raw = localStorage.getItem(SENSITIVITY_KEY)
    return raw === 'fast' || raw === 'sport' ? raw : 'standard'
  } catch {
    return 'standard'
  }
}

const SENSITIVITY_CONFIRM_MS: Record<VisionSensitivity, number> = { standard: 90, fast: 45, sport: 0 }

export interface VisionInputHandle {
  enable(): Promise<void>
  /** Camera-free variant for tests/E2E — synthetic landmarks, identical pipeline. */
  enableSynthetic(): Promise<void>
  disable(): void
  recalibrate(): void
  setPaused(paused: boolean): void
  /** Unpause without re-running the calibration wizard (TD round-trip). */
  resumeActive(): void
  /** Skip the wizard entirely — enter active with default parameters. */
  skipCalibration(): void
  applySettings(patch: Record<string, number | null>): void
  /** R136: runtime x-flip toggle — fixes reversed left/right for any camera setup. */
  setMirror(mirror: boolean): void
  mirror: boolean
  /** R136: latency-vs-accuracy preset (confirmMs 90/45/0). */
  setSensitivity(level: VisionSensitivity): void
  sensitivity: VisionSensitivity
  enabled: boolean
  label: string
  state: VisionState
  /** active calibration step while calibrating, else null */
  stepId: 'center' | 'reach' | 'pinch' | null
  /** live hand detection (geom present) — synced instantly on change */
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

/**
 * R136.1: the pipeline lives in a HIDDEN HOST WINDOW (its own renderer
 * process — see main/index.ts visionHostOpen). MediaPipe spawns an internal
 * wasm worker that fails when nested inside a Web Worker from this file://
 * page ("ModuleFactory not set"), but works from a plain renderer document —
 * the same setup the main thread used since R131. Data flows over the
 * same-origin BroadcastChannel ('rgbbox-vision'), the AudioViz projector
 * pattern; the host window is the only IPC surface.
 */

const VISION_CHANNEL = 'rgbbox-vision'

export function useVisionInput(): VisionInputHandle {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const hostOpenRef = useRef(false)
  const pausedRef = useRef(false)
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState('')
  const [state, setState] = useState<VisionState>('idle')
  const [stepId, setStepId] = useState<'center' | 'reach' | 'pinch' | null>(null)
  const [handSeen, setHandSeen] = useState(false)
  const [mirror, setMirrorState] = useState(() => readBool(MIRROR_KEY, true))
  const [sensitivity, setSensitivityState] = useState<VisionSensitivity>(readSensitivity)
  // game-facing state (normalized key names)
  const heldRef = useRef<Set<string>>(new Set())
  const queueRef = useRef<string[]>([])
  // per-frame snapshot for the pad overlay (never throttled)
  const frameRef = useRef<Partial<VisionFrame> | null>(null)
  // publish throttle: label text at ~4Hz; state/handSeen/stepId INSTANTLY
  const lastLabelPublishRef = useRef(0)
  // R138: consecutive handless frames — handSeen loss needs 5 before publish
  const handlessFramesRef = useRef(0)
  const prevPublishRef = useRef<{ state: string; handSeen: boolean; stepId: string | null }>({ state: 'idle', handSeen: false, stepId: null })

  const onEvent = useCallback((event: VisionEvent) => {
    // diagnostics/E2E bus carries EVERY event (offhand pause, hands apart/together…)
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

  const onSnapshot = useCallback((snapshot: Partial<VisionFrame>) => {
    frameRef.current = snapshot
    // instant publish for anything the banner must react to immediately —
    // EXCEPT handSeen loss: detection-score jitter makes geom flicker null
    // at the margin, and an immediate publish re-renders the whole games
    // view per flicker. R138: require 5 consecutive handless frames (~165ms
    // @30Hz) before publishing the loss; presence still publishes instantly.
    const seen = snapshot.geom != null
    if (seen) handlessFramesRef.current = 0
    else handlessFramesRef.current++
    const prev = prevPublishRef.current
    const handSeenNext = seen ? true : handlessFramesRef.current >= 5 ? false : prev.handSeen
    const next = { state: snapshot.state as string, handSeen: handSeenNext, stepId: snapshot.stepId ?? null }
    if (next.state !== prev.state || next.handSeen !== prev.handSeen || next.stepId !== prev.stepId) {
      prevPublishRef.current = next
      setState(next.state as VisionState)
      setHandSeen(next.handSeen)
      setStepId(next.stepId as 'center' | 'reach' | 'pinch' | null)
    }
    const now = performance.now()
    if (now - lastLabelPublishRef.current >= 250) {
      lastLabelPublishRef.current = now
      setLabel(snapshot.label ?? '')
    }
  }, [])

  const start = useCallback(async (mode: 'camera' | 'synthetic') => {
    if (channelRef.current) return
    const base = visionAssetBase()
    let storedProfile: unknown = null
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (raw) storedProfile = JSON.parse(raw)
    } catch { /* corrupt → null */ }

    // open the hidden pipeline host window (its own renderer process)
    await window.rgbbox.visionHostOpen()
    hostOpenRef.current = true
    const channel = new BroadcastChannel(VISION_CHANNEL)
    channelRef.current = channel

    await new Promise<void>((resolve, reject) => {
      // single onmessage handler (the test mock implements onmessage only) —
      // serves both the init handshake and the steady-state message flow.
      // 'host-hello' re-triggers init: BroadcastChannel does not buffer, so an
      // init posted before the host script executed would otherwise be lost.
      let initSent = false
      const sendInit = () => {
        if (initSent) return
        initSent = true
        channel.postMessage({
          type: 'init',
          cfg: {
            mode,
            bundleUrl: new URL('vendor/mediapipe/vision_bundle.js', base).href,
            wasmBase: new URL('vendor/mediapipe', base).href,
            handModel: new URL('models/hand_landmarker.task', base).href,
            faceModel: new URL('models/face_landmarker.task', base).href,
            numHands: 2,
            mirror,
            sensitivity,
            storedProfile,
            sessionCfg: {
              requireFace: false,
              faceEveryN: 3,
              dualHand: { enabled: true, primaryHand: 'Right', offPinchKey: 'KeyF' },
            },
          },
        })
      }
      channel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type: string; events?: VisionEvent[]; snapshot?: Partial<VisionFrame>; s?: string; profile?: unknown; message?: string }
        if (msg.type === 'ready') {
          resolve()
        } else if (msg.type === 'error') {
          reject(new Error(msg.message ?? 'vision host init failed'))
          return
        } else if (msg.type === 'host-hello') {
          // the hello proves the host just came up — an init posted before
          // its channel existed was lost, so always resend (host ignores
          // duplicates once initialized)
          initSent = false
          sendInit()
        } else if (msg.type === 'events' && msg.events) {
          for (const e of msg.events) onEvent(e)
        } else if (msg.type === 'snapshot' && msg.snapshot) {
          onSnapshot(msg.snapshot)
        } else if (msg.type === 'status' && msg.s) {
          setLabel(msg.s)
        } else if (msg.type === 'profile-save' && msg.profile) {
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(msg.profile)) } catch { /* non-fatal */ }
        }
      }
      sendInit()
    })
    setEnabled(true)
  }, [mirror, onEvent, onSnapshot, sensitivity])

  const enable = useCallback(() => start('camera'), [start])
  const enableSynthetic = useCallback(() => start('synthetic'), [start])

  const disable = useCallback(() => {
    channelRef.current?.postMessage({ type: 'stop' })
    channelRef.current?.close()
    channelRef.current = null
    if (hostOpenRef.current) {
      hostOpenRef.current = false
      void window.rgbbox.visionHostClose()
    }
    pausedRef.current = false
    handlessFramesRef.current = 0
    heldRef.current.clear()
    queueRef.current.length = 0
    frameRef.current = null
    setEnabled(false)
    setState('idle')
    setStepId(null)
    setHandSeen(false)
    setLabel('')
  }, [])

  const recalibrate = useCallback(() => channelRef.current?.postMessage({ type: 'recalibrate' }), [])

  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p
    channelRef.current?.postMessage({ type: 'pause', p })
  }, [])

  const resumeActive = useCallback(() => {
    pausedRef.current = false
    const channel = channelRef.current
    if (!channel) return
    channel.postMessage({ type: 'pause', p: false })
    let profile: unknown = null
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (raw) profile = JSON.parse(raw)
    } catch { /* ignore */ }
    channel.postMessage({ type: 'forceReady', profile: profile ?? undefined })
  }, [])

  const skipCalibration = useCallback(() => {
    channelRef.current?.postMessage({ type: 'forceReady', profile: undefined })
  }, [])

  const applySettings = useCallback((patch: Record<string, number | null>) => {
    channelRef.current?.postMessage({ type: 'settings', patch })
  }, [])

  const setMirror = useCallback((m: boolean) => {
    setMirrorState(m)
    try { localStorage.setItem(MIRROR_KEY, m ? '1' : '0') } catch { /* non-fatal */ }
    channelRef.current?.postMessage({ type: 'mirror', m })
  }, [])

  const setSensitivity = useCallback((level: VisionSensitivity) => {
    setSensitivityState(level)
    try { localStorage.setItem(SENSITIVITY_KEY, level) } catch { /* non-fatal */ }
    channelRef.current?.postMessage({ type: 'settings', patch: { confirmMs: SENSITIVITY_CONFIRM_MS[level] } })
  }, [])

  // leaving the games view unmounts the hook → stop the camera, release keys
  useEffect(() => disable, [disable])

  return {
    enable, enableSynthetic, disable, recalibrate, setPaused, resumeActive, skipCalibration, applySettings,
    setMirror, mirror, setSensitivity, sensitivity,
    enabled, label, state, stepId, handSeen, frameRef, heldRef, queueRef,
  }
}
