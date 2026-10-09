// hostProtocol (R228) — the single source of truth for the vision host ↔
// client wire protocol (BroadcastChannel 'rgbbox-vision'). Before this the
// 20 message types were string literals scattered across visionHostMain.js
// and useVisionInput.ts with zero shared contract (REVIEW-VISION 06-②).
//
// Also carries the session registry: the host is a single hidden window
// shared by multiple consumers (games hook / VisionAssistant / AI Lab bench),
// and "who owns the camera" is a refcount — acquire on enable, release on
// disable, teardown only when the LAST consumer leaves (R144.2's original
// intent). Pure data + pure functions on purpose: unit-testable without
// electron (tests/vision/hostProtocol.test.mjs).

export const VISION_CHANNEL = 'rgbbox-vision'

/** client → host */
export const HOST_MSG = Object.freeze({
  INIT: 'init',
  ACQUIRE: 'acquire',   // R228: {consumerId} — join the session refcount
  RELEASE: 'release',   // R228: {consumerId} — leave; last one out closes
  STOP: 'stop',         // force-stop (clears the registry), kept for E2E/back-compat
  SETTINGS: 'settings',
  PAUSE: 'pause',
  RECALIBRATE: 'recalibrate',
  FORCE_READY: 'forceReady',
  MIRROR: 'mirror',
  PRIMARY_HAND: 'primaryHand',
  TEXTMODE: 'textmode',
  BACKSPACE: 'backspace',
  CAPTURE: 'capture',
})

/** host → client */
export const HOST_REPLY = Object.freeze({
  HELLO: 'host-hello',
  READY: 'ready',
  EVENTS: 'events',
  SNAPSHOT: 'snapshot',
  STATUS: 'status',
  PROFILE_SAVE: 'profile-save',
  ERROR: 'error',
})

/**
 * Refcounted consumer set. All operations idempotent — a double-release from
 * a racing teardown must never take the camera down for someone else.
 */
export function createSessionRegistry() {
  const consumers = new Set()
  return {
    acquire(consumerId) {
      if (typeof consumerId === 'string' && consumerId) consumers.add(consumerId)
      return consumers.size
    },
    release(consumerId) {
      consumers.delete(consumerId)
      return consumers.size
    },
    clear() {
      consumers.clear()
    },
    size() {
      return consumers.size
    },
    empty() {
      return consumers.size === 0
    },
    has(consumerId) {
      return consumers.has(consumerId)
    },
  }
}

/**
 * R231: the USER-FACING gesture vocabulary — the complete list of gestures a
 * user must learn (single source of truth; the learning surface may never
 * exceed this table). Engine-level chords stay usable but "reserved"
 * (pause/next/back) — they are NOT taught until they gain a consumer.
 * Six words after R229 promoted the light ring into the core set.
 */
export const USER_VOCAB = Object.freeze([
  Object.freeze({ id: 'dir8', zh: '八向挥手', en: '8-way wave' }),
  Object.freeze({ id: 'pinch', zh: '捏合', en: 'pinch' }),
  Object.freeze({ id: 'palm', zh: '张掌', en: 'open palm' }),
  Object.freeze({ id: 'chord-menu', zh: '视图环（食中无三指）', en: 'view ring (3-finger chord)' }),
  Object.freeze({ id: 'chord-light', zh: '灯效环（拇食中三指）', en: 'light ring (thumb-led chord)' }),
  Object.freeze({ id: 'double-pinch', zh: '双手张合', en: 'two-hand spread' }),
])

/** Stable per-hook-instance consumer id (renderer, no crypto needed). */
let consumerSeq = 0
export function nextConsumerId() {
  consumerSeq += 1
  return `vision-consumer-${consumerSeq}`
}

/**
 * R235: the engine message-catalog contract (single source for both ends).
 * session.js renders EVERY user-facing string from an injectable messages
 * table (defaults = the exact pre-R235 zh values); pipeline/host lifecycle
 * statuses emit the codes directly. The hook injects VISION_KEY_MESSAGES
 * (identity: key→key) so the engine emits stable codes over the wire, then
 * localizes them per consumer language via i18n `games.vision.engine.<key>`.
 * tests/vision/session.test.mjs locks this list against the session catalog.
 */
export const VISION_SESSION_MSG_KEYS = Object.freeze([
  // session state labels (label())
  'state.idle', 'state.searching', 'state.active', 'state.paused',
  // calibration wizard: hints (label during calibrating), step wrapper,
  // extend/retry wrappers, per-gate reasons, live progress
  'cal.hint.center', 'cal.hint.reach', 'cal.hint.pinch',
  'cal.stepLabel',
  'cal.extend', 'cal.retry',
  'cal.center.hand-seen.extend', 'cal.center.hand-seen.retry',
  'cal.center.no-hand.extend', 'cal.center.no-hand.retry',
  'cal.center.jitter.extend', 'cal.center.jitter.retry',
  'cal.center.face.extend', 'cal.center.face.retry',
  'cal.reach.range.extend', 'cal.reach.range.retry',
  'cal.reach.sectors.extend', 'cal.reach.sectors.retry',
  'cal.pinch.samples.extend', 'cal.pinch.samples.retry',
  'cal.pinch.sep.extend', 'cal.pinch.sep.retry',
  'cal.progress.pinch', 'cal.progress.reach',
])

/** pipeline/host lifecycle statuses — ride the same hook mapping (not session cfg). */
export const VISION_MODEL_MSG_KEYS = Object.freeze([
  'models.cpu-retry',
  'models.gpu-fallback',
  'models.loading',
  'models.ready',
  'models.reloading',
  'models.synthetic',
])

/** every code the hook may map (session + models). */
export const VISION_MSG_KEYS = Object.freeze([...VISION_SESSION_MSG_KEYS, ...VISION_MODEL_MSG_KEYS])

/** identity table (key→key) — what the hook injects so the engine emits codes. */
export const VISION_KEY_MESSAGES = Object.freeze(
  Object.fromEntries(VISION_SESSION_MSG_KEYS.map((k) => [k, k])),
)
