// R239: camera-failure classification. The vision host surfaces failures as
// plain text over the wire ('error' messages on the vision channel) — the UI
// needs a locale-independent kind + next-action (CTA) to render the right
// recovery card instead of dumping the raw text. Framework-free on purpose:
// unit-testable in a plain node environment (tests/renderer/domain).
//
// Both wire shapes must classify: the DOMException NAME ("NotAllowedError:
// …", when an error crossed as String(err)) AND Chromium's bare MESSAGE text
// (the host posts `err.message`, which drops the name — "Permission denied
// by system" carries no "NotAllowed").

export type VisionErrorKind = 'denied' | 'no-device' | 'occupied' | 'detached' | 'proto-mismatch' | 'timeout' | 'generic'
type VisionErrorCta = 'open-settings' | 'retry' | 'enumerate'

/** kind → the CTA the recovery card offers (single source; kept in sync with classify). */
export const VISION_ERROR_CTA: Readonly<Record<VisionErrorKind, VisionErrorCta>> = Object.freeze({
  denied: 'open-settings',
  'no-device': 'enumerate',
  occupied: 'retry',
  detached: 'retry',
  'proto-mismatch': 'retry',
  timeout: 'retry',
  generic: 'retry',
})

// Substring matchers over the lowercased message, first hit wins.
const MATCHERS: ReadonlyArray<readonly [VisionErrorKind, readonly string[]]> = [
  // getUserMedia NotAllowedError — OS/app camera privacy switch is off
  ['denied', ['notallowederror', 'permission denied', 'denied by system']],
  // NotFoundError — no camera device present/enabled at all
  ['no-device', ['notfounderror', 'no camera', 'device not found', 'no device']],
  // NotReadableError — the device exists but another app holds it
  ['occupied', ['notreadableerror', 'could not start video source', 'camera in use', 'in use by']],
  // the R239 host watchdog's stable code (track.onended / dead-stream devicechange)
  ['detached', ['camera-ended']],
  // R306/T18: the channel-handshake version code (stale/mixed host build)
  ['proto-mismatch', ['protocol-mismatch']],
  // the R227.2 init watchdog
  ['timeout', ['init timeout']],
]

/**
 * Classify a vision-channel error message. The RAW TEXT stays the actionable
 * detail (the hook keeps it verbatim in `error`); this adds the structured
 * kind + CTA the recovery card renders.
 */
export function classifyVisionError(msg: string): { kind: VisionErrorKind; cta: VisionErrorCta } {
  const text = String(msg ?? '').toLowerCase()
  for (const [kind, tokens] of MATCHERS) {
    if (tokens.some((token) => text.includes(token))) return { kind, cta: VISION_ERROR_CTA[kind] }
  }
  return { kind: 'generic', cta: 'retry' }
}
