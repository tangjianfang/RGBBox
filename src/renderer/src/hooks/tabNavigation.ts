// R85 tab-shell navigation core. Pure functions, no React/DOM — unit-testable in node.

export type View =
  | 'dashboard' | 'workspace' | 'effects' | 'games' | 'audio'
  | 'video' | 'diagnostics' | 'model3d' | 'architecture'
  | 'settings' | 'profiles'
// 'profiles' keeps its legacy status: in the union, but never rendered / never a tab (R85.4).

export const DASHBOARD_VIEW: View = 'dashboard'

const KNOWN_VIEWS: ReadonlySet<string> = new Set<View>([
  'dashboard', 'workspace', 'effects', 'games', 'audio', 'video',
  'diagnostics', 'model3d', 'architecture', 'settings', 'profiles'
])

const TABBABLE_VIEWS: readonly View[] = [
  'workspace', 'effects', 'games', 'audio', 'video',
  'diagnostics', 'model3d', 'architecture', 'settings'
]

export interface TabNavState {
  tabs: View[]
  activeView: View
}

export function isKnownView(v: unknown): v is View {
  return typeof v === 'string' && KNOWN_VIEWS.has(v)
}

function isTabbable(v: View): boolean {
  return v !== DASHBOARD_VIEW && v !== 'profiles' && TABBABLE_VIEWS.includes(v)
}

/** Always returns ['dashboard', ...unique tabbable views in input order]. */
export function sanitizeTabs(raw: unknown, model3dEnabled: boolean): View[] {
  const items = Array.isArray(raw) ? raw : []
  const out: View[] = []
  for (const item of items) {
    if (!isKnownView(item) || !isTabbable(item)) continue
    if (item === 'model3d' && !model3dEnabled) continue
    if (out.includes(item)) continue
    out.push(item)
  }
  return [DASHBOARD_VIEW, ...out]
}

/** Boot-time resolution, incl. legacy 'rgbbox:view' → tab migration (R85.4). */
export function resolveInitialTabs(
  storedTabsRaw: string | null,
  storedViewRaw: string | null,
  model3dEnabled: boolean
): TabNavState {
  let tabs: View[] | null = null
  if (storedTabsRaw !== null) {
    try {
      tabs = sanitizeTabs(JSON.parse(storedTabsRaw), model3dEnabled)
    } catch {
      tabs = null
    }
  }
  if (tabs === null) {
    const legacy = isKnownView(storedViewRaw) && isTabbable(storedViewRaw)
      && !(storedViewRaw === 'model3d' && !model3dEnabled)
      ? storedViewRaw
      : null
    tabs = legacy === null ? [DASHBOARD_VIEW] : [DASHBOARD_VIEW, legacy]
  }
  const active = isKnownView(storedViewRaw)
    && (storedViewRaw === DASHBOARD_VIEW || tabs.includes(storedViewRaw))
    ? storedViewRaw
    : DASHBOARD_VIEW
  return { tabs, activeView: active }
}

export function openView(state: TabNavState, view: View): TabNavState {
  if (view === DASHBOARD_VIEW) return { tabs: state.tabs, activeView: DASHBOARD_VIEW }
  if (!isTabbable(view)) return state
  return {
    tabs: state.tabs.includes(view) ? state.tabs : [...state.tabs, view],
    activeView: view
  }
}

export function closeView(state: TabNavState, view: View): TabNavState {
  if (view === DASHBOARD_VIEW || !isTabbable(view)) return state
  const tabs = state.tabs.filter((v) => v !== view)
  return { tabs, activeView: state.activeView === view ? DASHBOARD_VIEW : state.activeView }
}
