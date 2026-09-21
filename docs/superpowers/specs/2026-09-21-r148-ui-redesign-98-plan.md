# R148 UI 美化大方案 —— 98/100 顶级商业软件标准完整路线

**日期**：2026-09-21　**分支**：`ui/redesign-research`　**PRD 条款**：R148（规划条款）
**输入研究**：[`ui-baseline-facts`](../../reviews/2026-09-21-ui-baseline-facts.md)（代码级基线）· [`ui-research-notes`](../../reviews/2026-09-21-ui-research-notes.md)（标杆解构）· AI 视觉评审（vision-lab 页逐维打分）

---

## 1. 使命

把 RGBBox 的 UI 从「专业工具的骨架 + 开发者调试面板的皮肤」（视觉评审原话）升级到 **Linear / Raycast 级商业软件质感**——量化目标：9 维度加权总分从 **5.5/10 → 9.8/10（98/100）**。

**诚实分声明**：S0–S4 兑现后高置信达 **95**；98 需要 S5（亮色主题 + 桌面原生质感）全兑现。每阶段独立验收，分数可复核。

## 2. 评分体系（基线 → 目标）

| # | 维度 | 权重 | 基线 | 目标 | 基线依据（实测） |
|---|------|-----:|-----:|-----:|------------------|
| 1 | 色彩系统 | 15% | 6.5 | 9.8 | token 起步（R86 17 个）但**双绿并存**（`--accent #42e8a9` vs 硬编码 `#46c6a8` ×89）、`#8aa2ad` 等 6 色硬编码 ×10-28、accent 一色四义（选中/分区标题/激活/聚焦） |
| 2 | 排印系统 | 15% | 4.5 | 9.8 | **字号塌陷**（页面标题到正文全挤 12–14px 单层）、遥测数值（fps/ms/距离）无等宽无仪表化、中英混排基线漂移、code token（R135/R142-E1）无 mono、Inter 未打包回落 Segoe |
| 3 | 组件态与质感 | 15% | 5.5 | 9.8 | 按钮无主次（五等权一字排开）、圆角 4/6/8 混用、disabled 区分弱、「校准中」状态裸文本、输入框边框不可见、五指方块边框近隐形 |
| 4 | 间距与布局 | 12% | 6.0 | 9.8 | gap token 仅 2 个、间距无节奏梯度（标题块/操作块/数据块等距）、面板间距 12/24px 随意、列宽失衡无规约 |
| 5 | 交互反馈 | 10% | 7.0 | 9.8 | hover 有但行可交互性弱、focus-visible 缺失、状态变更无即时容器 |
| 6 | 可访问性 | 10% | 4.5 | 9.5 | 对比度未系统校验（1293 类）、键盘焦点环不成体系、reduced-motion 未尊重 |
| 7 | 动效 | 8% | 5.5 | 9.5 | 16 个散装 keyframes 无时长/缓动规范、无进场/退场纪律 |
| 8 | 平台原生感 | 8% | 6.0 | 9.5 | 自绘 titlebar ✓、无窗口材质联动、字体回落链未治理 |
| 9 | 治理一致性 | 7% | 5.0 | 9.8 | **8336 行单文件 CSS** 无分层、双轨色值、无视觉回归门禁 |
| | **加权** | | **≈5.5** | **≈9.7–9.8** | |

## 3. 设计哲学：「舞台与观众席」

RGBBox 的独有命题（Linear/Raycast 都没有）：**页面里 30–70% 面积是高饱和动态灯效内容**（RGB 预览、频谱、游戏）。这决定了与纯工具软件相反的策略——

> **灯效是唯一的主角，UI chrome 全面退后。**

- chrome 用**近黑分层中性面**（Raycast 式 1–2% 明度差分层：rail → content → card → elevation），永远不与内容争饱和度；
- **accent 只表交互语义**（选中/聚焦/进行中），不表分区/装饰——把评审发现的「一色四义」收敛为「一色一义」；
- 分区标题去色（灰白 + 左侧 2px 色条），让青绿只出现在用户「正在操作」的地方；
- **遥测仪表化**：fps/p95/延迟/距离等数值是专业控制台的灵魂——tabular-nums 等宽 + mono 轨 + 低饱和辅色标签，做出「仪表感」而非「正文感」。

## 4. 方案选型（头脑风暴三方向）

| | A. 微调收敛 | **B. 系统化重构（选定）** | C. 全面重设计 |
|---|---|---|---|
| 做法 | 只修双绿/对齐/主按钮等显性瑕疵 | token 三层化 + 排印/组件态/动效体系化，视觉延续渐进 | 新视觉语言推倒重来（换字体换色彩体系换布局密度） |
| 到 95+ | ✗（天花板 ~75） | ✓ | ✓ |
| 风险 | 低 | 中（回归面大但有 S0 视觉回归门禁兜底） | 高（品牌连续性断裂、1293 类全重写、工期 ×3） |
| 与 R147 新架构 | — | 正交且互补（styles.css 拆分与组件结构对齐） | 冲突（组件层重写） |

**选 B**：A 到不了目标分；C 的收益 B 全部覆盖而风险不可控。

## 5. 设计系统规范（目标态定义）

### 5.1 色彩：三层 token（W3C 2025.10 语义模式 + Radix 刻度法）

```css
/* Layer 1 primitive（12 步色阶，唯一定义处） */
--mint-1..12   /* 薄荷绿主色阶（#42e8a9 归一为 mint-9，废除 #46c6a8） */
--slate-1..12  /* 冷蓝灰中性阶（现 #0d1318..#131d23 收编） */
--amber-*, --red-*, --blue-*  /* 状态色阶 */

/* Layer 2 语义（组件只允许用这层） */
--surface-rail/content/card/elevated   /* 近黑分层面：1–2% 明度差 */
--text-primary/secondary/muted/faint
--border-subtle/hover  /* Linear 式：半透明白 ~8%，不透明度分层而非实色 */
--accent / --accent-dim / --on-accent
--status-info/warn/error/dim           /* 状态四义，黄色入容器不再裸奔 */

/* Layer 3 组件域（可选，如 --btn-primary-bg） */
```
规则：组件 CSS 出现裸 hex = CI 检查失败（S0 的审计脚本升级为 lint）。

### 5.2 排印：四级阶梯 + 双轨

| 级 | 尺寸/行高 | 用途 |
|----|----------|------|
| display | 20px/28 semibold | 页面主标题（现在只有 14px 的位置） |
| title | 15px/22 medium | 面板标题、分区头 |
| body | 13px/20 regular | 正文、表格 |
| caption | 11px/16 regular + tracking | 辅助说明、坐标轴标签 |
- **数值轨**：`font-variant-numeric: tabular-nums` + JetBrains Mono/GeistMono 子集（woff2，数字+单位+符号 <30KB）——一切 fps/ms/%/距离/R-N token；
- **中文字体链**：`Inter var, "Segoe UI Variable", "Microsoft YaHei UI", system-ui` + **打包 Inter Variable 拉丁子集**（woff2 ~90KB，随主 chunk）；中文字重用 `font-synthesis: none` 保持（已有）+ 显式 500/600 档校准。

### 5.3 间距与形状：4px 基网格

- `--space-1..8`（4/8/12/16/24/32/48/64），面板节奏规约：标题块→操作块 16px、操作块→数据块 24px、卡片内 12px；
- 圆角三档 `--radius-s/m/l`（4/6/10px）+ 单一映射规则（输入/按钮 s、卡片 m、弹层 l）——废除 4/6/8 随意值；
- 边框 `1px` 全局唯一宽度，透明度分 3 档（hair 8% / line 14% / strong 24%）。

### 5.4 组件态：四态 × 主次层级

- 按钮：`primary`（accent 填充+on-accent 文字）/ `secondary`（surface+border）/ `ghost`（无边）/ `danger`，每态 × hover/pressed/focus-visible/disabled 全定义（24 组状态值全 token 化）；
- focus-visible：`outline: 2px solid --accent; outline-offset: 2px` 全局统一（现在散落）；
- 状态容器化：「校准中」→ spinner badge；警示 → `--status-warn` 底色容器；空态 → faint 图标 + caption。

### 5.5 动效：两档时长 + 一条缓动

- `--motion-fast: 120ms`（hover/press）、`--motion-slow: 240ms`（面板展开/视图过渡），`--ease: cubic-bezier(0.2, 0, 0, 1)`；
- 16 个 keyframes 收编为 6 个语义原语（fade-in / slide-up / pulse / spin / shimmer / burst），其余删除或映射；
- `@media (prefers-reduced-motion: reduce)` 全局降级为 opacity-only。

## 6. 分阶段实施路线（每阶段独立 R-N 立项）

| 阶段 | 内容 | 目标分增量 | 预估 | 核心验收 |
|------|------|-----------|------|---------|
| **S0 工具链** | 视觉回归快照（playwright screenshot diff 主流程 9 view）+ 对比度审计脚本（解析 CSS 计算 text/bg 对）+ 裸 hex lint | 治理 5→7 | 0.5 天 | 快照基线入档；lint 在 CI 可跑；审计报告列出全部违例 |
| **S1 色彩** | token 三层落地 + **双绿归一** + 6 组硬编码色收编 + styles.css 拆分（`tokens.css / base.css / components.css / views.css`，@import 聚合，总行数不变但分层） | 色彩 6.5→9.5，治理→8.5 | 1–1.5 天 | 裸 hex lint 归零（primitive 层除外）；视觉 diff 仅预期变化；对比度违例 <5 |
| **S2 排印** | 四级字阶 + Inter 打包 + 数值 mono 轨 + 遥测卡片组件（vision-lab/diagnostics/workspace 指标行重做） | 排印 4.5→9.5 | 1–1.5 天 | 字号档分布直方图（审计脚本）呈 4 簇；数值全 tabular；视觉评审复检排印 ≥4.5/5 |
| **S3 组件态** | 按钮四型×四态 + focus-visible 全局 + 状态容器化 + 圆角/间距 token 映射（1293 类逐类过堂，分 view 批次提交） | 组件 5.5→9.5、交互→9.5、间距→9.5 | 2–3 天 | 状态矩阵 24 组全覆盖快照；键盘走查全 view 可达 |
| **S4 动效** | 时长/缓动 token + keyframes 收编 16→6 + reduced-motion + 视图切换过渡（view fade 120ms） | 动效 5.5→9.5、a11y→9.5 | 1 天 | keyframes 清单 =6；reduced-motion 快照 diff；E2E 26/26 |
| **S5 主题与原生** | 亮色主题（语义 token 双指向 + `prefers-color-scheme` + 手动切换入 settings）+ 桌面质感（窗口inactive态边框、系统 accent 读取、titlebar 精修） | 平台 6→9.5、加权冲 98 | 1.5–2 天 | 双主题快照双绿；亮色对比度审计通过；真机走查 |

总计 7–9.5 天实施量（可按阶段间歇执行，每阶段独立价值独立验收）。

## 7. 治理与回归策略

- **每阶段门禁**：`yarn test` 全绿（含既有 25 组件测试——props 不动，DOM 类名不变则零改）+ E2E 26/26 + 视觉快照 diff 仅含本阶段预期变化（逐张人工 review 后入新基线）；
- styles.css 拆分放 S1 是因为 token 先行才能分层；拆分后 views.css 仍可按 R147 的 view 结构再分文件（S3 顺带）；
- i18n 文案、信息架构、功能行为**零变化**（超纲即另立 R-N）。

## 8. 风险

| 风险 | 对策 |
|------|------|
| 1293 类逐类改造引入视觉回归 | S0 快照先行；分 view 小批提交；每批 diff review |
| 既有 25 个组件测试依赖类名/DOM | 本方案不改类名语义（只改值），测试应零修改；如有依赖 style 值的断言逐个校准 |
| 亮色主题与高饱和 RGB 内容冲突 | S5 设计时以「舞台」逻辑优先：亮色下预览区加深色舞台底，保持内容对比 |
| Inter 打包增加包体 | woff2 子集 ~90KB；收益（跨机渲染一致）> 成本；dist 体积门禁核查 |
| 工期跨度内穿插其他 R-N | 阶段间无硬依赖顺序（S1→S2 建议顺序，S3/S4 可换），间歇执行安全 |
