# AGENTS/CLAUDE 规则 6/7 合规审计 — 冗余 UI 全量扫描 + 文档漂移（2026-10-28）

> 审计范围：规则 6「清理冗余 UI 元素」全量机械扫描 + 规则 7「三方体验/不破坏」中的文档漂移核查。
> 方法：全仓静态扫描（Node 脚本，语料 = src + tests 共 481 文件），所有"死"判定均经动态拼接白名单与人工抽查复核。
> 本报告只记证据，不改代码；清理实施需按规则 6 自身要求逐批走 R-N。

## 一、规则 6 扫描结果

### 1.1 干净层（无需处理）

| 层 | 规模 | 结论 |
| --- | --- | --- |
| i18n 键 | 1867 键 × 2 语言 | **完全对称、0 死键、0 仅测试键**（`TranslationKey = keyof EN` 类型保护有效） |
| 组件 | 54 个 tsx | 0 个零引用 |
| Effect 参数 | preset defaults 42 键 | 全部被消费（`gridDensity` 走 Preview3D u_detail GPU 槽位，非死参数） |

### 1.2 CSS 死类 — 53 个确认零引用（app.css 为主，共扫描 1130 类）

判定 = src+tests 全语料零子串命中，且排除 13 个动态模板拼接族（`md-h${level}` / `status-${tool.status}` / `ai-msg-${role}` / `diag-metric-*` / `difficulty-*` 等）。

```text
tnum, tnum-mono, code-chip, controls-panel, preset-grid, layer-button, preset-button,
parameter-panel, layer-enable-dot, add-layer-btn, effects-favorites-section,
primary-params, effects-favorites-row, swarm-setup-title, char-cards, char-card,
ambient-panel, ambient-preset-row, ambient-preset-btn, ambient-icon, quick-profile-btn,
profile-selector-row, profile-selector-icon, audio-tools-bar,
audio-eq-grid, audio-eq-band, audio-eq-freq, audio-eq-db,   ← app.css:4376 注释自证 "no longer used"
video-editor-modal, video-editor-shell, video-editor-topbar, video-editor-title,
video-editor-actions, video-editor-body, video-editor-loading, video-editor-hint,
video-last-shot-btn, video-last-shot-row, video-last-shot, screensaver-threshold,
ai-cfg-row, ai-model-name, ai-model-state, ai-model-refresh, cap-live, cap-idle,
ai-level, ai-model-badges, btn-ghost, agent-hint-row, games-side-panel,
swarm-coop-row, swarm-config-rows
```

- 死 `@keyframes`：`slide-up`（23 个动画中唯一无引用）。
- 家族成因：VideoStudioView 视频编辑器重构后类名换血（旧 `video-editor-*` 壳层残留）、audio-eq 旧均衡器 UI 淘汰、effects 首收藏/氛围面板改版。

### 1.3 死导出 — 67 个无外部引用（engine/shared/domain/gl 共 398 导出）

扫描定义 = 定义文件之外全语料（含 tests）零命中。**三类处置，需人工分拣，不机械删**：
1. 同文件内部有使用 → 收窄为模块私有（去 `export`）；
2. 完全无使用 → 删除；
3. 刻意公开的 API 面（如待接入的适配器接口）→ 保留并注释用途。

清单（`文件 :: 名称`）：`src/engine/audioMetrics.ts :: PeakInfo`；`src/engine/effects.ts :: SolarPlanetGeometry / ProteinPointGeometry / SpindleGeometry / VesicleGeometry`；`src/engine/eqResponse.ts :: genId / EqFilterType`；`src/engine/previewEngine.ts :: DARK_FLOOR_LIT`；`src/engine/videoWall.ts :: CanvasUv`；`src/engine/videoWallFrame.ts :: ExtractWallPanelFrameOptions`；`src/shared/ai8Client.ts :: AI8_BASE / Ai8ChatTemplate / Ai8DrawModel / Ai8DrawTemplateParsed / Ai8VideoVersion / Ai8VideoTemplateParsed / Ai8SseEvent`；`src/shared/aiProviders.ts :: AiProviderPreset`；`src/shared/dtlnDsp.ts :: DTLN_SAMPLE_RATE`；`src/shared/ipc.ts :: IpcChannel`（类型，ipc.ts:242；`ipcChannels` 常量本身 6 文件在用，约定未被破坏）；`src/shared/lanProtocol.ts :: LanCommand / SnapVerdict`；`src/shared/modelsManifest.ts :: ModelManifestEntry`；`src/shared/snipHotkeys.ts :: SnipHotkey`；`src/shared/titleBarTheme.ts :: TitleBarOverlayColors / TitleBarTheme`；`src/shared/types.ts :: PerformanceMode / SamplingSettings / AgentToolCallView / AvatarSlot`；`src/renderer/src/domain/appDialog.ts :: AppDialogRequest`；`domain/cardAnimation.ts :: CARD_FPS_BY_MODE / CARD_FPS_FLOOR / CARD_CELL_PX / CARD_BG_RGB`；`domain/curatedEffects.ts :: CLASSIC_FIVE / CURATED_CAP / RECENT_CAP`（内部在用，仅导出面冗余）；`domain/feelDials.ts :: FeelDialId / FeelDialDef`；`domain/gamesTelemetry.ts :: GameRunBuffer / GameProfileStats`；`domain/overlayDistribution.ts :: displayAspect`；`domain/primaryParams.ts :: primaryParamsFor`（主函数外部零引用，整模块疑似死）；`domain/quickDimensions.ts :: QUICK_ENERGY_OPTIONS / QUICK_DETAIL_OPTIONS / QUICK_PALETTE_OPTIONS / QuickMotionId / QuickEnergyId / QuickDetailId / QuickPaletteId / QuickOption`；`domain/randomizer.ts :: randomItem`；`domain/schedule.ts :: DEFAULT_SCHEDULE_EFFECTS / ScheduleBlockDefinition`；`domain/uiFontScale.ts :: UiFontScaleId`；`domain/uiTheme.ts :: UiThemeId / ResolvedTheme`；`domain/visionBench.ts :: LAB_BASELINE / BenchPlanStep / BenchGates / WordScore`；`domain/visionErrors.ts :: VisionErrorCta`；`domain/visionReplay.ts :: ReplayTick`；`gl/audioDrive3d.ts :: Drive3DState / Drive3DAmount`；`gl/effect3dGl.ts :: SHADERS`。

### 1.4 CSS 熵增热点（规则 6「布局不清」候选信号，仅登记不动作）

重复定义次数 Top（app.css 10967 行）：`games-screen` ×31、`vision-cap-table` ×14、`vs-model-list` ×13、`agent-sessions` ×12、`dash-tile-icon` ×10、`levelup-card` ×9、`process-cpu-table` ×8、`vision-banner` ×8、`agent-tool` ×8。多数为媒体查询/状态变体的合法重复，但 `games-screen` 31 次是明确的重构信号——按规则 6，等有 UI review 证据时走取证重构。

## 二、规则 7 文档漂移核查

| # | 文档声称 | 实际 | 严重度 |
| --- | --- | --- | --- |
| D1 | CLAUDE.md 架构：`effects.ts（49 CPU 效果 switch）` | **46** 个 case（R292 三体三效果迁 GPU 后未更新） | 中 |
| D2 | CLAUDE.md：`hooks/domains/（9 个域 hook）` | **10** 个文件 | 中 |
| D3 | CLAUDE.md：`App.tsx 编排层（~700 行…）` | 846 行（次要） | 低 |
| D4 | CLAUDE.md 命令速查 | 缺 `vision:*` ×6 / `ui:snapshot*` / `probe*` / `dist:7z` / `typecheck:node/web`（速查本属精选，列此备查） | 低 |
| D5 | docs/prd/README.md：「R13–R16（全部 ⏳ 待实施）」 | R13 段内 **88 处 ✅ vs 2 处 ⏳**（大部分已闭环）；R14/R15/R16 基本未动 | **高**（索引误导任务拾取） |
| D6 | CLAUDE.md：「覆盖率门槛见 PRD R11.4」 | R11.4 记载单一 80/70 阈值；实际 vitest.config 自 R163 起为**分层阈值**（global 58/46 + 每层红线） | 中（指针过期） |
| D7 | docs/I18N-AUDIT.md | 内容过期（本次扫描证明 i18n 层实际干净）；建议标 `historical` 或刷新 | 低 |
| — | AGENTS.md / copilot-instructions.md 启动流程引用（AI_WORKFLOW.md、PRD、TASKS-claude-execution.md、_TEMPLATE.md） | 文件全部存在，无漂移 | — |

## 三、建议的清理批 R-N 待办（待用户批准后逐批实施）

| 批次 | 内容 | 门禁 |
| --- | --- | --- |
| R327（拟） | 删 53 个 CSS 死类 + `slide-up` keyframes | `yarn ui:snapshot` 9/9 PASS（视觉零变化证明）+ 全量 test |
| R328（拟） | 67 个死导出三分类处置（私有化/删除/注释保留） | `yarn typecheck` + 全量 test |
| R329（拟） | 文档漂移修正 D1/D2/D5/D6/D7 | docs-only，免门禁 |

> 重复选择器热点（§1.4）不入清理批——规则 6 要求布局重构须有 UI review 证据，当前仅登记。
