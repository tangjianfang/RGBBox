// R234: the vision-host SESSION ORCHESTRATION contract (hostMessenger). The
// host shell (visionHostMain.js) is untestable glue — BroadcastChannel,
// getUserMedia, rVFC — so every lifecycle decision it used to make inline is
// asserted here against injected fakes. These tests pin the R227/R228
// semantics: duplicate-init re-ready, refcounted acquire/release, force-stop
// clearing the registry, 20s init cut, frame-error escalation (CPU rebuild →
// clean shutdown), and the capture mode rollback.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createHostMessenger } from '../../src/renderer/src/vision/hostMessenger.js'

/** Fake <video>: the rVFC slot is a manually pumped callback (test = clock). */
function makeVideo () {
  let cb = null
  return {
    ended: false,
    requestVideoFrameCallback (fn) { cb = fn; return 1 },
    cancelVideoFrameCallback () { cb = null },
    /** Run the scheduled tick (a fired rVFC callback is consumed, one-shot);
     * resolves when the async tick settles. */
    pump (now, meta) { const f = cb; cb = null; return f && f(now, meta) },
    get pending () { return cb != null },
  }
}

/** Fully fake-depped messenger + spies for every injectable seam. */
function makeHarness (over = {}) {
  const posted = []
  const camCalls = []
  const stops = { teardown: 0, pipelineStop: 0, reloads: [] }
  const timers = { intervals: [], timeouts: [] }
  const created = []
  const cameraFail = { err: null }
  const frameResult = { r: { events: [], snapshot: null } }
  let lastVideo = null
  const mkPipeline = (po = {}) => {
    const p = {
      delegate: 'GPU',
      running: false,
      maxFps: 0,
      acquireStats: null,
      init: async () => {},
      start: () => { p.running = true },
      startSynthetic: async () => { p.running = true },
      stop: () => { p.running = false; stops.pipelineStop++ },
      reloadLandmarkers: async (cfg) => { stops.reloads.push(cfg) },
      processFrame: () => frameResult.r,
      stats: () => ({ fps: 60 }),
      applySettings: () => {}, setPaused: () => {}, recalibrate: () => {},
      forceReady: () => {}, setMirror: () => {}, setPrimaryHand: () => {},
      setTextMode: () => {}, chordBackspace: () => {},
      ...po,
    }
    return p
  }
  const messenger = createHostMessenger({
    post: (m) => posted.push(m),
    pipelineApi: {
      create: (opts) => { const p = mkPipeline(over.pipelineOver); p.opts = opts; created.push(p); return p },
    },
    loadLandmarkers: async () => ({ hand: {}, face: null }),
    startCamera: async (mode) => {
      camCalls.push(mode)
      if (cameraFail.err) { const e = cameraFail.err; cameraFail.err = null; throw e }
      lastVideo = makeVideo()
      return lastVideo
    },
    teardown: () => { stops.teardown++ },
    now: () => 4242,
    scheduleInterval: (fn, ms) => { timers.intervals.push({ fn, ms }); return timers.intervals.length },
    clearTimer: (t) => { timers.intervals[t - 1] = null },
    scheduleTimeout: (fn, ms) => { timers.timeouts.push({ fn, ms }); return timers.timeouts.length },
    initTimeoutMs: 20000,
  })
  return {
    messenger, posted, camCalls, stops, timers, created, cameraFail, frameResult,
    get lastVideo () { return lastVideo },
  }
}

const M1 = { width: 640, height: 360, frameRate: 60 }
const M2 = { width: 960, height: 540, frameRate: 30 }

// ── R228: init / refcount / force-stop ────────────────────────────────────

test('init: succeeds with a ready reply; duplicate init re-replies ready WITHOUT re-creating the pipeline', async () => {
  const h = makeHarness()
  await h.messenger.handle({ type: 'init', cfg: { camera: M1 } })
  assert.equal(h.created.length, 1)
  assert.deepEqual(h.posted.at(-1), { type: 'ready', delegate: 'GPU' })
  assert.deepEqual(h.camCalls, [M1])
  // R228: a hello-triggered second init MUST still get a ready (swallowing
  // it left enable() awaiting a reply that never came).
  await h.messenger.handle({ type: 'init', cfg: { camera: M2 } })
  assert.equal(h.created.length, 1, 'duplicate init must not rebuild')
  assert.deepEqual(h.camCalls, [M1], 'duplicate init must not touch the camera')
  assert.deepEqual(h.posted.at(-1), { type: 'ready', delegate: 'GPU' })
})

test('acquire/release: only the LAST consumer out tears down; double-release is a no-op (R228 refcount)', async () => {
  const h = makeHarness()
  await h.messenger.handle({ type: 'init', cfg: {} })
  await h.messenger.handle({ type: 'acquire', consumerId: 'games' })
  await h.messenger.handle({ type: 'acquire', consumerId: 'assistant' })
  await h.messenger.handle({ type: 'release', consumerId: 'games' })
  assert.equal(h.stops.teardown, 0, 'one view leaving must not kill the other')
  assert.equal(h.stops.pipelineStop, 0)
  // racing double-release of an already-gone consumer changes nothing
  await h.messenger.handle({ type: 'release', consumerId: 'games' })
  assert.equal(h.stops.teardown, 0)
  // the last one out closes the camera and nulls the pipeline
  await h.messenger.handle({ type: 'release', consumerId: 'assistant' })
  assert.equal(h.stops.teardown, 1)
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(h.messenger.pipeline, null)
  // nulled pipeline → a fresh init builds a NEW session
  await h.messenger.handle({ type: 'init', cfg: {} })
  assert.equal(h.created.length, 2)
  assert.equal(h.posted.filter((m) => m.type === 'error').length, 0)
})

test('stop: force-stop tears down AND clears the registry — stale consumers cannot pin the next session', async () => {
  const h = makeHarness()
  await h.messenger.handle({ type: 'init', cfg: {} })
  await h.messenger.handle({ type: 'acquire', consumerId: 'A' })
  await h.messenger.handle({ type: 'acquire', consumerId: 'B' })
  await h.messenger.handle({ type: 'stop' })
  assert.equal(h.stops.teardown, 1)
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(h.messenger.pipeline, null)
  // pipeline gone → stray messages (incl. releases) are ignored entirely
  await h.messenger.handle({ type: 'release', consumerId: 'A' })
  assert.equal(h.stops.teardown, 1)
  // registry was cleared: after a fresh init, a STALE release hits an empty
  // registry (without the clear, dead 'B' would hold the camera open forever)
  await h.messenger.handle({ type: 'init', cfg: {} })
  await h.messenger.handle({ type: 'release', consumerId: 'A' })
  assert.equal(h.stops.teardown, 2, 'empty-registry release applies last-out semantics')
})

// ── R227.2: failure paths ──────────────────────────────────────────────────

test('switch: a throwing pipeline method surfaces an error reply and never rejects the host', async () => {
  const h = makeHarness({ pipelineOver: { recalibrate () { throw new Error('recal boom') } } })
  await h.messenger.handle({ type: 'init', cfg: {} })
  await assert.doesNotReject(h.messenger.handle({ type: 'recalibrate' }))
  assert.equal(h.posted.at(-1).type, 'error')
  assert.match(h.posted.at(-1).message, /^vision recalibrate failed: recal boom$/)
  // the session survives: unknown types are swallowed, live calls keep working
  const n = h.posted.length
  await h.messenger.handle({ type: 'junk' })
  await h.messenger.handle({ type: 'settings', patch: { confirmMs: 1 } })
  assert.equal(h.posted.length, n)
  assert.ok(h.messenger.pipeline, 'pipeline must survive a bad message')
})

test('init: camera failure tears down the half-built session, stops the pipeline and posts the raw error', async () => {
  const h = makeHarness()
  h.cameraFail.err = 'no camera hardware' // plain string → String(err) path
  await h.messenger.handle({ type: 'init', cfg: {} })
  assert.equal(h.posted.at(-1).type, 'error')
  assert.equal(h.posted.at(-1).message, 'no camera hardware')
  assert.equal(h.stops.teardown, 1)
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(h.messenger.pipeline, null)
  // nulled pipeline → any stray non-init message is ignored
  const n = h.posted.length
  await h.messenger.handle({ type: 'settings', patch: {} })
  assert.equal(h.posted.length, n)
})

test('init: a stalled init is cut at 20s — error surfaced, half-built session cleaned up', async () => {
  const h = makeHarness({ pipelineOver: { init: () => new Promise(() => {}) } })
  const done = h.messenger.handle({ type: 'init', cfg: {} })
  assert.equal(h.timers.timeouts.length, 1)
  assert.equal(h.timers.timeouts[0].ms, 20000)
  h.timers.timeouts[0].fn() // fire the watchdog
  await done
  assert.equal(h.posted.at(-1).type, 'error')
  assert.match(h.posted.at(-1).message, /vision init timeout/)
  assert.equal(h.stops.teardown, 1)
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(h.messenger.pipeline, null)
})

test('capture: restart uses the current mode when none is given; a FAILED switch posts an error and rolls the mode back', async () => {
  const h = makeHarness()
  await h.messenger.handle({ type: 'init', cfg: { camera: M1 } })
  assert.deepEqual(h.camCalls, [M1])
  // restart without an explicit mode falls back to the current mode
  await h.messenger.handle({ type: 'capture' })
  assert.deepEqual(h.camCalls[1], M1)
  assert.equal(h.stops.teardown, 1, 'capture restart tears the old stream down first')
  // a failed precision-mode switch must not poison the mode for the next retry
  h.cameraFail.err = new Error('getUserMedia denied')
  await assert.doesNotReject(h.messenger.handle({ type: 'capture', camera: M2 }))
  assert.equal(h.posted.at(-1).type, 'error')
  assert.match(h.posted.at(-1).message, /^vision capture failed: getUserMedia denied$/)
  assert.deepEqual(h.messenger.cameraMode, M1, 'cameraMode rolled back to the last GOOD mode')
  assert.equal(h.stops.teardown, 2, 'the failed restart still tore the old stream down')
})

// ── R227.2/R227.6: the frame loop ──────────────────────────────────────────

test('tick: 8 straight frame errors escalate to a CPU rebuild; recovery resets the streak, ended video stops the chain', async () => {
  let throwsLeft = 8
  const h = makeHarness({
    pipelineOver: {
      processFrame: () => {
        if (throwsLeft > 0) { throwsLeft -= 1; throw new Error(`infer fail ${throwsLeft}`) }
        return { events: [], snapshot: null }
      },
    },
  })
  await h.messenger.handle({ type: 'init', cfg: { maxFps: 60, camera: M1 } })
  const v = h.lastVideo
  assert.ok(v?.pending, 'camera loop scheduled')
  let t = 33
  // 7 non-fatal errors: streak grows, chain stays alive
  for (let i = 0; i < 7; i++) { await v.pump(t, { presentationTime: t - 5 }); t += 33 }
  assert.ok(v.pending)
  assert.equal(h.posted.filter((m) => m.type === 'status' && /frame error/.test(m.s)).length, 7)
  // 8th consecutive error → GPU rebuild on CPU (R227.6)
  await v.pump(t, { presentationTime: t - 5 }); t += 33
  assert.equal(h.stops.reloads.length, 1)
  assert.equal(h.stops.reloads[0].cpuFallback, true)
  assert.ok(v.pending, 'chain continues after the rebuild')
  // a clean frame resets the streak — no further rebuilds
  await v.pump(t, { presentationTime: t - 5 }); t += 33
  assert.equal(h.stops.reloads.length, 1)
  assert.ok(v.pending)
  // acquire telemetry percentiles were computed along the way (R230)
  assert.ok(h.created[0].acquireStats && h.created[0].acquireStats.n > 0)
  // video ended → no reschedule, the chain drains
  v.ended = true
  await v.pump(t, undefined)
  assert.equal(v.pending, false)
})

test('tick: unrecoverable streak (CPU delegate already) shuts down CLEAN — error surfaced, camera off, chain stopped', async () => {
  const h = makeHarness({
    pipelineOver: { delegate: 'CPU', processFrame: () => { throw new Error('dead') } },
  })
  await h.messenger.handle({ type: 'init', cfg: {} })
  const v = h.lastVideo
  let t = 33
  for (let i = 0; i < 8; i++) { await v.pump(t, undefined); t += 33 }
  const err = h.posted.find((m) => m.type === 'error')
  assert.ok(err, 'fatal error surfaced')
  assert.match(err.message, /^vision pipeline failed:/)
  assert.equal(h.stops.teardown, 1, 'camera torn down — no zombie camera light')
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(v.pending, false, 'callback chain stopped')
  assert.equal(h.stops.reloads.length, 0, 'CPU delegate does not retry a CPU rebuild')
})

test('tick: a FAILED CPU rebuild also shuts down clean (GPU death + reload death)', async () => {
  const h = makeHarness({
    pipelineOver: {
      processFrame: () => { throw new Error('x') },
      reloadLandmarkers: async () => { throw new Error('reload dead') },
    },
  })
  await h.messenger.handle({ type: 'init', cfg: {} })
  const v = h.lastVideo
  let t = 33
  for (let i = 0; i < 8; i++) { await v.pump(t, undefined); t += 33 }
  const err = h.posted.find((m) => m.type === 'error')
  assert.ok(err && /vision pipeline failed: reload dead/.test(err.message))
  assert.equal(h.stops.teardown, 1)
  assert.equal(h.stops.pipelineStop, 1)
  assert.equal(v.pending, false)
})

// ── synthetic mode ─────────────────────────────────────────────────────────

test('init synthetic: the interval drives processFrame, emits events/snapshot; stop clears the interval', async () => {
  const h = makeHarness()
  h.frameResult.r = { events: [{ type: 'dir', dir: 'up' }], snapshot: { hands: 1 } }
  await h.messenger.handle({ type: 'init', cfg: { mode: 'synthetic' } })
  assert.equal(h.camCalls.length, 0, 'synthetic mode never opens a camera')
  assert.equal(h.timers.intervals.length, 1)
  assert.equal(h.timers.intervals[0].ms, 33)
  h.timers.intervals[0].fn()
  const ev = h.posted.find((m) => m.type === 'events')
  const snap = h.posted.find((m) => m.type === 'snapshot')
  assert.ok(ev && ev.events[0].dir === 'up')
  assert.ok(snap && snap.snapshot.stats && snap.snapshot.stats.fps === 60, 'stats() attached to snapshots')
  // capture is a no-op in synthetic mode (no camera stream to restart)
  await h.messenger.handle({ type: 'capture' })
  assert.equal(h.camCalls.length, 0)
  // force-stop clears the synthetic interval
  await h.messenger.handle({ type: 'stop' })
  assert.equal(h.timers.intervals[0], null)
})
