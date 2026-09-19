// VisionInput — thin browser glue. All session logic lives in
// SessionController (session.js) which is fully headless-testable.
// Responsibilities here: camera, MediaPipe landmarkers, frame loop,
// latency meters, dispatching events/snapshots to the UI.

// R131 adaptation for RGBBox: the MediaPipe bundle ships under the Vite
// public/ dir (src/renderer/public/vendor/mediapipe/) so the wasm siblings it
// loads at runtime stay together on disk — public/ is NOT module-resolvable by
// the bundler, so the bundle is imported at RUNTIME from the same base URL as
// the wasm (see useVisionInput: document-relative in dev, media://app/ in the
// packaged file:// build where fetch of local files must go through the
// privileged protocol).
import { SessionController, adaptFaceRate } from './session.js';
import { blendshapeMap } from './face_engine.js';
import { LatencyMeter, FpsCounter } from './latency.js';

export { STATE_LABELS } from './session.js';

export const DEFAULT_CONFIG = {
  wasmBase: './vendor',
  handModel: './models/hand_landmarker.task',
  faceModel: './models/face_landmarker.task',
  // R132: null → run faceless (no FaceLandmarker at all) — the games
  // integration doesn't consume expression keys and halves the per-frame
  // inference budget on the main thread.
  camera: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } },
  // upstream v2 (PERFORMANCE_RESEARCH): hand inference scales with capture
  // pixels — 640×360 halves it vs 1280×720 on the GPU path, no precision
  // loss (model input is 192/224px).
  preferLowRes: true,
  cameraLowRes: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 60, min: 15 } },
  numHands: 2,
  // R132: cap the inference rate — detection runs on the renderer main thread
  // next to the game loop, so a 60fps camera must not mean 60 inferences/s.
  // 0 = every frame (upstream behavior).
  maxFps: 0,
  session: {}, // SessionController cfg overrides (storage etc.)
};

export class VisionInput {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...opts.config, camera: { ...DEFAULT_CONFIG.camera, ...(opts.config?.camera || {}) } };
    this.video = opts.video;
    this.onEvent = opts.onEvent || (() => {});
    this.onFrame = opts.onFrame || (() => {});
    this.onStatus = opts.onStatus || (() => {});

    this.session = new SessionController({ ...this.cfg.session, pinch: this.cfg.pinch, direction: this.cfg.direction, faceBindings: this.cfg.faceBindings });
    this.inferMeter = new LatencyMeter();
    this.fps = new FpsCounter();
    // upstream v2: per-stage latency meters — hand/face inference split, plus
    // camera frame AGE at callback time (sensor → pipeline → us) from rVFC's
    // presentationTime, and the camera's ACTUAL negotiated track settings
    // (diagnosing "asked for 60fps, got 30fps" is impossible without it).
    this.handMeter = new LatencyMeter();
    this.faceMeter = new LatencyMeter();
    this.acquireMeter = new LatencyMeter();
    this.camSettings = null;
    // R133: rate of PROCESSED frames (this.fps counts camera ticks including
    // capped/skipped ones) — surfaced in stats so the pad shows real inference Hz.
    this.inferFpsCounter = new FpsCounter();
    this.delegate = '-';
    this.lastTs = 0;
    this.lastProcessMs = 0;
    this.frameCount = 0;
    this._raf = null;
    this._running = false;
  }

  async init() {
    this.onStatus('loading wasm runtime…');
    const wasmBase = this.cfg.wasmBase.replace(/\/+$/, '');
    const bundleUrl = new URL(`${wasmBase}/vision_bundle.js`, document.baseURI).href;
    const { FilesetResolver, HandLandmarker, FaceLandmarker } = await import(/* @vite-ignore */ bundleUrl);
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);
    const make = (delegate) => ({
      baseOptions: { modelAssetPath: this.cfg.handModel, delegate },
      runningMode: 'VIDEO',
      numHands: this.cfg.numHands ?? 2,
    });
    const makeFace = (delegate) => ({
      baseOptions: { modelAssetPath: this.cfg.faceModel, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
    this.onStatus('loading models (GPU)…');
    try {
      this.hand = await HandLandmarker.createFromOptions(fileset, make('GPU'));
      // R132: face is optional — null faceModel skips the model entirely
      this.face = this.cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace('GPU')) : null;
      this.delegate = 'GPU';
    } catch (e) {
      this.onStatus(`GPU delegate unavailable (${e.message?.slice(0, 60)}), falling back to CPU`);
      this.hand = await HandLandmarker.createFromOptions(fileset, make('CPU'));
      this.face = this.cfg.faceModel ? await FaceLandmarker.createFromOptions(fileset, makeFace('CPU')) : null;
      this.delegate = 'CPU';
    }
    this.onStatus(`ready (${this.delegate} delegate) — ${this.session.label()}`);
  }

  async startCamera(deviceId) {
    // upstream v2: preferLowRes — the benchmarked sweet spot for hand inference
    const cam = this.cfg.preferLowRes ? this.cfg.cameraLowRes : this.cfg.camera;
    const constraints = {
      audio: false,
      video: deviceId ? { ...cam, deviceId: { exact: deviceId } } : cam,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    // read back what the camera ACTUALLY negotiated — diagnosing "asked for
    // 60fps, got 30fps" is impossible without this (upstream v2)
    const track = this.stream.getVideoTracks()[0];
    this.camSettings = track?.getSettings?.() ?? null;
    this.video.srcObject = this.stream;
    await new Promise((r) => (this.video.onloadedmetadata = r));
    await this.video.play();
    this._running = true;
    this.session.start(performance.now());
    this._scheduleNext();
  }

  /** Camera-free demo: synthetic landmarks drive the identical session logic. */
  startSynthetic(opts = {}) {
    import('./synthetic.js').then(({ SyntheticSource }) => {
      this.synthetic = new SyntheticSource(opts);
      this._running = true;
      this.session.start(performance.now());
      this.onStatus('synthetic demo running (no camera)');
      this._scheduleNext();
    });
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    this.session.stop().forEach(this.onEvent);
    this.onStatus('stopped');
  }

  setPaused(p) {
    this.session.setPaused(p).forEach(this.onEvent);
    this.onStatus(this.session.label());
  }

  recalibrate() {
    this.session.recalibrate();
    this.onStatus(this.session.label());
  }

  applySettings(patch) {
    this.session.applySettings(patch);
  }

  _scheduleNext() {
    if (!this._running) return;
    if (this.video?.requestVideoFrameCallback && !this.synthetic) {
      this._raf = this.video.requestVideoFrameCallback((now, meta) => this._tick(now, meta));
    } else {
      this._raf = requestAnimationFrame((now) => this._tick(now, null));
    }
  }

  _tick(now, meta) {
    if (!this._running) return;
    this.fps.tick(now);
    // upstream v2: camera-frame age at callback time (sensor → pipeline → us).
    // presentationTime is on the performance.now() clock; only rVFC provides it.
    if (meta?.presentationTime) this.acquireMeter.push(now - meta.presentationTime);
    if (this.session.paused) {
      this._scheduleNext();
      return;
    }
    // R132/R133: inference-rate cap — skip camera frames that arrive sooner
    // than 1000/maxFps after the last processed one. R133 adds a 4ms margin:
    // rVFC delivers at camera-frame cadence (33.3ms @30fps), so a strict
    // threshold turned every jittery-but-on-time frame into a skip and halved
    // the effective rate — the "high latency" user report. With the margin a
    // 30fps camera under a 30 cap processes EVERY frame; a 60fps camera
    // processes exactly every other frame.
    if (this.cfg.maxFps > 0 && now - this.lastProcessMs < 1000 / this.cfg.maxFps - 4) {
      this._scheduleNext();
      return;
    }
    this.lastProcessMs = now;
    try {
      this._processFrame(now);
    } catch (e) {
      this.onStatus(`frame error: ${e.message?.slice(0, 80)}`);
    }
    this._scheduleNext();
  }

  _processFrame(nowMs) {
    this.inferFpsCounter.tick(nowMs);
    const t0 = performance.now();
    let hands = [];
    let faceMap = null;

    if (this.synthetic) {
      const phase = this.session.state === 'active'
        ? 'active'
        : (this.session.cal?.id ?? 'center'); // cooperate with the wizard
      const s = this.synthetic.sample(nowMs, phase);
      // selfie-space convention (flip once at entry), same as camera path
      hands = [{ landmarks: s.hand.map((p) => ({ ...p, x: 1 - p.x })), score: 0.9, handedness: 'Right' }];
      if (s.hand2) hands.push({ landmarks: s.hand2.map((p) => ({ ...p, x: 1 - p.x })), score: 0.9, handedness: 'Left' });
      faceMap = this.face ? s.faceBlend : null;
    } else {
      let ts = Math.round(nowMs);
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;

      const th0 = performance.now();
      const hres = this.hand.detectForVideo(this.video, ts);
      this.handMeter.push(performance.now() - th0);
      const hs = hres.handednesses || hres.handedness || [];
      hands = (hres.landmarks || []).map((lm, i) => ({
        // selfie-space flip happens once, here, for the camera path
        landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        score: hs[i]?.[0]?.score ?? 0,
        handedness: hs[i]?.[0]?.categoryName ?? '',
      }));

      if (this.face && this.frameCount % this.session.faceEveryN === 0) {
        const tf0 = performance.now();
        const fres = this.face.detectForVideo(this.video, ts);
        this.faceMeter.push(performance.now() - tf0);
        if (fres.faceBlendshapes?.length) faceMap = blendshapeMap(fres.faceBlendshapes[0].categories);
      }
    }

    const inferMs = performance.now() - t0;
    this.inferMeter.push(inferMs);
    this.session.faceEveryN = adaptFaceRate(this.session.faceEveryN, this.inferMeter.stats().n > 60 ? this.inferMeter.stats().p95 : 0);

    const { events, snapshot } = this.session.onFrame({
      nowMs,
      hands,
      face: faceMap,
      inferMs,
    });
    for (const ev of events) this.onEvent(ev);

    this.onFrame({
      video: this.video,
      synthetic: !!this.synthetic,
      hand: snapshot.pickedLandmarks,
      score: snapshot.score,
      geom: snapshot.geom,
      faceBlend: snapshot.faceBlend,
      state: snapshot.state,
      label: snapshot.label,
      status: snapshot.status,
      stepId: snapshot.stepId,
      stepProgress: snapshot.stepProgress,
      provisionalCenter: snapshot.provisionalCenter,
      profile: snapshot.profile,
      pinch: snapshot.geom?.pinch ?? null,
      pinchCfg: this.session.handEngine.pinch.cfg,
      stats: this.stats(),
      faceEveryN: this.session.faceEveryN,
    });
    this.frameCount = (this.frameCount ?? 0) + 1;
  }

  stats() {
    const s = this.inferMeter.stats();
    return {
      infer: s,
      hand: this.handMeter.stats(),
      face: this.faceMeter.stats(),
      acquire: this.acquireMeter.stats(),
      fps: this.fps.fps,
      inferFps: this.inferFpsCounter.fps,
      delegate: this.delegate,
      lowFps: this.fps.fps > 0 && this.fps.fps < 18,
      cam: this.camSettings ? {
        w: this.camSettings.width, h: this.camSettings.height,
        fps: this.camSettings.frameRate,
      } : null,
    };
  }
}
