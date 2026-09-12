# 主界面重设计：Dashboard 首页 + 模块 Tab 导航（R85）设计文档

- 日期：2026-09-13
- PRD 条款：[PRD-0002 §R85](../../prd/PRD-0002-rgbbox-project-catalog.md)
- 分支：`feat/dashboard-tab-shell`
- 状态：设计已获用户确认（含三节评审 + 修订）

## 1. 背景与目标

功能模块持续增多（R73–R84 期间 sidebar 累积了 8 个导航按钮 + 7 组全局配置面板），左侧 sidebar 复杂度失控。本设计将主界面改为：

1. **Dashboard 首页**：按固定优先级分区展示模块卡片 + 全局状态区；
2. **顶部 Tab 栏**：唯一模块导航。第一个 Tab 恒为 Dashboard（不可关闭），其余 Tab 点击模块后按需打开、按模块名命名、可关闭；
3. **系统设置**收编 sidebar 里的全局配置，成为特殊 Tab；
4. **预留**登录/个人资料等用户菜单入口（仅 UI，无鉴权逻辑）。

## 2. 已确认的需求决策

| 决策点 | 结论 |
| --- | --- |
| 左侧 sidebar | **完全移除**，Tab 栏成为唯一模块导航 |
| Tab 语义 | **IDE 式 + 记忆**：每模块最多一个 Tab，重开=聚焦；关闭当前 Tab 回 Dashboard；tabs 存 localStorage，重启恢复 |
| Dashboard 内容 | 模块卡片（固定分区）+ 全局状态区；无最近使用区 |
| 卡片排序 | 固定三分区（核心/创作/工具），不做用户自定义、不做频率自适应 |
| 实现路线 | **方案 B**：抽取 AppShell 壳层组件（但不搬移各 view 的 JSX） |
| 系统设置形态 | **Tab**（非模态） |
| 登录/个人信息 | 菜单入口**预留**（灰置 + 「即将上线」），无任何真实鉴权 |
| 模块挂载行为 | 维持现状：条件渲染卸载重挂；audio 保持 `display:none` keep-alive |

## 3. 架构

### 3.1 组件树

```text
App.tsx（保留全部状态 hook 与各 view 的渲染逻辑）
 └─ <AppShell>                          新增 components/AppShell.tsx
     ├─ <TabBar>                        新增 components/TabBar.tsx（纯展示）
     │    品牌块 + Tab 列表 + 右侧：audio 快捷块 / 语言 / 关机 chip / ⚙ 菜单 / 👤 菜单
     └─ children                        App.tsx 把当前 view 内容作为 children 传入
          ├─ dashboard → <DashboardView>   新增 components/DashboardView.tsx
          ├─ settings  → <SettingsView>    新增 components/SettingsView.tsx
          └─ 其余 view  → 现有 JSX 原样（audio 的 keep-alive 包装不动）
```

配套文件：

- `hooks/useTabNavigation.ts`：导航状态机（tabs/activeView/操作/持久化/迁移）
- `components/shellModules.ts`：模块清单纯数据（View、分区、图标、i18n key），TabBar 与 DashboardView 共用

### 3.2 方案 B 的边界（R85 范围声明）

只抽取**壳层**（导航框架）。各 view 的 JSX 留在 App.tsx——它们消费 App.tsx 上百个 state hook，搬走意味着巨量 props 管道与高回归风险。逐 view 拆文件是未来独立 R-N。

## 4. 导航状态模型（useTabNavigation）

```ts
type View = 'dashboard' | 'workspace' | 'effects' | 'games' | 'audio'
          | 'video' | 'diagnostics' | 'model3d' | 'architecture' | 'settings'
// 'profiles' 维持在旧 union 的现状：无导航入口，不参与 Tab
```

| 操作 | 语义 |
| --- | --- |
| `openModule(v)` | `v` 已在 tabs → 仅置 active；否则 append 到 tabs 末尾并置 active |
| `closeTab(v)` | `v === 'dashboard'` → no-op；否则从 tabs 移除；若移除的是 activeView → activeView 置回 `'dashboard'` |

持久化与迁移：

- tabs 存 `rgbbox:tabs`（JSON 数组，恒含 `'dashboard'` 于首位）；active 沿用 `rgbbox:view` key
- 迁移：首次启动无 `rgbbox:tabs` 但存在合法旧 `rgbbox:view`（≠dashboard）→ `tabs = ['dashboard', 旧view]`、active = 旧view（老用户无感落回原视图）
- 防御：`rgbbox:tabs` JSON 损坏 → 回 `['dashboard']`；数组含非法 view / `'profiles'` → 过滤；`MODEL3D_VIEW_ENABLED=false` → `model3d` 从 tabs 过滤，若 active 是它则落 dashboard
- `settings` 参与正常 Tab 持久化与关闭，但不进 Dashboard 卡片

## 5. 顶栏（AppShell 内：TabBar + 右侧控件簇）

**TabBar 只负责品牌块 + Tab 列表**（纯展示）；右侧控件簇由 AppShell 直接渲染（props 从 App.tsx 透传）：

```ts
interface TabBarProps {
  tabs: View[]
  activeView: View
  onOpen: (v: View) => void
  onClose: (v: View) => void
}

interface AppShellProps extends TabBarProps {
  version: string
  // audio 快捷块
  audioEnabled: boolean
  onToggleAudio: () => void
  audioLevels?: { bass: number; mid: number; high: number }  // audio.active 时传入
  audioErrorLabel?: string
  // 语言
  lang: 'zh' | 'en'
  onToggleLang: () => void
  // R73 关机 chip（未激活时不渲染）
  shutdownLabel?: string
  onShutdownClick: () => void
  onOpen: (v: View) => void   // ⚙「系统设置」→ onOpen('settings')
  children: React.ReactNode
}
```

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ [RB] RGBBox │ ● Dashboard │ 工作台 × │ 灯效 × │  🎙 ▮▮▮ · 中/EN · ⏻36:12 · ⚙ · 👤 │
│  └── TabBar ─────────────────────────────┘   └──── AppShell 右侧控件簇 ────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

- Tab = lucide 图标（沿用 sidebar 现有：Monitor/Sparkles/Video/Music/Box/Gamepad2/Gauge/Cpu + Dashboard/LayoutGrid + Settings）+ 模块名（复用 `t('nav.*')`）
- 非 dashboard Tab 有 ×；溢出时横向滚动（细滚动条，风格同 R78.4，不共享代码）
- 右侧控件簇从左到右：
  1. **audio 快捷块**：mic 开关 + 3 段电平表（常驻即时反馈；出错时显示错误行 title）
  2. **语言切换**：中/EN
  3. **关机 chip**：R73 倒计时，激活时显示，点击开浮动 HUD（HUD 卡组件不动）
  4. **⚙ 设置菜单**（下拉）：「系统设置」（→ `onOpen('settings')`）；「关于」不做弹窗，下拉底部直接展示 `RGBBox v{version}` 一行
  5. **👤 用户菜单**（下拉，全预留）：登录 / 个人资料 / 退出登录——渲染但 disabled + tooltip「即将上线」

## 6. DashboardView（首页）

```ts
interface DashboardViewProps {
  onOpen: (v: View) => void
  status: {                    // 全部来自 App.tsx 现有 state，无新数据源
    running: boolean           // status.running（EngineStatus）
    onToggleEngine: () => void
    effectName: string         // 当前灯效名
    fps: number                // status.fps
    audioEnabled: boolean
    audioDeviceId: string
    audioDevices: MediaDeviceInfo[]
    speakerDevices: MediaDeviceInfo[]
    onSelectAudioDevice: (id: string) => void
    overlayCount: number       // overlayDisplayIds.length
    version: string
  }
}
```

```text
┌────────────────────────────────────────────────────┐
│ 状态区  ● 引擎运行中(可暂停) · 灯效 Rainbow · 60fps │
│         🎙 开 + 设备选择 · Overlay 2 屏             │
├────────────────────────────────────────────────────┤
│ 核心                                                │
│ [🖥 工作台：预览与效果控制] [✨ 灯效：49 个 CPU 特效] │
│ 创作                                                │
│ [🎬 视频] [🎵 音频] [📦 3D 模型]                    │
│ 工具                                                │
│ [🎮 游戏] [📊 诊断] [🖧 架构]                        │
└────────────────────────────────────────────────────┘
```

- 固定三分区：**核心**（workspace、effects）/ **创作**（video、audio、model3d）/ **工具**（games、diagnostics、architecture）
- audio 设备选择器的选项结构与 sidebar 现有 select 完全一致（默认设备 / 扬声器前缀项 / 系统音频 / 麦克风列表）；`effectName` 由 App.tsx 现有当前效果状态推导（实施计划钉死具体表达式）
- 卡片 = 图标 + 名称（复用 `nav.*`）+ 一句话描述（新 key `dash.desc.*`）
- `MODEL3D_VIEW_ENABLED=false` 时 3D 卡片隐藏
- 已打开模块的卡片带「已打开」标记（小圆点）；点击卡片 = `onOpen(view)`（已开则聚焦）

## 7. SettingsView（系统设置 Tab）

内容 = sidebar 迁来的 7 组配置，分四组呈现，全部控件与现有 state/IPC 同源：

| 组 | 内容 | 来源 |
| --- | --- | --- |
| 运行 | 引擎状态 + 播放/暂停、电源阻断、开机自启 | sidebar status-panel ×2 + 引擎块 |
| 屏保 | 开关 + 空闲阈值（1/5/10/30 分钟） | R74 |
| 快捷键 | 全局截图热键（预设五选一） | R81 |
| AI | OCR baseUrl / model / apiKey + 保存 | R83 |

```ts
interface SettingsViewProps {
  // 运行组
  running: boolean
  onToggleEngine: () => void
  powerSaveBlock: boolean
  onPowerSaveBlock: (v: boolean) => void
  autoLaunch: boolean
  onAutoLaunch: (v: boolean) => void
  // 屏保组（R74）
  screensaverEnabled: boolean
  screensaverMinutes: number
  onScreensaver: (cfg: { enabled?: boolean; idleMinutes?: number }) => void
  // 快捷键组（R81）
  snipHotkey: string
  onSnipHotkey: (k: string) => void
  // AI 组（R83）
  aiCfg: { baseUrl: string; model: string; apiKey: string }
  onAiCfg: (c: { baseUrl: string; model: string; apiKey: string }) => void
  onSaveAiCfg: () => void
  aiSaved: boolean
}
```

## 8. Sidebar 迁移映射（最终版）

| sidebar 现有内容 | 去向 |
| --- | --- |
| 品牌块（logo/名称/版本） | 顶栏左侧；版本进 tooltip + ⚙「关于」 |
| nav-list 8 按钮 | 删除（Tab + Dashboard 卡片取代） |
| audio 开关 + 电平表 | 顶栏右侧 |
| audio 设备选择器 | Dashboard 状态区 |
| 引擎状态 + 播放/暂停 | Dashboard 状态区（监控）+ 设置 Tab「运行」组（同一 state 两处呈现） |
| 语言切换 | 顶栏右侧 |
| 关机 chip + 浮动 HUD | chip 进顶栏（激活时）；HUD 浮动卡不动 |
| powerSaveBlock / autoLaunch / 屏保 / 截图热键 / AI 配置 | 设置 Tab |

## 9. 样式（styles.css）

- 删除：`.sidebar`、`.nav-list`、`.nav-item`、`.sidebar-audio`、`.sidebar-footer`、`.brand-block` 及配套规则
- 新增：`.app-shell`（纵向 flex：顶栏固定高 + 内容区撑满）、`.tab-bar` / `.tab`（active / × / 溢出滚动）、`.topbar-controls`（右侧控件簇）、`.topbar-menu`（⚙/👤 下拉）、`.dashboard` / `.dash-status` / `.dash-section` / `.dash-card`（hover / 已打开标记）、`.settings-view`
- 沿用现有 CSS 变量体系，不新增主题机制；窄窗口下 Tab 横向滚动、卡片网格 `auto-fill` 换行

## 10. i18n（zh + en 同步）

- 新 key：`nav.dashboard`、`nav.settings`、`dash.section.core|create|tools`、`dash.desc.*`（8 模块）、`dash.status.*`（状态区标签）、`menu.settings|about|login|profile|logout|comingSoon`、`settings.group.run|screensaver|hotkey|ai`
- 引擎/电源/自启/关机/屏保/热键/AI 等配置项文案**复用现有 key**，不重复造

## 11. 边界与错误处理

- localStorage 防御：JSON 损坏回退、非法 view / `profiles` / 禁用的 `model3d` 过滤（见 §4）
- audio keep-alive：`display:none` 包装原样保留在 children 内；Tab 切换仅改 activeView，行为与现状一致
- 👤 用户菜单所有项 disabled（`aria-disabled` + tooltip），点击无副作用
- 窄窗口：Tab 溢出横向滚动；Dashboard 卡片网格换行；设置 Tab 表单纵向堆叠

## 12. 测试（vitest）

- `useTabNavigation` 单测（node）：追加/聚焦、close 回 dashboard、dashboard 不可关、持久化往返、旧 `rgbbox:view` 迁移、JSON 损坏回退、非法值与 model3d 过滤
- `TabBar` 组件测试（happy-dom）：渲染顺序、active 态、× 有无（dashboard 无）、点击回调、⚙/👤 菜单项与灰置
- `DashboardView` 组件测试：三分区渲染、卡片点击 onOpen、model3d 隐藏、已打开标记、状态区数据渲染
- `SettingsView` 组件测试：四组配置渲染、受控回调
- 验收基线：`yarn test` 全量 0 失败、`yarn typecheck` 0 error

## 13. 非目标（R85 明确不做）

- Tab 拖拽排序、用户自定义卡片顺序、按使用频率自适应
- 同模块多开（浏览器式）
- 键盘快捷键（Ctrl+Tab 等）
- 真实登录/鉴权/账号体系（仅预留灰置入口）
- 各 view 从 App.tsx 拆文件（未来独立 R-N）
- 设置独立窗口

## 14. 验收点（对应 R85.5）

1. 启动首屏为 Dashboard，状态区数据实时正确
2. 点击卡片 → 顶部新开对应 Tab 并切换；已开模块点击卡片/Tab = 聚焦
3. 关闭当前 Tab → 回 Dashboard；Dashboard Tab 恒在且无 ×
4. 重启恢复上次打开的 Tab 与 active
5. 旧用户 `rgbbox:view`（非 dashboard）首启自动迁移为 [Dashboard, 旧模块] 且 active 落旧模块
6. ⚙ 菜单可开设置 Tab；设置四组配置与迁移前行为等价（同 state/IPC）
7. 👤 菜单渲染登录/资料/退出，全部灰置
8. 侧栏 CSS/JSX 全删，无残留死样式
9. zh/en 文案齐全无缺 key
10. `yarn test` 0 失败 + `yarn typecheck` 0 error
