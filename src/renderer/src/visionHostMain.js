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
  try {
    const hand = await HandLandmarker.createFromOptions(fileset, makeHand('GPU'))
    const face = cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace('GPU')) : null
    pipeline.delegate = 'GPU'
    return { hand, face }
  } catch (e) {
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

async function startCamera() {
  video = document.createElement('video')
  video.style.display = 'none'
  document.body.appendChild(video)
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 60, min: 15 } },
  })
  video.srcObject = stream
  await new Promise((r) => { video.onloadedmetadata = r })
  await video.play()
  pipeline.start(performance.now())
  let lastSend = 0
  const acquire = []
  const tick = (now, meta) => {
    // 30Hz inference cap (R133 margin fix): skip early camera frames
    if (now - lastSend >= 1000 / 30 - 4) {
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
    }
    if (pipeline?.running) vfcId = video.requestVideoFrameCallback(tick)
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
      pipeline = new VisionPipeline({
        loadLandmarkers,
        onEvents: (events) => post({ type: 'events', events }),
        onSnapshot: (snapshot) => emit(null, snapshot),
        onStatus: (s) => post({ type: 'status', s }),
        onProfileSave: (profile) => post({ type: 'profile-save', profile }),
      })
      await pipeline.init(msg.cfg)
      if (msg.cfg.mode === 'synthetic') {
        await pipeline.startSynthetic()
        syntheticTimer = setInterval(() => {
          const r = pipeline.processFrame(performance.now(), {})
          emit(r.events, r.snapshot)
        }, 33)
      } else {
        await startCamera()
      }
      post({ type: 'ready', delegate: pipeline.delegate })
    } catch (err) {
      teardown()
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  if (!pipeline) return
  switch (msg.type) {
    case 'settings': pipeline.applySettings(msg.patch); break
    case 'pause': pipeline.setPaused(msg.p); break
    case 'recalibrate': pipeline.recalibrate(); break
    case 'forceReady': pipeline.forceReady(msg.profile); break
    case 'mirror': pipeline.setMirror(msg.m); break
    case 'stop': teardown(); pipeline.stop(); break
    default: break
  }
}
