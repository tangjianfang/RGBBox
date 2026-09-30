# Q-5 设计系统 Token 方案（R189 · 一页）

> 方向拍板：**中性化 + 单强调色**。本文是实施前的 token 方案一页：中性阶分层、单一强调色（绿收敛）、字号 4 档、圆角 2 档、间距阶，每项列 before/after。实施四项=模块卡中性化、≥3 绿收敛单 token、dashboard 状态卡右缘对齐、顶栏与 H1 去重（见 §7）。

## 1. 中性阶（分层，收敛「每卡一色」的彩底）

UI chrome 全部走冷蓝灰中性阶，RGB 内容是唯一主角（R148.2「舞台与观众席」）。既有 token 已成分层，本轮**补齐角色注释 + 把彩色底收敛进中性阶**（模块卡图标底由 9 色相 14% 彩底 → 中性 `--bg-control`）：

| 层 | token | 值 | 角色 |
|---|---|---|---|
| L0 画布 | `--bg-content` / `--surface-deep` | #0f1418 / #0c1418 | 应用内容底 / body·全屏底 |
| L0 chrome 条 | `--bg-rail` / `--bg-toolbar` | #0d1318 / #11191f | 左 rail / 顶栏 |
| L1 卡片 | `--bg-card` → hover `--bg-card-hover` | #131d23 → #18242b | 卡片/磁贴/面板底 |
| L2 凸起 | `--bg-control` / `--surface-raised` | #1f3139 / #1e2e36 | 控件底/输入/图标圆底（Q-5 起含模块图标圆底）|
| 边框 | `--border-subtle` < `--border-strong` < `--border-control` < `--border-hover` | #26343c→#3a5a68 | 静态→交互 |
| 文本 | `--text-primary/secondary/muted/faint` | #e6edf0→#74919c | 四阶（全过 4.5:1，R158.2）|

## 2. 单一强调色——绿收敛（本轮核心收敛项）

**规则：绿色系字面值只允许出现在 `tokens.css`；`--accent: #42e8a9` 是唯一品牌绿定义行。** success 语义并轨品牌绿（「或单一品牌绿」拍板项）；accent 自身的文本/按钮状态阶是唯一允许的同族派生（tokens.css 内、注释标明绑定）。

| 绿色来源 | before | after |
|---|---|---|
| 品牌绿 | `--accent: #42e8a9` | 不变（唯一定义行）|
| 旧双绿残留 `rgba(70,198,168,X)`（= #46C6A8 的 rgba 形态，hex lint 抓不到的漏网） | app.css ×39 处 | `rgba(var(--accent-rgb), X)`（`--accent-rgb: 66,232,169` 与 --accent 同行区定义）|
| 第三绿 `#6ee7a0`（agent/games 后期批次带回的 fallback 族） | `var(--accent, #6ee7a0)` ×29 | `var(--accent)`（fallback 删除——:root 恒有定义，fallback 是死值）|
| 第三绿 rgba 形态 | `rgba(110,231,160,X)` ×14 | `rgba(var(--accent-rgb), X)` |
| success 第二绿 | `--status-success: #86efac` | `--status-success: var(--accent)`（语义别名保留，值并轨）|
| success pill 底 | `rgba(134,239,172,0.12)` 字面 | `var(--accent-dim)`（本就是 accent 12% 的 token）|
| accent glow 字面 | `rgba(66,232,169,0.5)` ×2 | `var(--accent-glow-50)`（精确匹配既有 token）|
| 模块 mint tint | `--tile-tint: 66,232,169`（accent 的重复定义） | `--tint-mint: var(--accent)`（tint 族入 tokens.css）|
| accent 派生阶（保留） | `--accent-bright/soft/deep-text`、`--btn-primary-bg-hover/pressed` | 字面保留于 tokens.css（对比度审计可解析 var 链；色相绑定注释标明）|

> 边界：游戏画布 / 标注调色板 / SnipView 描边里的绿色（`#86efac`、`#46c6a8` 等）是**内容层**颜色（画在 canvas/SVG 上的像素，非 chrome），且标注色值被持久化数据引用——不动。

验收口径：`grep -nE "70, 198, 168|110, 231, 160|134, 239, 172|#6ee7a0|#86efac" src/renderer/src/styles/*.css` → 0 命中（tokens.css 的 --tint-* 与派生阶除外，见上表）。

## 3. 字号——4 档（R148 S2 字阶核对）

既有四级字阶（rem，随外观字号缩放，R160.1）：**caption 11 / body 13 / title 15 / display 20**。

离群值核对（全量 census，px 换算后）：

| 离群 | 数量 | 处置 |
|---|---|---|
| 阴影 12px 层（0.75rem×85、12px×27、0.78125rem×21、12.5px×13、0.71875rem×11、11.5px×12…） | ~170 处 | **后续**（R148 S3 逐 view 批次）：按角色归 caption（辅助说明）或 body（正文），一次批次一个 view，基线随批重核 |
| 26px display 离群（`.effects-view-header h2` 1.625rem×4 选择器） | 1 处 | **本轮删除**——该 h2 属「顶栏与 H1 去重」项，随项销案 |
| 9–10.5px 微字（0.5625rem×3、10.5px×2、0.65625rem×3） | ~8 处 | 后续归 caption 或删除（多为游戏内 HUD） |
| px 形态字阶残留（11–22px 共 ~77 处，值多数在档） | ~77 处 | 后续统一 px→rem（值不变、像素级同效；当前不随外观字号缩放属 R160.1 漏网）|

本轮不动 ~170 处 12px 层的原因：一次性全量换档会同时改变全部视图文字度量的可读性风险，超出 Q-5「结构收敛」范畴；记入 S3 批次清单。

## 4. 圆角——2 档

| token | before | after |
|---|---|---|
| `--radius-s` | 4px | **6px**（chips/输入/按钮/小卡——与存量最大字面档 6px 对齐）|
| `--radius-m` | 6px | **删除**（消费者并入 --radius-s：scene-card/fx-applied-toast/vision-card/ai 按钮/focus-visible 共 10 处）|
| `--radius-l` | 10px（实际 0 消费） | **10px** 保留（卡片/面板/模态；Q-5 起承接 dashboard 卡与磁贴）|

落地：`.dash-card` 10px→`var(--radius-l)`、`.dash-tile` 12px→`var(--radius-l)`（12 并入 10）。
存量字面 census（后续 S3 批次映射）：8px×79、6px×65、10px×31、12px×28、4px×25 → 归 s/l 两档；`50%`（圆）×11 与 `999px`（胶囊）×30 是形状原语，不属圆角档位；奇数离群 3/5/7/9/14/16px ~34 处随批次归档（小元素上 6px 会被浏览器按盒高截断，需逐处判断，不盲扫）。

## 5. 间距阶

`--space-1..8`（4px 网格：4/8/12/16/24/32/48/64）已定义；语义间距 `--gap-grid: 20px`、`--gap-block: 28px` 均在 4px 网格上。现状消费者以字面 px 为主（token 化率低但值基本贴网格），离群（如 gap 10px×多、18px、22px）不构成视觉断裂，**本轮不强制收编**——间距 census 与映射随 S3 批次执行，避免无视觉收益的大面积 churn。

## 6. 模块卡中性化 + 图标保辨识（R151.1 修订）

| 部位 | before（R151.1） | after（Q-5） |
|---|---|---|
| 磁贴底/边 | `--bg-card` + `--border-subtle` | 不变（本就中性）|
| 图标圆底（56px 圆） | `rgba(--tile-tint, 0.14)` 九色淡彩底 | `var(--bg-control)` 中性凸起底 + `--border-subtle` 描边 |
| 图标色 | `rgb(--tile-tint)` 九色 | **保留九色**：`--tint-mint/violet/sky/amber/rose/lime/orange/fuchsia/cyan`（tokens.css 内容层，mint=var(--accent)）|
| hover | 彩底升至 0.22 | 中性底升至 `--border-hover`（既有 brightness(1.08) 不变）|

色相只留在字形上（辨识度），底面全部中性（统一）。

## 7. 顶栏与 H1 去重（逐 view）

顶栏细工具条恒显当前模块名（`getTabMeta(activeView).labelKey`，绝对居中）。view 内与之重复的大标题删除，保留 eyebrow 描述行（caption 级）为唯一下级文本：

| view | 顶栏 | view 内大标题 | 处置 |
|---|---|---|---|
| dashboard | 仪表盘 | 无 | — |
| workspace | 工作区 | h2=**当前 Profile 名**（非重复信息） | 保留 |
| effects | 效果库 | h2 效果库（=顶栏，26px 离群） | 删 h2，留 eyebrow「55 种内置效果…」 |
| video | 视频工作站 | h2 视频工作站（=顶栏） | 删 h2，留 eyebrow「采样 · 剪辑 · 标注」 |
| audio | 音频工作站 | h2 音频工作站（=顶栏） | 删 h2，留 eyebrow「专业音频」 |
| games | 迷你游戏 | h2 单机小游戏（近重复） | 删 h2，留 eyebrow「桌面街机」；游戏内 `<h2>{gameTitle}</h2>` 为具体游戏名，保留 |
| diagnostics | 诊断 | h2 诊断（=顶栏） | 删 h2，留 eyebrow「运行时」 |
| model3d | 3D 模型 | h2 高斯泼溅（技术名，非重复）；eyebrow「3D 模型查看器」（=顶栏） | 删 eyebrow，保留 h2 |
| architecture | 3D 可视化 | 无 view 级标题 | — |
| ai | AI 实验室 | 无 view 级标题（tab 条） | — |
| settings | 设置 | h2 设置（=顶栏） | 删整个空 header |

i18n 词表不动（key 保留，仅不再渲染）；ProfileManager 为模态浮层（顶栏在其下方显示宿主 view 名），不属重复。

## 8. 本轮实施清单（文件级）

1. `styles/tokens.css`：--status-success 并轨、--accent-rgb、--tint-* 九色、--radius s/m→s/l；--accent-dim/glow/ring 保持字面（与 --accent 同值区绑定注释，对比度审计可解析 var 链）。
2. `styles/app.css`：绿字面全量收敛（§2 表）、dash 图标圆底中性化（§6）、dash 卡/磁贴圆角 token、.dash-card-value 右缘对齐、`.effects-view-header h2` 规则删除。
3. `components/`：AudioStudioView / VideoStudioView / DiagnosticsView / EffectsView / MiniGamesView(hub) 删 h2；Model3DView 删 eyebrow；SettingsView 删 header。
