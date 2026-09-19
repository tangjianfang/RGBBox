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
  camera: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } },
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
    this.delegate = '-';
    this.lastTs = 0;
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
      numHands: 2,
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
      this.face = await FaceLandmarker.createFromOptions(fileset, makeFace('GPU'));
      this.delegate = 'GPU';
    } catch (e) {
      this.onStatus(`GPU delegate unavailable (${e.message?.slice(0, 60)}), falling back to CPU`);
      this.hand = await HandLandmarker.createFromOptions(fileset, make('CPU'));
      this.face = await FaceLandmarker.createFromOptions(fileset, makeFace('CPU'));
      this.delegate = 'CPU';
    }
    this.onStatus(`ready (${this.delegate} delegate) — ${this.session.label()}`);
  }

  async startCamera(deviceId) {
    const constraints = {
      audio: false,
      video: deviceId ? { ...this.cfg.camera, deviceId: { exact: deviceId } } : this.cfg.camera,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await new Promise((r) => (this.video.onloadedmetadata = r));
    await this.video.play();
    this._running = true;
    this.session.start(performance.now());
    this._scheduleNext();
  }

  /** Camera-free demo: synthetic landmarks drive the identical session logic. */
  startSynthetic() {
    import('./synthetic.js').then(({ SyntheticSource }) => {
      this.synthetic = new SyntheticSource();
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

  _tick(now) {
    if (!this._running) return;
    this.fps.tick(now);
    if (this.session.paused) {
      this._scheduleNext();
      return;
    }
    try {
      this._processFrame(now);
    } catch (e) {
      this.onStatus(`frame error: ${e.message?.slice(0, 80)}`);
    }
    this._scheduleNext();
  }

  _processFrame(nowMs) {
    const t0 = performance.now();
    let hands = [];
    let faceMap = null;

    if (this.synthetic) {
      const phase = this.session.state === 'active'
        ? 'active'
        : (this.session.cal?.id ?? 'center'); // cooperate with the wizard
      const s = this.synthetic.sample(nowMs, phase);
      // selfie-space convention (flip once at entry), same as camera path
      hands = [{ landmarks: s.hand.map((p) => ({ ...p, x: 1 - p.x })), score: 0.9 }];
      faceMap = s.faceBlend;
    } else {
      let ts = Math.round(nowMs);
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;

      const hres = this.hand.detectForVideo(this.video, ts);
      const hs = hres.handednesses || hres.handedness || [];
      hands = (hres.landmarks || []).map((lm, i) => ({
        // selfie-space flip happens once, here, for the camera path
        landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        score: hs[i]?.[0]?.score ?? 0,
      }));

      if (this.frameCount % this.session.faceEveryN === 0) {
        const fres = this.face.detectForVideo(this.video, ts);
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
      fps: this.fps.fps,
      delegate: this.delegate,
      lowFps: this.fps.fps > 0 && this.fps.fps < 18,
    };
  }
}
