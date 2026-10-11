# 深度 Review — App/Shell 编排层 + 引擎循环接线 + 浮窗 overlay 生态（2026-10-11）

范围：`src/renderer/src/App.tsx`（836 行）、`components/shellModules.ts` + `AppShell.tsx` + `domain/uiTheme.ts`（顶栏/WCO/titleBarTheme 主题链）、`hooks/useEngineLoop.ts`、`workers/previewEngineWorker.ts`、`engine/metricsCollector.ts`、`hooks/domains/`（9 个域 hook）、`domain/overlayDistribution.ts`、`components/{DisplayMap,VideoWallEditor,Preview3D,PreviewGrid,OverlayCanvas}.tsx`（overlay 渲染侧契约；窗口生命周期在 main 侧不在本次范围）、`tests/renderer/` 对应覆盖。
方法：只读代码 + grep 差距审计；未跑测试/构建。已知不重复：R233（快照遮罩）、R257（focus/fs）、R264（Profile 导入校验，main 侧已立案 ⏳——本报告 U5/U6/B4 为其补充渲染侧证据，见任务 D）、REVIEW-workspace-settings U2（overlay 开关 boolean 被忽略——本报告 U7 与其同根仅补充竞态）。「不引入路由库/store 库」「帧数据走 ref 不走 state」按约定执行，不作为缺陷。

## 1. 模块概览

| 模块 | 职责 | 数据流 |
|---|---|---|
| App.tsx | 纯编排：boot IPC 扇出、view 路由（`View` 联合 + keep-alive 门）、引擎循环接线（refs 桥）、shell 装配 | boot Promise.all(9 IPC) → profile/topology → 9 域 hook + view |
| shellModules/tabNavigation | MODULE_META/CARD_VIEWS 数据驱动 + view 联合单一事实源（顺序锁步测试） | `Record<CardView,…>` 编译期完备性检查 |
| useEngineLoop | tick 循环：自调度 timeout 链（fps 每 hop 重读）、R42/R43 消费门控、tickPending 背压、worker 帧回收 | engineConfigRef 桥 → worker postMessage（屏采样 buffer 转移零拷贝）→ onmessage 只写 ref → distributeFrameToOverlays |
| previewEngineWorker | 纯 TS 渲染 + 文本 mask 计算；previousFrame 像素缓冲复用 + 输出 buffer transfer | 帧往返均零拷贝（转出后 worker 侧 detach） |
| metricsCollector | 180 样本滚动窗口 avg/p95/last + droppedTicks 累计 | worker 帧 metrics → add()；Diagnostics 1Hz 读 snapshot |
| overlay 渲染侧 | overlayDistribution 三级分发（videoWall 面板→linked 子帧→广播）；OverlayCanvas 双通道消费（IPC LED 帧 + BroadcastChannel GPU 直渲 500ms 新鲜度门） | pushFrameToOverlays/ToDisplay（preload 白名单 61-74 行确认） |
| 主题链 | bootTheme 预绘 → App effect + prefers-color-scheme → applyTheme 单一收口 → html[data-theme] + setTitleBarTheme IPC（WCO 同色） | R224.3 单一 choke point |

## 2. 发现清单（21 条：缺陷 P1×2 / P2×4 / P3×10 + 断言成立×3 + ⚠️×1 + 盲区见 T）

### U — bug / 正确性（7）

| # | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|
| U1 | **P1** | `useEngineLoop.ts:187` + `App.tsx:642` + `Preview3D.tsx:112` | 3D 效果 + overlay 打开 + 主窗口**最小化或切走 workspace view** → overlay 冻结在最后一帧：rAF 停（Preview3D 唯一驱动）/WorkspaceView 条件卸载，而 tick 循环 `is3DEffect(activeLayer(...).kind)` 又旁路掉 worker 帧（CPU 引擎无 6 个 3D kind 分支，grep effects.ts 零命中，worker 无法兜底）；PRD R42.5 已记录 minimize 变体「记录在案未处理」，view 切换变体连 PRD 都未提 |
| U2 | P2 | `App.tsx:463` + `PreviewGrid.tsx:151-152` + `Preview3D.tsx:109` | hover 预览泄漏到物理屏：worker 路径有 `if (!previewOverride)` 防护（`useEngineLoop.ts:166`，R164.2 不变量「预览帧不出 App」），但 GPU 三条路径全部没有——handleFrame3D 无条件 distribute、EFFECT2D/EFFECT3D BroadcastChannel 广播含 previewLayer 的 gpuLayer → 用户悬停卡片，实体屏被未选效果刷屏 |
| U3 | P2 | `App.tsx:359-398` | boot `Promise.all`（9 个 IPC）无 `.catch`：任一 reject（profile 文件被杀软锁定等）→ 永久卡「RGBBox」boot 屏，无错误态无超时；boot 内 `saveProfileAs` 同样裸奔 |
| U4 | P3 | `useEngineLoop.ts:228,243-247` | worker `error` 监听器每次 effect 重跑（running 切换）重复添加且 cleanup 只移除 `message`；且 worker 出错后 `tickPending` 永不复位 → 循环死锁无自愈，预览冻结只能重启 |
| U5 | P3 | `WorkspaceView.tsx:891` + `useEngineLoop.ts:187` | 空图层场景 `activeLayer()` 返回 undefined：`eff.kind`（render 内）与 `activeLayer(...).kind`（tick 内）双双 TypeError——UI 有 `layers.length > 1` 删除守卫（WorkspaceView.tsx:446）但导入路径零校验直达，且 auto-save 400ms 后持久化 → **重启崩溃循环**；`onWorkerMessage:155` 同调用却带可选链，佐证漏防（R264 渲染侧补充证据） |
| U6 | P3 | `useEngineLoop.ts:239` | `Math.max(16, floor(1000/fps))` 只防高不防零：fps=0（导入 profile 无 clamp）→ 1000/0=Infinity → `setTimeout(Infinity)` 按 0 处理 → tick 链全速空转、droppedTicks 爆表 CPU spin；slider 限 15-60（WorkspaceView.tsx:1092）但导入不设防（R264 验收点建议纳入 fps clamp） |
| U7 | P3 | `useOverlayTopology.ts:35-44` | `handleToggleOverlay` 双击竞态（两次都见 not-included → 两次 openOverlay）+ `openOverlay/closeOverlay` reject 无 catch → unhandled rejection、按钮态不同步；boolean 返回值被忽略已由 REVIEW-workspace-settings U2 立项，本条补充竞态细节 |

### B — 行为/一致性断言（3 成立 + 1 告警）

| # | 结论 | 位置 | 证据 |
|---|---|---|---|
| B1 | ✅ R147 边界守住 | `App.tsx`（836 行） | 纯编排达成：boot/路由/接线/装配四件事，功能状态全在 9 域 hook + domain 纯函数 + view；重 view lazy + audio/video keep-alive 门；无回流 God 化迹象（对比拆出前 2976 行） |
| B2 | ✅ tick 全 ref 化成立 | `useEngineLoop.ts:54,249` | effect deps 仅 `[running, profileReady]`（boot 布尔），profile/automation/previewOverride 全走 engineConfigRef 桥，参数拖动零重建；帧路径零 setState（frameRef/ledColorsRef/metrics 直写） |
| B3 | ✅ 主题链单一收口 | `uiTheme.ts:38-49` | applyTheme 是唯一落点：bootTheme 预绘防闪 + App effect + prefers-color-scheme live 重解析 + setTitleBarTheme WCO 同步（preload:205 契约在）；overlay 窗口经可选链静默降级 |
| B4 | ⚠️ P3 | `useEngineLoop.ts:187` vs `WorkspaceView.tsx:891` vs `App.tsx:494-500` | 「当前帧由谁渲染」判据三处不同源：tick 循环用 `activeLayer()`（首个 enabled 层）、WorkspaceView 预览分支用 `previewLayer ?? activeLayer()`、gpuDirectLayer 用 `selectedLayer + solo`——今日恰好兼容，是 U1 的结构性根因，任何单点改动都可能与他处失配 |

### V — 数据展示（2）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| V1 | P2 | `App.tsx:320-323` + `metricsCollector.ts:34` | Dashboard fps 卡 = `min(round(1000/avgFrameMs),999)`，而 avgFrameMs 是 **roundTripMs（post→响应延迟）均值**——轻效果 3ms 延迟显示 333fps，与实际 tick 率（≤60）无关；正确应从 metrics.timestamp 差分算帧周期（worker 背压时二者才恰好接近）；`metricsCollector.test.ts:61` 只锁了均值语义本身 |
| V2 | P3 | `useEngineLoop.ts:169` + `DiagnosticsView.tsx:99` | `metrics.outputMs = 0` 硬编码，Diagnostics 照常渲染「output ms」行——恒 0 的指标行误导排查 |

### T — 测试盲区（3）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| T1 | **P1** | `tests/`（grep 零引用 useEngineLoop） | 引擎循环 hook **零直接测试**：R42/R43 消费门控、tickPending 背压、空场景补一帧、3D 旁路、previewOverride 跳过分发、fps 变更下 hop 生效——渲染层最关键的一层全靠 App.smoke（1 例）+ 人肉；U1/U4/U6 这类回归现有 164 个测试文件一个都不会红 |
| T2 | P2 | `tests/renderer/hooks/` | 9 个域 hook 零覆盖（grep 证：useOverlayTopology/useProfileManager/useSamplingDomain/useSettingsMirror/useShutdownTimer/useScheduleDomain/useAutomationDomain/useRandomizerDomain/useRecentEffects）；纯 domain 层（schedule/automation/randomizer）有测，hook 接线（overlay 竞态、auto-save debounce、localStorage 迁移）全裸 |
| T3 | P3 | `App.smoke.test.tsx`（1 例） | smoke 只测 boot+dashboard 渲染；keep-alive 门（videoVisited/audioVisited）、view 切换持久化端到端、theme→setTitleBarTheme 链路无断言（tabNavigation 7 例 + viewPersistence 4 例仅覆盖纯函数层；AppShell 7/ModuleRail 4/shellModules 3/DisplayMap 4/VideoWallEditor 9 例尚可） |

### X — 架构债 / 打磨（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| X1 | P3 | `App.tsx:267-271` 与 `304-308` | 同一段 R147 P2 注释粘贴两次（编排注释漂移的信号） |
| X2 | P3 | `metricsCollector.ts:9-14` | `add()` 每帧计算完整 snapshot（180 样本 map+sort+avg）返回值全被丢弃；消费方最快 1Hz 才读 |
| X3 | P3 | `previewEngineWorker.ts:75-90` | static 文本层 mask 每 tick 重算，无 (text,cols,rows,x,y,scale,weight) 签名缓存；textMaskMs 已计量——先看 Diagnostics 数据再决定是否值得缓存 |
| X4 | P3 | `ImagePaintEditor.tsx:103-104` + 每 tick `postMessage` | 全量 profile 每 tick structuredClone：image-paint 的 `imageDataList` 是嵌套数组像素网格，320 长边网格下多图场景每帧克隆 MB 级 → GC 压力（屏采样已 transfer，profile 未瘦身） |
| X5 | P3 | `App.tsx:277-282` | appliedToast 5s timer 无 unmount 清理（实际仅关窗场景，无害） |

## 3. 价值任务建议（过三关：① 真实用户可感知 ② 可验证 ③ 成本可控）

| # | 任务 | 三关判定 | 涉及 |
|---|---|---|---|
| A | **修 3D+overlay 停帧**：Preview3D 在文档不可见时降级 setTimeout 驱动（跳过本地 canvas 绘制，保留 readLEDs+EFFECT3D 广播+onFrame——R70.2 音频投屏同款解法）；或 workspace 卸载后保一个隐藏渲染器；同时按 B4 收敛「谁在渲染」判据到 engineConfigRef 单点 | ① 副屏投屏是核心卖点、3D 6 款是商业展示款，当前最小化必冻结 ② OverlayCanvas timingAcc + `--perf-selftest` 到达率测量现成可验收 ③ 改动集中 Preview3D/useEngineLoop 两文件（注意 CPU 引擎无 3D 分支，worker 兜底不可行） | U1, B4 |
| B | **hover 预览不出 App**：handleFrame3D 加 previewOverride guard（App 已有该 state）+ PreviewGrid/Preview3D 广播前判 gpuLayer 是否 previewLayer | ① 防止实体屏被悬停卡片刷屏（用户可感知的怪异行为）② 单测断言 distribute/广播未触发 ③ ~10 行 | U2 |
| C | **useEngineLoop 直接测试**：fake Worker + fake timers 覆盖 6 分支（消费门控/背压/空层补帧/3D 旁路/previewOverride 跳过分发/fps 变更生效），注入 U4/U6 变体验证会红 | ① 承载 R42→R164 十几个已修 bug 的防回归网，A 的安全网 ② vitest 纯 hook 可测（仓内已有 happy-dom 范式）③ 1 个测试文件 | T1 |
| D | **R264 验收点扩充**（搭已立案 ⏳ 顺风车）：坏形状 profile 的渲染侧两崩溃点（WorkspaceView:891 / useEngineLoop:187 可选链或前置守卫）+ auto-save 放大成的重启崩溃循环（boot 前校验/失败回默认）+ sampling.fps clamp 15-60 | ① 崩溃循环是真实灾难场景（手工编辑/损坏 JSON 一步触发）② 坏样本单测可写 ③ R264 已含 main 侧校验，边际成本低 | U5, U6 |
| E | **fps 显示语义修正**：MetricsCollector 增加 framePeriodMs（相邻 timestamp 差分，滚动中位），dashFps 改用 1000/中位周期 | ① 仪表盘核心卡片数据可信（现在轻效果虚高 5 倍+）② 单测直接断言 ③ 小 | V1 |
| F | **boot 容错**：Promise.allSettled + 逐项失败降级（topology 失败→单显示器假拓扑等）+ 错误横幅 | ① 杀软锁文件/权限异常不再白屏卡死 ② mock 单 reject 单测 ③ 小 | U3 |
| G | **打磨包**：worker error 自愈（error 事件复位 tickPending + 监听器移除）、output ms 行删除或实测、MetricsCollector.add 去 snapshot、重复注释清理、textMask/imageDataList 先用现有 metrics 量化再决定 | ① 各自微小但都是误导/浪费 ② 均可单测或已有计量 ③ 零散小改 | U4, V2, X1-X3 |

## 4. 优先级排序

**C ≥ A > B > D > E > F > G**

- C 先行/伴随 A：A 是唯一 P1 行为缺陷，但 C 是它的安全网且防未来回归（循环层历史上 bug 密度最高）；
- B 小成本高确定性（一处 guard 对齐已存在的不变量），排第三；
- D 搭 R264 已立案通道，边际成本最低的 P2 价值；
- E/F/G 按用户可感知度递减排入后续迭代。

---

*生成：2026-10-11 · 只读差距审计 · 未改任何产品代码 · 未跑测试/构建（并行代理避让）*


---

## 主审复核（2026-10-11，对码核实）

- **A（3D+overlay 停帧）**：✅ 机制真——`Preview3D.tsx:112-114` 纯 rAF 循环，最小化/遮挡即停（R70.2 同款问题的先例修复在别处存在）；3D 旁路 worker 帧不兜底成立。
- **C（useEngineLoop 零测试）**：✅ 属实——该循环消费门控/背压/override 应用全无直接测试（安全网价值高）。
- **B（hover 预览泄漏）**：✅ 实锤——`useEngineLoop.ts:124-126` 仅 worker 路径应用 previewOverride；EffectsView 的 GPU 渲染分支零 override 防护，悬停未选效果会刷到实体屏。
- 其余 P2/P3 未逐条复核，按报告立项、TDD 先行验证。
