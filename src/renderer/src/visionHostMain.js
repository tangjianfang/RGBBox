// visionHostMain (R136.1) — hidden pipeline host window. Why a window and
// not a Web Worker: MediaPipe spawns its OWN internal worker for the wasm;
// from inside a worker (blob or otherwise) that nested cross-origin worker
// fails ("ModuleFactory not set"), while from a plain renderer document the
// exact same media:// setup has worked since R131. A hidden BrowserWindow
// gives the pipeline its own renderer process (the actual goal — never
// starving the game's main thread) and the same-origin BroadcastChannel
// bridge the AudioViz projector already uses.
//
// R234: this file is now a THIN SHELL — only the DOM/electron glue (channel,
// video element + getUserMedia, landmarker loading, hello broadcast). All
// session orchestration (init/refcount/stop/timeout/frame-error escalation)
// lives in vision/hostMessenger.js and is unit-tested in
// tests/vision/hostSession.test.mjs.
//
// Protocol (game window → host, on BroadcastChannel 'rgbbox-vision'):
//   {type:'init', cfg} → {type:'ready', delegate} | {type:'error', message}
//   cfg.mode: 'camera' | 'synthetic'
//   {type:'settings'|'pause'|'recalibrate'|'forceReady'|'mirror'|'stop', …}
// Protocol (host → game):
//   {type:'events', events} | {type:'snapshot', snapshot} | {type:'status', s}
//   | {type:'profile-save', profile}

import { VisionPipeline } from './vision/pipeline.js'
import { createHostMessenger } from './vision/hostMessenger.js'

const channel = new BroadcastChannel('rgbbox-vision')
let video = null
let stream = null

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
  const p = messenger.pipeline // the pipeline being initialized/reloaded
  try {
    const hand = await HandLandmarker.createFromOptions(fileset, makeHand(preferred))
    const face = cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace(preferred)) : null
    p.delegate = preferred
    return { hand, face }
  } catch (e) {
    if (preferred === 'CPU') throw e
    post({ type: 'status', s: `GPU delegate unavailable (${String(e).slice(0, 60)}), CPU fallback` })
    const hand = await HandLandmarker.createFromOptions(fileset, makeHand('CPU'))
    const face = cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace('CPU')) : null
    p.delegate = 'CPU'
    return { hand, face }
  }
}

// R234: camera ACQUISITION only — the capture mode (and its rollback) and
// the inference loop live in hostMessenger. `mode` is always explicit.
async function startCamera(mode) {
  // R141-B: capture mode is cfg-driven — games stay at the fast 640×360,
  // precision mode (960×540) serves cursor/assistant scenes where the
  // latency budget is loose but detection robustness matters.
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
  return video
}

// R234: camera/DOM cleanup only — the loop cancel + synthetic timer are owned
// by the messenger (its fullTeardown calls this after its own bits).
function teardown() {
  for (const t of stream?.getTracks() ?? []) t.stop()
  stream = null
  video?.remove()
  video = null
}

const messenger = createHostMessenger({
  post,
  pipelineApi: { create: (opts) => new VisionPipeline(opts) },
  loadLandmarkers,
  startCamera,
  teardown,
})

channel.onmessage = (ev) => { messenger.handle(ev.data) }
