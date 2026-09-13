import { Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import { isViewReachable, type View } from '../hooks/tabNavigation'
import { CARD_VIEWS, getTabMeta } from './shellModules'

export interface ModuleRailProps {
  activeView: View
  onSwitch: (v: View) => void
  onOpenSettings: () => void
  isSettingsActive: boolean
  model3dEnabled: boolean
}

/** R86: Synapse-style left module rail — click to switch directly (no tabs). */
export function ModuleRail({ activeView, onSwitch, onOpenSettings, isSettingsActive, model3dEnabled }: ModuleRailProps) {
  const { t } = useI18n()
  const items: View[] = ['dashboard', ...CARD_VIEWS.filter((v) => isViewReachable(v, model3dEnabled))]
  return (
    <nav className="module-rail" aria-label={t('a11y.moduleNav')}>
      {items.map((view) => {
        const meta = getTabMeta(view)
        const Icon = meta.icon
        const active = view === activeView
        return (
          <button
            key={view}
            type="button"
            className={`rail-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={t(meta.labelKey)}
            title={t(meta.labelKey)}
            onClick={() => onSwitch(view)}
          >
            <Icon size={20} />
            <span className="rail-label">{t(meta.labelKey)}</span>
          </button>
        )
      })}
      <div className="rail-spacer" />
      <button
        type="button"
        className={`rail-item rail-settings${isSettingsActive ? ' active' : ''}`}
        aria-current={isSettingsActive ? 'page' : undefined}
        aria-label={t('nav.settings')}
        title={t('nav.settings')}
        onClick={onOpenSettings}
      >
        <Settings size={20} />
        <span className="rail-label">{t('nav.settings')}</span>
      </button>
    </nav>
  )
}
