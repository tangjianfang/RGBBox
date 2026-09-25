import { describe, expect, it } from 'vitest'
import { describeMediaError, formatMediaFailure, MEDIA_ERROR_CODES } from '../../../src/renderer/src/domain/mediaError'
import type { TranslationKey } from '../../../src/renderer/src/i18n'

// R168: MediaError.code → user-facing message mapping.
const t = (key: TranslationKey): string => `T:${key}`

describe('domain/mediaError describeMediaError (R168)', () => {
  it('maps each Chromium MediaError code to its message key', () => {
    expect(describeMediaError({ code: MEDIA_ERROR_CODES.aborted })?.key).toBe('media.error.aborted')
    expect(describeMediaError({ code: MEDIA_ERROR_CODES.network })?.key).toBe('media.error.network')
    expect(describeMediaError({ code: MEDIA_ERROR_CODES.decode })?.key).toBe('media.error.decode')
    expect(describeMediaError({ code: MEDIA_ERROR_CODES.srcUnsupported })?.key).toBe('media.error.unsupported')
  })

  it('falls back to unsupported for unknown positive codes (demux failures reuse it)', () => {
    expect(describeMediaError({ code: 99 })?.key).toBe('media.error.unsupported')
  })

  it('returns null for nothing-to-report inputs', () => {
    expect(describeMediaError(null)).toBeNull()
    expect(describeMediaError(undefined)).toBeNull()
    expect(describeMediaError({})).toBeNull()
    expect(describeMediaError({ code: 0 })).toBeNull()
    expect(describeMediaError({ code: -1 })).toBeNull()
  })

  it('carries the raw browser message as detail', () => {
    const f = describeMediaError({
      code: 4,
      message: 'DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed',
    })
    expect(f?.detail).toBe('DEMUXER_ERROR_COULD_NOT_OPEN: FFmpegDemuxer: open context failed')
    expect(describeMediaError({ code: 4 })?.detail).toBe('')
  })

  it('formatMediaFailure appends the detail in brackets', () => {
    expect(formatMediaFailure({ key: 'media.error.unsupported', detail: '' }, t)).toBe('T:media.error.unsupported')
    expect(formatMediaFailure({ key: 'media.error.decode', detail: 'ERR' }, t)).toBe('T:media.error.decode [ERR]')
  })
})
