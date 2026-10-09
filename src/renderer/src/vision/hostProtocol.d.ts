// Type bridge for the JS island (tsconfig.web has no allowJs — R131.1 pattern).
export declare const VISION_CHANNEL: string
export declare const HOST_MSG: Readonly<{
  INIT: 'init'; ACQUIRE: 'acquire'; RELEASE: 'release'; STOP: 'stop'
  SETTINGS: 'settings'; PAUSE: 'pause'; RECALIBRATE: 'recalibrate'
  FORCE_READY: 'forceReady'; MIRROR: 'mirror'; PRIMARY_HAND: 'primaryHand'
  TEXTMODE: 'textmode'; BACKSPACE: 'backspace'; CAPTURE: 'capture'
}>
export declare const HOST_REPLY: Readonly<{
  HELLO: 'host-hello'; READY: 'ready'; EVENTS: 'events'; SNAPSHOT: 'snapshot'
  STATUS: 'status'; PROFILE_SAVE: 'profile-save'; ERROR: 'error'
  HEARTBEAT: 'heartbeat'
}>
export interface SessionRegistry {
  acquire(consumerId: string): number
  release(consumerId: string): number
  clear(): void
  size(): number
  empty(): boolean
  has(consumerId: string): boolean
}
export declare function createSessionRegistry(): SessionRegistry
export interface VocabEntry { readonly id: string; readonly zh: string; readonly en: string }
export declare const USER_VOCAB: ReadonlyArray<Readonly<VocabEntry>>
export declare function nextConsumerId(): string
// R235: engine message-catalog contract (see hostProtocol.js — tests lock the
// list against session.js DEFAULT_SESSION_MESSAGES)
export declare const VISION_SESSION_MSG_KEYS: ReadonlyArray<string>
export declare const VISION_MODEL_MSG_KEYS: ReadonlyArray<string>
export declare const VISION_MSG_KEYS: ReadonlyArray<string>
/** identity table (key→key) the hook injects so the engine emits codes */
export declare const VISION_KEY_MESSAGES: Readonly<Record<string, string>>
