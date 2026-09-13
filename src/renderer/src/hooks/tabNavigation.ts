// R86: single-view navigation core. R85's multi-tab model (tabs array, open/close)
// was removed together with the top TabBar — the left ModuleRail switches directly.
// Pure functions, no React/DOM — unit-testable in node.

/** Valid module views (membership single source). DISPLAY order is owned by
 *  CARD_VIEWS in shellModules.ts — this tuple mirrors it (+ settings at the
 *  tail) and an exact-order test keeps the two in lockstep. */
export const MODULE_VIEWS = [
  'workspace', 'effects', 'video', 'audio', 'model3d',
  'games', 'diagnostics', 'architecture', 'ai', 'settings'
] as const
export type ModuleView = (typeof MODULE_VIEWS)[number]

export type View = 'dashboard' | 'profiles' | ModuleView
// 'profiles' keeps its legacy status: in the union, but never rendered (R85.4/R86).

export const DASHBOARD_VIEW: View = 'dashboard'

/** Storage key for the last active view (single source; legacy R85 key). */
export const VIEW_STORAGE_KEY = 'rgbbox:view'

const KNOWN_VIEWS: ReadonlySet<string> = new Set<string>([...MODULE_VIEWS, 'dashboard', 'profiles'])

export function isKnownView(v: unknown): v is View {
  return typeof v === 'string' && KNOWN_VIEWS.has(v)
}

/** Whether a view is currently reachable in the UI — the ONE feature-flag gate
 *  consumed by boot resolution, the rail and the dashboard tiles. */
export function isViewReachable(view: View, model3dEnabled: boolean): boolean {
  return view !== 'profiles' && !(view === 'model3d' && !model3dEnabled)
}

/** Boot-time view resolution for the single-active-page rail (R86).
 *  Legacy R85 'rgbbox:tabs' data is ignored; a stored 'rgbbox:view' that is
 *  invalid or unreachable falls back to the dashboard. */
export function resolveInitialView(storedViewRaw: string | null, model3dEnabled: boolean): View {
  return isKnownView(storedViewRaw) && isViewReachable(storedViewRaw, model3dEnabled)
    ? storedViewRaw
    : DASHBOARD_VIEW
}

/** Read the persisted last-active view (null when storage is unavailable). */
export function loadStoredView(storage: Pick<Storage, 'getItem'> | null): string | null {
  return storage ? storage.getItem(VIEW_STORAGE_KEY) : null
}

/** Persist the active view (no-op when localStorage is unavailable, e.g. SSR/tests). */
export function persistView(view: View): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_STORAGE_KEY, view)
}
