/**
 * R320: production CSP policy as a pure, unit-tested module (extracted from
 * electron.vite.config.ts inline constants — the mirror of mediaProtocol /
 * rendererCrashPolicy). The CSP is a behavioral contract of the packaged
 * build, and three of its outlets have had regressions already; the tests in
 * tests/shared/cspPolicy.test.ts lock it.
 *
 * Scheme history:
 * - R306/T16: first CSP, production-only (dev keeps vite HMR unblocked) —
 *   locked to self + the app's own media:// protocol (vision bundle + models)
 *   + the blob/data URLs the app legitimately produces + 'wasm-unsafe-eval'
 *   for MediaPipe (wasm only — no JS eval is allowed).
 * - R307 (T16 regression): AI8 is renderer-direct by design — connect-src
 *   initially omitted its origin and silently killed every AI8 fetch in
 *   packaged builds. img-src allows remote https (chat markdown embeds
 *   arbitrary user-content images — passive content).
 * - R316 (third CSP regression): media-src/img-src missed the app's own
 *   `media:` scheme — every packaged media://local video/audio/thumbnail was
 *   rejected pre-network as "MEDIA_ELEMENT_ERROR: Media load rejected by URL
 *   safety check". Fixed by adding `media:`.
 * - R320: media-src/connect-src missed `http:`/`https:` — the packaged stream
 *   box (direct URLs), AI8 video results (<video src={videoUrl}>) and hls.js
 *   fetches died with the same URL-safety error. http: is kept deliberately:
 *   probing on the built file:// page showed http media/fetch is NOT blocked
 *   as mixed content, so LAN cameras / LAN HLS stay usable.
 *
 * Security stance: script-src stays at 'self' + wasm-unsafe-eval — no JS
 * eval anywhere. media-src widening is passive content (same trust class as
 * the R307 img-src https:). connect-src http(s) is an active egress surface
 * required by hls.js; documented as a user-vetoable trade-off in R320.2.
 */
export const CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  'default-src': "'self'",
  'script-src': "'self' media: 'wasm-unsafe-eval'",
  'style-src': "'self' 'unsafe-inline'",
  'img-src': "'self' data: blob: https: media:",
  'connect-src': "'self' media: blob: https: http: https://ai8.rcouyi.com",
  'media-src': "'self' media: blob: https: http:",
  'worker-src': "'self' blob:",
  'font-src': "'self' data:",
  'object-src': "'none'",
}

export const PROD_CSP: string = Object.entries(CSP_DIRECTIVES)
  .map(([directive, value]) => `${directive} ${value}`)
  .join('; ')

/**
 * Vite plugin that stamps the CSP meta into every renderer html entry.
 * Framework-free on purpose: the plugin shape is structural — no vite import
 * needed at runtime, which keeps this module loadable from plain Node tests.
 */
export function buildProdCspPlugin() {
  return {
    name: 'rgbbox-prod-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string): string {
      if (html.includes('http-equiv="Content-Security-Policy"')) return html
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}">`)
    },
  }
}
