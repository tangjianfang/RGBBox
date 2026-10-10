// hostMessenger (R234) — the vision-host SESSION ORCHESTRATION, extracted
// from visionHostMain.js (06-R1/R8: ~200 lines of untestable glue). Every
// lifecycle decision the host used to make inline lives here behind
// injectable seams, so the R227/R228 semantics are unit-testable without
// electron/DOM (tests/vision/hostSession.test.mjs):
//   - duplicate init re-replies ready (swallowing the hello-triggered second
//     init left the client's enable() awaiting a reply that never came)
//   - the camera is a refcount: acquire/release per consumer, only the LAST
//     one out closes it; 'stop' is a force-stop that ALSO clears the registry
//     (stale consumers must never pin the camera open forever)
//   - init is cut at 20s; half-built sessions are torn down + stopped + nulled
//   - the camera tick survives per-frame throws: consecutive errors first
//     rebuild the landmarkers on CPU (R227.6), then shut down CLEAN — camera
//     off, error surfaced, never a silent zombie keeping the camera light on
//   - a throwing pipeline method surfaces an error reply, never kills the host
//   - R244: while a session is live the host BEATS every 5s ({type:'heartbeat'}).
//     A dead/hung host renderer cannot say goodbye — the client's watchdog
//     reads the missing beats (main closes the window on render-process-gone)
//     and self-heals. The interval starts on a successful init (and is revived
//     by a capture-mode restart, which rebuilds the stream) and dies with the
//     session in fullTeardown.
// The host shell keeps only the DOM/electron glue (BroadcastChannel, the
// video element + getUserMedia, landmarker loading) and forwards every
// message to messenger.handle(msg).
//
// deps (all injectable — see tests/vision/hostSession.test.mjs for fakes):
//   post(msg)                  — send one reply to the client
//   pipelineApi.create(opts)   — pipeline factory (host: new VisionPipeline)
//   loadLandmarkers(cfg)       — loader passed through to the pipeline opts
//   startCamera(mode)          — open the camera; resolves the video source
//   teardown()                 — host-side camera/DOM cleanup
//   now()                      — clock (default performance.now)
//   scheduleInterval/clearTimer/scheduleTimeout — timer seams (globals)
//   initTimeoutMs              — init watchdog, default 20000 (R227.2)

import { createSessionRegistry } from './hostProtocol.js'

export function createHostMessenger(deps) {
  const {
    post,
    pipelineApi,
    loadLandmarkers,
    startCamera,
    teardown,
    now = () => performance.now(),
    scheduleInterval = (fn, ms) => setInterval(fn, ms),
    clearTimer = (t) => clearInterval(t),
    scheduleTimeout = (fn, ms) => setTimeout(fn, ms),
    initTimeoutMs = 20000,
  } = deps

  let pipeline = null
  // R227.6: kept for the GPU→CPU runtime rebuild path
  let lastCfg = null
  // R141-B: current capture mode (cfg.camera or the {type:'capture'} switch).
  // Rolled back when a capture switch fails, so a dead mode can never poison
  // the next restart (R227 rollback discipline).
  let cameraMode = { width: 640, height: 360, frameRate: 60 }
  let video = null
  let vfcId = null
  let syntheticTimer = null
  // R244: the 5s liveness beacon (see header) — idempotent start, cleared in
  // fullTeardown so it always dies with the session.
  let heartbeatTimer = null
  // R228: the camera is refcounted — multiple consumers (games hook /
  // VisionAssistant / AI Lab bench) share this single host; the last one out
  // closes it. 'stop' remains a force-stop (clears the registry).
  const sessions = createSessionRegistry()

  function emit(events, snapshot) {
    if (events?.length) post({ type: 'events', events })
    if (snapshot) {
      snapshot.stats = pipeline.stats()
      post({ type: 'snapshot', snapshot })
    }
  }

  // Loop + timer state first, then the host's camera/DOM cleanup — the exact
  // order the monolithic teardown used.
  function fullTeardown() {
    if (vfcId != null && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcId)
    vfcId = null
    if (syntheticTimer) { clearTimer(syntheticTimer); syntheticTimer = null }
    if (heartbeatTimer) { clearTimer(heartbeatTimer); heartbeatTimer = null } // R244
    video = null
    teardown()
  }

  /** R244: start the liveness beacon if it is not already beating. */
  function startHeartbeat() {
    if (heartbeatTimer == null) {
      heartbeatTimer = scheduleInterval(() => post({ type: 'heartbeat' }), 5000)
    }
  }

  async function openCamera(camera) {
    const mode = camera ?? cameraMode
    cameraMode = mode
    video = await startCamera(mode)
    runCameraLoop()
    // R244: a capture restart goes through fullTeardown (beacon cleared) —
    // revive it here so a LIVE session never goes silent on a mode switch.
    startHeartbeat()
  }

  // R227.2: one thrown exception inside tick must NOT kill the rVFC chain.
  // Consecutive errors escalate: GPU delegate death → CPU rebuild (R227.6);
  // still failing → clean shutdown (camera OFF, error surfaced).
  function runCameraLoop() {
    pipeline.start(now())
    let lastSend = 0
    const acquire = []
    let errStreak = 0
    let rebuilding = false
    const tick = async (t, meta) => {
      try {
        // inference-rate cap (R133 margin fix), mode-driven (60 continuous / 30 default)
        const cap = pipeline?.maxFps && pipeline.maxFps > 0 ? pipeline.maxFps : 30
        if (t - lastSend >= 1000 / cap - 4) {
          lastSend = t
          if (meta?.presentationTime && t - meta.presentationTime >= 0 && t - meta.presentationTime < 5000) {
            acquire.push(t - meta.presentationTime)
            if (acquire.length > 300) acquire.shift()
            const sorted = [...acquire].sort((a, b) => a - b)
            const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
            pipeline.acquireStats = { n: sorted.length, p50: q(0.5), p95: q(0.95), mean: sorted.reduce((s, v) => s + v, 0) / sorted.length }
          }
          const r = pipeline.processFrame(t, { source: video })
          emit(r.events, r.snapshot)
          errStreak = 0
        }
      } catch (err) {
        errStreak++
        post({ type: 'status', s: `frame error (${errStreak}): ${String(err?.message ?? err).slice(0, 80)}` })
        if (errStreak >= 8 && !rebuilding) {
          rebuilding = true
          try {
            if (pipeline.delegate === 'GPU' && lastCfg) {
              post({ type: 'status', s: 'models.cpu-retry' }) // R235: stable code, localized at the consumer
              await pipeline.reloadLandmarkers({ ...lastCfg, cpuFallback: true })
              errStreak = 0
            } else {
              throw err
            }
          } catch (e2) {
            post({ type: 'error', message: `vision pipeline failed: ${String(e2?.message ?? e2).slice(0, 120)}` })
            fullTeardown()
            try { pipeline.stop() } catch { /* already broken */ }
            return // stop the callback chain — camera is OFF, error is surfaced
          } finally {
            rebuilding = false
          }
        }
      }
      if (pipeline?.running && !video.ended) vfcId = video.requestVideoFrameCallback(tick)
    }
    vfcId = video.requestVideoFrameCallback(tick)
  }

  async function handleInit(msg) {
    if (pipeline) {
      // R228: already running — the second consumer's init MUST get a ready
      // (swallowing it left enable() awaiting a reply that never came).
      post({ type: 'ready', delegate: pipeline.delegate })
      return
    }
    try {
      lastCfg = msg.cfg
      pipeline = pipelineApi.create({
        loadLandmarkers,
        onEvents: (events) => post({ type: 'events', events }),
        onSnapshot: (snapshot) => emit(null, snapshot),
        onStatus: (s) => post({ type: 'status', s }),
        onProfileSave: (profile) => post({ type: 'profile-save', profile }),
      })
      // R227.2: init must never hang forever — wasm/model load or camera
      // negotiation that stalls gets cut at 20s with a surfaced error.
      await Promise.race([
        pipeline.init(msg.cfg),
        new Promise((_r, rej) => scheduleTimeout(() => rej(new Error('vision init timeout (20s)')), initTimeoutMs)),
      ])
      pipeline.maxFps = msg.cfg.maxFps ?? 0
      if (msg.cfg.mode === 'synthetic') {
        await pipeline.startSynthetic()
        syntheticTimer = scheduleInterval(() => {
          const r = pipeline.processFrame(now(), {})
          emit(r.events, r.snapshot)
        }, 33)
      } else {
        await openCamera(msg.cfg.camera)
      }
      post({ type: 'ready', delegate: pipeline.delegate })
      // R244: the session is live — start beating (camera sessions already
      // started it in openCamera; synthetic sessions start it here).
      startHeartbeat()
    } catch (err) {
      fullTeardown()
      try { pipeline?.stop() } catch { /* init half-finished — session may be null */ }
      pipeline = null
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // R239: USB pull / OS sleep / driver death ends the track with no say-so.
  // Same clean-shutdown discipline as the fatal frame streak: the stable
  // 'camera-ended' error is surfaced (the hook classifies it → detached),
  // the camera is torn down and the registry cleared — a fresh init can
  // always rebuild. The host shell wires track.onended / devicechange to
  // these; the DOM reads stay there, the DECISION lives here.
  function cameraEnded() {
    if (!pipeline) return // double-fire (devicechange racing onended) or already dead
    post({ type: 'error', message: 'camera-ended' })
    sessions.clear()
    fullTeardown()
    try { pipeline.stop() } catch { /* already broken */ }
    pipeline = null
  }

  /**
   * R239: navigator.mediaDevices 'devicechange' fires for ANY camera
   * add/remove. Only OUR OWN stream dying (the active camera was removed)
   * escalates — and only for camera sessions; the shell passes the DOM
   * liveness read (`stream.active`), the judgment is here.
   */
  function onDeviceChange(streamAlive) {
    if (!pipeline || video == null) return // no camera session (idle/synthetic)
    if (streamAlive) return // a new device plugged in — nothing to recover
    cameraEnded()
  }

  async function handle(msg) {
    if (msg.type === 'init') {
      await handleInit(msg)
      return
    }
    if (!pipeline) return
    try {
      switch (msg.type) {
        case 'settings': pipeline.applySettings(msg.patch); break
        case 'pause': pipeline.setPaused(msg.p); break
        case 'recalibrate': pipeline.recalibrate(); break
        case 'forceReady': pipeline.forceReady(msg.profile); break
        case 'mirror': pipeline.setMirror(msg.m); break
        case 'primaryHand': pipeline.setPrimaryHand(msg.side); break
        case 'textmode': pipeline.setTextMode(msg.on); break
        case 'backspace': pipeline.chordBackspace(); break
        case 'capture': {
          // R141-B: precision mode switch — restart the stream with new constraints
          if (!msg.synthetic && video != null) {
            const prevMode = cameraMode
            try {
              fullTeardown()
              await openCamera(msg.camera)
            } catch (err) {
              cameraMode = prevMode // a failed switch must not poison the next restart
              throw err
            }
          }
          break
        }
        case 'acquire':
          sessions.acquire(msg.consumerId)
          break
        case 'release':
          // R228: refcounted shutdown — only the LAST consumer out closes the
          // camera (one view leaving must never kill another live consumer).
          sessions.release(msg.consumerId)
          if (sessions.empty()) {
            fullTeardown()
            try { pipeline.stop() } catch { /* already broken */ }
            pipeline = null
          }
          break
        case 'stop':
          // force-stop: clears the registry so stray consumers can't resurrect
          sessions.clear()
          fullTeardown()
          try { pipeline.stop() } catch { /* session may be gone — teardown already ran */ }
          pipeline = null
          break
        default: break
      }
    } catch (err) {
      // R227.2: a bad message (or a half-dead pipeline) must not take the host
      // down silently — surface it so the client can show/recover.
      post({ type: 'error', message: `vision ${msg.type} failed: ${String(err?.message ?? err).slice(0, 120)}` })
    }
  }

  return {
    handle,
    /** R239: the shell wires track.onended here (camera gone without a say-so) */
    onCameraEnded: cameraEnded,
    /** R239: the shell wires mediaDevices devicechange here (liveness read stays in the shell) */
    onDeviceChange,
    /** live pipeline — the host's loadLandmarkers sets .delegate during init */
    get pipeline() { return pipeline },
    /** current capture mode (R141-B; rolled back on a failed capture switch) */
    get cameraMode() { return cameraMode },
  }
}
