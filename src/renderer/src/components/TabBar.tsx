import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { View } from '../hooks/tabNavigation'
import { getTabMeta } from './shellModules'

export interface TabBarProps {
  tabs: View[]
  activeView: View
  onOpen: (v: View) => void
  onClose: (v: View) => void
}

export function TabBar({ tabs, activeView, onOpen, onClose }: TabBarProps) {
  const { t } = useI18n()
  return (
    <div className="tab-bar" role="tablist" aria-label="Module tabs">
      {tabs.map((view) => {
        const meta = getTabMeta(view)
        const Icon = meta.icon
        const active = view === activeView
        return (
          <div key={view} className={`tab${active ? ' active' : ''}`} role="tab" aria-selected={active}>
            <button type="button" className="tab-main" onClick={() => onOpen(view)}>
              <Icon size={15} />
              <span>{t(meta.labelKey)}</span>
            </button>
            {view !== 'dashboard' && (
              <button
                type="button"
                className="tab-close"
                aria-label={t('dash.closeTab')}
                onClick={() => onClose(view)}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
