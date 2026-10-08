/**
 * R148 S5: UI theme preference — dark / light / follow-system.
 *
 * Dark is the shipped default (R148.2 stage-first design language — the app
 * is a dark control room around light-effect content), which also keeps the
 * visual-baseline snapshots deterministic on any OS. 'system' resolves via
 * prefers-color-scheme and re-resolves live on OS theme change.
 *
 * Mechanism: the resolved theme lands on <html data-theme="light">; dark is
 * the :root default (attribute absent). All chrome colors flow through the
 * semantic token layer in styles/tokens.css — the light block there is the
 * single place light values are defined. Stage surfaces (LED preview, video
 * players, game canvases, 3D scenes) ride --stage-bg / content literals and
 * stay dark in both themes on purpose.
 */
export const UI_THEME_OPTIONS = [
  { id: 'dark' },
  { id: 'light' },
  { id: 'system' },
] as const

export type UiThemeId = (typeof UI_THEME_OPTIONS)[number]['id']
export type ResolvedTheme = 'dark' | 'light'

export const UI_THEME_DEFAULT: UiThemeId = 'dark'

export function isUiThemeId(v: string): v is UiThemeId {
  return UI_THEME_OPTIONS.some((o) => o.id === v)
}

/** Preference + OS scheme → the theme actually rendered. */
export function resolveTheme(pref: string, prefersDark: boolean): ResolvedTheme {
  if (isUiThemeId(pref) && pref !== 'system') return pref
  return prefersDark ? 'dark' : 'light'
}

/** Stamp the resolved theme onto <html>; dark = attribute removed (root default). */
export function applyTheme(pref: string, prefersDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(pref, prefersDark)
  if (resolved === 'light') document.documentElement.setAttribute('data-theme', 'light')
  else document.documentElement.removeAttribute('data-theme')
  // R224.3: this is the single choke point every theme resolution funnels
  // through (bootTheme pre-paint, settings change, live prefers-color-scheme
  // flips) — piggyback the resolved theme to main so the native window
  // controls strip recolors with the chrome. Bridge may be absent (overlay /
  // snip windows, tests) — optional chaining keeps it a silent no-op there.
  window.rgbbox?.setTitleBarTheme?.(resolved)
  return resolved
}

/**
 * Pre-paint boot call for the renderer entry: applies the persisted
 * preference synchronously before React renders so a light-theme user never
 * sees a dark flash. Falls back silently (storage/SSR-hostile contexts).
 */
export function bootTheme(): ResolvedTheme {
  let pref: string = UI_THEME_DEFAULT
  try {
    pref = localStorage.getItem('rgbbox:theme') ?? UI_THEME_DEFAULT
  } catch { /* best-effort */ }
  let prefersDark = true
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch { /* best-effort */ }
  return applyTheme(pref, prefersDark)
}
