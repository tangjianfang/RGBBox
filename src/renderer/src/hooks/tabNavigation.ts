// R86: single-view navigation core. R85's multi-tab model (tabs array, open/close)
// was removed together with the top TabBar — the left ModuleRail switches directly.
// Pure functions, no React/DOM — unit-testable in node.

/** Single ordered list of module views (single source; add a module HERE plus
 *  its card meta in shellModules.ts). */
export const MODULE_VIEWS = [
  'workspace', 'effects', 'games', 'audio', 'video',
  'diagnostics', 'model3d', 'architecture', 'settings'
] as const
export type ModuleView = (typeof MODULE_VIEWS)[number]

export type View = 'dashboard' | 'profiles' | ModuleView
// 'profiles' keeps its legacy status: in the union, but never rendered (R85.4/R86).

export const DASHBOARD_VIEW: View = 'dashboard'

const KNOWN_VIEWS: ReadonlySet<string> = new Set<string>([...MODULE_VIEWS, 'dashboard', 'profiles'])

export function isKnownView(v: unknown): v is View {
  return typeof v === 'string' && KNOWN_VIEWS.has(v)
}

/** Boot-time view resolution for the single-active-page rail (R86).
 *  Legacy R85 'rgbbox:tabs' data is ignored; a stored 'rgbbox:view' that is
 *  invalid, 'profiles', or a disabled model3d falls back to the dashboard. */
export function resolveInitialView(storedViewRaw: string | null, model3dEnabled: boolean): View {
  if (
    isKnownView(storedViewRaw)
    && storedViewRaw !== 'profiles'
    && !(storedViewRaw === 'model3d' && !model3dEnabled)
  ) {
    return storedViewRaw
  }
  return DASHBOARD_VIEW
}
