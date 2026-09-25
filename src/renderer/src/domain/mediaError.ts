import type { TranslationKey } from '../i18n'

/**
 * R168: user-facing playback-failure reporting. `<video>` / `new Audio()`
 * fire an `error` event with a MediaError whose numeric code is the only
 * structured information — before this module nothing consumed it, so a file
 * whose container Chromium cannot demux (e.g. a renamed or DRM-wrapped
 * "mkv") surfaced as a silent black screen and read as an app bug.
 *
 * Kept framework-free (plain numeric codes, no `MediaError` global) so it
 * stays unit-testable outside a DOM environment.
 */

export const MEDIA_ERROR_CODES = {
  aborted: 1, // MEDIA_ERR_ABORTED — fetching was aborted by the user/app
  network: 2, // MEDIA_ERR_NETWORK — a network/disk error interrupted fetching
  decode: 3, // MEDIA_ERR_DECODE — demuxed but bitstream could not be decoded
  srcUnsupported: 4, // MEDIA_ERR_SRC_NOT_SUPPORTED — container/codec not demuxable
} as const

export interface MediaFailure {
  key: TranslationKey
  /** Raw browser detail, e.g. "DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed". */
  detail: string
}

/** Map a MediaError-like object to a user-facing message key; null when there is nothing to report. */
export function describeMediaError(err: { code?: number; message?: string } | null | undefined): MediaFailure | null {
  if (!err || typeof err.code !== 'number' || !Number.isFinite(err.code) || err.code <= 0) return null
  const detail = typeof err.message === 'string' && err.message.length > 0 ? err.message : ''
  switch (err.code) {
    case MEDIA_ERROR_CODES.aborted:
      return { key: 'media.error.aborted', detail }
    case MEDIA_ERROR_CODES.network:
      return { key: 'media.error.network', detail }
    case MEDIA_ERROR_CODES.decode:
      return { key: 'media.error.decode', detail }
    case MEDIA_ERROR_CODES.srcUnsupported:
    default:
      // Unknown codes are most plausibly "this source cannot be played" —
      // Chromium tends to reuse SRC_NOT_SUPPORTED for demux-stage failures.
      return { key: 'media.error.unsupported', detail }
  }
}

/** Compose the one-line UI text shown in the player's empty-state overlay. */
export function formatMediaFailure(failure: MediaFailure, translate: (key: TranslationKey) => string): string {
  const base = translate(failure.key)
  return failure.detail ? `${base} [${failure.detail}]` : base
}
