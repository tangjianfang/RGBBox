// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { buildPathEntries, ingestRestoredProgress, shouldOfferResume } from '../../../src/renderer/src/components/video/playlistProgress'

describe('video/playlistProgress (R91.1)', () => {
  const playlist = [
    { id: 'a', name: 'movie.mp4', url: 'media://local?p=C%3A%5Cv%5Cmovie.mp4', group: 'Default' },
    { id: 'b', name: 'remote', url: 'https://example.com/v.mp4', group: 'Default' },
    { id: 'c', name: 'blob item', url: 'blob:xx', group: 'Default' },
    { id: 'd', name: 'no url', group: 'Default' },
    { id: 'e', name: 'bad url', url: 'media://%', group: 'Default' },
  ]

  it('buildPathEntries keeps media:// items only, decoding ?p= to a path', () => {
    const out = buildPathEntries(playlist, {})
    // malformed media:// URL (new URL throws) is dropped, not crashed
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', name: 'movie.mp4', path: 'C:\\v\\movie.mp4', group: 'Default' })
  })

  it('buildPathEntries merges progress into entries with t>0, floors values', () => {
    const out = buildPathEntries(playlist, {
      a: { t: 754.7, d: 8597, u: 1726000000000 },
      b: { t: 10, d: 100, u: 1 }, // non-media item — never persisted
    })
    expect(out.find(e => e.id === 'a')).toMatchObject({ progress: 754, duration: 8597, updatedAt: 1726000000000 })
    expect(out.find(e => e.id === 'b')).toBeUndefined()
    // zero-position progress (fresh) keeps the entry clean
    const out2 = buildPathEntries(playlist, { a: { t: 0, d: 100, u: 1 } })
    expect(out2.find(e => e.id === 'a')!.progress).toBeUndefined()
  })

  it('shouldOfferResume: >30s in and >60s from the end', () => {
    expect(shouldOfferResume(undefined)).toBe(false)
    expect(shouldOfferResume({ t: 10, d: 100, u: 0 })).toBe(false) // barely started
    expect(shouldOfferResume({ t: 31, d: 100, u: 0 })).toBe(true)
    expect(shouldOfferResume({ t: 95, d: 100, u: 0 })).toBe(false) // almost finished
    expect(shouldOfferResume({ t: 41, d: 100, u: 0 })).toBe(false) // exactly 60s from end
  })

  it('ingestRestoredProgress folds persisted entries, skipping invalid ones', () => {
    const map = ingestRestoredProgress([
      { id: 'a', progress: 100, duration: 200, updatedAt: 5 },
      { id: 'b' }, // never watched
      { id: 'c', progress: 0, duration: 200 }, // zero position — skip
      { id: 'd', progress: 10, duration: 0 }, // no duration — skip
    ])
    expect(map).toEqual({ a: { t: 100, d: 200, u: 5 } })
  })
})
