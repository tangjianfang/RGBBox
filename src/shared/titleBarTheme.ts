/**
 * R224.3: resolved UI theme → Window Controls Overlay colors.
 *
 * The main window's titleBarOverlay is created dark (stage-first default);
 * once the renderer resolves the theme (R148 S5) it pushes the result over
 * uiSetTitleBarTheme so the native min/max/close strip follows. Values mirror
 * the semantic tokens so the strip is seamless with `.topbar`
 * (background: var(--bg-toolbar)):
 *   dark  — #11191f = dark --bg-toolbar (shipped overlay color, unchanged)
 *   light — #e9eff2 = light --bg-toolbar; symbols #3f5a66 = light --text-secondary
 */
export interface TitleBarOverlayColors {
  color: string
  symbolColor: string
}

export type TitleBarTheme = 'dark' | 'light'

export const TITLE_BAR_OVERLAY_COLORS: Record<TitleBarTheme, TitleBarOverlayColors> = {
  dark: { color: '#11191f', symbolColor: '#9cb7c3' },
  light: { color: '#e9eff2', symbolColor: '#3f5a66' },
}

export function isResolvedTheme(v: unknown): v is TitleBarTheme {
  return v === 'dark' || v === 'light'
}

/** Map a resolved theme to overlay colors; anything unknown falls back to dark (root default). */
export function titleBarOverlayColors(theme: unknown): TitleBarOverlayColors {
  return isResolvedTheme(theme) ? TITLE_BAR_OVERLAY_COLORS[theme] : TITLE_BAR_OVERLAY_COLORS.dark
}
