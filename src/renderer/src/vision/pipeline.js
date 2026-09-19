// VisionPipeline (R136) — the whole detection→session pipeline with ZERO
// browser dependencies: no camera, no video element, no rVFC, no worker API.
// The MediaPipe landmarkers are INJECTED via a loader so this module is
// unit-testable with scripted detections (tests/vision/pipeline.test.mjs),
// and the visionWorker wrapper supplies the real loader.
//
// Semantics ported from vision_input.js (upstream v2 + RGBBox adaptations):
// monotonic timestamps, hand/face latency meters, requireFace/faceEveryN,
// dualHand passthrough, selfie x-flip — now a RUNTIME mirror toggle instead
// of the hard-wired assumption that broke directions for some camera setups.

import { SessionController, adaptFaceRate } from './session.js';
import { blendshapeMap } from './face_engine.js';
import { LatencyMeter, FpsCounter } from './latency.js';
import { ChordEngine } from './fingerChords.js';

export const PIPELINE_SENSITIVITY = {
  standard: { confirmMs: 90, label: '标准' },
  fast: { confirmMs: 45, label: '灵敏' },
  sport: { confirmMs: 0, label: '运动' },
};

export class VisionPipeline {
  /**
   * @param {object} deps
   * @param {(cfg: object) => Promise<{hand: object, face: object|null}>} deps.loadLandmarkers
   * @param {(events: Array) => void} deps.onEvents
   * @param {(snapshot: object) => void} deps.onSnapshot
   * @param {(status: string) => void} deps.onStatus
   * @param {(profile: object) => void} deps.onProfileSave
   */
  constructor(deps) {
    this.deps = deps;
    this.session = null;
    this.handMeter = new LatencyMeter();
    this.faceMeter = new LatencyMeter();
    this.inferMeter = new LatencyMeter();
    this.inferFpsCounter = new FpsCounter();
    this.frameCount = 0;
    this.lastTs = 0;
    this.running = false;
    // R142-L2: display-rate prediction — an EMA of palm velocity lets
    // continuous consumers (analog axis, pad dot, cursor) render ~1-2 frames
    // AHEAD of the ~30-60Hz detection cadence. Discrete events stay
    // confirm-gated (research anti-pattern warning respected).
    this.predVel = { x: 0, y: 0 };
    this.predLast = null;
    // R142-L4: finger-chord command layer — hand resting on the desk,
    // per-frame finger extension patterns → discrete chord events
    this.chords = new ChordEngine();
    this.paused = false;
    this.mirror = true; // selfie convention; toggleable (R136.2)
    this.synthetic = null;
    this.hand = null;
    this.face = null;
  }

  /** @param {object} cfg { bundleless landmarkers come from the loader;
   *  sessionCfg, mirror, numHands, sensitivity, storedProfile } */
  async init(cfg = {}) {
    this.deps.onStatus?.('loading models…');
    const loaded = await this.deps.loadLandmarkers(cfg);
    this.hand = loaded.hand;
    this.face = loaded.face ?? null;
    this.session = new SessionController({
      ...(cfg.sessionCfg || {}),
      pinch: { key: 'Space' },
    });
    if (cfg.storedProfile) {
      try {
        this.session._applyProfile(cfg.storedProfile);
      } catch { /* corrupt profile → defaults */ }
    }
    this.mirror = cfg.mirror !== false;
    if (cfg.sensitivity && PIPELINE_SENSITIVITY[cfg.sensitivity]) {
      this.session.applySettings({ confirmMs: PIPELINE_SENSITIVITY[cfg.sensitivity].confirmMs });
    }
    this.deps.onStatus?.('models ready');
  }

  start(nowMs) {
    this.session.start(nowMs);
    this.running = true;
  }

  startSynthetic() {
    // synthetic landmarks drive the identical pipeline (tests/E2E, no camera)
    return import('./synthetic.js').then(({ SyntheticSource }) => {
      this.synthetic = new SyntheticSource();
      this.running = true;
      this.session.start(performance.now());
      this.deps.onStatus?.('synthetic source running');
    });
  }

  stop() {
    this.running = false;
    const events = this.session.stop();
    this.deps.onEvents?.(events);
  }

  setPaused(p) {
    this.paused = p;
    this.deps.onEvents?.(this.session.setPaused(p));
  }

  recalibrate() { this.session.recalibrate(); }
  forceReady(profile) { this.session.forceReady(profile); }
  applySettings(patch) { this.session.applySettings(patch); }
  setMirror(m) { this.mirror = m; }
  setTextMode(on) { this.chords.setTextMode(on); }
  chordBackspace() { this.chords.backspace(); }
  chordBuffer() { return this.chords.buffer; }

  /**
   * One processed frame. Camera mode passes `bitmap` (ImageBitmap, already
   * age-measured on the main thread); synthetic mode ignores it.
   * @returns {{events: Array, snapshot: object}}
   */
  processFrame(nowMs, { source } = {}) {
    if (!this.running) return { events: [], snapshot: null };
    this.inferFpsCounter.tick(nowMs);
    const t0 = performance.now();
    let hands = [];
    let faceMap = null;

    if (this.synthetic) {
      const phase = this.session.state === 'active' ? 'active' : (this.session.cal?.id ?? 'center');
      const s = this.synthetic.sample(nowMs, phase);
      hands = [{ landmarks: this.flip(s.hand), score: 0.9, handedness: 'Right' }];
      if (s.hand2) hands.push({ landmarks: this.flip(s.hand2), score: 0.9, handedness: 'Left' });
      faceMap = this.face ? s.faceBlend : null;
    } else if (source && this.hand) {
      let ts = Math.round(nowMs);
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;

      const th0 = performance.now();
      const hres = this.hand.detectForVideo(source, ts);
      this.handMeter.push(performance.now() - th0);
      const hs = hres.handednesses || hres.handedness || [];
      hands = (hres.landmarks || []).map((lm, i) => ({
        landmarks: this.flip(lm),
        score: hs[i]?.[0]?.score ?? 0,
        handedness: hs[i]?.[0]?.categoryName ?? '',
      }));

      if (this.face && this.frameCount % this.session.faceEveryN === 0) {
        const tf0 = performance.now();
        const fres = this.face.detectForVideo(source, ts);
        this.faceMeter.push(performance.now() - tf0);
        if (fres.faceBlendshapes?.length) faceMap = blendshapeMap(fres.faceBlendshapes[0].categories);
      }
    }

    this.inferMeter.push(performance.now() - t0);
    this.session.faceEveryN = adaptFaceRate(this.session.faceEveryN, this.inferMeter.stats().n > 60 ? this.inferMeter.stats().p95 : 0);

    const { events, snapshot } = this.session.onFrame({ nowMs, hands, face: faceMap });
    this.frameCount++;
    // R142-L4: chord events ride the same stream (active tracking only —
    // during calibration/searching the fingers are part of the wizard)
    if (this.session.state === 'active' && snapshot.pickedLandmarks) {
      events.push(...this.chords.update(snapshot.pickedLandmarks));
    }
    // R142-L2: attach the predicted palm (velocity × 50ms lookahead)
    if (snapshot && snapshot.geom) {
      const g = snapshot.geom;
      if (this.predLast && nowMs > this.predLast.t) {
        const dt = (nowMs - this.predLast.t) / 1000;
        if (dt > 0.001 && dt < 0.2) {
          const vx = (g.palm.x - this.predLast.x) / dt;
          const vy = (g.palm.y - this.predLast.y) / dt;
          this.predVel.x += (vx - this.predVel.x) * 0.35;
          this.predVel.y += (vy - this.predVel.y) * 0.35;
        }
      }
      this.predLast = { x: g.palm.x, y: g.palm.y, t: nowMs };
      const ahead = 0.05;
      const px = g.palm.x + this.predVel.x * ahead;
      const py = g.palm.y + this.predVel.y * ahead;
      snapshot.geomPredicted = {
        palm: { x: Math.min(1, Math.max(0, px)), y: Math.min(1, Math.max(0, py)) },
        pinch: g.pinch, scale: g.scale,
      };
    } else if (snapshot) {
      snapshot.geomPredicted = null;
      this.predLast = null;
      this.predVel = { x: 0, y: 0 };
    }
    if (snapshot) { snapshot.hostNowMs = nowMs; snapshot.chordBuffer = this.chords.buffer; snapshot.chordPreview = this.chords.currentPreview(); }
    // profile persistence is proxied to the main thread (workers lack localStorage)
    if (this.deps.onProfileSave && events.some((e) => e.name === 'calibrated')) {
      this.deps.onProfileSave(this.session.profile);
    }
    return { events, snapshot };
  }

  /** selfie-space flip — the R136 runtime mirror toggle lives here */
  flip(landmarks) {
    if (!this.mirror) return landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    return landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
  }

  stats(extra = {}) {
    return {
      infer: this.inferMeter.stats(),
      hand: this.handMeter.stats(),
      face: this.faceMeter.stats(),
      fps: 0, // camera fps is measured on the main thread (rVFC ticks)
      inferFps: this.inferFpsCounter.fps,
      delegate: this.delegate ?? '-',
      ...extra,
    };
  }
}
