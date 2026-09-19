// R141-B: environment coach — turns the pipeline's own telemetry (capture
// age, negotiated camera mode, detection quality) into ONE actionable piece
// of advice for the user. Pure function so the thresholds are unit-tested.
//
// Signal sources (all already computed by the host pipeline):
//  - acquire p95 (rVFC presentationTime age): long age at callback = the
//    sensor spent a long time EXPOSING the frame — dim light pulls exposure
//    to a full frame period (33ms) and beyond.
//  - negotiated camera fps: some cameras deliver less than requested when
//    another app holds the device or the mode list is poor.
//  - sustained hand-loss while the session is active: usually distance or
//    framing, not lighting.

export interface EnvTelemetry {
  /** capture-age p95 in ms (undefined while no rVFC metadata yet) */
  acquireP95?: number
  /** camera's ACTUAL negotiated frame rate */
  camFps?: number
  /** true while the session is active but no hand has been seen recently */
  handLost?: boolean
  /** samples behind the stats — advice needs enough evidence */
  samples?: number
}

export type EnvAdvice = 'dim-light' | 'low-fps' | 'too-far' | null

export function envAdvice(t: EnvTelemetry): EnvAdvice {
  if ((t.samples ?? 0) < 45) return null // <1.5s of evidence — stay quiet
  if (t.acquireP95 != null && t.acquireP95 > 45) return 'dim-light'
  if (t.camFps != null && t.camFps > 0 && t.camFps < 25) return 'low-fps'
  if (t.handLost) return 'too-far'
  return null
}
