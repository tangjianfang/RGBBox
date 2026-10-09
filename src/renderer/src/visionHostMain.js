// visionHostMain (R136.1) — hidden pipeline host window. Why a window and
// not a Web Worker: MediaPipe spawns its OWN internal worker for the wasm;
// from inside a worker (blob or otherwise) that nested cross-origin worker
// fails ("ModuleFactory not set"), while from a plain renderer document the
// exact same media:// setup has worked since R131. A hidden BrowserWindow
// gives the pipeline its own renderer process (the actual goal — never
// starving the game's main thread) and the same-origin BroadcastChannel
// bridge the AudioViz projector already uses.
//
// Protocol (game window → host, on BroadcastChannel 'rgbbox-vision'):
//   {type:'init', cfg} → {type:'ready', delegate} | {type:'error', message}
//   cfg.mode: 'camera' | 'synthetic'
//   {type:'settings'|'pause'|'recalibrate'|'forceReady'|'mirror'|'stop', …}
// Protocol (host → game):
//   {type:'events', events} | {type:'snapshot', snapshot} | {type:'status', s}
//   | {type:'profile-save', profile}

import { VisionPipeline } from './vision/pipeline.js'

const channel = new BroadcastChannel('rgbbox-vision')
let pipeline = null
let video = null
let stream = null
let vfcId = null
let syntheticTimer = null
// R227.6: kept for the GPU→CPU runtime rebuild path
let lastCfg = null
// R141-B: current capture mode (cfg.camera or the {type:'capture'} switch)
let currentCamera = { width: 640, height: 360, frameRate: 60 }

function post(msg) {
  channel.postMessage(msg)
}

// Announce readiness BEFORE anything else: the game window may open its
// channel and post 'init' before this module script executes — BroadcastChannel
// does not buffer, so the client (re)sends init when it hears this hello.
post({ type: 'host-hello' })

async function loadLandmarkers(cfg) {
  const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(/* @vite-ignore */ cfg.bundleUrl)
  const fileset = await FilesetResolver.forVisionTasks(cfg.wasmBase)
  const makeHand = (delegate) => ({
    baseOptions: { modelAssetPath: cfg.handModel, delegate },
    runningMode: 'VIDEO',
    numHands: cfg.numHands ?? 2,
  })
  const makeFace = (delegate) => ({
    baseOptions: { modelAssetPath: cfg.faceModel, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  })
  // R227.6: cpuFallback forces CPU directly (runtime GPU-process death rebuild)
  const preferred = cfg.cpuFallback ? 'CPU' : 'GPU'
  try {
    const hand = await HandLandmarker.createFromOptions(fileset, makeHand(preferred))
    const face = cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace(preferred)) : null
    pipeline.delegate = preferred
    return { hand, face }
  } catch (e) {
    if (preferred === 'CPU') throw e
    post({ type: 'status', s: `GPU delegate unavailable (${String(e).slice(0, 60)}), CPU fallback` })
    const hand = await HandLandmarker.createFromOptions(fileset, makeHand('CPU'))
    const face = cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace('CPU')) : null
    pipeline.delegate = 'CPU'
    return { hand, face }
  }
}

function emit(events, snapshot) {
  if (events?.length) post({ type: 'events', events })
  if (snapshot) {
    snapshot.stats = pipeline.stats()
    post({ type: 'snapshot', snapshot })
  }
}

async function startCamera(camera) {
  // R141-B: capture mode is cfg-driven — games stay at the fast 640×360,
  // precision mode (960×540) serves cursor/assistant scenes where the
  // latency budget is loose but detection robustness matters.
  const mode = camera ?? currentCamera
  currentCamera = mode
  video = document.createElement('video')
  video.style.display = 'none'
  document.body.appendChild(video)
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: mode.width },
      height: { ideal: mode.height },
      frameRate: { ideal: mode.frameRate ?? 60, min: 15 },
    },
  })
  video.srcObject = stream
  await new Promise((r) => { video.onloadedmetadata = r })
  await video.play()
  pipeline.start(performance.now())
  let lastSend = 0
  const acquire = []
  // R227.2: one thrown exception inside tick must NOT kill the rVFC chain —
  // the pre-R136 main-thread loop had this defense and it was lost in the
  // host migration. Consecutive errors escalate: GPU delegate death → CPU
  // rebuild; still failing → clean shutdown (camera OFF, error surfaced —
  // never a silent zombie keeping the camera light on).
  let errStreak = 0
  let rebuilding = false
  const tick = async (now, meta) => {
    try {
      // inference-rate cap (R133 margin fix), mode-driven (60 continuous / 30 default)
      const cap = pipeline?.maxFps && pipeline.maxFps > 0 ? pipeline.maxFps : 30
      if (now - lastSend >= 1000 / cap - 4) {
        lastSend = now
        if (meta?.presentationTime && now - meta.presentationTime >= 0 && now - meta.presentationTime < 5000) {
          acquire.push(now - meta.presentationTime)
          if (acquire.length > 300) acquire.shift()
          const sorted = [...acquire].sort((a, b) => a - b)
          const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
          pipeline.acquireStats = { n: sorted.length, p50: q(0.5), p95: q(0.95), mean: sorted.reduce((s, v) => s + v, 0) / sorted.length }
        }
        const r = pipeline.processFrame(now, { source: video })
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
            post({ type: 'status', s: '推理连续异常，切换 CPU 模式重试 / inference failing, retrying on CPU' })
            await pipeline.reloadLandmarkers({ ...lastCfg, cpuFallback: true })
            errStreak = 0
          } else {
            throw err
          }
        } catch (e2) {
          post({ type: 'error', message: `vision pipeline failed: ${String(e2?.message ?? e2).slice(0, 120)}` })
          teardown()
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

function teardown() {
  if (vfcId != null && video?.cancelVideoFrameCallback) video.cancelVideoFrameCallback(vfcId)
  vfcId = null
  if (syntheticTimer) { clearInterval(syntheticTimer); syntheticTimer = null }
  for (const t of stream?.getTracks() ?? []) t.stop()
  stream = null
  video?.remove()
  video = null
}

channel.onmessage = async (ev) => {
  const msg = ev.data
  if (msg.type === 'init') {
    if (pipeline) return // already initialized — hello-triggered duplicate
    try {
      lastCfg = msg.cfg
      pipeline = new VisionPipeline({
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
        new Promise((_r, rej) => setTimeout(() => rej(new Error('vision init timeout (20s)')), 20000)),
      ])
      pipeline.maxFps = msg.cfg.maxFps ?? 0
      if (msg.cfg.mode === 'synthetic') {
        await pipeline.startSynthetic()
        syntheticTimer = setInterval(() => {
          const r = pipeline.processFrame(performance.now(), {})
          emit(r.events, r.snapshot)
        }, 33)
      } else {
        await startCamera(msg.cfg.camera)
      }
      post({ type: 'ready', delegate: pipeline.delegate })
    } catch (err) {
      teardown()
      try { pipeline?.stop() } catch { /* init half-finished — session may be null */ }
      pipeline = null
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
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
      case 'capture':
        // R141-B: precision mode switch — restart the stream with new constraints
        if (!msg.synthetic && stream) {
          teardown()
          await startCamera(msg.camera)
        }
        break
      case 'stop':
        teardown()
        try { pipeline.stop() } catch { /* session may be gone — teardown already ran */ }
        pipeline = null // allow a later init (host window stays single-instance)
        break
      default: break
    }
  } catch (err) {
    // R227.2: a bad message (or a half-dead pipeline) must not take the host
    // down silently — surface it so the client can show/recover.
    post({ type: 'error', message: `vision ${msg.type} failed: ${String(err?.message ?? err).slice(0, 120)}` })
  }
}
