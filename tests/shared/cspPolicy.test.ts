import { describe, expect, it } from 'vitest'

import { CSP_DIRECTIVES, PROD_CSP, buildProdCspPlugin } from '../../src/shared/cspPolicy'

/**
 * R320: the prod CSP is a behavioral contract of the packaged build — its
 * media-src/connect-src omissions killed the stream box, AI8 video results
 * and hls.js (MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check,
 * rejected pre-network, packaged only — dev injects no CSP). These tests are
 * the lock: every renderer media/fetch consumer class maps to a CSP outlet
 * that admits it, and the injection plugin behaves.
 *
 * Hardcoded expectations on purpose — asserting against the module's own
 * constants would be tautological. When a new media consumer appears, add a
 * row to CONSUMER_MATRIX, not a weaker assertion.
 */

/** Every scheme/host class the renderer actually loads media/fetches through. */
const CONSUMER_MATRIX: ReadonlyArray<{ feature: string; url: string; directive: keyof typeof CSP_DIRECTIVES; outlet: string }> = [
  // R70/R316: VideoStudio/AudioStudio playlists + AI8 local artifacts + filmstrip
  { feature: 'playlist media://local', url: 'media://local?p=…', directive: 'media-src', outlet: 'media:' },
  { feature: 'picker/recorder blob:', url: 'blob:…', directive: 'media-src', outlet: 'blob:' },
  // R320: stream-box direct URLs (mp4/webm; LAN cameras are http)
  { feature: '网络流 direct https', url: 'https://…/v.mp4', directive: 'media-src', outlet: 'https:' },
  { feature: '网络流 direct http', url: 'http://192.168.…/v.mp4', directive: 'media-src', outlet: 'http:' },
  // R320: AI8 video generation results (remote videoUrl on <video>)
  { feature: 'AI8 remote videoUrl', url: 'https://ai8…/v.mp4', directive: 'media-src', outlet: 'https:' },
  // R320: hls.js m3u8 + segment fetches
  { feature: 'hls.js playlist fetch', url: 'https://…/x.m3u8', directive: 'connect-src', outlet: 'https:' },
  { feature: 'hls.js segment fetch (LAN)', url: 'http://192.168.…/seg0.ts', directive: 'connect-src', outlet: 'http:' },
  // R307: AI8 API calls (named before https: existed — breadcrumb, now redundant)
  { feature: 'AI8 API', url: 'https://ai8.rcouyi.com/api/…', directive: 'connect-src', outlet: 'https://ai8.rcouyi.com' },
  // R316: filmstrip/AI8 thumbnails
  { feature: '缩略图 media://local', url: 'media://local?p=…', directive: 'img-src', outlet: 'media:' },
  // R131: vision bundle + wasm + models
  { feature: 'vision bundle fetch', url: 'media://app/…', directive: 'connect-src', outlet: 'media:' },
  { feature: 'vision script', url: 'media://app/vision_bundle.js', directive: 'script-src', outlet: 'media:' },
]

describe('cspPolicy directives (R320)', () => {
  it('admits every renderer media/fetch consumer class', () => {
    for (const row of CONSUMER_MATRIX) {
      const directive = CSP_DIRECTIVES[row.directive]
      expect(directive, `${row.feature} → ${row.directive}`).toContain(row.outlet)
    }
  })

  it('media-src carries the full R320 scheme set', () => {
    expect(CSP_DIRECTIVES['media-src']).toBe("'self' media: blob: https: http:")
  })

  it('connect-src carries http(s) for hls.js alongside the R307 ai8 host', () => {
    expect(CSP_DIRECTIVES['connect-src']).toBe("'self' media: blob: https: http: https://ai8.rcouyi.com")
  })

  it('keeps the R316 img-src regression lock', () => {
    expect(CSP_DIRECTIVES['img-src']).toBe("'self' data: blob: https: media:")
  })

  it('keeps script-src locked: no JS eval, wasm only', () => {
    expect(CSP_DIRECTIVES['script-src']).toBe("'self' media: 'wasm-unsafe-eval'")
  })

  it('ships the full directive set (a dropped directive must fail here)', () => {
    expect(Object.keys(CSP_DIRECTIVES)).toEqual([
      'default-src', 'script-src', 'style-src', 'img-src', 'connect-src',
      'media-src', 'worker-src', 'font-src', 'object-src',
    ])
    expect(CSP_DIRECTIVES['default-src']).toBe("'self'")
    expect(CSP_DIRECTIVES['object-src']).toBe("'none'")
  })

  it('joins directives with "; " and terminates none (meta content shape)', () => {
    expect(PROD_CSP).toBe(Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${k} ${v}`).join('; '))
    expect(PROD_CSP.endsWith(';')).toBe(false)
  })
})

describe('buildProdCspPlugin (R320)', () => {
  const plugin = buildProdCspPlugin()

  it('is a build-only vite plugin with a stable name', () => {
    expect(plugin.name).toBe('rgbbox-prod-csp')
    expect(plugin.apply).toBe('build')
  })

  it('injects exactly one CSP meta right after <head>', () => {
    const html = '<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>\n'
    const out = plugin.transformIndexHtml(html)
    expect(out.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
    expect(out).toContain(`content="${PROD_CSP}"`)
    // head opening preserved exactly once, title and body untouched
    expect(out.match(/<head>/g)).toHaveLength(1)
    expect(out).toContain('<title>x</title>')
    expect(out).toContain('<body></body>')
  })

  it('does not disturb html that already carries the CSP meta (idempotent)', () => {
    const injected = plugin.transformIndexHtml('<head>\n</head>')
    expect(plugin.transformIndexHtml(injected)).toBe(injected)
  })

  it('returns html without <head> unchanged (defensive — vite always emits one)', () => {
    const html = '<html><body></body></html>'
    expect(plugin.transformIndexHtml(html)).toBe(html)
  })
})
