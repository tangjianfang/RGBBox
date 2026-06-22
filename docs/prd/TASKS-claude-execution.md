# RGBBox 高质量化 — Claude 执行任务清单

> **本文件是给 Claude（及其它 agent）的执行索引，不是需求定义处。**
> 所有需求正文、验收点、受影响文件均定义在 [`PRD-0002-rgbbox-project-catalog.md`](./PRD-0002-rgbbox-project-catalog.md) 的 **R13–R16**。本清单只把它们**拆成颗粒度更小的可执行任务**并排序，便于 Claude 逐条拾取。
> 工作流规则：[`../AI_WORKFLOW.md`](../AI_WORKFLOW.md)。提交标题统一 `[PRD-0002] <type>: <subject>`。
> 来源：2026-06-22 四轮评审讨论（推广就绪度 / 功能力 / 视觉力 / 影响力维度）。

---

## 0. 给 Claude 的执行约定

1. **拾取任务前**：先读对应 R-N（本清单每条都标了 `→ R<x>.<y>`），确认验收点。
2. **执行顺序**：按 **P0 → P1 → P2 → P3** 批次推进；同批次内可按依赖关系并行。
3. **风险分级**（见 `AI_WORKFLOW.md §8` / PRD-0002 R10）：
   - **L0** = 纯文档/配置，自动执行，完成后改对应 R-N 状态 ✅ + 证据。
   - **L1** = 单文件/内部重构（行为不变），一次审批跑完。
   - **L2** = engine / IPC / UI 可见行为 / 新增依赖 / 跨多文件 → **走标准四步，逐项审批**。
4. **完成一条** → 在本清单勾选 `- [x]` + 在 PRD-0002 把对应 R-N 子项验收框勾上 + 该主 R-N 全部完成后状态改 ✅。
5. **标 `🧑 需用户/真机`** 的任务 Claude **不能在沙箱内完成**（截图、真机出光、arm64 出包、性能实测、GitHub 仓库设置），Claude 应铺好代码/占位/文档并提示用户接手。
6. **不确定风险级别 → 询问用户（L0/L1/L2？），不擅自决定。**

---

## 1. P0 批次 — 零/低风险、最高性价比（先做这批）

> 目标：让项目「可信 + 可发现 + 可维护」。绝大多数是 L0/L1，Claude 可自动跑完（除截图）。

### 1.1 合规地基（→ R13.1，L0）
- [ ] T-A1 新建 `LICENSE`（MIT 全文，署名 "RGBBox Contributors"） → R13.1.1
- [ ] T-A2 修正 `package.json` `homepage` 为 `https://github.com/tangjianfang/RGBBox`（**仅此字段，不动 scripts/deps**） → R13.1.2
- [ ] T-A3 新建 `CONTRIBUTING.md`（开发命令 + 单 PRD/R-N 工作流简版 + 提交格式） → R13.1.3
- [ ] T-A4 新建 `CODE_OF_CONDUCT.md`（Contributor Covenant） → R13.1.4
- [ ] T-A5 新建 `SECURITY.md`（漏洞上报流程） → R13.1.5
- [ ] T-A6 新建 `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md` + `.github/PULL_REQUEST_TEMPLATE.md` → R13.1.6
- [ ] T-A7 新建 `.github/FUNDING.yml`（占位） → R13.1.7 / R16.8.1
- [ ] T-A8 🧑 需用户：开启 GitHub Discussions（仓库设置） → R13.1.8

### 1.2 CI 自动化（→ R13.3，L2 — 改 workflows，需审批）
- [ ] T-A9 新建 `.github/workflows/ci.yml`：push/PR → `yarn install → typecheck → test → build`（matrix 可选） → R13.3.1
- [ ] T-A10 README 加 CI 徽章（+ 可选 Codecov） → R13.3.2

### 1.3 落地页 SEO（→ R13.4，L1）
- [ ] T-A11 `docs/index.html` 补 `description` + `og:*` + `twitter:card` + `canonical` + favicon/apple-touch-icon → R13.4.1
- [ ] T-A12 🧑 需用户：GitHub 仓库补 Topics + description + website → R13.4.2

### 1.4 视觉设计令牌根基（→ R15.1，L1）
- [ ] T-C1 抽取 `styles.css` 颜色/间距/圆角/阴影/字体 → `:root` 设计令牌（`--color-*` 等），新建 `src/renderer/src/styles/tokens.css` → R15.1.1
- [ ] T-C2 按 9 大 view 拆分 `styles.css`（4678 行巨石） → R15.1.2
- [ ] T-C3 逐项视觉零回归校验 + `yarn typecheck && yarn build` → R15.1.3 / R15.7

### 1.5 长期护城河文档（→ R13.5，L0）
- [ ] T-A13 新建 `CHANGELOG.md`（从 v0.3.8 起） → R13.5.1
- [ ] T-A14 🧑 需用户：完善 v0.3.8 Release 描述 → R13.5.2

### 1.6 视觉素材（→ R13.2，🧑 需真机录制）
- [ ] T-A15 🧑 需用户：录主视觉 GIF/MP4 + 4–6 张分类截图存 `docs/screenshots/` → R13.2.1 / R13.2.2
- [ ] T-A16 README 顶部加徽章 + 截图画廊 + 下载入口 + 信息架构前移（**素材就位后**） → R13.2.3 / R13.2.4

---

## 2. P1 批次 — 体验与传播双补（中低风险）

### 2.1 视觉系统进阶（→ R15.2 / R15.4，L2）
- [ ] T-C4 基于令牌实现 light/dark 切换 + `prefers-color-scheme` + 持久化 → R15.2.1
- [ ] T-C5 可选多套预设皮肤（霓虹/赛博/极简） → R15.2.2
- [ ] T-C6 抽共享 UI 原子组件 `components/ui/*`（Button/Card/Slider/Tabs/Panel）统一 9 大 view → R15.4.1
- [ ] T-C7 响应式：优化 `min-width:960px` 小窗体验 → R15.5.1

### 2.2 品牌识别（→ R15.3，L1/L2，部分需设计素材）
- [ ] T-C8 🧑 部分需用户：统一 Logo + 品牌色板 + 图标语言 → R15.3.1
- [ ] T-C9 启动动效 / 关于页 / 加载态品牌签名 → R15.3.2

### 2.3 预设市场（→ R14.3，L2 — 复用已有导出）
- [ ] T-B1 扩展 `ProfileManager` 导出为标准 `.rgbbox` 格式 + 版本号 + 一键导入 → R14.3.1
- [ ] T-B2 社区预设库（仓库/Discussions/Pages 画廊） → R14.3.2

### 2.4 质量与安全硬资质（→ R16.5，L0/L2）
- [ ] T-D1 接入 CodeQL + Dependabot + OpenSSF Scorecard → R16.5.3
- [ ] T-D2 测试覆盖率公开徽章 → R16.5.1
- [ ] T-D3 Electron 安全基线审计清单（文档） → R16.5.2

### 2.5 应用内录制（最高杠杆低成本，→ R16.9.2，L2）
- [ ] T-D4 应用内「导出灯效为 GIF/视频」按钮（用户自传播 + 反哺截图荒） → R16.9.2

---

## 3. P2 批次 — 让它成为「真正的 RGB 控制器」+ 打开受众（L2，逐阶段审批）

### 3.1 真实硬件输出（→ R14.1，L2 — 分阶段）
- [ ] T-B3 新建 `src/main/outputs/` + `IOutputAdapter` 抽象层 → R14.1.1
- [ ] T-B4 **WLED 适配器**（UDP DDP/WARLS，首发优先） → R14.1.2
- [ ] T-B5 把 50 个特效逐帧缓冲接到输出层（预览=真机同源） → R14.1.4
- [ ] T-B6 设备发现 / 灯珠映射 UI → R14.1.5
- [ ] T-B7 新增 `rgbbox:output:*` IPC + preload 桥 + 测试 → R14.1.6
- [ ] T-B8 **OpenRGB 适配器**（TCP SDK） → R14.1.3

### 3.2 平台覆盖（→ R16.1，L2）
- [ ] T-D5 mac 补 arm64/universal 产物（改 `package.json` build） → R16.1.1
- [ ] T-D6 Linux 补 Flatpak/AUR → R16.1.2
- [ ] T-D7 评估 Web/WASM 预览 Demo（纯 TS 引擎可编译） → R16.1.3
- [ ] T-D8 🧑 需真机：arm64 出包验证 + 性能基准实测 → R16.1 / R16.2

### 3.3 性能数字证据（→ R16.2，L1）
- [ ] T-D9 FPS/CPU/GPU/内存性能面板（复用 `metricsCollector` R6.12） → R16.2.1
- [ ] T-D10 性能回归基准接入 CI → R16.2.2

---

## 4. P3 批次 — 差异化 & 影响力放大（高价值，部分高风险）

### 4.1 AI 生成灯效（差异化王牌，→ R14.4，L2）
- [ ] T-B9 「文本/音乐 → 效果参数」AI 生成（结合高斯泼溅 + GPU 管线） → R14.4.1
- [ ] T-B10 本地优先策略（本地小模型 / 可选云端，守 local-first） → R14.4.2

### 4.2 效果创作工具化（→ R14.2，L2）
- [ ] T-B11 效果图层模型 + 混合模式（add/screen/multiply）+ 按区域分配 → R14.2.1
- [ ] T-B12 时间线 / 关键帧编排 → R14.2.2

### 4.3 插件 SDK（生态杠杆，→ R16.3，L2）
- [ ] T-D11 效果插件 SDK（第三方 TS 写特效 + 热加载） → R16.3.1
- [ ] T-D12 效果模板仓库 + 文档 + 示例（接 R14.3 市场） → R16.3.2

### 4.4 联动触发（→ R14.5，L2）
- [ ] T-B13 热键 / 系统事件 / CPU·GPU 温度 / 时间表触发 → R14.5.1

### 4.5 无障碍 + 国际化 + 安全开关（→ R16.4，L2）
- [ ] T-D13 A11y 补强（键盘可达 / 焦点 / 屏幕阅读器 / WCAG AA） → R16.4.1
- [ ] T-D14 i18n 扩语（日/韩/德/西） → R16.4.2
- [ ] T-D15 光敏癫痫安全开关（强闪烁「减少闪烁」选项） → R16.4.3

### 4.6 文档站 & 开发者体验（→ R16.6，L0）
- [ ] T-D16 文档站点（VitePress/Docusaurus）：手册 + 效果图鉴 + 架构 + SDK 文档 → R16.6.1
- [ ] T-D17 交互式效果图鉴（GIF + 参数 + 在线预览） → R16.6.2
- [ ] T-D18 devcontainer / Codespaces 一键开发环境 → R16.6.3

### 4.7 数据 / 商业 / 运营（→ R16.7 / R16.8 / R16.9，混合）
- [ ] T-D19 本地优先匿名遥测（可选开关） + 崩溃上报 → R16.7
- [ ] T-D20 🧑 规划：双轨模式 / 硬件联名 → R16.8
- [ ] T-D21 路线图公开 + good-first-issue + 贡献者墙 + 内容飞轮 → R16.9.1 / R16.9.3

---

## 5. 三个最高杠杆点（如果只做三件事）

| 优先 | 任务 | → R-N | 为什么 |
| --- | --- | --- | --- |
| 1 | T-D5 + T-D7（arm64 + Web Demo） | R16.1 | 打开最大受众 + 零安装传播 |
| 2 | T-D11（插件 SDK） | R16.3 | 让社区帮你造内容，生态指数增长 |
| 3 | T-B9（AI 生成灯效） | R14.4 | 建立无人能及的差异化 |

---

## 6. 进度总览

| 批次 | 任务数 | 风险主调 | 可 Claude 自动 | 需用户/真机 |
| --- | --- | --- | --- | --- |
| P0 | 16（T-A1~A16 + T-C1~C3） | L0/L1（CI 为 L2） | 多数 | 截图×2、Discussions、Topics、Release 描述 |
| P1 | 13（T-C4~C9 + T-B1~B2 + T-D1~D4） | L1/L2 | 多数 | 品牌素材 |
| P2 | 11（T-B3~B8 + T-D5~D10） | L2 | 代码可写 | arm64 出包、性能实测 |
| P3 | 16（T-B9~B13 + T-D11~D21） | L2/L0 | 代码可写 | 商业规划 |

> **建议起步**：让 Claude 先跑 **P0 的 L0 项**（T-A1~A7、T-A13、T-C1~C3、T-A11），这些零风险、纯增量、不碰核心引擎、不动 `package.json` scripts/deps；CI（T-A9）作为 L2 单独审批。
