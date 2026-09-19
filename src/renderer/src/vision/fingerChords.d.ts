// Type bridge for the plain-JS finger-chord module (R142-L4/E5).
export interface FingerStates { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean }
export declare function fingerStates(lm: Array<{ x: number; y: number; z: number }>): FingerStates
export declare const CHORD_VOCAB: Record<string, string>
export declare const CHORD_CHARS: Record<string, string>
export declare class ChordEngine {
  constructor(cfg?: { stableFrames?: number; previewFrames?: number })
  textMode: boolean
  buffer: string
  setTextMode(on: boolean): void
  backspace(): void
  currentPreview(): { pattern: string; kind: 'command' | 'char'; name: string } | null
  update(lm: Array<{ x: number; y: number; z: number }>): Array<{ kind: 'chord'; name: string; down: boolean }>
}
