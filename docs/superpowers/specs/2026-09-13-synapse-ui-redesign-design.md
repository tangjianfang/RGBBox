# UI 全面重设计：Synapse 式布局（R86，三期之 P1）设计文档

- 日期：2026-09-13
- PRD 条款：[PRD-0002 §R86](../../prd/PRD-0002-rgbbox-project-catalog.md)
- 分支：`feat/synapse-ui-redesign`（基于 R85 `feat/dashboard-tab-shell`）
- 参考截图：Razer Synapse 主界面（用户提供，2026-09-13）

## 1. 需求与已确认决策

用户需求：「完全参考 Razer Synapse 的主界面设计风格和布局，重新设计 UI」。经澄清确认：

| 决策点 | 结论 |
| --- | --- |
| 导航模型 | **左侧竖排图标栏（直接切换）**；R85 的多 Tab（打开/关闭/重启恢复）语义移除 |
| 配色 | **保持 RGBBox 现有深蓝灰 + 青绿体系**，不改 Razer 绿/纯黑 |
| 范围 | **全量 view 重排**，分三期（P1 壳层+token / P2 核心 view / P3 媒体与工具 view） |
| 圆角 | 保留 RGBBox 8–12px（不采 Synapse 近直角；圆角属风格非布局） |
| rail 标签 | 图标 + 下方 9px 小字（9 模块纯图标难辨识） |
| 三分区 | Dashboard 的核心/创作/工具三分区随多 Tab 一起退役，改 Synapse 式单组磁贴 |

## 2. 参考图解构（布局语言，颜色不采用）

> 参考截图实际为「顶部多层导航 + 全宽内容区」形态；用户明确要的是 Synapse 经典**左侧竖排模块图标栏**布局，内容区语言取自截图。

可移植要素：

1. **三层明度底色分层**：rail 最深 / 工具条次之 / 内容区再亮 / 卡片最亮（明度差分层，弱描边）
2. **全宽内容区** + 独立滚动 + 自定义细滚动条
3. **可折叠分组**：`▼ + 大写标题` 为信息架构基本单元
4. **卡片网格**：~290px 列宽节奏、~21px 间距、扁平无阴影
5. **磁贴**：约 4:3、上部圆形实心 accent 底 + 深色图标、底部大写标签
6. **四级字阶**：全大写标签 + 字距，靠字号/灰度分层
7. **强调色语义**：accent = 激活/在线
8. **顶部细工具条**：左品牌、中页面标题（大写·字距）、右功能图标组

## 3. 分期

- **P1（本文档主体）**：设计 token + 壳层（左 rail + 顶工具条）+ Dashboard 重排 + 设置页 token 化 + 公共控件焕新
- **P2**：工作台（fx-sidebar → Synapse 式面板分组）、灯效库（分类可折叠分组）——验收点届时细化进 R86.4
- **P3**：音频/视频/3D/游戏/诊断/架构——届时细化进 R86.5

每期独立 spec 增补 → plan → 实施 → 验收；P2/P3 在 P1 验收后逐期启动。

## 4. P1 详细设计

### 4.1 设计 Token（styles.css `:root` 集中声明，全应用引用）

```css
:root {
  /* 三层明度底色（Synapse 黑/深灰/灰 → RGBBox 冷蓝灰） */
  --bg-rail: #0d1318;
  --bg-toolbar: #11191f;
  --bg-content: #0f1418;
  --bg-card: #131d23;
  --bg-card-hover: #18242b;
  --border-subtle: #26343c;
  /* 文字四级 */
  --text-primary: #e6edf0;
  --text-secondary: #b7cbd3;
  --text-muted: #8aa2ad;
  --text-faint: #5c707a;
  /* 强调语义（沿用 RGBBox 青绿，非 Razer 绿） */
  --accent: #42e8a9;
  --accent-dim: rgba(66, 232, 169, 0.12);
  --accent-contrast: #081014;   /* accent 实心底上的图标/文字色 */
}
/* 字阶：xs=11px/大写/0.06em · sm=12.5px · md=14px · lg=18px；间距：网格 20px、组内 16px、区块 28px */
```

存量类迁移到变量的 P1 范围明确为：`.app-shell/.topbar/.panel/.status-panel/.icon-button/.audio-*/滚动条/.settings-*/.dashboard 系新类`；其余类保持原值不受影响（P2/P3 随各自 view 重排继续迁移）。

### 4.2 壳层结构

```text
┌──────────────────────────────────────────────────────────────────────┐
│ [RB] RGBBox │ 当前模块名（大写·字距） │ 🎙▮▮▮ · 中/EN · ⏻36:12 · ⚙ · 👤 │ 48px
├──────┬───────────────────────────────────────────────────────────────┤
│ ◱ 首 │  内容区（全宽 · 独立滚动 · 细滚动条）                            │
│ 🖥 工 │                                                               │
│ ✨ 灯 │  ▼ 运行状态                                                   │
│ 🎬 视 │  [引擎状态卡] [实时帧率卡] [当前灯效卡] [浮窗卡] [音频输入卡]    │
│ 🎵 音 │                                                               │
│ 📦 3D │  ▼ 模块                                                       │
│ 🎮 游 │  (●)工作台 (●)灯效 (●)视频 (●)音频 (●)3D (●)游戏 (●)诊断 (●)架构 │
│ 📊 诊 │                                                               │
│ 🔗 架 │                                                               │
│ ⚙ 设 │                                                               │
└──────┴───────────────────────────────────────────────────────────────┘
   rail 72px：48px 图标块 + 9px 小字；选中态 = 左侧 2px accent 竖条 + 亮底
   （👤 用户菜单只在工具条右侧，rail 底部仅 ⚙——避免双入口）
```

### 4.3 导航语义（相对 R85 的变化）

- rail 点击 → `setActiveView(view)` 直接切换；`rgbbox:view` 持久化保留（重启回上次视图）
- 旧 `rgbbox:tabs` localStorage 残留数据不读取、不清理（无害）
- `tabNavigation.ts` 瘦身：`resolveInitialView(storedViewRaw: string | null, model3dEnabled: boolean): View`（非法/禁用值兜底 `dashboard`）；删除 `TabNavState/openView/closeView/sanitizeTabs/resolveInitialTabs`
- `MODEL_VIEWS` 保留（合法视图清单单一源）；`MODEL_META` 复用为 rail 与磁贴的图标/文案源

### 4.4 组件接口

```ts
// ModuleRail.tsx（新）
interface ModuleRailProps {
  activeView: View
  onSwitch: (v: View) => void        // 首页 + CARD_VIEWS（model3d 门控同 R85）
  onOpenSettings: () => void          // 底部 ⚙（setActiveView('settings')）
  isSettingsActive: boolean
  model3dEnabled: boolean             // false 时 rail 不显示 3D 入口
}

// AppShell.tsx（改造）
interface AppShellProps {
  title: string                       // 当前模块名（大写由 CSS 处理）
  version: string
  audioEnabled: boolean; onToggleAudio: () => void
  audioLevels?: { bass: number; mid: number; high: number }
  audioErrorLabel?: string
  lang: 'zh' | 'en'; onToggleLang: () => void
  shutdownLabel: string; onShutdownClick: () => void   // chip 恒显（R85 review 修复保留）
  onOpenSettings: () => void          // 工具条 ⚙ 菜单项（与 rail ⚙ 等效）
  rail: ReactNode                     // App.tsx 注入 <ModuleRail/>
  children: ReactNode                 // 当前 view 内容
}
// ⚙/👤 details 菜单仅在工具条；外点关闭、互斥逻辑原样保留；👤 持续灰置
```

### 4.5 Dashboard 重排（DashboardView 重写容器，数据链不动）

- 折叠分组：`<details open><summary>▼ {t('dash.group.*')}</summary>…</details>`，默认展开、不记忆
- 状态卡（`dash.card.*` 标签 + 现有数据源）：引擎（含 Play/Pause）、实时帧率（dashFps，0 显示 —）、当前灯效（effectName）、浮窗（overlayCount）、音频输入（audioEnabled 门控 + 设备选择器，选项结构同 R85）
- 模块磁贴：`grid auto-fill minmax(150px,1fr)`、高 ~150px、56px 实心 `--accent` 圆 + `--accent-contrast` 图标、`--text-xs` 大写标签、hover 明度 +8%；点击 `onOpen(view)`
- 「已打开」标记、三分区、`dash-status` 横条移除

### 4.6 设置页（P1 不动结构）

四组 panel 保留；panel 底色/标题走 token；组标题大写化。折叠分组不引入（配置项应全可见）。

### 4.7 i18n 增量（zh+en）

- 删：`dash.section.core|create|tools`、`dash.closeTab`、`dash.opened`
- 增：`dash.group.status`（运行状态/Status）、`dash.group.modules`（模块/Modules）、`dash.card.engine|fps|effect|overlay|audio`

### 4.8 移除清单

`TabBar.tsx`、`TabBar.test.tsx`、`useTabNavigation.ts`、`useTabNavigation.test.tsx` 删除；`tabNavigation.ts`/`tabNavigation.test.ts` 瘦身改写；`shellModules.ts` 的 `DASHBOARD_SECTIONS` 改为单组磁贴清单；App.tsx 恢复单视图 state + 持久化 effect。

### 4.9 测试

- 新 `ModuleRail.test.tsx`：模块数（model3d 门控 9→8）、active 高亮、点击 onSwitch、底部设置入口；👤 灰置断言保留在 AppShell 测试
- 改写：`AppShell.test.tsx`（title 渲染、去 tab 断言、chip 恒显/菜单关闭保留）、`DashboardView.test.tsx`（分组结构、状态卡值、磁贴点击、audio 门控、fps 占位）、`tabNavigation.test.ts`（resolveInitialView 兜底矩阵）、`shellModules.test.ts`（清单完整性）
- 基线：`yarn test` 0 失败 + `yarn typecheck` 0 error + `yarn build` 成功

## 5. P1 验收（对应 R86.3）

1. 左 rail 直切模块；重启回到上次视图
2. TabBar/多 Tab 逻辑全移除，无死代码
3. Dashboard：折叠分组 + 状态卡实时（fps 采样/引擎开关/设备门控）+ 磁贴进入模块
4. 配色保持 RGBBox；布局结构对照参考图
5. zh/en 无缺 key；测试/typecheck/build 全绿

## 6. 非目标（P1）

- 不改配色体系/品牌渐变；不引入 Razer 绿
- 不实现真实登录（👤 持续灰置预留）
- 不动各 view 内部布局（P2/P3）
- 不做 rail 可折叠/宽度调节、磁贴自定义排序
