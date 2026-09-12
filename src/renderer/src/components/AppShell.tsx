import { Languages, Mic, MicOff, Settings, Timer, User } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useI18n } from '../i18n'
import { TabBar, type TabBarProps } from './TabBar'

export interface AppShellProps extends TabBarProps {
  version: string
  // audio quick block (from the old sidebar)
  audioEnabled: boolean
  onToggleAudio: () => void
  audioLevels?: { bass: number; mid: number; high: number }
  audioErrorLabel?: string
  lang: 'zh' | 'en'
  onToggleLang: () => void
  // R73 shutdown chip — undefined = not armed, chip hidden
  shutdownLabel?: string
  onShutdownClick: () => void
  children: ReactNode
}

export function AppShell(props: AppShellProps) {
  const { t } = useI18n()
  const { tabs, activeView, onOpen, onClose } = props
  return (
    <>
      <header className="topbar">
        <div className="brand-block topbar-brand" title={`RGBBox v${props.version}`}>
          <div className="brand-mark">RB</div>
          <h1>RGBBox</h1>
        </div>

        <TabBar tabs={tabs} activeView={activeView} onOpen={onOpen} onClose={onClose} />

        <div className="topbar-controls">
          <button
            type="button"
            className={`audio-toggle${props.audioEnabled ? ' active' : ''}`}
            onClick={props.onToggleAudio}
            title={props.audioErrorLabel || (props.audioEnabled ? t('audio.on') : t('audio.off'))}
          >
            {props.audioEnabled ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          {props.audioEnabled && props.audioLevels && (
            <div className="audio-meter-row topbar-meters">
              <div className="audio-meter" style={{ '--level': props.audioLevels.bass } as CSSProperties} title="Bass" />
              <div className="audio-meter" style={{ '--level': props.audioLevels.mid } as CSSProperties} title="Mid" />
              <div className="audio-meter" style={{ '--level': props.audioLevels.high } as CSSProperties} title="High" />
            </div>
          )}
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={props.onToggleLang}
            title={props.lang === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Languages size={15} />
          </button>
          {props.shutdownLabel && (
            <button type="button" className="topbar-chip" onClick={props.onShutdownClick} title={t('shutdown.title')}>
              <Timer size={14} />
              <span>{props.shutdownLabel}</span>
            </button>
          )}
          {/* ⚙ settings menu — native <details> keeps it testable & dependency-free */}
          <details className="topbar-menu" data-menu="settings">
            <summary aria-label={t('nav.settings')}><Settings size={16} /></summary>
            <div className="topbar-menu-items" role="menu">
              <button type="button" role="menuitem" className="topbar-menu-item" onClick={() => onOpen('settings')}>
                {t('menu.settings')}
              </button>
              <div className="topbar-menu-about">{t('menu.about')} · RGBBox v{props.version}</div>
            </div>
          </details>
          {/* 👤 user menu — reserved entries, all disabled (R85.3) */}
          <details className="topbar-menu" data-menu="user">
            <summary aria-label={t('menu.login')}><User size={16} /></summary>
            <div className="topbar-menu-items" role="menu">
              <button type="button" role="menuitem" className="topbar-menu-item" disabled title={t('menu.comingSoon')}>
                {t('menu.login')}
              </button>
              <button type="button" role="menuitem" className="topbar-menu-item" disabled title={t('menu.comingSoon')}>
                {t('menu.profile')}
              </button>
              <button type="button" role="menuitem" className="topbar-menu-item" disabled title={t('menu.comingSoon')}>
                {t('menu.logout')}
              </button>
            </div>
          </details>
        </div>
      </header>
      <div className="app-content">{props.children}</div>
    </>
  )
}
