import { Languages, Mic, MicOff, Settings, Timer, User } from 'lucide-react'
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
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
  // R73 shutdown chip — label is the countdown when armed, else the "off" hint;
  // the chip is ALWAYS visible so the timer can be armed in the first place.
  shutdownLabel: string
  onShutdownClick: () => void
  children: ReactNode
}

export function AppShell(props: AppShellProps) {
  const { t } = useI18n()
  const { tabs, activeView, onOpen, onClose } = props
  const settingsMenuRef = useRef<HTMLDetailsElement>(null)
  const userMenuRef = useRef<HTMLDetailsElement>(null)

  // Native <details> menus: close both on any outside click, keep them exclusive.
  const closeMenus = useCallback(() => {
    settingsMenuRef.current?.removeAttribute('open')
    userMenuRef.current?.removeAttribute('open')
  }, [])
  useEffect(() => {
    const onDocClick = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.topbar-menu')) return
      closeMenus()
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [closeMenus])

  const runMenuItem = (action: () => void) => () => {
    action()
    closeMenus()
  }

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
          <button
            type="button"
            className={`topbar-chip${props.shutdownLabel ? ' armed' : ''}`}
            onClick={props.onShutdownClick}
            title={t('shutdown.title')}
          >
            <Timer size={14} />
            <span>{props.shutdownLabel || t('shutdown.off')}</span>
          </button>
          {/* ⚙ settings menu — native <details> + explicit close (see closeMenus) */}
          <details className="topbar-menu" data-menu="settings" ref={settingsMenuRef}>
            <summary aria-label={t('nav.settings')}><Settings size={16} /></summary>
            <div className="topbar-menu-items" role="menu">
              <button type="button" role="menuitem" className="topbar-menu-item" onClick={runMenuItem(() => onOpen('settings'))}>
                {t('menu.settings')}
              </button>
              <div className="topbar-menu-about">{t('menu.about')} · RGBBox v{props.version}</div>
            </div>
          </details>
          {/* 👤 user menu — reserved entries, all disabled (R85.3) */}
          <details className="topbar-menu" data-menu="user" ref={userMenuRef}>
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
