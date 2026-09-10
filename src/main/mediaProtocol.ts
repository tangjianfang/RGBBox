/**
 * Pure helpers for the media:// custom protocol handler (R70.1).
 *
 * Extracted from src/main/index.ts so the MIME table and HTTP Range parsing
 * are unit-testable — the handler itself stays a thin wrapper in index.ts.
 * No Electron imports: this module must stay loadable from plain Node tests.
 */

/**
 * MIME types for every extension the audio/video studios can queue. The audio
 * half is the pre-R70 table (unchanged); the video half is new —
 * VideoStudioView playlist items are served through this same scheme
 * (`media://local?p=…`), and the old audio-only table with an `audio/*`
 * fallback made every video file arrive with an audio Content-Type.
 */
export const MEDIA_MIME: Record<string, string> = {
  // audio
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg',
  opus: 'audio/opus', weba: 'audio/webm',
  // video (same extension set as VIDEO_FILTERS in src/main/index.ts)
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  mov: 'video/quicktime', avi: 'video/x-msvideo', flv: 'video/x-flv',
  ts: 'video/mp2t', wmv: 'video/x-ms-wmv',
}

/** Resolve the Content-Type for a local media path (neutral fallback for unknown). */
export function resolveMediaMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return MEDIA_MIME[ext] ?? 'application/octet-stream'
}

export interface ByteRange {
  /** inclusive byte offset */
  start: number
  /** inclusive byte offset */
  end: number
}

/**
 * Parse a single-range `Range: bytes=…` header against a known file size.
 * Supports `bytes=a-b`, open-ended `bytes=a-` and suffix `bytes=-n`.
 *
 * - `null` — header absent/malformed/multi-range: caller should serve 200 full.
 * - `'unsatisfiable'` — the range references no byte of the file: caller
 *   should serve 416 with a Content-Range header of "bytes *-of- size".
 */
export function parseRangeHeader(header: string | null | undefined, size: number): ByteRange | 'unsatisfiable' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)\s*$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    // suffix range: the last n bytes of the file
    const n = parseInt(m[2], 10)
    if (n === 0) return 'unsatisfiable'
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = parseInt(m[1], 10)
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10)
  }
  if (size === 0 || start >= size || start > end) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}
