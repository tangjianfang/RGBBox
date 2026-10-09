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
import { useI18n, type TranslationKey } from '../i18n'

export type VisionState = 'idle' | 'searching' | 'calibrating' | 'active' | 'paused'
export type VisionSensitivity = 'standard' | 'fast' | 'sport'

const PROFILE_KEY = 'vgi-profile-v2'
const MIRROR_KEY = 'rgbbox:visionMirror'
const PRIMARY_HAND_KEY = 'rgbbox:visionPrimaryHand'
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

// ── R235: engine message localization ──────────────────────────────────────
// The session/pipeline render user-facing text from a messages catalog. This
// hook injects the identity table (key→key) so the engine emits stable CODES
// over the wire, then localizes them at the consumer via i18n
// `games.vision.engine.<key>` — per-consumer language, switchable at runtime,
// zh values byte-identical to the pre-R235 engine strings. Text that hits no
// key (real error messages — R227) passes through verbatim.

type TFn = (key: TranslationKey) => string

const ENGINE_PREFIX = 'games.vision.engine.'
const VISION_MSG_KEY_SET: ReadonlySet<string> = new Set(VISION_MSG_KEYS)

/** {param} interpolation over a t() template (params come from the engine). */
function interpolate(template: string, params: Record<string, unknown> | null | undefined): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] != null ? String(params[name]) : m)
}

/** A structured engine code → localized text (exact key hit). */
function translateEngineKey(key: string, params: Record<string, unknown> | null | undefined, t: TFn): string {
  if (!VISION_MSG_KEY_SET.has(key)) return key
  return interpolate(t((ENGINE_PREFIX + key) as TranslationKey), params)
}

/**
 * Wire text → localized text. Exact code hit → t(); code with a dynamic tail
 * ('models.gpu-fallback (…)' keeps the raw error detail); anything else is
 * passed through unchanged (R227: real error messages are the actionable
 * text — never mangle them).
 */
function translateEngineText(text: string, t: TFn): string {
  if (VISION_MSG_KEY_SET.has(text)) return translateEngineKey(text, null, t)
  for (const key of VISION_MSG_KEYS) {
    if (text.startsWith(key) && (text.length === key.length || text[key.length] === ' ' || text[key.length] === '(')) {
      return translateEngineKey(key, null, t) + text.slice(key.length)
    }
  }
  return text
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
  /** Skip the wizard entirely — enter active with default parameters. */
  skipCalibration(): void
  applySettings(patch: Record<string, number | null>): void
  /** R136: runtime x-flip toggle — fixes reversed left/right for any camera setup. */
  setMirror(mirror: boolean): void
  mirror: boolean
  /** R149: runtime primary-hand role switch ('Left' | 'Right'), persisted. */
  setPrimaryHand(side: 'Left' | 'Right'): void
  primaryHand: 'Left' | 'Right'
  /** R141-B: capture precision — fast 640×360 (games) vs precise 960×540 (cursor/assistant). */
  /** R142-E5: chord text mode — chords emit characters into chordBuffer() */
  setChordTextMode(on: boolean): void
  chordBackspace(): void
  chordBuffer(): string
  setCapturePrecision(precise: boolean): void
  /** R136: latency-vs-accuracy preset (confirmMs 90/45/0). */
  setSensitivity(level: VisionSensitivity): void
  sensitivity: VisionSensitivity
  enabled: boolean
  label: string
  /**
   * R235: the structured engine status code behind `label` when the engine
   * reports a calibration gate result (e.g. 'cal.center.jitter.retry') —
   * null otherwise. Consumers use it for locale-independent decisions (the
   * retry chip check) instead of matching rendered text.
   */
  statusKey: string | null
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
  /** R230: last enable/init failure message; null while healthy; cleared on retry */
  error: string | null
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

// R228: protocol constants + per-instance consumer id for the refcounted
// host session (see vision/hostProtocol.js). R235: VISION_KEY_MESSAGES is
// the identity table injected into the engine so it emits stable codes.
import { VISION_CHANNEL, VISION_MSG_KEYS, VISION_KEY_MESSAGES, nextConsumerId } from '../vision/hostProtocol'

export function useVisionInput(): VisionInputHandle {
  const { t } = useI18n()
  // handlers close over this ref, so a live language switch re-localizes the
  // NEXT message without tearing the channel down (t identity changes per lang)
  const tRef = useRef<TFn>(t)
  tRef.current = t
  const channelRef = useRef<BroadcastChannel | null>(null)
  // R227.4: in-flight startup dedupe (double-toggle safety)
  const startInFlightRef = useRef<Promise<void> | null>(null)
  // R228: stable per-hook-instance id — the host refcounts consumers so one
  // view disabling never kills another live consumer's camera session.
  const consumerIdRef = useRef<string>('')
  if (!consumerIdRef.current) consumerIdRef.current = nextConsumerId()
  const pausedRef = useRef(false)
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState('')
  // R235: structured engine status code (published INSTANTLY with the state
  // tuple — the retry chip must react on the exact frame it happens)
  const [statusKey, setStatusKey] = useState<string | null>(null)
  // R230: the REAL last error (a failed enable used to leave `label` holding
  // a stale status like "models ready", which status chips rendered as the
  // nonsense "启动失败: models ready" — REVIEW-VISION 07-X1)
  const [error, setError] = useState<string | null>(null)
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
  const prevPublishRef = useRef<{ state: string; handSeen: boolean; stepId: string | null; statusKey: string | null }>({ state: 'idle', handSeen: false, stepId: null, statusKey: null })

  const onEvent = useCallback((event: VisionEvent) => {
    // diagnostics/E2E bus carries EVERY event (offhand pause, hands apart/together…)
    window.dispatchEvent(new CustomEvent<VisionEvent>('vision-input', { detail: event }))
    // R142-L4: finger chords are discrete commands (no held-key semantics)
    if (event.kind === 'chord' && event.name) {
      queueRef.current.push(`chord:${event.name}`)
      return
    }
    if (!event.key) return
    // R230: the engines emit KeyboardEvent-CODE names for face modifiers and
    // the off-hand pinch ('KeyE'/'ShiftLeft'/'KeyF'), while the consumers'
    // passthrough table expects 'e'/'shift'/'f' — the mismatch made R135's
    // face-modifier feature dead on arrival (REVIEW-VISION 08, keye≠e).
    const norm = event.key === 'Space' ? 'space'
      : /^Key[A-Z]$/.test(event.key) ? event.key.slice(3).toLowerCase()
      : /^(Shift|Control|Alt|Meta)(Left|Right)?$/.test(event.key) ? event.key.replace(/(Left|Right)$/, '').toLowerCase()
      : event.key.toLowerCase()
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
    // R235: the structured status code rides the INSTANT tuple (retry/extend
    // gate results change without any state change while calibrating)
    const next = {
      state: snapshot.state as string,
      handSeen: handSeenNext,
      stepId: snapshot.stepId ?? null,
      statusKey: snapshot.statusKey ?? null,
    }
    if (next.state !== prev.state || next.handSeen !== prev.handSeen || next.stepId !== prev.stepId || next.statusKey !== prev.statusKey) {
      prevPublishRef.current = next
      setState(next.state as VisionState)
      setHandSeen(next.handSeen)
      setStepId(next.stepId as 'center' | 'reach' | 'pinch' | null)
      setStatusKey(next.statusKey)
    }
    const now = performance.now()
    if (now - lastLabelPublishRef.current >= 250) {
      lastLabelPublishRef.current = now
      // R235: a retry gate result replaces the (code-mode) label with the
      // localized actionable reason; otherwise map the label code → t()
      const key = snapshot.statusKey
      if (key && key.endsWith('.retry')) {
        setLabel(translateEngineKey(key, snapshot.statusParams, tRef.current))
      } else {
        setLabel(translateEngineText(snapshot.label ?? '', tRef.current))
      }
    }
  }, [])

  const start = useCallback(async (mode: 'camera' | 'synthetic') => {
    if (channelRef.current) return
    setError(null) // R230: a new attempt clears the previous failure
    // R227.4: rapid double-toggle must share ONE startup — two concurrent
    // starts each created a BroadcastChannel (double-queued commands, leaked
    // channel) and the loser's error left the winner's channel behind.
    if (startInFlightRef.current) return startInFlightRef.current
    const attempt = (async () => {
    const base = visionAssetBase()
    let storedProfile: unknown = null
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (raw) storedProfile = JSON.parse(raw)
    } catch { /* corrupt → null */ }

    // open the hidden pipeline host window (its own renderer process)
    await window.rgbbox.visionHostOpen()
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
            // R142-L1: 60fps full-frame capture — MJPG at 640×480 is standard
            // webcam fare; the host pipeline (its own renderer process)
            // processes EVERY frame, cutting the end-to-end chain by a frame+.
            camera: { width: 640, height: 480, frameRate: 60 },
            maxFps: 60,
            mirror,
            sensitivity,
            storedProfile,
            sessionCfg: {
              requireFace: false,
              faceEveryN: 3,
              dualHand: { enabled: true, primaryHand, offPinchKey: 'KeyF' }, // R149: persisted primary-hand role
              // R235: identity catalog — the engine emits stable codes, this
              // hook localizes them per consumer language (zh = engine defaults)
              messages: VISION_KEY_MESSAGES,
            },
          },
        })
      }
      channel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type: string; events?: VisionEvent[]; snapshot?: Partial<VisionFrame>; s?: string; profile?: unknown; message?: string }
        if (msg.type === 'ready') {
          resolve()
        } else if (msg.type === 'error') {
          // R230: record the REAL reason — label too, so every existing status
          // chip shows it instead of the stale "models ready" nonsense.
          const reason = msg.message ?? 'vision host init failed'
          setError(reason)
          setLabel(reason)
          reject(new Error(reason))
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
          // R235: pipeline/host lifecycle statuses are codes ('models.ready')
          // — localize; anything else (real diagnostics) passes through
          setLabel(translateEngineText(msg.s, tRef.current))
        } else if (msg.type === 'profile-save' && msg.profile) {
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(msg.profile)) } catch { /* non-fatal */ }
        }
      }
      sendInit()
    })
    channelRef.current?.postMessage({ type: 'acquire', consumerId: consumerIdRef.current })
    setEnabled(true)
    })()
    // R227.4: failure must roll the half-built state back — a leaked
    // channelRef turned every later enable() into a silent no-op (the
    // "dead button" bug: retry was impossible without remounting the view).
    const tracked = attempt.catch((err) => {
      // R228: our OWN init failed — close our channel only. The host window
      // may be serving another consumer; it is not ours to close.
      channelRef.current?.close()
      channelRef.current = null
      throw err
    }).finally(() => { startInFlightRef.current = null })
    startInFlightRef.current = tracked
    return tracked
  }, [mirror, onEvent, onSnapshot, sensitivity])

  const enable = useCallback(() => start('camera'), [start])
  const enableSynthetic = useCallback(() => start('synthetic'), [start])

  const disable = useCallback(() => {
    // R228: RELEASE, not stop — the host tears the camera down only when the
    // last consumer leaves (this hook's 'stop' was killing the assistant's
    // session and vice versa). The hidden host WINDOW stays warm (a hidden
    // idle renderer is cheap); closing it here would kill every other
    // consumer's session and defeat the refcount. It dies with the main
    // window (main/index.ts R228).
    channelRef.current?.postMessage({ type: 'release', consumerId: consumerIdRef.current })
    channelRef.current?.close()
    channelRef.current = null
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
    setStatusKey(null)
    setError(null)
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

  // R149: runtime primary-hand switch — left-handed users no longer need the
  // single-hand promotion heuristic; the role assignment follows their hand.
  const [primaryHand, setPrimaryHandState] = useState<'Left' | 'Right'>(() =>
    (localStorage.getItem(PRIMARY_HAND_KEY) as 'Left' | 'Right' | null) ?? 'Right'
  )
  const setPrimaryHand = useCallback((side: 'Left' | 'Right') => {
    setPrimaryHandState(side)
    try { localStorage.setItem(PRIMARY_HAND_KEY, side) } catch { /* non-fatal */ }
    channelRef.current?.postMessage({ type: 'primaryHand', side })
  }, [])

  const setChordTextMode = useCallback((on: boolean) => {
    channelRef.current?.postMessage({ type: 'textmode', on })
  }, [])
  const chordBackspace = useCallback(() => channelRef.current?.postMessage({ type: 'backspace' }), [])
  const chordBuffer = useCallback((): string => (frameRef.current?.chordBuffer as string | undefined) ?? '', [])

  const setCapturePrecision = useCallback((precise: boolean) => {
    channelRef.current?.postMessage({ type: 'capture', camera: precise ? { width: 960, height: 540, frameRate: 60 } : { width: 640, height: 360, frameRate: 60 } })
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
    setMirror, mirror, setPrimaryHand, primaryHand, setChordTextMode, chordBackspace, chordBuffer, setCapturePrecision, setSensitivity, sensitivity,
    enabled, label, statusKey, error, state, stepId, handSeen, frameRef, heldRef, queueRef,
  }
}
