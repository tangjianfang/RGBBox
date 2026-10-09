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

/** Stable per-hook-instance consumer id (renderer, no crypto needed). */
let consumerSeq = 0
export function nextConsumerId() {
  consumerSeq += 1
  return `vision-consumer-${consumerSeq}`
}
