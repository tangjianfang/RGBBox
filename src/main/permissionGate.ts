// R236.1: origin-gated permission whitelist.
//
// The default session used to grant the media permission types to WHOEVER
// asked — including about:blank popups or any remote page that somehow got
// loaded. This gate narrows that: the type whitelist only applies when the
// requesting surface is one of the app's own —
//   file://   packaged renderer pages (loadFile)
//   media://  the custom asset protocol (mediaProtocol.ts)
//   http://<loopback>  ONLY while ELECTRON_RENDERER_URL is set (`yarn dev`,
//              electron-vite serves the renderer + visionHost on localhost)
// Everything else (about:blank, any https origin, unknown schemes) is denied
// before the type check. Extracted from main/index.ts as a pure function so
// the whole matrix is unit-testable (tests/main/permissionGate.test.ts).

/** Permission types the app's own pages may request (unchanged from pre-R236). */
const ALLOWED_PERMISSIONS = new Set(['media', 'audioCapture', 'videoCapture', 'display-capture', 'fullscreen'])

/** Loopback hosts electron-vite dev servers bind to. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function isDevRuntime(): boolean {
  // Same signal main/index.ts uses for its `isDevelopment` — set by
  // `yarn dev`, absent in packaged builds. Read lazily (not at module load)
  // so tests can flip it per-case.
  return Boolean(process.env.ELECTRON_RENDERER_URL)
}

/**
 * Decide whether `permission` requested by the page at `originUrl` is allowed.
 * `originUrl` may be a full URL (permission-request `details.requestingUrl`,
 * `webContents.getURL()`) or a bare origin (permission-check
 * `requestingOrigin`, e.g. `file://`); undefined/unparsable → deny.
 */
export function allowPermission(originUrl: string | undefined, permission: string): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false
  if (originUrl === undefined || originUrl === '') return false

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(originUrl.trim())
  if (schemeMatch === null) return false
  const scheme = schemeMatch[1].toLowerCase()

  if (scheme === 'file' || scheme === 'media') return true
  if (scheme === 'http') {
    if (!isDevRuntime()) return false
    try {
      return LOOPBACK_HOSTS.has(new URL(originUrl).hostname)
    } catch {
      return false
    }
  }
  // https:, about:, chrome:, data:, … — not app surfaces.
  return false
}
