import { describe, expect, it } from 'vitest'
import { MEDIA_MIME, mediaStreamPlan, parseRangeHeader, resolveMediaMime } from '../../src/main/mediaProtocol'

describe('main/mediaProtocol (R70.1)', () => {
  describe('resolveMediaMime', () => {
    it('maps audio extensions (pre-R70 table, unchanged)', () => {
      expect(resolveMediaMime('C:\\music\\song.MP3')).toBe('audio/mpeg')
      expect(resolveMediaMime('/home/user/tune.flac')).toBe('audio/flac')
      expect(resolveMediaMime('track.opus')).toBe('audio/opus')
    })

    it('maps image extensions for AI8 draw thumbnails (R127)', () => {
      expect(resolveMediaMime('artifact.png')).toBe('image/png')
      expect(resolveMediaMime('C:\\cache\\S01A-1.jpg')).toBe('image/jpeg')
      expect(resolveMediaMime('thumb.jpeg')).toBe('image/jpeg')
      expect(resolveMediaMime('a.webp')).toBe('image/webp')
      expect(resolveMediaMime('a.gif')).toBe('image/gif')
      expect(resolveMediaMime('a.bmp')).toBe('image/bmp')
      expect(resolveMediaMime('a.avif')).toBe('image/avif')
    })

    it('maps every video extension VideoStudioView can queue', () => {
      // Same extension set as VIDEO_FILTERS in src/main/index.ts
      const videoExts = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'ts', 'm4v', 'wmv']
      for (const ext of videoExts) {
        expect(MEDIA_MIME[ext]).toMatch(/^video\//)
      }
      expect(resolveMediaMime('movie.mkv')).toBe('video/x-matroska')
      expect(resolveMediaMime('clip.MP4')).toBe('video/mp4') // case-insensitive
    })

    it('falls back to a neutral binary type (was audio/octet-stream)', () => {
      expect(resolveMediaMime('file.xyz')).toBe('application/octet-stream')
      expect(resolveMediaMime('no-extension')).toBe('application/octet-stream')
      expect(resolveMediaMime('')).toBe('application/octet-stream')
    })
  })

  describe('parseRangeHeader', () => {
    const size = 1000

    it('returns null for absent / empty headers (serve 200 full)', () => {
      expect(parseRangeHeader(null, size)).toBeNull()
      expect(parseRangeHeader(undefined, size)).toBeNull()
      expect(parseRangeHeader('', size)).toBeNull()
      expect(parseRangeHeader('   ', size)).toBeNull()
    })

    it('returns null for malformed or multi-range headers (serve 200 full)', () => {
      expect(parseRangeHeader('chunks=0-99', size)).toBeNull()
      expect(parseRangeHeader('bytes=', size)).toBeNull()
      expect(parseRangeHeader('bytes=a-b', size)).toBeNull()
      // multi-range — we only support single ranges
      expect(parseRangeHeader('bytes=0-99,200-299', size)).toBeNull()
    })

    it('parses explicit and open-ended ranges', () => {
      expect(parseRangeHeader('bytes=0-499', size)).toEqual({ start: 0, end: 499 })
      expect(parseRangeHeader('bytes=100-', size)).toEqual({ start: 100, end: 999 })
      expect(parseRangeHeader('bytes=999-999', size)).toEqual({ start: 999, end: 999 })
    })

    it('clamps end past EOF to the last byte', () => {
      expect(parseRangeHeader('bytes=500-2000', size)).toEqual({ start: 500, end: 999 })
    })

    it('parses suffix ranges (last N bytes)', () => {
      expect(parseRangeHeader('bytes=-100', size)).toEqual({ start: 900, end: 999 })
      // suffix longer than the file → whole file
      expect(parseRangeHeader('bytes=-5000', size)).toEqual({ start: 0, end: 999 })
      // suffix of zero bytes references nothing
      expect(parseRangeHeader('bytes=-0', size)).toBe('unsatisfiable')
    })

    it('marks start-at/past-EOF and inverted ranges unsatisfiable', () => {
      expect(parseRangeHeader('bytes=1000-', size)).toBe('unsatisfiable')
      expect(parseRangeHeader('bytes=1000-1200', size)).toBe('unsatisfiable')
      expect(parseRangeHeader('bytes=5-2', size)).toBe('unsatisfiable')
      expect(parseRangeHeader('bytes=0-0', 0)).toBe('unsatisfiable') // empty file
    })

    it('tolerates surrounding whitespace', () => {
      expect(parseRangeHeader(' bytes=0-99  ', size)).toEqual({ start: 0, end: 99 })
    })
  })

  describe('mediaStreamPlan (R70.15)', () => {
    const type = 'video/mp4'

    it('regression: open-ended range on a >2GiB file plans a full-window 206 (the old single fs.read of this window tripped Node\'s int32 CHECK and aborted the app)', () => {
      const size = 4_055_708_976 // the crash file: 3.78GiB HEVC Main10
      const plan = mediaStreamPlan(parseRangeHeader('bytes=0-', size), size, type)
      expect(plan.status).toBe(206)
      if (plan.status === 416) throw new Error('unreachable')
      expect(plan.start).toBe(0)
      expect(plan.end).toBe(size - 1)
      // the window must stay > INT32_MAX to pin what killed the old handler
      expect(plan.end - plan.start + 1).toBeGreaterThan(2_147_483_647)
      expect(plan.headers['Content-Length']).toBe(String(size))
      expect(plan.headers['Content-Range']).toBe(`bytes 0-${size - 1}/${size}`)
      expect(plan.headers['Content-Type']).toBe(type)
      expect(plan.headers['Accept-Ranges']).toBe('bytes')
      expect(plan.headers['Access-Control-Allow-Origin']).toBe('*')
    })

    it('no Range header plans a full-file 200 without Content-Range', () => {
      const plan = mediaStreamPlan(parseRangeHeader(null, 1000), 1000, type)
      expect(plan.status).toBe(200)
      if (plan.status === 416) throw new Error('unreachable')
      expect(plan.start).toBe(0)
      expect(plan.end).toBe(999)
      expect(plan.headers['Content-Length']).toBe('1000')
      expect(plan.headers['Content-Range']).toBeUndefined()
    })

    it('bounded and suffix ranges plan their exact 206 window', () => {
      const bounded = mediaStreamPlan(parseRangeHeader('bytes=100-199', 1000), 1000, type)
      expect(bounded.status).toBe(206)
      if (bounded.status !== 416) {
        expect(bounded.start).toBe(100)
        expect(bounded.end).toBe(199)
        expect(bounded.headers['Content-Length']).toBe('100')
        expect(bounded.headers['Content-Range']).toBe('bytes 100-199/1000')
      }
      const suffix = mediaStreamPlan(parseRangeHeader('bytes=-100', 1000), 1000, type)
      expect(suffix.status).toBe(206)
      if (suffix.status !== 416) {
        expect(suffix.start).toBe(900)
        expect(suffix.end).toBe(999)
      }
    })

    it('unsatisfiable ranges plan a 416 with the size-only Content-Range', () => {
      const plan = mediaStreamPlan(parseRangeHeader('bytes=5-2', 1000), 1000, type)
      expect(plan.status).toBe(416)
      expect(plan.headers['Content-Range']).toBe('bytes */1000')
    })

    it('empty file with no Range plans a zero-length 200 window', () => {
      const plan = mediaStreamPlan(parseRangeHeader(null, 0), 0, type)
      expect(plan.status).toBe(200)
      if (plan.status !== 416) {
        expect(plan.end).toBeLessThan(plan.start) // handler serves an empty body for this
        expect(plan.headers['Content-Length']).toBe('0')
      }
    })
  })
})
