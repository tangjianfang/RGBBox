// R87: semantics for the Diagnostics "Frame age" metric. The tick loop is
// gated (R42/R43: only overlays or a visible Workspace consume frames; and
// tick() early-returns when the engine is paused), so a growing millisecond
// count on the Diagnostics page means "idle", not "unhealthy". This pure
// helper turns that into an explicit three-state answer.

export type FrameAgeState =
  | { kind: 'waiting' }                                       // no frame ever generated
  | { kind: 'idle'; reason: 'paused' | 'no-consumer' }        // loop gated — ms would be misleading
  | { kind: 'age'; ms: number }                               // frames flowing

export function frameAgeState(
  generatedAt: number | null,
  now: number,
  consumerActive: boolean,
  engineRunning: boolean
): FrameAgeState {
  if (generatedAt === null) return { kind: 'waiting' }
  if (!engineRunning) return { kind: 'idle', reason: 'paused' }
  if (!consumerActive) return { kind: 'idle', reason: 'no-consumer' }
  return { kind: 'age', ms: Math.max(0, now - generatedAt) }
}
