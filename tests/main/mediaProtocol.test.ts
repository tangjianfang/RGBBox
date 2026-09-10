import { describe, expect, it } from 'vitest'
import { MEDIA_MIME, parseRangeHeader, resolveMediaMime } from '../../src/main/mediaProtocol'

describe('main/mediaProtocol (R70.1)', () => {
  describe('resolveMediaMime', () => {
    it('maps audio extensions (pre-R70 table, unchanged)', () => {
      expect(resolveMediaMime('C:\\music\\song.MP3')).toBe('audio/mpeg')
      expect(resolveMediaMime('/home/user/tune.flac')).toBe('audio/flac')
      expect(resolveMediaMime('track.opus')).toBe('audio/opus')
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
})
