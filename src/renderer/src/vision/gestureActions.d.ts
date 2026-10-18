// Type bridge for the plain-JS gesture action matrix (R254 / R306/T8).
// Minimal surface — only what TS consumers import; the runtime module is
// the source of truth.
export interface GestureCell {
  action: string
  cooldownMs: number
  guard: string
}
export type GestureSceneMap = Record<string, Record<string, GestureCell>>
export declare const ACTIONS: ReadonlyArray<string>
export declare const GESTURES: ReadonlyArray<string>
export declare const SCENES: ReadonlyArray<string>
export declare const GESTURE_SCENE_MAP: GestureSceneMap
export declare function validateGestureSceneMap(map?: GestureSceneMap): string[]
