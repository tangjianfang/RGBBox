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
export declare function nextConsumerId(): string
