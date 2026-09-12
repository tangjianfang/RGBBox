import { useCallback, useEffect, useState } from 'react'
import {
  closeView, openView, resolveInitialTabs,
  type TabNavState, type View
} from './tabNavigation'

const TABS_KEY = 'rgbbox:tabs'
const ACTIVE_KEY = 'rgbbox:view' // legacy key, kept so old installs migrate (R85.4)

export interface UseTabNavigation {
  tabs: View[]
  activeView: View
  openView: (v: View) => void
  closeView: (v: View) => void
}

export function useTabNavigation(model3dEnabled: boolean): UseTabNavigation {
  const [state, setState] = useState<TabNavState>(() =>
    resolveInitialTabs(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(TABS_KEY),
      typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_KEY),
      model3dEnabled
    )
  )

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(state.tabs))
  }, [state.tabs])
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, state.activeView)
  }, [state.activeView])

  const open = useCallback((v: View) => setState((s) => openView(s, v)), [])
  const close = useCallback((v: View) => setState((s) => closeView(s, v)), [])

  return { tabs: state.tabs, activeView: state.activeView, openView: open, closeView: close }
}
