# CLAUDE.md — Claude Code 启动规则

> 完整项目目录 + 所有功能 R-N：[`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md)
> 流程规则：[`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)
> 项目概览（双语）：[`README.md`](./README.md)

## 强制约束（违反任何一条都属于「瞎改」）

1. **单 PRD 模型**：所有需求、bug、重构都**追加 R-N 条款**到 `PRD-0002` 对应章节。**禁止开新 PRD。**
2. **代码改动前必须有 R-N**：R-N 必须有 ID、章节定位、验收点，状态 ⏳ 或 🔄。
3. **跳过白名单极小**：见 `docs/AI_WORKFLOW.md §2`；任何「行为变更」必须先追加 R-N。
4. **提交标题格式**：`[PRD-0002] <type>: <subject>`。
5. **完成时自检**：实施完必须把对应 R-N 状态改为 ✅ 并附证据。

## 启动时必做的检查

- 读 [`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md)（如未读过）；
- 看 `docs/prd/README.md` 索引，确认当前任务有匹配 R-N；
- 若没有匹配 R-N → 询问用户"是否要在 PRD-0002 追加 R-N？"，**不要直接动手**。

## Auto 模式（可选）

用户可说 `auto` / `信任模式` / `auto L0` / `auto L1` 触发 auto 模式，让 AI 自主跑完 R-N → 实施 → 自检全流程。详见 [`docs/AI_WORKFLOW.md §8`](./docs/AI_WORKFLOW.md) 与 `docs/prd/PRD-0002-rgbbox-project-catalog.md` **R10**。

L0 = 自动执行（无需审批）；L1 = 一次审批跑完；L2 = 不在 auto 范围，走四步。

## 状态符号 / 跳过规则 / 反例 / 提交格式

详见 [`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)。

## 与项目相关的非工作流提示

- 项目类型：Electron + Vite + React + TypeScript 桌面 RGB 灯效客户端；
- 不要修改 `package.json` 的 scripts 段（影响构建路径），除非本次 R-N 专门改了它；
- `src/main/index.ts` 与 `src/preload/index.ts` 是已审过的 P0/P1 问题集中点，**未通过 R-N 流程不要"顺手"修**。
- 如果你用 CC Switch 给 Claude Code 切到 GitHub Copilot 供应商，必须在**同一个已经激活的终端**里启动 Claude Code；新开终端通常不会继承 CC Switch 的会话上下文，出现 `Not logged in · Please run /login` 时，先重新激活 CC Switch，再启动 Claude Code。

## 命令速查（开发 / 构建 / 测试）

> 所有命令均通过 `package.json` scripts 暴露；不要直接拼 `electron-vite` / `tsc` / `vitest` 命令。

```bash
yarn dev            # electron-vite dev：主进程 + preload + renderer 热更新
yarn typecheck      # tsc --noEmit 跑 node + web 两套 tsconfig
yarn build          # typecheck && electron-vite build（产出 out/）
yarn preview        # electron-vite preview
yarn test           # vitest run（全量单次跑）
yarn test:watch     # vitest 监听模式
yarn test:coverage  # vitest run --coverage（v8，覆盖率门槛见 PRD R11.4）
yarn dist:win       # patch 版本号 + dist-clean + build + electron-builder --win（zip，x64）
yarn dist:mac       # patch 版本号 + dist-clean + build + electron-builder --mac（dmg，x64）
yarn dist:dir       # patch 版本号 + dist-clean + build + electron-builder --dir（仅出可运行目录，便于本地验证）
yarn download-models # 拉取 5 个高斯泼溅模型到 renderer assets
```

**跑单个测试 / 测试集：**

```bash
yarn test tests/engine/videoWall.test.ts                    # 单文件
yarn test -t "bezel compensation"                          # 按用例名过滤（vitest -t）
yarn vitest run tests/renderer/components/VideoWallEditor.test.tsx  # 直接调底层也行
```

**模型资产**（`build/icon.ico/png`、`*.splat` / `*.ksplat` / `*.spz` / `*.ply`）由 `electron-builder.files` 排除出 release 包，仅本地 dev / 调试用。

## 高层架构

```text
src/main          Electron 主进程：IPC handler、显示器拓扑、Profile 持久化、
                  屏幕捕获 provider 抽象（desktopCapturer + DXGI/ScreenCaptureKit stub）、
                  浮窗（overlay）生命周期、media:// 自定义协议
src/preload       contextIsolation=true + 白名单 API，单一根 window.rgbbox
                  暴露；事件订阅统一返回反注册函数
src/shared        跨进程复用的纯数据：类型 / IPC 通道名常量 / 文件 logger /
                  模型清单；is3DEffect() 等类型守卫在此
src/engine        纯 TS 特效引擎（Node 不可用也无 DOM 依赖）：
                  effects.ts（49 CPU 效果 switch）、previewEngine.ts（zone+display
                  slot mask、smoothing）、color.ts、textRenderer.ts（5×7 bitmap）、
                  videoWall.ts（矩阵布局+bezel+旋转+fit 数学）、videoWallFrame.ts
                  （从虚拟画布采样到面板帧）；可独立编译到 Web/WASM
src/renderer/src  React UI 与 3D 渲染：
  ├ App.tsx       God Component（路径分 9 个 view，含 worker 引擎循环接线）
  ├ components/   各 view 实现 + 共享 UI（EffectsView / DisplayMap / VideoWallEditor 等）
  ├ gl/           WebGL 预览 + 6 个 GPU 3D 效果的 shader 渲染
  ├ workers/      previewEngineWorker.ts（zero-copy buffer + previousFrame 复用）
  ├ engine/       metricsCollector.ts（180-frame 滚动窗口 fps/p95）
  ├ hooks/        useAudioAnalyzer / useModelStore 等
  ├ 3d/           Three.js + @mkkellogg/gaussian-splats-3d + LEDMapper
  └ i18n/         zh + en
tests/            vitest（默认 environment: node；components/3d 走 happy-dom；
                  gl 走 node + headless-gl）；覆盖率门槛见 PRD R11.4
docs/index.html   GitHub Pages 部署的产品展示页（双语；CSS-only 效果预览）
```

**关键架构约定：**

- **Renderer ↔ Main 通过 preload 桥**：所有 Node 能力只走 `window.rgbbox.*` 白名单；不允许渲染层直连 `electron` / `ipcRenderer`（R5.1）。
- **Engine 是纯 TS**：不在 engine 层引入 DOM / WebGL / Electron 依赖，方便跨平台复用与单测。
- **IPC 通道名统一在 `src/shared/ipc.ts`**：用 `as const` + `IpcChannel` 联合类型，避免字符串散落；新通道必须 PR-1 加 R-N。
- **主进程入口单文件**（`src/main/index.ts`）承载了 IPC、捕获、浮窗、profile、protocol 等多个职责，是历史 P0/P1 集中点——不要"顺手"重构。
- **Renderer 是单 God Component**（`App.tsx`）：当前架构是历史约定，新 view 仍以 `type View` 联合的成员追加，不要引入额外路由层。

## 提交流程（落地版）

- **单 PRD 模型**：所有需求、bug、重构追加 R-N 到 `PRD-0002` 对应章节（R-N 列表见 `docs/prd/README.md` 索引 + PRD §R0–§R22）。**禁止开新 PRD。**
- **提交标题**：`[PRD-0002] <type>: <subject>`（`type` 沿用 Conventional Commits）。
- **完整证据**：实施完把 R-N 状态改 ✅ 并附**命令输出 / 文件路径 / 测试结果**到 PRD §6 验收清单。
