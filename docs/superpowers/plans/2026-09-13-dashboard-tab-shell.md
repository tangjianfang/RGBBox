# R85 主界面重设计（Dashboard + Tab 壳层）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用「Dashboard 首页 + 顶部 Tab 栏 + 设置 Tab + 预留用户菜单」替换左侧 sidebar 导航壳层（PRD-0002 R85）。

**Architecture:** 壳层置换（spec §3 方案 B 边界）：导航状态机抽为纯函数核心 `tabNavigation.ts` + `useTabNavigation` hook；新增 `AppShell`/`TabBar`/`DashboardView`/`SettingsView` 四个组件；`App.tsx` 删除 sidebar JSX（1790–2007 行）、改名 `currentView→activeView`、接入壳层；各 view 的 JSX 与 state hook 一律不动。

**Tech Stack:** Electron + React 18 + TypeScript；测试 vitest（组件用 happy-dom，纯函数用 node）；图标 lucide-react；样式单文件 `styles.css`。

**Spec:** `docs/superpowers/specs/2026-09-13-dashboard-tab-shell-design.md`

## Global Constraints

- 不引入路由层；导航仍是 `type View` 联合 + 状态驱动（CLAUDE.md）。
- 所有提交标题：`[PRD-0002] <type>: <subject>`，可附 `(R85)`。
- i18n 新 key 必须同时进 EN 与 ZH 表（ZH 表类型 `TranslationTable = { [K in TranslationKey]: string }`，缺 key 会被 `yarn typecheck` 拦下）。
- 不改 `src/main`、`src/preload`、`src/engine`、`package.json` scripts。
- 测试命令只用 `yarn test <file>` / `yarn test -t <name>` / `yarn typecheck`（CLAUDE.md 命令速查）。
- 已存在的事实（勿重新发明）：`.app-shell` 类已存在（styles.css:100，现为 2 列 grid，本计划改写为纵向 flex）；`TranslationKey` 已从 i18n 导出（i18n/index.tsx:766）；`.tab*` 类名当前未被占用；`.workspace`（styles.css:252）是纯 flex 列，无 grid 依赖。

## File Structure（本计划锁定）

```text
新增：
  src/renderer/src/hooks/tabNavigation.ts        纯函数导航核心（node 可测，无 React/DOM）
  src/renderer/src/hooks/useTabNavigation.ts     hook：核心 + localStorage 持久化
  src/renderer/src/components/shellModules.ts    模块元数据（图标/文案 key/分区）+ getTabMeta()
  src/renderer/src/components/TabBar.tsx         纯展示：Tab 列表
  src/renderer/src/components/AppShell.tsx       顶栏（品牌 + TabBar + 右侧控件簇）+ 内容区
  src/renderer/src/components/DashboardView.tsx  首页：状态区 + 三分区卡片
  src/renderer/src/components/SettingsView.tsx   设置 Tab：四组配置
  tests/renderer/i18nShellKeys.test.ts           (node)
  tests/renderer/hooks/tabNavigation.test.ts     (node)
  tests/renderer/hooks/useTabNavigation.test.tsx (happy-dom)
  tests/renderer/components/TabBar.test.tsx      (happy-dom)
  tests/renderer/components/AppShell.test.tsx    (happy-dom)
  tests/renderer/components/DashboardView.test.tsx (happy-dom)
  tests/renderer/components/SettingsView.test.tsx  (happy-dom)
修改：
  src/renderer/src/App.tsx                       壳替换 + 改名 + 新 view 渲染
  src/renderer/src/styles.css                    .app-shell 改写、删 sidebar 系、新增 tab/dash/settings 系
  src/renderer/src/i18n/index.tsx                EN+ZH 新 key
  docs/prd/PRD-0002-rgbbox-project-catalog.md    R85 状态 → ✅ + 证据
```

---

### Task 1: i18n 壳层文案 key（EN + ZH）

**Files:**
- Modify: `src/renderer/src/i18n/index.tsx`（EN 表 `nav.games` 行后、ZH 表 `nav.games` 行后各插一组）
- Test: `tests/renderer/i18nShellKeys.test.ts`

**Interfaces:**
- Produces: TranslationKey 联合新增 `nav.dashboard | nav.settings | nav.model3d | dash.section.core|create|tools | dash.desc.workspace|effects|video|audio|model3d|games|diagnostics|architecture | dash.closeTab | dash.opened | dash.status.effect | dash.status.overlay | menu.settings|about|login|profile|logout|comingSoon | settings.group.run|screensaver|hotkey|ai`（后续所有任务直接引用，typo 即编译错）

- [ ] **Step 1: 写失败测试**

```ts
// tests/renderer/i18nShellKeys.test.ts  (node 环境，文件头不需要 happy-dom 注释)
import { describe, it, expect } from 'vitest'
import { translations } from '../../src/renderer/src/i18n'

// R85 壳层新 key 清单——EN/ZH 必须同时有值（缺 key 由 TranslationTable 类型 + 本测试双保险）
const SHELL_KEYS = [
  'nav.dashboard', 'nav.settings', 'nav.model3d',
  'dash.section.core', 'dash.section.create', 'dash.section.tools',
  'dash.desc.workspace', 'dash.desc.effects', 'dash.desc.video', 'dash.desc.audio',
  'dash.desc.model3d', 'dash.desc.games', 'dash.desc.diagnostics', 'dash.desc.architecture',
  'dash.closeTab', 'dash.opened', 'dash.status.effect', 'dash.status.overlay',
  'menu.settings', 'menu.about', 'menu.login', 'menu.profile', 'menu.logout', 'menu.comingSoon',
  'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey', 'settings.group.ai'
] as const

describe('i18n shell keys (R85)', () => {
  it('every shell key exists in both en and zh tables', () => {
    for (const key of SHELL_KEYS) {
      expect(translations.en[key], `en missing: ${key}`).toBeTruthy()
      expect(translations.zh[key], `zh missing: ${key}`).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/i18nShellKeys.test.ts`
Expected: FAIL — `en missing: nav.dashboard`（translations 表里还没有这些 key）

- [ ] **Step 3: 加 key**

EN 表（`i18n/index.tsx`，`'nav.games': 'Mini Games',` 行后插入）：

```ts
  // R85: dashboard + tab shell
  'nav.dashboard': 'Dashboard',
  'nav.settings': 'Settings',
  'nav.model3d': '3D Models',
  'dash.section.core': 'Core',
  'dash.section.create': 'Create',
  'dash.section.tools': 'Tools',
  'dash.desc.workspace': 'Preview and effect control',
  'dash.desc.effects': 'CPU effect library',
  'dash.desc.video': 'Video studio and wall',
  'dash.desc.audio': 'Audio workstation',
  'dash.desc.model3d': '3D model effects',
  'dash.desc.games': 'Mini games',
  'dash.desc.diagnostics': 'Engine and capture diagnostics',
  'dash.desc.architecture': '3D architecture visual',
  'dash.closeTab': 'Close tab',
  'dash.opened': 'Open',
  'dash.status.effect': 'Effect',
  'dash.status.overlay': 'Overlay',
  'menu.settings': 'System settings',
  'menu.about': 'About',
  'menu.login': 'Sign in',
  'menu.profile': 'Profile',
  'menu.logout': 'Sign out',
  'menu.comingSoon': 'Coming soon',
  'settings.group.run': 'Runtime',
  'settings.group.screensaver': 'Screensaver',
  'settings.group.hotkey': 'Hotkeys',
  'settings.group.ai': 'AI (OCR)',
```

ZH 表（`'nav.games': '迷你游戏',` 行后插入）：

```ts
  // R85: dashboard + tab shell
  'nav.dashboard': '首页',
  'nav.settings': '系统设置',
  'nav.model3d': '3D 模型',
  'dash.section.core': '核心',
  'dash.section.create': '创作',
  'dash.section.tools': '工具',
  'dash.desc.workspace': '预览与效果控制',
  'dash.desc.effects': 'CPU 特效库',
  'dash.desc.video': '视频工作站与拼接墙',
  'dash.desc.audio': '音频工作站',
  'dash.desc.model3d': '3D 模型灯效',
  'dash.desc.games': '迷你游戏',
  'dash.desc.diagnostics': '引擎与捕获诊断',
  'dash.desc.architecture': '3D 架构可视化',
  'dash.closeTab': '关闭标签页',
  'dash.opened': '已打开',
  'dash.status.effect': '当前灯效',
  'dash.status.overlay': '浮窗',
  'menu.settings': '系统设置',
  'menu.about': '关于',
  'menu.login': '登录',
  'menu.profile': '个人资料',
  'menu.logout': '退出登录',
  'menu.comingSoon': '即将上线',
  'settings.group.run': '运行',
  'settings.group.screensaver': '屏保',
  'settings.group.hotkey': '快捷键',
  'settings.group.ai': 'AI（OCR）',
```

- [ ] **Step 4: 跑测试确认通过 + typecheck**

Run: `yarn test tests/renderer/i18nShellKeys.test.ts && yarn typecheck`
Expected: PASS（1 个用例）+ typecheck 0 error（ZH 表补齐后类型闭合）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/i18n/index.tsx tests/renderer/i18nShellKeys.test.ts
git commit -m "[PRD-0002] feat: R85 壳层 i18n 文案（dashboard/tab/settings/menu，zh+en）"
```

---

### Task 2: 导航纯函数核心 `tabNavigation.ts`

**Files:**
- Create: `src/renderer/src/hooks/tabNavigation.ts`
- Test: `tests/renderer/hooks/tabNavigation.test.ts`

**Interfaces:**
- Produces（后续任务全部依赖，签名逐字对齐）:
  - `type View = 'dashboard' | 'workspace' | 'effects' | 'games' | 'audio' | 'video' | 'diagnostics' | 'model3d' | 'architecture' | 'settings' | 'profiles'`
  - `const DASHBOARD_VIEW: View`
  - `interface TabNavState { tabs: View[]; activeView: View }`
  - `function isKnownView(v: unknown): v is View`
  - `function sanitizeTabs(raw: unknown, model3dEnabled: boolean): View[]`
  - `function resolveInitialTabs(storedTabsRaw: string | null, storedViewRaw: string | null, model3dEnabled: boolean): TabNavState`
  - `function openView(state: TabNavState, view: View): TabNavState`
  - `function closeView(state: TabNavState, view: View): TabNavState`

- [ ] **Step 1: 写失败测试**

```ts
// tests/renderer/hooks/tabNavigation.test.ts  (node 纯函数)
import { describe, it, expect } from 'vitest'
import {
  closeView, openView, resolveInitialTabs, sanitizeTabs,
  DASHBOARD_VIEW, type TabNavState
} from '../../../src/renderer/src/hooks/tabNavigation'

const base: TabNavState = { tabs: ['dashboard', 'workspace'], activeView: 'workspace' }

describe('sanitizeTabs', () => {
  it('always prepends dashboard exactly once and dedupes', () => {
    expect(sanitizeTabs(['workspace', 'dashboard', 'effects', 'workspace'], true))
      .toEqual(['dashboard', 'workspace', 'effects'])
  })
  it('drops unknown / non-tabbable (profiles) entries', () => {
    expect(sanitizeTabs(['workspace', 'nope', 'profiles'], true)).toEqual(['dashboard', 'workspace'])
  })
  it('drops model3d when disabled', () => {
    expect(sanitizeTabs(['model3d', 'video'], false)).toEqual(['dashboard', 'video'])
  })
  it('empty / non-array input returns dashboard-only', () => {
    expect(sanitizeTabs(undefined, true)).toEqual(['dashboard'])
    expect(sanitizeTabs('nope', true)).toEqual(['dashboard'])
  })
})

describe('resolveInitialTabs', () => {
  it('fresh install → dashboard only', () => {
    expect(resolveInitialTabs(null, null, false)).toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
  it('legacy rgbbox:view migrates into a tab (old users land back home-free)', () => {
    expect(resolveInitialTabs(null, 'audio', true))
      .toEqual({ tabs: ['dashboard', 'audio'], activeView: 'audio' })
  })
  it('stored tabs + stored active are restored', () => {
    expect(resolveInitialTabs('["dashboard","effects","video"]', 'video', true))
      .toEqual({ tabs: ['dashboard', 'effects', 'video'], activeView: 'video' })
  })
  it('corrupt stored tabs falls back to legacy view migration', () => {
    expect(resolveInitialTabs('{bad json', 'effects', true))
      .toEqual({ tabs: ['dashboard', 'effects'], activeView: 'effects' })
  })
  it('active not in tabs (model3d disabled) falls back to dashboard', () => {
    expect(resolveInitialTabs('["dashboard","model3d"]', 'model3d', false))
      .toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
})

describe('openView', () => {
  it('appends new module tab and activates it', () => {
    expect(openView(base, 'audio')).toEqual({ tabs: ['dashboard', 'workspace', 'audio'], activeView: 'audio' })
  })
  it('re-open focuses existing tab without duplicating', () => {
    expect(openView(base, 'workspace')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'workspace' })
  })
  it('dashboard just activates', () => {
    const s = { tabs: ['dashboard', 'workspace'], activeView: 'workspace' } as TabNavState
    expect(openView(s, 'dashboard')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'dashboard' })
  })
  it('non-tabbable view is a no-op', () => {
    expect(openView(base, 'profiles')).toEqual(base)
  })
})

describe('closeView', () => {
  it('dashboard cannot be closed', () => {
    expect(closeView(base, 'dashboard')).toEqual(base)
  })
  it('closing the active tab returns to dashboard', () => {
    expect(closeView(base, 'workspace')).toEqual({ tabs: ['dashboard'], activeView: 'dashboard' })
  })
  it('closing a background tab keeps the active one', () => {
    const s = { tabs: ['dashboard', 'workspace', 'effects'], activeView: 'workspace' } as TabNavState
    expect(closeView(s, 'effects')).toEqual({ tabs: ['dashboard', 'workspace'], activeView: 'workspace' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/hooks/tabNavigation.test.ts`
Expected: FAIL — 模块不存在（Failed to resolve import）

- [ ] **Step 3: 实现**

```ts
// src/renderer/src/hooks/tabNavigation.ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/hooks/tabNavigation.test.ts`
Expected: PASS（13 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/tabNavigation.ts tests/renderer/hooks/tabNavigation.test.ts
git commit -m "[PRD-0002] feat: R85 Tab 导航纯函数核心（sanitize/migrate/open/close）"
```

---

### Task 3: `useTabNavigation` hook（持久化）

**Files:**
- Create: `src/renderer/src/hooks/useTabNavigation.ts`
- Test: `tests/renderer/hooks/useTabNavigation.test.tsx`

**Interfaces:**
- Consumes: Task 2 全部导出
- Produces: `useTabNavigation(model3dEnabled: boolean): { tabs: View[]; activeView: View; openView: (v: View) => void; closeView: (v: View) => void }`；持久化 key：tabs → `rgbbox:tabs`（JSON 数组）、active → `rgbbox:view`（沿用旧 key）

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/hooks/useTabNavigation.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTabNavigation } from '../../../src/renderer/src/hooks/useTabNavigation'

beforeEach(() => {
  localStorage.clear()
})

describe('useTabNavigation', () => {
  it('starts on dashboard-only for a fresh install', () => {
    const { result } = renderHook(() => useTabNavigation(false))
    expect(result.current.tabs).toEqual(['dashboard'])
    expect(result.current.activeView).toBe('dashboard')
  })

  it('migrates a legacy rgbbox:view into a restored tab', () => {
    localStorage.setItem('rgbbox:view', 'audio')
    const { result } = renderHook(() => useTabNavigation(true))
    expect(result.current.tabs).toEqual(['dashboard', 'audio'])
    expect(result.current.activeView).toBe('audio')
  })

  it('persists tabs and active view after open/close', () => {
    const { result } = renderHook(() => useTabNavigation(true))
    act(() => result.current.openView('effects'))
    act(() => result.current.openView('video'))
    act(() => result.current.closeView('effects'))
    expect(localStorage.getItem('rgbbox:tabs')).toBe('["dashboard","video"]')
    expect(localStorage.getItem('rgbbox:view')).toBe('video')
  })

  it('close of the active tab lands back on dashboard', () => {
    const { result } = renderHook(() => useTabNavigation(true))
    act(() => result.current.openView('games'))
    act(() => result.current.closeView('games'))
    expect(result.current.activeView).toBe('dashboard')
    expect(result.current.tabs).toEqual(['dashboard'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/hooks/useTabNavigation.test.tsx`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

```ts
// src/renderer/src/hooks/useTabNavigation.ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/hooks/useTabNavigation.test.tsx`
Expected: PASS（4 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useTabNavigation.ts tests/renderer/hooks/useTabNavigation.test.tsx
git commit -m "[PRD-0002] feat: R85 useTabNavigation hook（持久化 + 旧 view 迁移）"
```

---

### Task 4: `shellModules.ts` + `TabBar.tsx`

**Files:**
- Create: `src/renderer/src/components/shellModules.ts`
- Create: `src/renderer/src/components/TabBar.tsx`
- Test: `tests/renderer/components/TabBar.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 TranslationKey；Task 2 的 `View`
- Produces:
  - `interface ShellModuleMeta { view: View; labelKey: TranslationKey; descKey: TranslationKey; icon: LucideIcon }`
  - `MODULE_META: Record<'workspace'|'effects'|'video'|'audio'|'model3d'|'games'|'diagnostics'|'architecture', ShellModuleMeta>`
  - `DASHBOARD_SECTIONS: { key: TranslationKey; views: View[] }[]`（核心/创作/工具 三分区）
  - `getTabMeta(view: View): { labelKey: TranslationKey; icon: LucideIcon }`（dashboard/settings 也覆盖）
  - `interface TabBarProps { tabs: View[]; activeView: View; onOpen: (v: View) => void; onClose: (v: View) => void }`
  - `TabBar(props: TabBarProps): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/components/TabBar.test.tsx
// @vitest-environment happy-dom
// i18n 默认 context 的 t(key) 返回 key 本身 → 断言用 key 字面量
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../../../src/renderer/src/components/TabBar'

beforeEach(() => cleanup())

describe('TabBar', () => {
  const tabs = ['dashboard', 'workspace', 'effects'] as const

  it('renders one tab per entry in order', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="workspace" onOpen={() => {}} onClose={() => {}} />
    )
    const els = container.querySelectorAll('.tab')
    expect(els.length).toBe(3)
    expect(els[1].textContent).toContain('nav.workspace')
  })

  it('marks the active tab', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="effects" onOpen={() => {}} onClose={() => {}} />
    )
    expect(container.querySelectorAll('.tab')[2].classList.contains('active')).toBe(true)
    expect(container.querySelectorAll('.tab')[0].classList.contains('active')).toBe(false)
  })

  it('dashboard tab has no close button, module tabs do', () => {
    const { container } = render(
      <TabBar tabs={[...tabs]} activeView="dashboard" onOpen={() => {}} onClose={() => {}} />
    )
    expect(container.querySelectorAll('.tab')[0].querySelector('.tab-close')).toBeNull()
    expect(container.querySelectorAll('.tab')[1].querySelector('.tab-close')).not.toBeNull()
  })

  it('clicking a tab calls onOpen; clicking × calls onClose', () => {
    const onOpen = vi.fn(); const onClose = vi.fn()
    const { container } = render(<TabBar tabs={[...tabs]} activeView="dashboard" onOpen={onOpen} onClose={onClose} />)
    fireEvent.click(container.querySelectorAll('.tab-main')[1])
    expect(onOpen).toHaveBeenCalledWith('workspace')
    fireEvent.click(container.querySelectorAll('.tab-close')[1])
    expect(onClose).toHaveBeenCalledWith('effects')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/components/TabBar.test.tsx`
Expected: FAIL — TabBar 模块不存在

- [ ] **Step 3: 实现 shellModules.ts + TabBar.tsx**

```ts
// src/renderer/src/components/shellModules.ts
import {
  Box, Cpu, Gamepad2, Gauge, LayoutGrid, Monitor, Music, Settings, Sparkles, Video
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '../i18n'
import type { View } from '../hooks/tabNavigation'

export interface ShellModuleMeta {
  view: View
  labelKey: TranslationKey
  descKey: TranslationKey
  icon: LucideIcon
}

export type ModuleView = 'workspace' | 'effects' | 'video' | 'audio' | 'model3d' | 'games' | 'diagnostics' | 'architecture'

export const MODULE_META: Record<ModuleView, ShellModuleMeta> = {
  workspace:    { view: 'workspace',    labelKey: 'nav.workspace',    descKey: 'dash.desc.workspace',    icon: Monitor },
  effects:      { view: 'effects',      labelKey: 'nav.effects',      descKey: 'dash.desc.effects',      icon: Sparkles },
  video:        { view: 'video',        labelKey: 'nav.video',        descKey: 'dash.desc.video',        icon: Video },
  audio:        { view: 'audio',        labelKey: 'nav.audio',        descKey: 'dash.desc.audio',        icon: Music },
  model3d:      { view: 'model3d',      labelKey: 'nav.model3d',      descKey: 'dash.desc.model3d',      icon: Box },
  games:        { view: 'games',        labelKey: 'nav.games',        descKey: 'dash.desc.games',        icon: Gamepad2 },
  diagnostics:  { view: 'diagnostics',  labelKey: 'nav.diagnostics',  descKey: 'dash.desc.diagnostics',  icon: Gauge },
  architecture: { view: 'architecture', labelKey: 'nav.architecture', descKey: 'dash.desc.architecture', icon: Cpu }
}

export interface ShellSection {
  key: TranslationKey
  views: View[]
}

/** Dashboard 固定三分区（R85.1，用户已确认：不做自定义/频率自适应） */
export const DASHBOARD_SECTIONS: ShellSection[] = [
  { key: 'dash.section.core',   views: ['workspace', 'effects'] },
  { key: 'dash.section.create', views: ['video', 'audio', 'model3d'] },
  { key: 'dash.section.tools',  views: ['games', 'diagnostics', 'architecture'] }
]

const TAB_LABEL_KEYS: Partial<Record<View, TranslationKey>> = {
  dashboard: 'nav.dashboard',
  settings: 'nav.settings'
}
const TAB_ICONS: Partial<Record<View, LucideIcon>> = {
  dashboard: LayoutGrid,
  settings: Settings
}

/** Label + icon for any tabbable view (module views come from MODULE_META). */
export function getTabMeta(view: View): { labelKey: TranslationKey; icon: LucideIcon } {
  const meta = MODULE_META[view as ModuleView]
  if (meta) return { labelKey: meta.labelKey, icon: meta.icon }
  return { labelKey: TAB_LABEL_KEYS[view] ?? 'nav.dashboard', icon: TAB_ICONS[view] ?? LayoutGrid }
}
```

```tsx
// src/renderer/src/components/TabBar.tsx
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/components/TabBar.test.tsx`
Expected: PASS（4 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/shellModules.ts src/renderer/src/components/TabBar.tsx tests/renderer/components/TabBar.test.tsx
git commit -m "[PRD-0002] feat: R85 模块元数据 + TabBar 组件"
```

---

### Task 5: `AppShell.tsx`（顶栏 + 右侧控件簇 + 预留菜单）

**Files:**
- Create: `src/renderer/src/components/AppShell.tsx`
- Test: `tests/renderer/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `TabBarProps`/`TabBar`；Task 1 的文案 key
- Produces: `interface AppShellProps extends TabBarProps { version: string; audioEnabled: boolean; onToggleAudio: () => void; audioLevels?: { bass: number; mid: number; high: number }; audioErrorLabel?: string; lang: 'zh' | 'en'; onToggleLang: () => void; shutdownLabel?: string; onShutdownClick: () => void; children: ReactNode }`；`AppShell(props): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/components/AppShell.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AppShell } from '../../../src/renderer/src/components/AppShell'

beforeEach(() => cleanup())

function renderShell(over: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const props = {
    tabs: ['dashboard', 'workspace'] as any,
    activeView: 'dashboard' as any,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    version: '0.3.44',
    audioEnabled: false,
    onToggleAudio: vi.fn(),
    lang: 'zh' as const,
    onToggleLang: vi.fn(),
    onShutdownClick: vi.fn(),
    children: <div className="fake-view">VIEW</div>,
    ...over
  }
  return { props, ...render(<AppShell {...props} />) }
}

describe('AppShell', () => {
  it('renders topbar (brand + tabs + controls) and children as content', () => {
    const { container } = renderShell()
    expect(container.querySelector('.topbar .brand-mark')?.textContent).toBe('RB')
    expect(container.querySelector('.topbar .tab-bar')).not.toBeNull()
    expect(container.querySelector('.app-content .fake-view')?.textContent).toBe('VIEW')
  })

  it('audio toggle reflects state and fires onToggleAudio', () => {
    const onToggleAudio = vi.fn()
    const { container } = renderShell({ onToggleAudio, audioEnabled: true })
    const btn = container.querySelector('.topbar-controls .audio-toggle') as HTMLElement
    expect(btn.classList.contains('active')).toBe(true)
    fireEvent.click(btn)
    expect(onToggleAudio).toHaveBeenCalledOnce()
  })

  it('audio meters render only when levels provided', () => {
    const { container, rerender } = renderShell({ audioEnabled: true })
    expect(container.querySelector('.topbar-meters')).toBeNull()
    rerender(<AppShell {...{
      tabs: ['dashboard'], activeView: 'dashboard', onOpen: vi.fn(), onClose: vi.fn(),
      version: 'v', audioEnabled: true, onToggleAudio: vi.fn(), lang: 'zh', onToggleLang: vi.fn(),
      onShutdownClick: vi.fn(), audioLevels: { bass: 0.5, mid: 0.2, high: 0.1 }, children: null
    } as any} />)
    expect(container.querySelectorAll('.topbar-meters .audio-meter').length).toBe(3)
  })

  it('shutdown chip renders only when label provided', () => {
    const onShutdownClick = vi.fn()
    const { container: none } = renderShell()
    expect(none.querySelector('.topbar-chip')).toBeNull()
    const { container } = renderShell({ shutdownLabel: '36:12', onShutdownClick })
    fireEvent.click(container.querySelector('.topbar-chip') as HTMLElement)
    expect(onShutdownClick).toHaveBeenCalledOnce()
  })

  it('settings menu opens the settings view via onOpen', () => {
    const onOpen = vi.fn()
    const { container } = renderShell({ onOpen })
    const item = container.querySelector('.topbar-menu[data-menu="settings"] .topbar-menu-item') as HTMLElement
    fireEvent.click(item)
    expect(onOpen).toHaveBeenCalledWith('settings')
  })

  it('user menu items exist and are all disabled (reserved, R85.3)', () => {
    const { container } = renderShell()
    const items = container.querySelectorAll('.topbar-menu[data-menu="user"] .topbar-menu-item[disabled]')
    expect(items.length).toBe(3) // login / profile / logout
    expect(container.querySelector('.topbar-menu-about')?.textContent).toContain('0.3.44')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/components/AppShell.test.tsx`
Expected: FAIL — AppShell 模块不存在

- [ ] **Step 3: 实现**

```tsx
// src/renderer/src/components/AppShell.tsx
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/components/AppShell.test.tsx`
Expected: PASS（6 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AppShell.tsx tests/renderer/components/AppShell.test.tsx
git commit -m "[PRD-0002] feat: R85 AppShell 顶栏（品牌/Tab/全局控件/设置菜单/预留用户菜单）"
```

---

### Task 6: `DashboardView.tsx`（状态区 + 三分区卡片）

**Files:**
- Create: `src/renderer/src/components/DashboardView.tsx`
- Test: `tests/renderer/components/DashboardView.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `MODULE_META`/`DASHBOARD_SECTIONS`
- Produces:
  - `interface DashboardStatus { running: boolean; onToggleEngine: () => void; effectName: string; fps: number; audioEnabled: boolean; audioDeviceId: string; audioDevices: MediaDeviceInfo[]; speakerDevices: MediaDeviceInfo[]; onSelectAudioDevice: (id: string) => void; overlayCount: number; version: string }`
  - `interface DashboardViewProps { onOpen: (v: View) => void; openTabs: View[]; model3dEnabled: boolean; status: DashboardStatus }`
  - `DashboardView(props): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/components/DashboardView.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { DashboardView, type DashboardStatus } from '../../../src/renderer/src/components/DashboardView'

beforeEach(() => cleanup())

function makeStatus(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return {
    running: true,
    onToggleEngine: vi.fn(),
    effectName: 'Rainbow',
    fps: 60,
    audioEnabled: true,
    audioDeviceId: '',
    audioDevices: [{ deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput' } as MediaDeviceInfo],
    speakerDevices: [{ deviceId: 'spk-1', label: 'Speaker 1', kind: 'audiooutput' } as MediaDeviceInfo],
    onSelectAudioDevice: vi.fn(),
    overlayCount: 2,
    version: '0.3.44',
    ...over
  }
}

function renderDash(over: { openTabs?: any[]; model3dEnabled?: boolean; status?: Partial<DashboardStatus> } = {}) {
  const props = {
    onOpen: vi.fn(),
    openTabs: over.openTabs ?? ['dashboard'],
    model3dEnabled: over.model3dEnabled ?? false,
    status: makeStatus(over.status ?? {})
  }
  return { props, ...render(<DashboardView {...props} />) }
}

describe('DashboardView', () => {
  it('renders the three fixed sections with all cards (model3d disabled → hidden)', () => {
    const { container } = renderDash()
    const sections = container.querySelectorAll('.dash-section')
    expect(sections.length).toBe(3)
    const cards = container.querySelectorAll('.dash-card')
    expect(cards.length).toBe(7) // 8 modules − model3d
  })

  it('shows the model3d card when enabled', () => {
    const { container } = renderDash({ model3dEnabled: true })
    expect(container.querySelectorAll('.dash-card').length).toBe(8)
  })

  it('card click fires onOpen with the module view', () => {
    const { container, props } = renderDash()
    const card = [...container.querySelectorAll('.dash-card')].find((c) => c.textContent?.includes('nav.workspace'))
    fireEvent.click(card as HTMLElement)
    expect(props.onOpen).toHaveBeenCalledWith('workspace')
  })

  it('open module card carries the is-open marker', () => {
    const { container } = renderDash({ openTabs: ['dashboard', 'audio'] })
    const audioCard = [...container.querySelectorAll('.dash-card')].find((c) => c.textContent?.includes('nav.audio'))
    expect(audioCard?.classList.contains('is-open')).toBe(true)
  })

  it('status row shows engine state, effect, fps, overlay count and device select', () => {
    const { container } = renderDash()
    const status = container.querySelector('.dash-status') as HTMLElement
    expect(status.textContent).toContain('engine.running')
    expect(status.textContent).toContain('Rainbow')
    expect(status.textContent).toContain('60')
    expect(status.textContent).toContain('2')
    const select = container.querySelector('.dash-status .audio-device-select') as HTMLSelectElement
    const options = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(options).toEqual(['', '__speaker__:spk-1', '__system_audio__', 'mic-1'])
  })

  it('engine toggle button fires onToggleEngine', () => {
    const onToggleEngine = vi.fn()
    const { container } = renderDash({ status: { onToggleEngine } })
    fireEvent.click(container.querySelector('.dash-status .icon-button') as HTMLElement)
    expect(onToggleEngine).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/components/DashboardView.test.tsx`
Expected: FAIL — DashboardView 模块不存在

- [ ] **Step 3: 实现**

```tsx
// src/renderer/src/components/DashboardView.tsx
import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import type { View } from '../hooks/tabNavigation'
import { DASHBOARD_SECTIONS, MODULE_META } from './shellModules'

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
  openTabs: View[]
  model3dEnabled: boolean
  status: DashboardStatus
}

export function DashboardView({ onOpen, openTabs, model3dEnabled, status }: DashboardViewProps) {
  const { t } = useI18n()
  return (
    <div className="dashboard">
      <div className="dash-status">
        <button
          type="button"
          className="icon-button"
          onClick={status.onToggleEngine}
          aria-label="Toggle engine"
          title={status.running ? t('engine.paused') : t('engine.running')}
        >
          {status.running ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className={`dash-dot${status.running ? ' on' : ''}`} />
        <span>{status.running ? t('engine.running') : t('engine.paused')}</span>
        <span className="dash-sep">·</span>
        <span>{t('dash.status.effect')}: {status.effectName}</span>
        <span className="dash-sep">·</span>
        <span>{status.fps} fps</span>
        <span className="dash-sep">·</span>
        <span>{t('dash.status.overlay')}: {status.overlayCount}</span>
        <span className="dash-sep">·</span>
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
      </div>

      {DASHBOARD_SECTIONS.map((section) => (
        <section key={section.key} className="dash-section">
          <h3>{t(section.key)}</h3>
          <div className="dash-cards">
            {section.views.map((view) => {
              if (view === 'model3d' && !model3dEnabled) return null
              const meta = MODULE_META[view as keyof typeof MODULE_META]
              const Icon = meta.icon
              const isOpen = openTabs.includes(view)
              return (
                <button
                  key={view}
                  type="button"
                  className={`dash-card${isOpen ? ' is-open' : ''}`}
                  onClick={() => onOpen(view)}
                >
                  <Icon size={22} />
                  <strong>{t(meta.labelKey)}</strong>
                  <span>{t(meta.descKey)}</span>
                  {isOpen && <i className="dash-open-dot" title={t('dash.opened')} />}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/components/DashboardView.test.tsx`
Expected: PASS（6 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/DashboardView.tsx tests/renderer/components/DashboardView.test.tsx
git commit -m "[PRD-0002] feat: R85 DashboardView（状态区 + 固定三分区模块卡片）"
```

---

### Task 7: `SettingsView.tsx`（四组配置，控件迁移自 sidebar）

**Files:**
- Create: `src/renderer/src/components/SettingsView.tsx`
- Test: `tests/renderer/components/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `PRESET_SNIP_HOTKEYS`（`src/shared/snipHotkeys`，App.tsx:27 已在用）
- Produces（App.tsx Task 8 按 props 逐项接线）:
  - `interface AiCfg { baseUrl: string; model: string; apiKey: string }`
  - `interface SettingsViewProps { running: boolean; onToggleEngine: () => void; powerSaveBlock: boolean; onPowerSaveBlock: (v: boolean) => void; autoLaunch: boolean; onAutoLaunch: (v: boolean) => void; screensaverEnabled: boolean; screensaverMinutes: number; onScreensaver: (cfg: { enabled?: boolean; idleMinutes?: number }) => void; snipHotkey: string; onSnipHotkey: (k: string) => void; aiCfg: AiCfg; onAiCfg: (c: AiCfg) => void; onSaveAiCfg: () => void; aiSaved: boolean }`
  - `SettingsView(props): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/renderer/components/SettingsView.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { SettingsView, type SettingsViewProps } from '../../../src/renderer/src/components/SettingsView'

beforeEach(() => cleanup())

function makeProps(over: Partial<SettingsViewProps> = {}): SettingsViewProps {
  return {
    running: true,
    onToggleEngine: vi.fn(),
    powerSaveBlock: false,
    onPowerSaveBlock: vi.fn(),
    autoLaunch: false,
    onAutoLaunch: vi.fn(),
    screensaverEnabled: false,
    screensaverMinutes: 5,
    onScreensaver: vi.fn(),
    snipHotkey: 'Alt+A',
    onSnipHotkey: vi.fn(),
    aiCfg: { baseUrl: 'https://x', model: 'm', apiKey: '' },
    onAiCfg: vi.fn(),
    onSaveAiCfg: vi.fn(),
    aiSaved: false,
    ...over
  }
}

describe('SettingsView', () => {
  it('renders the four config groups', () => {
    const { container } = render(<SettingsView {...makeProps()} />)
    const groups = container.querySelectorAll('.settings-group h3')
    const titles = [...groups].map((g) => g.textContent)
    expect(titles).toEqual([
      'settings.group.run', 'settings.group.screensaver',
      'settings.group.hotkey', 'settings.group.ai'
    ])
  })

  it('runtime group: engine toggle, powerSaveBlock, autoLaunch callbacks fire', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    fireEvent.click(container.querySelector('.settings-group .icon-button') as HTMLElement)
    expect(props.onToggleEngine).toHaveBeenCalledOnce()
    const checks = [...container.querySelectorAll('.settings-group label.status-panel input[type="checkbox"]')]
    fireEvent.click(checks[0]); fireEvent.click(checks[1])
    expect(props.onPowerSaveBlock).toHaveBeenCalledWith(true)
    expect(props.onAutoLaunch).toHaveBeenCalledWith(true)
  })

  it('screensaver toggle + threshold fire onScreensaver', () => {
    const props = makeProps({ screensaverEnabled: true, screensaverMinutes: 5 })
    const { container } = render(<SettingsView {...props} />)
    const checks = [...container.querySelectorAll('.settings-group label.status-panel input[type="checkbox"]')]
    fireEvent.click(checks[2]) // screensaver is the 3rd checkbox
    expect(props.onScreensaver).toHaveBeenCalledWith({ enabled: false })
    const select = container.querySelector('.settings-group select[data-setting="screensaver-minutes"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '10' } })
    expect(props.onScreensaver).toHaveBeenCalledWith({ idleMinutes: 10 })
  })

  it('snip hotkey select fires onSnipHotkey', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    const select = container.querySelector('select[data-setting="snip-hotkey"]') as HTMLSelectElement
    expect([...select.querySelectorAll('option')].length).toBeGreaterThan(1)
    fireEvent.change(select, { target: { value: select.options[1].value } })
    expect(props.onSnipHotkey).toHaveBeenCalledWith(select.options[1].value)
  })

  it('ai group: inputs are controlled, save button fires', () => {
    const props = makeProps()
    const { container } = render(<SettingsView {...props} />)
    const inputs = [...container.querySelectorAll('.settings-group[data-group="ai"] input')] as HTMLInputElement[]
    expect(inputs.length).toBe(3)
    fireEvent.change(inputs[0], { target: { value: 'https://y' } })
    expect(props.onAiCfg).toHaveBeenCalledWith({ baseUrl: 'https://y', model: 'm', apiKey: '' })
    fireEvent.click(container.querySelector('.settings-group[data-group="ai"] button') as HTMLElement)
    expect(props.onSaveAiCfg).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `yarn test tests/renderer/components/SettingsView.test.tsx`
Expected: FAIL — SettingsView 模块不存在

- [ ] **Step 3: 实现（控件逐字迁移自 sidebar 1879–1992 行，仅改回调为 props）**

```tsx
// src/renderer/src/components/SettingsView.tsx
import { Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'
import { PRESET_SNIP_HOTKEYS } from '../../../shared/snipHotkeys'

export interface AiCfg {
  baseUrl: string
  model: string
  apiKey: string
}

export interface SettingsViewProps {
  // Runtime
  running: boolean
  onToggleEngine: () => void
  powerSaveBlock: boolean
  onPowerSaveBlock: (v: boolean) => void
  autoLaunch: boolean
  onAutoLaunch: (v: boolean) => void
  // Screensaver (R74)
  screensaverEnabled: boolean
  screensaverMinutes: number
  onScreensaver: (cfg: { enabled?: boolean; idleMinutes?: number }) => void
  // Hotkeys (R81)
  snipHotkey: string
  onSnipHotkey: (k: string) => void
  // AI (R83)
  aiCfg: AiCfg
  onAiCfg: (c: AiCfg) => void
  onSaveAiCfg: () => void
  aiSaved: boolean
}

export function SettingsView(props: SettingsViewProps) {
  const { t } = useI18n()
  return (
    <div className="settings-view">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{t('nav.settings')}</p>
          <h2>{t('menu.settings')}</h2>
        </div>
      </header>
      <div className="settings-groups">
        <section className="panel settings-group" data-group="run">
          <h3>{t('settings.group.run')}</h3>
          <div className="status-panel">
            <div>
              <span>{t('engine.label')}</span>
              <strong>{props.running ? t('engine.running') : t('engine.paused')}</strong>
            </div>
            <button className="icon-button" type="button" onClick={props.onToggleEngine} aria-label="Toggle engine">
              {props.running ? <Pause size={18} /> : <Play size={18} />}
            </button>
          </div>
          <label className="status-panel" style={{ cursor: 'pointer' }}>
            <div>
              <span>{t('power.label')}</span>
              <strong>{props.powerSaveBlock ? t('power.on') : t('power.off')}</strong>
            </div>
            <input type="checkbox" checked={props.powerSaveBlock} onChange={(e) => props.onPowerSaveBlock(e.target.checked)} />
          </label>
          <label className="status-panel" style={{ cursor: 'pointer' }}>
            <div>
              <span>{t('autoLaunch.label')}</span>
              <strong>{props.autoLaunch ? t('autoLaunch.on') : t('autoLaunch.off')}</strong>
            </div>
            <input type="checkbox" checked={props.autoLaunch} onChange={(e) => props.onAutoLaunch(e.target.checked)} />
          </label>
        </section>

        <section className="panel settings-group" data-group="screensaver">
          <h3>{t('settings.group.screensaver')}</h3>
          <label className="status-panel" style={{ cursor: 'pointer' }} title={t('screensaver.hint')}>
            <div>
              <span>{t('screensaver.label')}</span>
              <strong>{props.screensaverEnabled ? t('screensaver.on') : t('screensaver.off')}</strong>
            </div>
            <input
              type="checkbox"
              checked={props.screensaverEnabled}
              onChange={(e) => props.onScreensaver({ enabled: e.target.checked })}
            />
          </label>
          {props.screensaverEnabled && (
            <div className="status-panel" title={t('screensaver.hint')}>
              <span>{t('screensaver.threshold')}</span>
              <select
                data-setting="screensaver-minutes"
                value={props.screensaverMinutes}
                onChange={(e) => props.onScreensaver({ idleMinutes: Number(e.target.value) })}
              >
                {[1, 5, 10, 30].map((m) => (
                  <option key={m} value={m}>{m} {t('screensaver.minUnit')}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="panel settings-group" data-group="hotkey">
          <h3>{t('settings.group.hotkey')}</h3>
          <div className="status-panel" title={t('snip.hotkeyHint')}>
            <span>{t('snip.hotkeyLabel')}</span>
            <select
              data-setting="snip-hotkey"
              value={props.snipHotkey}
              onChange={(e) => props.onSnipHotkey(e.target.value)}
            >
              {PRESET_SNIP_HOTKEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="panel settings-group" data-group="ai">
          <h3>{t('settings.group.ai')}</h3>
          <div className="status-panel" title={t('ai.hint')}>
            <span>{t('ai.label')}</span>
            <div className="ai-cfg-row">
              <input
                value={props.aiCfg.baseUrl}
                placeholder={t('ai.baseUrl')}
                onChange={(e) => props.onAiCfg({ ...props.aiCfg, baseUrl: e.target.value })}
              />
              <input
                value={props.aiCfg.model}
                placeholder={t('ai.model')}
                onChange={(e) => props.onAiCfg({ ...props.aiCfg, model: e.target.value })}
              />
              <input
                type="password"
                value={props.aiCfg.apiKey}
                placeholder={t('ai.apiKey')}
                onChange={(e) => props.onAiCfg({ ...props.aiCfg, apiKey: e.target.value })}
              />
              <button type="button" className="video-btn" onClick={props.onSaveAiCfg}>
                {props.aiSaved ? t('ai.saved') : t('ai.save')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `yarn test tests/renderer/components/SettingsView.test.tsx`
Expected: PASS（5 用例）

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SettingsView.tsx tests/renderer/components/SettingsView.test.tsx
git commit -m "[PRD-0002] feat: R85 SettingsView（运行/屏保/快捷键/AI 四组，控件迁自 sidebar）"
```

---

### Task 8: App.tsx 壳替换 + styles.css 布局改写

**Files:**
- Modify: `src/renderer/src/App.tsx`（行号基于当前 main；先做删除/替换再做改名，按下面顺序执行）
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 3 的 `useTabNavigation`、Task 2 的 `View`、Task 5/6/7 全部组件
- Produces: 完整 R85 壳层（运行时行为）

**实施要点（App.tsx，按顺序）：**

- [ ] **Step 1: imports 与类型替换**

删除本地定义（33–39 行）：

```ts
type View = 'workspace' | 'effects' | 'profiles' | 'diagnostics' | 'model3d' | 'games' | 'audio' | 'video' | 'architecture'

const MODEL3D_VIEW_ENABLED = false

function normalizeView(view: View | null): View {
  return view === 'model3d' && !MODEL3D_VIEW_ENABLED ? 'workspace' : (view ?? 'workspace')
}
```

替换为（`MODEL3D_VIEW_ENABLED` 保留，其余由 import 提供）：

```ts
const MODEL3D_VIEW_ENABLED = false
```

并在 import 区（App.tsx 顶部）加入：

```ts
import { useTabNavigation } from './hooks/useTabNavigation'
import type { View } from './hooks/tabNavigation'
import { AppShell } from './components/AppShell'
import { DashboardView } from './components/DashboardView'
import { SettingsView } from './components/SettingsView'
```

- [ ] **Step 2: 状态替换**

670–673 行的 `currentView` useState 整块替换为：

```ts
const { tabs, activeView, openView, closeView } = useTabNavigation(MODEL3D_VIEW_ENABLED)
```

976 行的持久化 effect 整行删除：

```ts
useEffect(() => { localStorage.setItem('rgbbox:view', normalizeView(currentView)) }, [currentView])
```

- [ ] **Step 3: 全文改名 `currentView` → `activeView`**

对 App.tsx 全文做 `currentView` → `activeView` 替换（现有引用点：761、999、2022、2863、2875、2891、2892、2895、2899、3008、3012 行附近；nav 按钮里的引用随 Step 4 一并删除）。`setCurrentView` 的引用只存在于 nav 按钮（随 sidebar 删除）。

- [ ] **Step 4: 删除 sidebar JSX，接入 AppShell**

删除 1790–2007 行整块 `<aside className="sidebar">…</aside>`（品牌块/nav-list/sidebar-audio/引擎与电源与自启 status-panel/关机 chip/屏保/热键/AI 配置/sidebar-footer）。保留 2009–2019 行的 `ShutdownTimerPanel` 浮动 HUD。

把 `<main className="app-shell">` 与 `<section className="workspace">` 之间改为 AppShell 包裹结构（ShutdownTimerPanel 为 fixed 定位，留在 children 顶部）：

```tsx
<main className="app-shell">
  <AppShell
    tabs={tabs}
    activeView={activeView}
    onOpen={openView}
    onClose={closeView}
    version={version}
    audioEnabled={audioEnabled}
    onToggleAudio={() => setAudioEnabled((v) => !v)}
    audioLevels={audio.active ? { bass: audio.bass, mid: audio.mid, high: audio.high } : undefined}
    audioErrorLabel={audioErrorLabel || undefined}
    lang={lang}
    onToggleLang={() => setLang(lang === 'zh' ? 'en' : 'zh')}
    shutdownLabel={
      shutdownInfo && shutdownInfo.remainingMs > 0
        ? formatMediaTime(Math.ceil(shutdownInfo.remainingMs / 1000))
        : undefined
    }
    onShutdownClick={() => setShutdownPanelOpen((v) => !v)}
  >
    {shutdownPanelOpen && (
      <ShutdownTimerPanel
        deadlineMs={shutdownInfo?.deadlineMs ?? null}
        totalMs={shutdownInfo?.totalMs ?? 0}
        remainingMs={shutdownInfo?.remainingMs ?? 0}
        onArm={armShutdownTimer}
        onCancel={cancelShutdownTimer}
        onClose={() => setShutdownPanelOpen(false)}
      />
    )}
    <section className="workspace">
      {/* ↓ 新增两个 view 渲染块（放在 workspace 块之前） */}
      {activeView === 'dashboard' && (
        <DashboardView
          onOpen={openView}
          openTabs={tabs}
          model3dEnabled={MODEL3D_VIEW_ENABLED}
          status={{
            running: status.running,
            onToggleEngine: toggleEngine,
            effectName:
              effectPresets.find((p) => p.kind === (selectedLayer?.kind ?? 'static'))?.label
              ?? selectedLayer?.kind ?? 'static',
            fps: status.fps,
            audioEnabled,
            audioDeviceId,
            audioDevices,
            speakerDevices,
            onSelectAudioDevice: setAudioDeviceId,
            overlayCount: overlayDisplayIds.length,
            version
          }}
        />
      )}
      {activeView === 'settings' && (
        <SettingsView
          running={status.running}
          onToggleEngine={toggleEngine}
          powerSaveBlock={powerSaveBlock}
          onPowerSaveBlock={(v) => { window.rgbbox.setPowerSaveBlock(v).then(setPowerSaveBlock) }}
          autoLaunch={autoLaunch}
          onAutoLaunch={(v) => { window.rgbbox.setAutoLaunch(v).then(setAutoLaunch) }}
          screensaverEnabled={screensaverEnabled}
          screensaverMinutes={screensaverMinutes}
          onScreensaver={applyScreensaverSettings}
          snipHotkey={snipHotkey}
          onSnipHotkey={applySnipHotkey}
          aiCfg={aiCfg}
          onAiCfg={setAiCfg}
          onSaveAiCfg={saveAiCfg}
          aiSaved={aiSaved}
        />
      )}
      {/* ↓ 现有各 view 条件渲染块原样保留（已在 Step 3 改名 activeView） */}
      …
    </section>
  </AppShell>
</main>
```

注：`toggleEngine`、`setPowerSaveBlock`、`setAutoLaunch`、`applyScreensaverSettings`、`screensaverMinutes`、`applySnipHotkey`、`aiCfg`、`setAiCfg`、`saveAiCfg`、`aiSaved`、`selectedLayer` 均为 App.tsx 现有 state/函数（见 sidebar 原 JSX 1879–1992 行与 670–723 行区段），本步只是换位置引用，不改其定义。若个别名称有出入（如 `snipHotkey` state 名），以 App.tsx 实际为准做同义映射，不新增状态。

- [ ] **Step 5: styles.css 改写**

`.app-shell`（100–107 行）整块替换：

```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 40px);
  margin-top: 40px;
  overflow: hidden;
  background: linear-gradient(180deg, #0f1418 0%, #0d1216 100%);
}
```

在文件末尾追加新样式块（沿用现有深色变量取值：边框 `#1e2e36`/`#26343c`、文字 `#b7cbd3`/`#8aa2ad`、active 渐变 `#182e38→#162633`）：

```css
/* ── R85: top bar + tab shell ─────────────────────────────────────── */
.topbar {
  align-items: center;
  background: #11191f;
  border-bottom: 1px solid #1e2e36;
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  height: 48px;
  padding: 0 12px;
}

.topbar-brand h1 { font-size: 15px; }

.tab-bar {
  align-items: stretch;
  display: flex;
  flex: 1;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(138, 162, 173, 0.18) transparent;
}
.tab-bar::-webkit-scrollbar { height: 4px; }
.tab-bar::-webkit-scrollbar-thumb { background: rgba(138, 162, 173, 0.25); border-radius: 2px; }

.tab {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}
.tab.active {
  background: linear-gradient(90deg, #182e38, #162633);
  border-color: #3a6070;
}
.tab-main {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 8px 0 0 8px;
  color: #b7cbd3;
  display: flex;
  font-size: 12.5px;
  gap: 6px;
  padding: 6px 4px 6px 10px;
}
.tab.active .tab-main { color: #e4f8fb; font-weight: 600; }
.tab-main:hover { color: #f4fbfd; }
.tab-close {
  align-items: center;
  background: transparent;
  border: none;
  border-radius: 0 8px 8px 0;
  color: #8aa2ad;
  cursor: pointer;
  display: flex;
  padding: 6px 8px 6px 2px;
}
.tab-close:hover { color: #ff7b72; }

.topbar-controls {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
.topbar-icon-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #b7cbd3;
  cursor: pointer;
  display: flex;
  height: 32px;
  justify-content: center;
  width: 32px;
}
.topbar-icon-btn:hover { background: #18242b; border-color: #2f4650; color: #f4fbfd; }
.topbar-chip {
  align-items: center;
  background: #0d1318;
  border: 1px solid #26343c;
  border-radius: 8px;
  color: #e4f8fb;
  cursor: pointer;
  display: flex;
  font-size: 12px;
  gap: 6px;
  padding: 5px 10px;
}
.topbar-meters { display: flex; gap: 2px; }

.topbar-menu { position: relative; }
.topbar-menu summary {
  align-items: center;
  border-radius: 8px;
  color: #b7cbd3;
  cursor: pointer;
  display: flex;
  height: 32px;
  justify-content: center;
  list-style: none;
  width: 32px;
}
.topbar-menu summary::-webkit-details-marker { display: none; }
.topbar-menu[open] summary { background: #18242b; color: #f4fbfd; }
.topbar-menu-items {
  background: #0d1318;
  border: 1px solid #26343c;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  min-width: 160px;
  padding: 6px;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 60;
}
.topbar-menu-item {
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #eff8fb;
  cursor: pointer;
  display: block;
  font-size: 13px;
  padding: 8px 10px;
  text-align: left;
  width: 100%;
}
.topbar-menu-item:hover:not([disabled]) { background: #18242b; }
.topbar-menu-item[disabled] { color: #5c707a; cursor: not-allowed; }
.topbar-menu-about {
  border-top: 1px solid #26343c;
  color: #8aa2ad;
  font-size: 12px;
  margin-top: 4px;
  padding: 8px 10px 4px;
}

.app-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.app-content > .workspace { flex: 1; }

/* ── R85: dashboard ───────────────────────────────────────────────── */
.dashboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 22px;
  overflow-y: auto;
  padding: 20px 24px;
}
.dash-status {
  align-items: center;
  background: #0d1318;
  border: 1px solid #26343c;
  border-radius: 10px;
  color: #b7cbd3;
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: 10px;
  padding: 10px 14px;
}
.dash-dot {
  background: #5c707a;
  border-radius: 50%;
  height: 8px;
  width: 8px;
}
.dash-dot.on { background: #42e8a9; box-shadow: 0 0 8px rgba(66, 232, 169, 0.5); }
.dash-sep { color: #3a4f58; }
.dash-section h3 {
  color: #8aa2ad;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  margin: 0 0 10px;
  text-transform: uppercase;
}
.dash-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
}
.dash-card {
  align-items: flex-start;
  background: #131d23;
  border: 1px solid #26343c;
  border-radius: 12px;
  color: #b7cbd3;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  position: relative;
  text-align: left;
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.dash-card:hover {
  border-color: #3a6070;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  color: #f4fbfd;
  transform: translateY(-1px);
}
.dash-card strong { color: #eff8fb; font-size: 14.5px; }
.dash-card span { font-size: 12.5px; }
.dash-card.is-open { border-color: #42e8a9; }
.dash-open-dot {
  background: #42e8a9;
  border-radius: 50%;
  height: 7px;
  position: absolute;
  right: 12px;
  top: 12px;
  width: 7px;
}

/* ── R85: settings view ───────────────────────────────────────────── */
.settings-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 20px 24px;
}
.settings-groups {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
}
.settings-group { display: flex; flex-direction: column; gap: 10px; }
.settings-group h3 { margin: 0; }
.settings-group .status-panel { margin-top: 0; }
```

- [ ] **Step 6: 验证编译 + 既有测试**

Run: `yarn typecheck && yarn test tests/renderer/App.test.tsx tests/renderer/components/EffectsView.test.tsx`
Expected: typecheck 0 error；App 测试的 import-shape 用例不变（App 仍是函数组件）

- [ ] **Step 7: 手动冒烟（可选但推荐）**

Run: `yarn dev`
人肉核对：首屏 Dashboard、点卡片开 Tab、关 Tab 回 Dashboard、⚙ 开设置、👤 三项灰置、audio 开关/电平表在顶栏、语言切换、重启恢复 Tab、旧 `rgbbox:view` 用户落回原模块。

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "[PRD-0002] feat: R85 App 壳替换——sidebar 移除，接入 AppShell/Dashboard/Settings (R85)"
```

---

### Task 9: 清理死代码 + 全量回归

**Files:**
- Modify: `src/renderer/src/App.tsx`（删未用 import）、`src/renderer/src/styles.css`（删 sidebar 系规则）

- [ ] **Step 1: 删除 sidebar 系 CSS**

删除以下规则块（行号是当前 main 上的位置，删时以选择器为准）：
- `.sidebar`（109–119）、`.nav-list`（163–166）、`.nav-item`（168–196 三块）
- `.sidebar-audio`（1064）、`.sidebar-footer`（2474）
- 保留并复用：`.brand-block`/`.brand-mark`（顶栏品牌块在用）、`.status-panel`（SettingsView 在用）、`.audio-toggle`/`.audio-device-select`/`.audio-meter-row`/`.audio-meter`/`.audio-error`（顶栏/Dashboard 在用）、`.lang-toggle-btn` 若无引用则一并删除。

删除后全局搜索确认无残留引用：

```bash
grep -rn "sidebar\|nav-item\|nav-list" src/renderer/src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

Expected: 仅剩无关命中（如 `.diagnostics` 内无关词）或零命中；`.ts/.tsx` 中不允许再出现 `className="sidebar…"` / `nav-item`。

- [ ] **Step 2: 删除 App.tsx 未用 import**

`yarn typecheck` 后，对 sidebar 删除后不再使用的 lucide 图标（候选：`Gauge`、`Box`、`Cpu`、`Monitor`、`Sparkles`、`Gamepad2`、`Music`、`Video`、`Mic`、`MicOff`、`Languages`、`Timer`、`Pause`、`Play`、`Settings`、`User` 等）逐一 grep 确认 App.tsx 内无其他使用再删：

```bash
grep -n "Gauge\|Gamepad2\|Monitor,\|Sparkles\|<Mic \|Languages\|<Timer \|<Pause \|<Play " src/renderer/src/App.tsx
```

只删「零命中」的 import 名；工作台/诊断等 view JSX 里仍在用的（如 `Activity`、`Monitor`）必须保留。

- [ ] **Step 3: 全量回归**

Run: `yarn typecheck && yarn test && yarn build`
Expected: typecheck 0 error；vitest 全量 0 失败（含新增 7 个测试文件约 42 用例）；build 产出 out/ 无报错。

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/src/ 
git commit -m "[PRD-0002] chore: R85 清理 sidebar 死代码（JSX/CSS/imports）"
```

---

### Task 10: PRD R85 收尾（状态 ✅ + 证据）

**Files:**
- Modify: `docs/prd/PRD-0002-rgbbox-project-catalog.md`

- [ ] **Step 1: 更新 R85.7 状态**

把 `R85.7 状态：🔄…` 改为 `✅`，证据格式对齐 R84.5（附：测试文件/用例数、`yarn test` 全量输出行 `N files / N passed 0 failed`、typecheck/build 0 error、实机复测待用户）。

- [ ] **Step 2: Commit**

```bash
git add docs/prd/PRD-0002-rgbbox-project-catalog.md
git commit -m "[PRD-0002] docs: R85 验收完成，状态 ✅ + 证据"
```

---

## Self-Review 记录（写完计划后已核对）

1. **Spec 覆盖**：§2 决策表 8 项 → Task 2/3（IDE 式+记忆+迁移）、Task 6（固定分区+状态区）、Task 8（sidebar 移除）；§4 状态模型 → Task 2/3；§5 顶栏 → Task 4/5/8；§6 Dashboard → Task 6；§7 Settings → Task 7；§8 迁移映射 → Task 5/6/7/8 各自承接；§9 样式 → Task 8/9；§10 i18n → Task 1；§11 边界 → Task 2（sanitize/迁移/防御）+ Task 8（keep-alive 不动）；§12 测试 → 各任务 + Task 9 全量回归；§13 非目标 → 无对应任务（正确）；§14 验收点 10 条 → Task 8 Step 7 冒烟清单 + Task 9 Step 3 + Task 10 证据。无缺口。
2. **占位符扫描**：无 TBD/TODO；Task 8 Step 4 的「…现有 view 块」是有意的保留指令（明确声明不改动），非占位。
3. **类型一致性**：`View`/`TabNavState`/`openView`/`closeView`（Task 2 定义，Task 3/4/6 引用）；`TabBarProps`（Task 4 定义，Task 5 extends）；`DashboardStatus`/`SettingsViewProps`/`AiCfg`（Task 6/7 定义，Task 8 按名接线）；i18n key 列表 Task 1 与 Task 4–7 引用一致（含 `nav.model3d`）。
