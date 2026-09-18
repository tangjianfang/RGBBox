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
  // R127: images — AI8 draw thumbnails render local artifacts via media://
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
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

export interface MediaStreamPlan {
  status: 200 | 206
  /** inclusive first byte of the window the stream must serve */
  start: number
  /** inclusive last byte of the window the stream must serve */
  end: number
  headers: Record<string, string>
}

export interface MediaRangeUnsatisfiablePlan {
  status: 416
  headers: Record<string, string>
}

/**
 * Turn a parsed Range header + file size into the exact response plan —
 * status, headers, and the inclusive byte window for a `createReadStream`.
 *
 * R70.15: the handler STREAMS this window chunk-by-chunk. The previous shape
 * materialized the whole range into one Buffer via a single fs.read, and a
 * >2GiB window (e.g. the open-ended `bytes=0-` Chromium media sends at load
 * on a 3.78GiB file) tripped Node's native int32 CHECK in node_file.cc — a
 * fatal, uncatchable abort() that took the whole app down. Short of that,
 * whole-range buffers also spiked main-process memory on every seek.
 */
export function mediaStreamPlan(
  range: ByteRange | 'unsatisfiable' | null,
  size: number,
  contentType: string,
): MediaStreamPlan | MediaRangeUnsatisfiablePlan {
  if (range === 'unsatisfiable') {
    return { status: 416, headers: { 'Content-Range': `bytes */${size}` } }
  }
  const start = range ? range.start : 0
  // No-range on an empty file yields end=-1 (window length 0) — the handler
  // serves an empty body for that instead of opening a stream.
  const end = range ? range.end : size - 1
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': String(end - start + 1),
  }
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  return { status: range ? 206 : 200, start, end, headers }
}
