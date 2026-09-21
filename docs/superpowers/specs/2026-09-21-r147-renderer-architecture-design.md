# R147 渲染层架构现代化设计 — App.tsx God Component 渐进式域拆分 + 性能专项

**日期**：2026-09-21
**分支**：`refactor/r147-renderer-arch`
**PRD 条款**：R147（PRD-0002 §3）
**用户目标**：「方便快速扩展，性能最佳」——痛点全选（UI 卡顿/掉帧、加载/启动/内存、未来扩展保障、可维护性为主）
**选定方案**：A 渐进式域拆分（否决 B 全局 store 重写、C 仅性能手术）

---

## 1. 现状诊断（2026-09-21 子代理深度分析）

### 1.1 规模

`src/renderer/src/App.tsx` **2976 行**：
- 模块级常量/纯函数 **~620 行**（1–622）：`PARAM_META`（79 参数元数据）、随机器调色板、计划时段、快捷维度选项、Ambient 预设、localStorage 解析器、**~190 行域逻辑纯函数**（自动化波形调制 / 随机器 / 快捷维度参数变换 / overlay 帧分发三路）——**零单测**
- `App()` 组件单体 **~2350 行**（623–2976）：**24 useState / 23 useRef / 42 useEffect / 43 useCallback / 9 setInterval**
- **workspace 视图内联 JSX ~840 行**（1882–2721）——唯一未拆的 view，闭包引用全部 state/callback，任何子块无法 memo

### 1.2 性能问题（按影响排序）

| # | 问题 | 根因 | 痛点映射 |
|---|------|------|---------|
| 1 | **音频开启时全 App 最高 60Hz 重渲染** | `useAudioAnalyzer.ts:183` 以 16ms `setAudioData` 挂在 App 上；顶栏电平条需要它，代价是整棵树（含 840 行 workspace JSX）全 diff | UI 卡顿/掉帧 |
| 2 | **拖 slider 时引擎 interval 反复 teardown/rebuild** | tick effect 依赖 `[profile, status.running, selectedLayerId, automation*]`，每次参数调节重建 interval + 重挂 listener | UI 卡顿 |
| 3 | **全部 view + three.js 饿加载进主 chunk** | 顶层直接 import MiniGames/AiLab/VideoStudio/AudioStudio/Preview3D(three.js)；启动到 dashboard 也要加载全部代码 | 启动/内存 |
| 4 | workspace 840 行 JSX 不可 memo | 全闭包耦合，非 prop drilling | 扩展保障 |

### 1.3 核心资产（拆分必须原样保持）

1. **帧通道全 ref 化**：`setInterval(tick) → worker.postMessage(transferable) → onWorkerMessage → frameRef/ledColorsRef（零 setState）→ distributeFrameToOverlays IPC`；`PreviewGrid` 自持 rAF 轮询 frameRef → WebGL。**每帧执行路径 React setState = 0**。
2. **两种已验证 view 集成模式**：AiLabView（0 props 自管理）/ AudioStudioView（keep-alive + `visible` prop）。
3. **骨架已就位**：AppShell（顶栏 chrome）/ ModuleRail + shellModules（视图注册表，编译期完整性检查）/ tabNavigation（纯函数，node 可测）/ DashboardView / SettingsView。
4. view 组件 props 面普遍已窄（除 workspace）：EffectsView 4、SettingsView 11、其余 0–3。

### 1.4 其他债务

14 处散装 localStorage useEffect；9 个分散 setInterval（schedule 60s / shutdown 1s / diag 1s / dashFps 1s / audio 16ms / 引擎 tick…）；`MODEL3D_VIEW_ENABLED=false` 的 ~130 行 model3d 死代码；App.tsx 零直接测试。

---

## 2. 目标架构

```text
App.tsx（<600 行，纯编排层：shell 装配 + view 路由分发 + 域 hook 组合）
  ├─ 域 hooks（自持 state + 副作用 + 持久化，renderer/src/hooks/domains/）
  │   ├─ useEngineLoop        引擎 tick + worker 接线 + metrics（帧通道 ref 化不变）
  │   ├─ useProfileManager    profile 槽位/导入导出/菜单/收藏
  │   ├─ useOverlayTopology   显示器拓扑 + overlay 配置/推流编排
  │   ├─ useAudioDomain       音频设备/开关（分析数据走 ref 通道）
  │   ├─ useSchedule / useAutomation / useRandomizer / useShutdownTimer
  │   └─ usePersistedState    统一 14 处 localStorage（单一机制）
  ├─ domain/（纯函数模块，P1 外迁 + 首次单测）
  │   paramMeta / randomizer / automation / schedule / profileUtils /
  │   overlayDistribution / quickDimensions / ambientPresets
  ├─ components/workspace/（P3 拆分）
  │   WorkspaceView + PreviewStage / SamplingPanel / VideoWallPanel /
  │   SchedulePanel / RandomizerPanel / QuickDimensionsPanel …（props 窄化 + memo）
  └─ view 级 lazy（P4）：MiniGames / AiLab / VideoStudio / AudioStudio /
      Architecture / Preview3D（three.js）→ 按需 chunk
```

### 三条铁律（每阶段验收的前提）

1. **帧数据走 ref 不走 state**——worker→frameRef→rAF 管线零变化；
2. **`View` union 不变、不引入路由库/store 库**——统一到已验证 view 模式；
3. **每阶段独立验收独立提交**：`yarn typecheck` + 全量 `yarn test` + `yarn build` 绿 + CDP E2E 26/26 零回归，可回滚。

---

## 3. 五阶段路线图

### P0 基线（保护网）

- App 最小 mount 冒烟测试（`tests/renderer/App.smoke.test.tsx`，happy-dom，mock `window.rgbbox` IPC 桥）——App.tsx 首次获得直接测试；
- 基线入档（本文档附录 A）：App.tsx 行数/hooks 计数、build 产物主 chunk 体积、音频 setState 路径代码级证据。

### P1 纯函数外迁（零风险，+可测性）

- 模块级 620 行 → `src/renderer/src/domain/` 8 模块（目录新设，engine 无关的 renderer 域逻辑）；
- 迁移原则：**原样搬运**（不改逻辑不改签名），App.tsx 改 import；类型跨模块共享走 `shared/types` 或 domain 内部导出；
- **~190 行域逻辑首次配单测**：automation 波形调制（sine/triangle/pulse × 4 参数）、randomizer 四模式参数生成 + 调色板、quickDimensions 四维参数变换、overlayDistribution 三路分发（视频墙裁剪/联屏/广播）、schedule 时段解析、paramMeta 完整性（每个 PARAM_META key ↔ engine 参数一致）；目标 ~30 用例。

### P2 性能核心（音频 ref 通道 + tick 稳定化）

**音频通道改造**：
- `useAudioAnalyzer` 内部保留分析循环，但暴露改为：`audioRef`（App/tick 消费的连续量，已有消费点）+ `subscribeAudioLevels(cb)` 细粒度订阅（或电平条组件自持 rAF 从 hook 暴露的 ref 拉取）；
- 删除 16ms `setAudioData` 对 App 的 setState → **App 层音频重渲染 60Hz→0**；
- 顶栏电平条（AppShell）与 AudioStudioView 可视化改为订阅/拉取模式；
- `useVisionInput` 等其他高频 hook 排查同类问题。

**tick 稳定化**：
- interval 只建一次（`[]` 依赖），`profile / selectedLayerId / automation` 等配置经 ref 桥进入 tick 闭包（复用既有 view/visibility ref 桥模式，App.tsx:1191–1200）；
- worker 重建等真正需要 teardown 的场景（运行开关）单独 effect 承载；
- 验收断言：mock 计数 interval 创建次数（挂载后拖参数 → interval 不重建）；App 渲染计数（音频数据流动时 App 不重渲染）。

### P3 workspace 拆分 + 域 hooks（结构性）

- 840 行内联 JSX → `components/workspace/`：按面板域拆 6–8 个组件（预览舞台/采样与网格/视频墙/计划/自动化/随机器/快捷维度/Ambient），**props 窄化到各自域**（禁整包 state 下传），`memo` 生效；
- App 24 state 归位域 hooks；跨域协作经 App 编排（域 hook 返回窄接口：state + actions）；
- workspace 内部状态（如 samplingCollapsed/gridAdvanced/previewFullscreen）随面板组件内聚；
- 验收：App.tsx < 600 行；E2E 26/26 零回归；既有 25 个组件测试零修改通过（props 接口未破坏外部 view）。

### P4 启动优化（view lazy）

- `MiniGamesView / AiLabView / VideoStudioView / AudioStudioView / ArchitectureView / Preview3D`（+ 其 three.js 依赖链）→ `React.lazy` + `Suspense`（fallback 复用现有 loading 骨架样式）；
- **keep-alive 兼容**：keep-alive wrapper 在首次挂载后保持实例——lazy 只影响首载 chunk，`visible` 语义不变；AudioStudio/VideoStudio 的状态保持断言（E2E 已有）覆盖；
- 验收：build 后主 chunk 与按需 chunk 体积对比入档（three.js 预期移出主 chunk）；首屏 dashboard 仅加载核心 + dashboard 模块。

### P5 收尾收敛

- `usePersistedState<T>(key, initial)` 统一 14 处 localStorage effect（语义不变：防抖/JSON 解析容错统一）；
- model3d 死代码：外迁独立文件保留编译期开关（`MODEL3D_VIEW_ENABLED=false` 不变），App.tsx 移除 ~130 行；
- 定时器归属：9 个 interval 各归其域 hook，App 不再持有裸 interval；
- **CLAUDE.md 修订**：「Renderer 是单 God Component」条款改为「App.tsx 为编排层（<600 行），view 按既有两种模式接入，`View` union + 无路由层原则不变」；
- R147 状态 ✅ 附证据；合并回 main。

---

## 4. 测试与验收策略

| 层 | 手段 |
|----|------|
| 单元 | P1 域逻辑 ~30 用例（新）；P2 渲染计数/interval 计数断言（新）；既有 110 文件全量每阶段跑 |
| 组件 | 既有 25 个 view 组件测试作为 props 接口回归网（P3 要求零修改通过） |
| 冒烟 | P0 App mount 冒烟（新） |
| E2E | CDP E2E 26/26 每阶段跑（dist:dir 后） |
| 产物 | P4 build 体积对比入档 |

每阶段一个 commit：`[PRD-0002] refactor: R147 P<N> <subject>`。

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| workspace 拆分闭包依赖漏接 | TS 编译器 + 组件测试 + E2E 三层兜底；P3 内部再按面板小步提交 |
| 音频订阅模式破坏电平条/可视化 | 双消费点（AppShell 电平条 / AudioStudioView）在 P2 中同步改造并补测试 |
| lazy × keep-alive 状态丢失 | keep-alive wrapper 语义不变（lazy 仅影响加载），E2E 状态保持断言 |
| 域 hook 拆分引入双写/漏写 localStorage | P5 统一 usePersistedState 前，P3 迁移保持 effect 原样搬运，逐处 grep 校验 key |
| 回归范围大 | 五阶段独立提交可回滚；铁律 3 门禁 |

## 6. Non-Goals

- 不引入路由库 / Redux / zustand 等状态库；
- 不改 `View` union 语义、不加新 view；
- 不动 IPC 通道 / preload / main / engine 行为；
- 不做视觉/UI 改版（UI 美化是独立后续专项）；
- 不重构 `src/main/index.ts`（P0/P1 集中点，与 renderer 无关）。

---

## 附录 A：基线（P0 时填写）

- App.tsx：2976 行 / 24 useState / 23 useRef / 42 useEffect / 43 useCallback / 9 setInterval（2026-09-21 测量）
- 主 chunk 体积：P0 填写（`yarn build` 后 out/renderer/assets/index-*.js）
- 音频路径证据：`useAudioAnalyzer.ts:183`（16ms setInterval → setAudioData → App 全树重渲染）
