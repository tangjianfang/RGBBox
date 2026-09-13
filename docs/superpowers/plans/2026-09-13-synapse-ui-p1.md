# R86 P1（Synapse 式 UI 重设计·壳层与 Token）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 R85 的「顶部 Tab 壳层」换成「Synapse 式左侧模块图标栏 + 顶工具条」，落地三层明度 token 与 Dashboard 磁贴重排（R86 P1）。

**Architecture:** 导航从多 Tab 状态机回退为单活动视图（`useState<View>` + `rgbbox:view` 持久化）；新增 `ModuleRail`，`AppShell` 去 TabBar 改「工具条 + rail + 内容区」三段；`DashboardView` 容器重写为折叠分组（状态卡 + 磁贴），数据链不动；`styles.css` 落 `:root` token 并重写壳层/Dashboard 样式。

**Tech Stack:** Electron + React 18 + TypeScript；vitest（组件 happy-dom / 纯函数 node）；lucide-react；单文件 styles.css。

**Spec:** `docs/superpowers/specs/2026-09-13-synapse-ui-redesign-design.md`

## Global Constraints

- 配色保持 RGBBox（--accent `#42e8a9`，禁用 Razer 绿/纯黑化）；圆角保留 8–12px。
- 提交标题 `[PRD-0002] <type>: <subject>`，可附 `(R86 P1)`。
- i18n zh+en 同步（ZH 表缺 key 会被 `yarn typecheck` 拦截）。
- 不改 `src/main`、`src/preload`、`src/engine`、`package.json` scripts。
- 命令只用 `yarn test <file>` / `yarn typecheck` / `yarn build`。
- 现状锚点（R85 完成态）：`tabNavigation.ts` 含 `MODULE_VIEWS/View/DASHBOARD_VIEW/isKnownView/sanitizeTabs/resolveInitialTabs/openView/closeView`；`AppShell.tsx` 含 TabBar + `closeMenus` details 逻辑 + 恒显关机 chip；`App.tsx` 用 `useTabNavigation`；`shellModules.ts` 含 `CARD_VIEWS/MODULE_META/TAB_META/getTabMeta/DASHBOARD_SECTIONS`；`dashFps` 实时采样与 `rgbbox:tabs` 持久化均在 hook/组件内。

## File Structure

```text
新增： src/renderer/src/components/ModuleRail.tsx
      tests/renderer/components/ModuleRail.test.tsx
删除： src/renderer/src/components/TabBar.tsx + tests/renderer/components/TabBar.test.tsx
      src/renderer/src/hooks/useTabNavigation.ts + tests/renderer/hooks/useTabNavigation.test.tsx
修改： src/renderer/src/hooks/tabNavigation.ts（瘦身：删多 Tab 语义，增 resolveInitialView）
      src/renderer/src/components/AppShell.tsx（去 TabBar → title + rail 注入 + shell-body）
      src/renderer/src/components/DashboardView.tsx（容器重写：折叠分组 + 状态卡 + 磁贴）
      src/renderer/src/components/shellModules.ts（删 DASHBOARD_SECTIONS/ShellSection）
      src/renderer/src/App.tsx（useState 直切 + ModuleRail + title 接线）
      src/renderer/src/i18n/index.tsx（删 5 key 增 7 key ×2 语言）
      src/renderer/src/styles.css（:root token + rail/topbar/dashboard 重写 + 死样式清理）
      tests/renderer/{i18nShellKeys.test.ts, hooks/tabNavigation.test.ts,
        components/{AppShell,DashboardView,shellModules}.test.tsx|ts}（改写）
      docs/prd/PRD-0002-rgbbox-project-catalog.md（R86.7 P1 证据）
```

---

### Task 1: i18n 增删（删分组/Tab key，增卡片 key）

**Files:**
- Modify: `src/renderer/src/i18n/index.tsx`
- Test: `tests/renderer/i18nShellKeys.test.ts`

**Interfaces:**
- Produces: TranslationKey 删 `dash.section.core|create|tools`、`dash.closeTab`、`dash.opened`；增 `dash.group.status|modules`、`dash.card.engine|fps|effect|overlay|audio`

- [ ] **Step 1: 更新 key 清单测试（先红）**

`tests/renderer/i18nShellKeys.test.ts` 的 `SHELL_KEYS` 数组整体替换为：

```ts
const SHELL_KEYS = [
  'nav.dashboard', 'nav.settings', 'nav.model3d',
  'dash.group.status', 'dash.group.modules',
  'dash.card.engine', 'dash.card.fps', 'dash.card.effect', 'dash.card.overlay', 'dash.card.audio',
  'dash.desc.workspace', 'dash.desc.effects', 'dash.desc.video', 'dash.desc.audio',
  'dash.desc.model3d', 'dash.desc.games', 'dash.desc.diagnostics', 'dash.desc.architecture',
  'menu.settings', 'menu.about', 'menu.login', 'menu.profile', 'menu.logout', 'menu.comingSoon',
  'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey', 'settings.group.ai'
] as const
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/i18nShellKeys.test.ts`
Expected: FAIL — `en missing: dash.group.status`

- [ ] **Step 3: 改 i18n 表**

EN（把 R85 注入块的 5 个 key 行删除：`dash.section.core/create/tools`、`dash.closeTab`、`dash.opened`，原位插入）：

```ts
  'dash.group.status': 'Runtime Status',
  'dash.group.modules': 'Modules',
  'dash.card.engine': 'Engine',
  'dash.card.fps': 'Frame Rate',
  'dash.card.effect': 'Current Effect',
  'dash.card.overlay': 'Overlay',
  'dash.card.audio': 'Audio Input',
```

ZH（同样删 5 行原位插入）：

```ts
  'dash.group.status': '运行状态',
  'dash.group.modules': '模块',
  'dash.card.engine': '引擎',
  'dash.card.fps': '实时帧率',
  'dash.card.effect': '当前灯效',
  'dash.card.overlay': '浮窗',
  'dash.card.audio': '音频输入',
```

- [ ] **Step 4: 验证 + 提交**

Run: `yarn test tests/renderer/i18nShellKeys.test.ts && yarn typecheck`
Expected: PASS + 0 error（此时 `dash.section.*` 等已无引用者；`DashboardView` 仍引用旧 key 的话 typecheck 会红——若红，说明本任务必须与 Task 3 同批，直接继续 Task 3 不提交，Task 3 一并提交本任务文件）

```bash
git add src/renderer/src/i18n/index.tsx tests/renderer/i18nShellKeys.test.ts
git commit -m "[PRD-0002] feat: R86 P1 i18n（折叠分组/状态卡 key，删三分区/Tab key）"
```

---

### Task 2: ModuleRail 组件（新，可独立编译）

**Files:**
- Create: `src/renderer/src/components/ModuleRail.tsx`
- Test: `tests/renderer/components/ModuleRail.test.tsx`

**Interfaces:**
- Consumes: `CARD_VIEWS`、`MODULE_META`、`getTabMeta`（shellModules.ts 现有）；`View`（tabNavigation.ts 现有）
- Produces: `interface ModuleRailProps { activeView: View; onSwitch: (v: View) => void; onOpenSettings: () => void; isSettingsActive: boolean; model3dEnabled: boolean }`；`ModuleRail(props): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/components/ModuleRail.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { ModuleRail } from '../../../src/renderer/src/components/ModuleRail'

beforeEach(() => cleanup())

function renderRail(over: { model3dEnabled?: boolean } = {}) {
  const props = {
    activeView: 'dashboard' as const,
    onSwitch: vi.fn(),
    onOpenSettings: vi.fn(),
    isSettingsActive: false,
    model3dEnabled: over.model3dEnabled ?? false
  }
  return { props, ...render(<ModuleRail {...props} />) }
}

describe('ModuleRail', () => {
  it('renders dashboard + card modules (model3d gated) + bottom settings', () => {
    const { container } = renderRail()
    // dashboard + 8 卡片模块 − model3d + 底部 settings
    expect(container.querySelectorAll('.rail-item').length).toBe(9)
    expect(container.querySelector('.rail-settings')).not.toBeNull()
  })

  it('shows the model3d entry when enabled', () => {
    const { container } = renderRail({ model3dEnabled: true })
    expect(container.querySelectorAll('.rail-item').length).toBe(10)
  })

  it('marks the active view', () => {
    const { container } = renderRail()
    const first = container.querySelector('.rail-item') as HTMLElement // dashboard
    expect(first.classList.contains('active')).toBe(true)
    expect((container.querySelector('.rail-settings') as HTMLElement).classList.contains('active')).toBe(false)
  })

  it('clicking a module calls onSwitch; settings button calls onOpenSettings', () => {
    const { container, props } = renderRail()
    const workspace = [...container.querySelectorAll('.rail-item')]
      .find((el) => el.textContent?.includes('nav.workspace')) as HTMLElement
    fireEvent.click(workspace)
    expect(props.onSwitch).toHaveBeenCalledWith('workspace')
    fireEvent.click(container.querySelector('.rail-settings') as HTMLElement)
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `yarn test tests/renderer/components/ModuleRail.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

```tsx
// src/renderer/src/components/ModuleRail.tsx
import { Settings } from 'lucide-react'
import { useI18n } from '../i18n'
import type { View } from '../hooks/tabNavigation'
import { CARD_VIEWS, MODULE_META, getTabMeta } from './shellModules'

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
  const items: View[] = ['dashboard', ...CARD_VIEWS.filter((v) => v !== 'model3d' || model3dEnabled)]
  return (
    <nav className="module-rail" aria-label="Module navigation">
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
        onClick={onOpenSettings}
      >
        <Settings size={20} />
        <span className="rail-label">{t('nav.settings')}</span>
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: 验证 + 提交**

Run: `yarn test tests/renderer/components/ModuleRail.test.tsx`
Expected: PASS（4 用例）

```bash
git add src/renderer/src/components/ModuleRail.tsx tests/renderer/components/ModuleRail.test.tsx
git commit -m "[PRD-0002] feat: R86 P1 ModuleRail 左侧模块图标栏组件"
```

---

### Task 3: 导航模型原子切换（多 Tab → 单视图直切）

> 编译锁说明：tabNavigation 瘦身会让 useTabNavigation/TabBar/AppShell/App.tsx 同时失编译，这 6 处必须一批完成。步骤按依赖顺序排列，最后统一验证提交。

**Files:**
- Modify: `src/renderer/src/hooks/tabNavigation.ts`、`src/renderer/src/components/AppShell.tsx`、`src/renderer/src/components/DashboardView.tsx`、`src/renderer/src/components/shellModules.ts`、`src/renderer/src/App.tsx`
- Delete: `src/renderer/src/components/TabBar.tsx`、`src/renderer/src/hooks/useTabNavigation.ts` 及二者测试
- Test: 改写 `tests/renderer/hooks/tabNavigation.test.ts`、`tests/renderer/components/{AppShell,DashboardView,shellModules}.test.tsx|ts`

**Interfaces:**
- Consumes: Task 2 的 `ModuleRail`；Task 1 的 i18n key
- Produces: `resolveInitialView(storedViewRaw: string | null, model3dEnabled: boolean): View`；`AppShellProps { title; version; audioEnabled; onToggleAudio; audioLevels?; audioErrorLabel?; lang; onToggleLang; shutdownLabel; onShutdownClick; onOpenSettings; rail: ReactNode; children }`；`DashboardViewProps { onOpen; model3dEnabled; status }`

- [ ] **Step 1: 瘦身 tabNavigation.ts（整文件替换）**

```ts
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
```

- [ ] **Step 2: 删除多 Tab 文件**

```bash
git rm src/renderer/src/components/TabBar.tsx tests/renderer/components/TabBar.test.tsx
git rm src/renderer/src/hooks/useTabNavigation.ts tests/renderer/hooks/useTabNavigation.test.tsx
```

- [ ] **Step 3: shellModules.ts 删三分区**

删除 `ShellSection` interface 与 `DASHBOARD_SECTIONS` 导出（含注释）；`CARD_VIEWS/MODULE_META/TAB_META/getTabMeta` 原样保留。

- [ ] **Step 4: AppShell.tsx 整文件替换（去 TabBar，加 title/rail/shell-body）**

```tsx
// src/renderer/src/components/AppShell.tsx
import { Languages, Mic, MicOff, Settings, Timer, User } from 'lucide-react'
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useI18n } from '../i18n'

export interface AppShellProps {
  title: string // current module name, uppercase handled by CSS
  version: string
  // audio quick block (unchanged from R85)
  audioEnabled: boolean
  onToggleAudio: () => void
  audioLevels?: { bass: number; mid: number; high: number }
  audioErrorLabel?: string
  lang: 'zh' | 'en'
  onToggleLang: () => void
  // R73 shutdown chip — always visible so the timer stays armable (R85 review fix)
  shutdownLabel: string
  onShutdownClick: () => void
  // toolbar ⚙ menu (equivalent to the rail's settings entry)
  onOpenSettings: () => void
  rail: ReactNode
  children: ReactNode
}

export function AppShell(props: AppShellProps) {
  const { t } = useI18n()
  const settingsMenuRef = useRef<HTMLDetailsElement>(null)
  const userMenuRef = useRef<HTMLDetailsElement>(null)

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
        <div className="topbar-title">{props.title}</div>
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
          <details className="topbar-menu" data-menu="settings" ref={settingsMenuRef}>
            <summary aria-label={t('nav.settings')}><Settings size={16} /></summary>
            <div className="topbar-menu-items" role="menu">
              <button type="button" role="menuitem" className="topbar-menu-item" onClick={runMenuItem(props.onOpenSettings)}>
                {t('menu.settings')}
              </button>
              <div className="topbar-menu-about">{t('menu.about')} · RGBBox v{props.version}</div>
            </div>
          </details>
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
      <div className="shell-body">
        {props.rail}
        <div className="app-content">{props.children}</div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: DashboardView.tsx 整文件替换（折叠分组 + 状态卡 + 磁贴）**

```tsx
// src/renderer/src/components/DashboardView.tsx
import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import type { View } from '../hooks/tabNavigation'
import { CARD_VIEWS, MODULE_META } from './shellModules'

export interface DashboardStatus {
  running: boolean
  onToggleEngine: () => void
  effectName: string
  fps: number
  audioEnabled: boolean
  audioDeviceId: string
  audioDevices: MediaDeviceInfo[]
  speakerDevices: MediaDeviceInfo[]
  onSelectAudioDevice: (id: string) => void
  overlayCount: number
  version: string
}

export interface DashboardViewProps {
  onOpen: (v: View) => void
  model3dEnabled: boolean
  status: DashboardStatus
}

/** R86: Synapse-style dashboard — collapsible groups + status cards + module tiles. */
export function DashboardView({ onOpen, model3dEnabled, status }: DashboardViewProps) {
  const { t } = useI18n()
  return (
    <div className="dashboard">
      <details open className="dash-group">
        <summary>▼ {t('dash.group.status')}</summary>
        <div className="dash-cards">
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.engine')}</span>
            <div className="dash-card-value">
              <button
                type="button"
                className="icon-button"
                onClick={status.onToggleEngine}
                aria-label="Toggle engine"
              >
                {status.running ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <strong>{status.running ? t('engine.running') : t('engine.paused')}</strong>
            </div>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.fps')}</span>
            <strong className="dash-card-value">{status.fps > 0 ? `${status.fps} fps` : '—'}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.effect')}</span>
            <strong className="dash-card-value">{status.effectName}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.overlay')}</span>
            <strong className="dash-card-value">{status.overlayCount}</strong>
          </div>
          <div className="dash-card">
            <span className="dash-card-label">{t('dash.card.audio')}</span>
            <div className="dash-card-value">
              <strong>{status.audioEnabled ? t('audio.on') : t('audio.off')}</strong>
              {status.audioEnabled && (
                <select
                  className="audio-device-select"
                  value={status.audioDeviceId}
                  onChange={(e) => status.onSelectAudioDevice(e.target.value)}
                  title={t('audio.deviceLabel')}
                >
                  <option value="">{t('audio.defaultDevice')}</option>
                  {status.speakerDevices.map((d) => (
                    <option key={d.deviceId} value={`__speaker__:${d.deviceId}`}>
                      {t('audio.speakerPrefix')}{d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                  <option value="__system_audio__">{t('audio.systemAudio')}</option>
                  {status.audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId.slice(0, 12)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </details>

      <details open className="dash-group">
        <summary>▼ {t('dash.group.modules')}</summary>
        <div className="dash-tiles">
          {CARD_VIEWS.map((view) => {
            if (view === 'model3d' && !model3dEnabled) return null
            const meta = MODULE_META[view]
            const Icon = meta.icon
            return (
              <button key={view} type="button" className="dash-tile" onClick={() => onOpen(view)}>
                <span className="dash-tile-icon"><Icon size={24} /></span>
                <span className="dash-tile-label">{t(meta.labelKey)}</span>
              </button>
            )
          })}
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 6: App.tsx 接线**

1. imports：删 `import { useTabNavigation } from './hooks/useTabNavigation'`；`import type { View } from './hooks/tabNavigation'` 改为 `import { resolveInitialView, type View } from './hooks/tabNavigation'`；增 `import { ModuleRail } from './components/ModuleRail'` 与 `import { getTabMeta } from './components/shellModules'`。
2. hook 行替换：

```ts
  // R86: single-view navigation — left rail direct switching, last view persisted
  const [activeView, setActiveView] = useState<View>(() =>
    resolveInitialView(localStorage.getItem('rgbbox:view'), MODEL3D_VIEW_ENABLED)
  )
  useEffect(() => { localStorage.setItem('rgbbox:view', activeView) }, [activeView])
```

3. AppShell JSX props 替换：删 `tabs/activeView/onOpen/onClose` 四行，增：

```tsx
        title={t(getTabMeta(activeView).labelKey)}
        onOpenSettings={() => setActiveView('settings')}
        rail={
          <ModuleRail
            activeView={activeView}
            onSwitch={setActiveView}
            onOpenSettings={() => setActiveView('settings')}
            isSettingsActive={activeView === 'settings'}
            model3dEnabled={MODEL3D_VIEW_ENABLED}
          />
        }
```

4. DashboardView JSX：`onOpen={openView}` → `onOpen={setActiveView}`；删 `openTabs={tabs}` 行。
5. 全文 `openView('workspace')` 两处 → `setActiveView('workspace')`（EffectsView 选择后跳转 + model3d 返回按钮）。

- [ ] **Step 7: 改写四个测试文件**

`tests/renderer/hooks/tabNavigation.test.ts` 整文件替换：

```ts
import { describe, it, expect } from 'vitest'
import { isKnownView, resolveInitialView } from '../../../src/renderer/src/hooks/tabNavigation'

describe('resolveInitialView (R86 single-view)', () => {
  it('null / invalid / profiles falls back to dashboard', () => {
    expect(resolveInitialView(null, false)).toBe('dashboard')
    expect(resolveInitialView('nope', true)).toBe('dashboard')
    expect(resolveInitialView('profiles', true)).toBe('dashboard')
  })
  it('valid stored view is restored', () => {
    expect(resolveInitialView('audio', true)).toBe('audio')
    expect(resolveInitialView('settings', true)).toBe('settings')
    expect(resolveInitialView('dashboard', false)).toBe('dashboard')
  })
  it('model3d falls back when disabled', () => {
    expect(resolveInitialView('model3d', false)).toBe('dashboard')
    expect(resolveInitialView('model3d', true)).toBe('model3d')
  })
})

describe('isKnownView', () => {
  it('accepts union members, rejects others', () => {
    expect(isKnownView('workspace')).toBe(true)
    expect(isKnownView(123)).toBe(false)
    expect(isKnownView(undefined)).toBe(false)
  })
})
```

`tests/renderer/components/shellModules.test.ts` 整文件替换（去 DASHBOARD_SECTIONS 断言）：

```ts
import { describe, it, expect } from 'vitest'
import { CARD_VIEWS, MODULE_META, getTabMeta } from '../../../src/renderer/src/components/shellModules'
import { MODULE_VIEWS } from '../../../src/renderer/src/hooks/tabNavigation'

describe('shell module registry completeness (R86)', () => {
  it('every card view has meta', () => {
    for (const v of CARD_VIEWS) {
      expect(MODULE_META[v], `missing MODULE_META for ${v}`).toBeDefined()
    }
  })
  it('module views = card views + settings', () => {
    expect([...MODULE_VIEWS].sort()).toEqual([...CARD_VIEWS, 'settings'].sort())
  })
  it('every view renderable in the rail has label + icon', () => {
    for (const v of ['dashboard', ...CARD_VIEWS] as const) {
      const meta = getTabMeta(v)
      expect(meta.labelKey, `missing label for ${v}`).toBeTruthy()
      expect(meta.icon, `missing icon for ${v}`).toBeTruthy()
    }
  })
})
```

`tests/renderer/components/AppShell.test.tsx`：`makeProps` 换新签名（`title: 'WORKSPACE'`、`onOpenSettings: vi.fn()`、`rail: <nav className="fake-rail" />`、删 tabs/activeView/onOpen/onClose）；断言改：`.topbar-title` 文本 = 'WORKSPACE'、`.shell-body .fake-rail` 存在、`.app-content .fake-view` 存在、⚙ 菜单项点击 → `onOpenSettings` 且 details 关闭；audio/语言/关机 chip 恒显与 armed 态、👤 三项 disabled 断言原样保留。

`tests/renderer/components/DashboardView.test.tsx`：props 去 `openTabs`；断言改：两个 `.dash-group` 的 summary 含 `dash.group.status`/`dash.group.modules`；状态卡 `.dash-card` 5 张、值含 engine.running/Rainbow/60/2；磁贴 `.dash-tile` 7 张（启用 model3d 8）、点击磁贴 `onOpen('workspace')`；audio 禁用无 select、fps 0 显示 —；引擎按钮 onToggleEngine。

- [ ] **Step 8: 验证 + 提交**

Run: `yarn typecheck && yarn test tests/renderer/hooks/tabNavigation.test.ts tests/renderer/components/ModuleRail.test.tsx tests/renderer/components/AppShell.test.tsx tests/renderer/components/DashboardView.test.tsx tests/renderer/components/shellModules.test.ts tests/renderer/i18nShellKeys.test.ts`
Expected: 0 error + 全 PASS（App 测试的 import-shape 用例不受影响）

```bash
git add -A src/renderer/src tests
git commit -m "[PRD-0002] feat: R86 P1 导航模型切换——左 rail 直切，移除 TabBar/多 Tab（原子变更）"
```

---

### Task 4: styles.css——Token + Rail/工具条/Dashboard 样式

**Files:**
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 3 的 DOM 结构（.module-rail/.rail-item/.shell-body/.topbar-title/.dash-group/.dash-card/.dash-tile）
- Produces: `:root` token 变量集（后续 P2/P3 view 重排继续引用）

- [ ] **Step 1: `:root` 增 token**

文件顶部 `:root` 块内追加（现有 color/font 声明保留）：

```css
  /* ── R86 P1 design tokens（Synapse 三层明度 → RGBBox 冷蓝灰） ────────── */
  --bg-rail: #0d1318;
  --bg-toolbar: #11191f;
  --bg-content: #0f1418;
  --bg-card: #131d23;
  --bg-card-hover: #18242b;
  --border-subtle: #26343c;
  --text-primary: #e6edf0;
  --text-secondary: #b7cbd3;
  --text-muted: #8aa2ad;
  --text-faint: #5c707a;
  --accent: #42e8a9;
  --accent-dim: rgba(66, 232, 169, 0.12);
  --accent-contrast: #081014;
  --gap-grid: 20px;
  --gap-block: 28px;
```

- [ ] **Step 2: 删旧 Tab/Dashboard 样式，写新样式**

删除 R85 的 `.tab-bar/.tab/.tab-main/.tab-close/.dashboard/.dash-status/.dash-dot/.dash-sep/.dash-section/.dash-cards(旧)/.dash-card(旧)/.dash-card.is-open/.dash-open-dot` 规则块，原区域写入：

```css
/* ══ R86 P1: rail + toolbar + shell body ═══════════════════════════ */
.topbar {
  align-items: center;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  height: 48px;
  padding: 0 12px;
}
.topbar-brand h1 { font-size: 15px; }
.topbar-title {
  color: var(--text-secondary);
  flex: 1;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-align: center;
  text-transform: uppercase;
}

.shell-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.module-rail {
  background: var(--bg-rail);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 2px;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-width: thin;
  width: 72px;
}
.rail-item {
  align-items: center;
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
}
.rail-item:hover { background: var(--bg-card); color: var(--text-primary); }
.rail-item.active {
  background: var(--bg-card);
  border-left-color: var(--accent);
  color: var(--accent);
}
.rail-label {
  font-size: 9px;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-align: center;
}
.rail-spacer { flex: 1; }

/* ══ R86 P1: dashboard（折叠分组 + 状态卡 + 磁贴） ═════════════════ */
.dashboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--gap-block);
  overflow-y: auto;
  padding: 20px 24px;
}
.dash-group > summary {
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  list-style: none;
  margin: 0 0 14px;
  text-transform: uppercase;
}
.dash-group > summary::-webkit-details-marker { display: none; }
.dash-group > summary:hover { color: var(--text-primary); }
.dash-group[open] > summary { color: var(--text-primary); }

.dash-cards {
  display: grid;
  gap: var(--gap-grid);
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.dash-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  transition: background 150ms ease, border-color 150ms ease;
}
.dash-card:hover { background: var(--bg-card-hover); border-color: #3a5a68; }
.dash-card-label {
  color: var(--text-muted);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.dash-card-value {
  align-items: center;
  color: var(--text-primary);
  display: flex;
  font-size: 14px;
  gap: 8px;
}
.dash-card .audio-device-select { width: auto; max-width: 180px; }

.dash-tiles {
  display: grid;
  gap: var(--gap-grid);
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
.dash-tile {
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  min-height: 150px;
  padding: 18px 12px;
  transition: background 150ms ease, border-color 150ms ease;
}
.dash-tile:hover { background: var(--bg-card-hover); border-color: var(--accent); }
.dash-tile-icon {
  align-items: center;
  background: var(--accent);
  border-radius: 50%;
  color: var(--accent-contrast);
  display: flex;
  height: 56px;
  justify-content: center;
  width: 56px;
}
.dash-tile:hover .dash-tile-icon { filter: brightness(1.08); }
.dash-tile-label {
  color: var(--text-primary);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

- [ ] **Step 3: 存量类 token 迁移（spec §4.1 列定的范围）**

把以下规则里的字面色替换为变量（仅换值，不动结构）：`.app-shell`（background → `var(--bg-content)` 渐变保留可改为 `linear-gradient(180deg, var(--bg-content), #0d1216)`）、`.status-panel`（background/border）、`.panel`（background/border）、`.icon-button`（background/border/color）、`.audio-toggle`（background/border/color）、`.settings-view/.settings-group` 若含字面色同步。 `.topbar-controls/.topbar-icon-btn/.topbar-chip/.topbar-menu*` 内的字面色一并换变量。

- [ ] **Step 4: 窄屏适配**

`@media (max-width: 960px)` 块内追加：

```css
  .module-rail { width: 56px; }
  .rail-label { display: none; }
```

- [ ] **Step 5: 验证 + 提交**

Run: `yarn build && yarn test tests/renderer/components/DashboardView.test.tsx tests/renderer/components/ModuleRail.test.tsx`
Expected: build 成功 + 测试 PASS

```bash
git add src/renderer/src/styles.css
git commit -m "[PRD-0002] feat: R86 P1 设计 token + rail/工具条/Dashboard 磁贴样式"
```

---

### Task 5: 清理核查 + 全量回归

**Files:**
- Modify: 按核查结果（预期仅残留清理）

- [ ] **Step 1: 死引用核查**

```bash
grep -rn "TabBar\|useTabNavigation\|DASHBOARD_SECTIONS\|dash.section\|dash.closeTab\|dash.opened\|tab-bar\|dash-status\|dash-open-dot" src/renderer/src tests | grep -v node_modules
```

Expected: 零命中（含 CSS 类名与 i18n key）。

- [ ] **Step 2: 全量回归**

Run: `yarn typecheck && yarn test && yarn build`
Expected: 0 error；全量 0 失败；build 成功。

- [ ] **Step 3: 手动冒烟（可选推荐）**

Run: `yarn dev`
核对：左 rail 直切 + 记忆上次视图、顶工具条居中大写模块名、Dashboard 两组折叠分组（状态卡实时、磁贴 accent 圆图标）、设置页 token 化外观、关机 chip 恒显、👤 灰置、zh/en 切换。

- [ ] **Step 4: 提交（如有清理）**

```bash
git add -A src/renderer/src tests
git commit -m "[PRD-0002] chore: R86 P1 清理残留引用"
```

---

### Task 6: PRD R86 P1 收尾

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`

- [ ] **Step 1: 更新 R86.7**

`R86.7 状态` 改为：`🔄（P1 ✅：左 rail 直切+记忆、TabBar/多 Tab 移除、Dashboard 折叠分组+状态卡+磁贴、token 落地；证据：`yarn test` N files / N passed 0 失败 + typecheck/build 0 error + 死引用核查零命中；P2/P3 待启动）`（N 以实际输出填）。

- [ ] **Step 2: 提交**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R86 P1 验收完成（P1 ✅，P2/P3 待启动）"
```

---

## Self-Review 记录（已核对）

1. **Spec 覆盖**：§4.1 token→T4；§4.2 壳层→T3 Step 4/6 + T4；§4.3 导航语义→T3 Step 1/6；§4.4 组件接口→T2/T3（签名逐字一致）；§4.5 Dashboard→T3 Step 5 + T4；§4.6 设置页→T4 Step 3；§4.7 i18n→T1；§4.8 移除→T3 Step 2/3；§4.9 测试→T2/T3 Step 7/T5；§5 验收→T5 Step 3 + T6。无缺口。
2. **占位符**：无 TBD/TODO；T4 Step 3 的 token 迁移是明确的类清单+替换规则。
3. **类型一致**：`resolveInitialView`（T3 定义，App.tsx 用）；`ModuleRailProps`（T2 定义，App.tsx 传参一致，含 spec 回填的 `model3dEnabled`）；`AppShellProps`（T3 Step 4 与 Step 6 接线一致）；`DashboardViewProps`（T3 Step 5 与 Step 6 一致）；i18n key 集合 T1 与 T3 Step 5/7 断言一致。
