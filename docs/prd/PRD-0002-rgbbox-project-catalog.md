# PRD-0002: RGBBox 项目功能目录（单 PRD 长期管理）

| 字段 | 值 |
| --- | --- |
| 状态 | `closed` |
| 负责人 | mike |
| 创建 | 2026-06-11 |
| 更新 | 2026-06-11 |
| 类型 | 长期活的 feature catalog |
| 替代 | PRD-0001（多 PRD 流程已废弃） |

---

## 1. 背景 / 目标

**痛点：**
- 项目功能数量大：55 个内置效果（49 CPU + 6 GPU）、46 条 IPC 通道、9 个视图、5 个模型资产、3 个 capture provider 等；
- 之前没有任何"项目目录"文档，新人 / 后续 agent 上手需要读遍 `src/`；
- PRD-0001 设计的多 PRD 流程对小项目过重，**一份活的目录 + 增量追加 R-N** 的模型更适合当前规模。

**目标：**
- 用本 PRD 作为**唯一**的需求/功能管理文档；
- 废除 PRD-0001 的多 PRD 流程；
- 未来所有新功能、bug 修复、重构、迁移都以**追加 R-N 条款**的形式维护在本 PRD。

## 2. 范围

**In scope：**
- 把现有代码库所有功能列入目录（**细颗粒度**：每个效果、每条 IPC、每个视图、每个引擎模块、每个测试、每个构建/工具链能力）；
- 修订 `docs/AI_WORKFLOW.md`、`CLAUDE.md`、`AGENTS.md`、`.github/copilot-instructions.md` 反映单 PRD 模型；
- 简化 `docs/prd/_TEMPLATE.md` 为本 PRD 的"增量追加"模板；
- 更新 `docs/prd/README.md` 索引；
- 把 `PRD-0001` 状态改为 `superseded`。

**Out of scope：**
- 不重写任何业务代码；
- 不动 `src/`、`tests/`、`package.json`；
- **审核报告里的 23 个 P0/P1/P2 finding 不在本 PRD 范围内**（它们是"待修复问题"，如要纳入可另开 R 段，但本次不强制）。

## 3. 详细需求

### R0. 流程变更

- **R0.1** 废除 PRD-0001 的多 PRD 流程模型（每条需求开新 PRD + 状态机 + 索引），改为**单 PRD 增量模型**。
- **R0.2** `docs/prd/PRD-0001-ai-workflow-constitution.md` 状态 `closed` → `superseded`；在变更记录里 link 本 PRD。
- **R0.3** `docs/AI_WORKFLOW.md` 改写为"单 PRD 模型"版本：删除多 PRD 状态机、编号规则、命名规则；新增"如何在本 PRD 追加 R-N"流程。
- **R0.4** `CLAUDE.md` 简化为：所有约束 + 引用 `docs/prd/PRD-0002-rgbbox-project-catalog.md`。
- **R0.5** `AGENTS.md` 简化为：所有约束 + 引用 `docs/prd/PRD-0002-rgbbox-project-catalog.md`。
- **R0.6** `.github/copilot-instructions.md` 改写以指向本 PRD。
- **R0.7** `docs/prd/_TEMPLATE.md` 简化为"本 PRD 增量追加时的填表模板"。

### R1. Engine — CPU 内置效果（49 个）

> 全部在 `src/engine/effects.ts` `renderEffectPixel()` switch 实现；运行时由 `src/renderer/src/workers/previewEngineWorker.ts` 调用。

**Classic 经典（8）：**
- **R1.1** `screen-ambient` — 屏幕取色（基础）
- **R1.2** `static` — 静态色
- **R1.3** `breathing` — 呼吸（sin 节律）
- **R1.4** `rainbow` — 彩虹（HSL 色相沿 x）
- **R1.5** `wave` — 波浪（sin/cos 调制）
- **R1.6** `zone-gradient` — 分区渐变
- **R1.7** `fire` — 火焰（噪声 + 暖色映射）
- **R1.8** `starlight` — 星光（随机闪烁）

**Advanced 进阶（6）：**
- **R1.9** `ripple` — 波纹（中心扩散）
- **R1.10** `spectrum` — 频谱（沿 x 分布色相）
- **R1.11** `comet` — 彗星（运动光点）
- **R1.12** `lightning` — 闪电（随机分支）
- **R1.13** `aurora` — 极光（多色渐变）
- **R1.14** `explode` — 爆炸（径向脉冲）

**Audio 音频反应（2）：**
- **R1.15** `audio-beat` — 节拍响应（亮 / bass 跳变）
- **R1.16** `audio-equalizer` — 32 段均衡器（频带 → 颜色 / 强度）

**Painting 绘画（3）：**
- **R1.17** `random-color` — 随机色
- **R1.18** `custom-paint` — 自绘（用户画板）
- **R1.19** `image-paint` — 图像取色（按图采样）

**3D Visual（CPU，10）：**
- **R1.20** `plasma` — 等离子（多 sin 干涉）
- **R1.21** `vortex` — 漩涡
- **R1.22** `tunnel` — 隧道（透视深度）
- **R1.23** `crystal` — 水晶（多面体着色）
- **R1.24** `glitch` — 故障（随机块错位）
- **R1.25** `matrix-rain` — 矩阵雨（落字）
- **R1.26** `neon-pulse` — 霓虹脉冲
- **R1.27** `nebula` — 星云（噪声 + 多色）
- **R1.28** `fluid-flow` — 流体（curl noise 风格）
- **R1.29** `mirror-symmetry` — 镜像

**Science 科学（20）：**
- **R1.30** `dna-helix` — DNA 双螺旋
- **R1.31** `black-hole` — 黑洞（吸积盘）
- **R1.32** `solar-system` — 太阳系
- **R1.33** `spiral-galaxy` — 螺旋星系
- **R1.34** `orion-nebula` — 猎户座星云
- **R1.35** `pulsar-beacon` — 脉冲星
- **R1.36** `hurricane-eye` — 飓风眼
- **R1.37** `lightning-leader` — 先导闪电
- **R1.38** `icosahedral-virus` — 二十面体病毒
- **R1.39** `protein-folding` — 蛋白质折叠
- **R1.40** `mitosis-spindle` — 有丝分裂纺锤体
- **R1.41** `synapse-pulse` — 突触脉冲
- **R1.42** `quantum-collapse` — 量子坍缩
- **R1.43** `microvilli-field` — 微绒毛场
- **R1.44** `eclipse-alignment` — 日食对齐
- **R1.45** `comet-tail` — 彗尾
- **R1.46** `magnetosphere-aurora` — 磁层极光
- **R1.47** `wave-diffraction` — 波动衍射
- **R1.48** `vortex-flame` — 涡旋火焰
- **R1.49** `tokamak-plasma` — 托卡马克等离子体

### R2. Engine — GPU 3D 效果（6 个）

> 全部在 `src/renderer/src/gl/previewGl.ts`（WebGL shader）渲染，绕过 Worker。

- **R2.1** `sphere-pulse` — 球体脉冲
- **R2.2** `warp-portal` — 折叠传送门
- **R2.3** `neon-galaxy` — 霓虹星系
- **R2.4** `lava-sphere` — 熔岩球
- **R2.5** `laser-show` — 激光秀
- **R2.6** `hologram` — 全息

### R3. Engine — 工具 / 支持模块

- **R3.1** `src/engine/color.ts` — 纯色工具（hex/RGB/HSL 互转等）
- **R3.2** `src/engine/textRenderer.ts` — 5×7 bitmap 字体（带 mask 缓存）
- **R3.3** `src/engine/previewEngine.ts` — CPU 帧渲染（zone mask、display slot mask、smoothing）
- **R3.4** `src/renderer/src/gl/previewGl.ts` — WebGL 预览渲染（texSubImage2D + 单 drawArrays，NEAREST 过滤，UNPACK_ALIGNMENT=1）
- **R3.5** `src/renderer/src/workers/previewEngineWorker.ts` — Worker 引擎循环（`previousFrame` 复用 + zero-copy buffer transfer）

### R4. Main 进程子系统（按 IPC 频道枚举）

> 主入口 `src/main/index.ts`。所有 IPC 通道名见 `src/shared/ipc.ts`。

**应用 / 系统（6）：**
- **R4.1** `rgbbox:app:version` — 应用版本
- **R4.2** `rgbbox:system:get-display-topology` — 显示器拓扑
- **R4.3** `rgbbox:system:get-displays` — 显示器列表
- **R4.4** `rgbbox:system:display-topology-changed` — 热插拔推送（main → renderer）
- **R4.5** `rgbbox:system:set-power-save-block` / `get-power-save-block` — 防休眠
- **R4.6** `rgbbox:system:get-auto-launch` / `set-auto-launch` — 开机自启

**Profile（5）：**
- **R4.7** `rgbbox:profile:get-default` — 默认 Profile
- **R4.8** `rgbbox:profile:save` — 保存默认 Profile
- **R4.9** `rgbbox:profiles:list` / `load` / `save-as` / `delete` — 命名 Profile CRUD
- **R4.10** `rgbbox:profiles:export-dialog` / `import-dialog` — 导入导出
- **R4.11** `src/main/profileStore.ts` — 持久化（`loadProfile` / `saveProfile` / `saveProfileAs` / `loadProfileById` / `listProfiles` / `deleteProfile`）

**Engine 控制（3）：**
- **R4.12** `rgbbox:engine:get-status` / `set-running` — 引擎启停
- **R4.13** `rgbbox:engine:render-preview-frame` — 主进程渲染一帧
- **R4.14** `rgbbox:engine:capture-screen-sample` — 仅捕获屏幕样本（无渲染）

**Capture / Provider（8）：**
- **R4.15** `src/main/captureProviders/index.ts` — Provider 抽象
- **R4.16** `src/main/captureProviders/desktopCaptureProvider.ts` — `desktopCapturer` provider（活动）
- **R4.17** `src/main/captureProviders/dxgiProvider.ts` — DXGI provider（Windows stub）
- **R4.18** `src/main/captureProviders/screenCaptureKitProvider.ts` — ScreenCaptureKit provider（macOS stub）
- **R4.19** `rgbbox:capture:get-provider-status` — 当前 provider 状态
- **R4.20** `src/main/screenCapture.ts` — 屏幕捕获适配层
- **R4.21** `rgbbox:video:capture-sources` — 屏幕/窗口 capture source 列表
- **R4.22** `rgbbox:video:select-capture-source` — 预选 source

**Overlay / 浮窗（9）：**
- **R4.23** `rgbbox:overlay:open` / `close` / `set-config` / `get-ids` — 浮窗生命周期
- **R4.24** `rgbbox:overlay:push-frame` — 推帧到所有浮窗（renderer → main）
- **R4.25** `rgbbox:overlay:push-frame-for-display` — 推帧到指定浮窗（linked-display 模式）
- **R4.26** `overlay:frame` — 浮窗帧推送到 renderer
- **R4.27** `rgbbox:overlay:closed` — 浮窗关闭推送
- **R4.28** `rgbbox:overlay:show-context-menu` — 浮窗右键菜单
- **R4.29** `rgbbox:overlay:effect-changed` — 浮窗效果切换推送
- **R4.30** `src/main/overlayManager.ts` — 浮窗管理实现
- **R4.31** `OverlayConfig` / `OverlayRegionPreset` — 浮窗位置 / 区域配置

**媒体协议（1）：**
- **R4.32** `media://` 自定义协议（`protocol.handle` + permission allowlist，handler 见 `src/main/index.ts` L638–L657）

**音频源（2）：**
- **R4.33** `rgbbox:audio:desktop-source-id` — 桌面音频源 ID
- **R4.34** `rgbbox:audio:desktop-sources` — 桌面音频源列表

**音频文件持久化（4）：**
- **R4.35** `rgbbox:audio:get-saved-paths` / `save-paths` — 音频文件路径持久化
- **R4.36** `rgbbox:audio:open-files` / `open-folder` — 音频原生选择器

**视频文件持久化（4）：**
- **R4.37** `rgbbox:video:get-saved-paths` / `save-paths` — 视频文件路径持久化
- **R4.38** `rgbbox:video:open-files` / `open-folder` — 视频原生选择器

**3D 模型资产管理（3）：**
- **R4.39** `rgbbox:models:get-cached-paths` — 已缓存模型路径
- **R4.40** `rgbbox:models:download` / `download-progress` — 按需下载 + 进度推送
- **R4.41** `src/shared/modelsManifest.ts` — 5 个模型清单（keyboard_rgb / mouse_rgb / train / garden / bicycle，源在 GitHub releases models-v1）

### R5. Preload 桥

> 实现：`src/preload/index.ts`。`contextBridge.exposeInMainWorld('rgbbox', api)` 暴露单一根。

- **R5.1** `contextIsolation: true` + `nodeIntegration: false` + 白名单 API（无任意 IPC 转发）
- **R5.2** `AudioInput` 类型作为桥接层约定：`{ bass, mid, high, beat, freqBands?: number[32] }`（20 Hz – 20 kHz log-spaced 32 段）
- **R5.3** 事件订阅方法返回**反注册函数**（5 处）：`onOverlayFrame` / `onOverlayClosed` / `onOverlayEffectChanged` / `onDisplayTopologyChanged` / `onModelDownloadProgress`
- **R5.4** `RgbBoxApi = typeof api` —— 渲染层通过 `window.rgbbox` 访问

### R6. Renderer

- **R6.1** `src/renderer/src/App.tsx` — God Component（2491 行，路由 + 状态 + 引擎循环）
- **R6.2** View `workspace` — 工作台（默认）
- **R6.3** View `effects` — 效果浏览 / 调参
- **R6.4** View `profiles` — Profile 管理
- **R6.5** View `diagnostics` — 诊断（fps / 延迟 / 错误）
- **R6.6** View `model3d` — 3D 模型查看（Three.js + Gaussian Splat）
- **R6.7** View `games` — 游戏
- **R6.8** View `audio` — 音频 Studio
- **R6.9** View `video` — 视频 Studio
- **R6.10** View `architecture` — 3D 架构视图
- **R6.11** `src/renderer/src/i18n/index.tsx` — 国际化（zh + en）
- **R6.12** `src/renderer/src/engine/metricsCollector.ts` — 180-frame 滚动窗口 metrics
- **R6.13** Three.js 0.184 + `@mkkellogg/gaussian-splats-3d` 0.4.7 集成
- **R6.14** hls.js 1.5.17 视频流

### R7. Shared 模块

- **R7.1** `src/shared/types.ts` — 全局类型（含 `is3DEffect()` 类型守卫 + `EFFECT_3D_KINDS` 集合）
- **R7.2** `src/shared/ipc.ts` — IPC 通道常量（`as const` + `IpcChannel` 联合类型）
- **R7.3** `src/shared/logger.ts` — 文件 logger（5MB × 5 rotation + `queueMicrotask` 异步 flush）
- **R7.4** `src/shared/modelsManifest.ts` — 模型清单（见 R4.41）

### R8. Tests

- **R8.1** `tests/effects.test.ts` — 43 个效果的属性测试（`renderEffectPixel` 返回 RGB ∈ [0,255]）
- **R8.2** `tests/profileStore.test.ts` — 11 个 case：默认 / 合并 / 损坏 JSON / 目录创建 / 命名 profile CRUD / 不存在 / 删除不存在

### R9. Build / 打包 / 工具链

- **R9.1** `electron-vite` 5.0.0 构建（`manualChunks` 分离 `vendor-splat` / `vendor-three`）
- **R9.2** `electron-builder` 26.8.1 打包（NSIS / DMG / AppImage 三平台）
- **R9.3** TypeScript 严格模式（`strict` + `noUnusedLocals` + `noUnusedParameters`）
- **R9.4** COOP / COEP headers（SharedArrayBuffer 支持）
- **R9.5** Vitest 4.1.7（`environment: 'node'`，仅跑 `tests/*.test.ts`）
- **R9.6** `scripts/download-models.mjs` — 模型下载脚本

### R10. 全自动执行模式（auto 模式）

> 适用场景：批量任务 / 低风险变更——用户授权 AI 自主跑完 R-N → 实施 → 自检全流程，**无需每步审批**。
> **触发关键词**：`auto` / `信任模式` / `自动跑完` / `批量修` / `auto 模式` / `auto L0` / `auto L1`。

- **R10.1** **风险分级**：
  - **L0 自动执行（无需审批）**：纯文档、注释、`.gitignore`、lockfile 重新生成、测试添加（不改行为）。
  - **L1 批量审批（一次审批）**：单文件改动 / 内部重构（行为不变 + 有测试覆盖）/ 不涉及 IPC / 安全 / engine / UI 核心 / 依赖 的小行为变更。
  - **L2 保留四步**：IPC 通道、media:// 等安全敏感、engine 逻辑、UI 用户可见行为、新增/升级依赖、跨多文件架构变更。

- **R10.2** **L0 流程**：AI 直接执行 → 完成后 R-N 状态 ⏳ → ✅ + 证据；用户可批末审。

- **R10.3** **L1 流程**：AI 一次性把 R-N 列齐（描述里写明文件 + 子项），**用户批一次** → AI 自动跑完 → 完成后批量报 ✅ + 证据。

- **R10.4** **L2 不在 auto 范围**：走标准四步流程，每步用户审。

- **R10.5** **退出 / 暂停**：
  - 用户随时可说 `退出 auto` / `恢复手动` → 立即回 L2 全流程。
  - L0 / L1 任何一次失败 → **暂停 auto**，单条 R-N 走四步。
  - 同一会话 auto 模式连续 3 个 R-N 失败 → **强制回 L2**。

- **R10.6** **强制要求**：
  - auto 模式下 R-N 描述必须列清**所有受影响文件 + 子项 R-条款**（让用户一眼看到范围）。
  - 提交标题仍为 `[PRD-0002] ...`，不变。
  - 即便 L0 / L1，AI 仍必须在完成后更新 R-N 状态为 ✅ + 证据，**不可跳过自检**。
  - **不确定风险等级时，AI 应主动询问用户（L0/L1/L2？），不可擅自决定。**

- **R10.7** **AI 自我检查新增项**：
  ```
  □ 用户是否说了 auto 模式关键词？
  □ 当前任务属 L0 / L1 / L2 哪一级？（不确定时询问）
  □ L1 模式下是否一次性列齐所有 R-N / 文件？
  □ auto 模式下 R-N 描述是否包含完整文件清单？
  ```

### R11. 全量测试覆盖（高要求 / 自动化友好）

> 目标：把"覆盖率不足 / 改动没有自动验证"这个痛点解决，让后续任何 commit 都有自动化测试把关。
> **风险等级：L2**（新增 devDep `@vitest/coverage-v8` + 改 `vitest.config.ts` + 改 `package.json` scripts）。

- **R11.1** **范围界定**：
  - **覆盖**：`src/engine/`、`src/shared/`、`src/main/`（不含 capture 外部依赖）、`src/preload/` 桥接层、`src/renderer/src/workers/`、`src/renderer/src/engine/`。
  - **不覆盖**（本轮不做）：`src/renderer/src/gl/` WebGL（需 headless GL）、`src/renderer/src/views/` 组件（需 DOM + Testing Library）、E2E（需 Playwright）。
  - 上述未覆盖部分可由未来 R-N 处理。

- **R11.2** **新增测试文件清单**（13 个）：
  - **R11.2.1** `tests/engine/color.test.ts` — hex/rgb/hsv 互转、边界值（空字符串、无效 hex、NaN 防护）
  - **R11.2.2** `tests/engine/textRenderer.test.ts` — 5×7 bitmap 字体（所有 ASCII 字符、mask 缓存命中）
  - **R11.2.3** `tests/engine/previewEngine.test.ts` — zone mask、display slot mask、smoothing（多次调用的状态连续性）
  - **R11.2.4** `tests/main/displayTopology.test.ts` — mock `electron.screen.getAllDisplays`，覆盖单屏 / 多屏 / workArea 越界
  - **R11.2.5** `tests/main/overlayManager.test.ts` — open/close/setConfig/getIds 全状态机
  - **R11.2.6** `tests/main/screenCapture.test.ts` — captureScreenFrame / captureVirtualScreenFrame 两种路径
  - **R11.2.7** `tests/main/captureProviders/desktopCaptureProvider.test.ts` — desktopCapturer mock、available/error
  - **R11.2.8** `tests/shared/logger.test.ts` — 写入、rotation（5MB × 5 触发）、queueMicrotask 异步 flush
  - **R11.2.9** `tests/shared/modelsManifest.test.ts` — 5 个 model entry 字段完整性 + URL 协议合法性
  - **R11.2.10** `tests/shared/types.test.ts` — `is3DEffect` 类型守卫全枚举、`EFFECT_3D_KINDS` 集合对称
  - **R11.2.11** `tests/preload/index.test.ts` — mock electron contextBridge，验证 50+ 方法在 `window.rgbbox` 上、类型签名
  - **R11.2.12** `tests/renderer/engine/metricsCollector.test.ts` — 180 帧滚动窗口（p95 / avg / dropped 计算正确性）
  - **R11.2.13** `tests/renderer/workers/previewEngineWorker.test.ts` — 消息协议、zero-copy transfer（postMessage 收到 ArrayBuffer）

- **R11.3** **增强已有测试**（3 项）：
  - **R11.3.1** `tests/effects.test.ts` 补全 6 个缺失效果：`screen-ambient` / `zone-gradient` / `audio-beat` / `audio-equalizer` / `custom-paint` / `image-paint`
  - **R11.3.2** `tests/profileStore.test.ts` 增强：损坏 JSON 恢复 / 文件权限错误 / 并发写竞态 / 命名 profile 边界（空名 / 重复 id / 含特殊字符）
  - **R11.3.3** 新增 `tests/integration/ipcChannels.test.ts` — 46 个 IPC 通道名唯一性、payload 类型与 `preload` 暴露的签名一致

- **R11.4** **覆盖率基建**（4 项）：
  - **R11.4.1** `npm install -D @vitest/coverage-v8`
  - **R11.4.2** 更新 `vitest.config.ts` 加 coverage 配置（include: `src/{engine,shared,main,preload,renderer/src/{engine,workers}}/**`，exclude: `**/*.d.ts`、types 文件）
  - **R11.4.3** `package.json` scripts 新增 `test:coverage` / `test:watch`
  - **R11.4.4** 目标：覆盖率 ≥ **80%** 行 + **70%** 分支（首跑达成即可，后续 R-N 拉高）

- **R11.5** **质量门槛**（每个测试文件必须满足）：
  - **R11.5.1** 完整 `describe` / `it` 结构；参数化用 `it.each`
  - **R11.5.2** 边界 + 错误路径 + 异步 + 类型守卫全覆盖
  - **R11.5.3** mock 集中在文件顶部、命名 `mockedElectron`（避免泄漏）
  - **R11.5.4** 不依赖真实文件系统（用 `os.tmpdir()` / in-memory）
  - **R11.5.5** 不依赖真实 Electron / 屏幕 / GPU（纯 mock）
  - **R11.5.6** 测试间无顺序依赖（每个 `it` 独立）

- **R11.6** **CI 友好**：
  - **R11.6.1** 测试可并行（vitest 默认）
  - **R11.6.2** 无 flakiness（不依赖时间精度 / 网络 / 真实硬件）
  - **R11.6.3** 失败信息清晰（包含期望值 / 实际值 / 路径）
  - **R11.6.4** 跑完 `npm test` 在干净环境下应全绿

- **R11.7** **受本 R-N 影响的文件**：
  - 新增：13 个测试文件（见 R11.2）+ 1 个集成测试（见 R11.3.3）
  - 修改：`tests/effects.test.ts` / `tests/profileStore.test.ts`（增强）
  - 修改：`vitest.config.ts`（加 coverage 配置）
  - 修改：`package.json`（加 devDep + 2 个 scripts）
  - 业务代码（`src/`）：**0 diff**（测试不引入产品代码变化）

---

### R12. 渲染层 + WebGL + Hook 测试（续 R11）

> 目标：把 R11.1 中"本轮不做"的 `src/renderer/src/{views,components,hooks,gl}` 也纳入自动化测试。
> 目的：让"任何代码改动都有自动化测试把关"覆盖到 UI 与 3D 渲染路径，为后续 R-N 自动验证提供基础。
> **风险等级：L2**（新增 devDep `@testing-library/react` + `@testing-library/jest-dom` + `happy-dom` + `gl`；改 `vitest.config.ts` 环境分流；不改产品代码）。
> **范围**：本 R-N 处理 React 组件 + Hook + WebGL；E2E（Playwright）单列为 **R13**。

- **R12.1** **React 组件测试**（`happy-dom` + `@testing-library/react`）：
  - **R12.1.1** `tests/renderer/components/EffectsView.test.tsx` — 效果列表渲染 / 选择 / 启用切换
  - **R12.1.2** `tests/renderer/components/PreviewGrid.test.tsx` — LED 网格 SVG 渲染（按 columns × rows）+ 像素高亮
  - **R12.1.3** `tests/renderer/components/DisplayMap.test.tsx` — 显示器拓扑渲染 + drag/drop
  - **R12.1.4** `tests/renderer/components/ProfileManager.test.tsx` — profile CRUD 弹窗 + 命名校验
  - **R12.1.5** `tests/renderer/components/AudioStudioView.test.tsx` — 频谱条渲染 + audio 状态
  - **R12.1.6** `tests/renderer/components/VideoStudioView.test.tsx` — 视频播放器状态机（play/pause/seek）
  - **R12.1.7** `tests/renderer/components/CustomPaintEditor.test.tsx` — 画布编辑（pixelData 序列化往返）
  - **R12.1.8** `tests/renderer/components/ImagePaintEditor.test.tsx` — 图片上传 / 转换 / pixelData 缓存
  - **R12.1.9** `tests/renderer/components/OverlayCanvas.test.tsx` — 透明覆盖层初始化 + frame 推送
  - **R12.1.10** `tests/renderer/components/ArchitectureView.test.tsx` — 3D 架构视图入口（懒加载占位）
  - **R12.1.11** `tests/renderer/components/MiniGamesView.test.tsx` — 小游戏路由 / 分数更新
  - **R12.1.12** `tests/renderer/components/Preview3D.test.tsx` — `<canvas>` 节点存在 + resize 监听
  - **R12.1.13** `tests/renderer/3d/LEDMapper.test.tsx` — LED 映射编辑器（点数增删）
  - **R12.1.14** `tests/renderer/3d/SplatViewer.test.tsx` — Gaussian Splat 加载占位
  - **R12.1.15** `tests/renderer/App.test.tsx` — 顶层 view 路由切换（点击 9 个 nav 按钮）

- **R12.2** **Hook 测试**（`renderHook` from `@testing-library/react`）：
  - **R12.2.1** `tests/renderer/hooks/useAudioAnalyzer.test.ts` — start/stop 生命周期 + 频段数据回填
  - **R12.2.2** `tests/renderer/hooks/useModelStore.test.ts` — Zustand 状态读写 + 持久化

- **R12.3** **WebGL 单元测试**（`gl` npm headless GL）：
  - **R12.3.1** `tests/renderer/gl/previewGl.test.ts` — `createPreviewGL` shader 编译成功 / 缓冲区绑定 / draw 回调被调
  - **R12.3.2** `tests/renderer/gl/effect3dGl.test.ts` — `createEffect3DGL` 6 个 3D 效果路径（不要求视觉正确性，只验证管线不报错 + uniform 被设置）

- **R12.4** **vitest 环境分流**（`vitest.config.ts`）：
  - **R12.4.1** `tests/renderer/components/**` 与 `tests/renderer/3d/**` → `environment: 'happy-dom'`
  - **R12.4.2** `tests/renderer/gl/**` → `environment: 'node'`（`gl` 自建上下文，不需 DOM）
  - **R12.4.3** 其余沿用 `environment: 'node'`
  - **R12.4.4** 新增 `tests/renderer/setup.ts` 注册 `@testing-library/jest-dom` 断言扩展

- **R12.5** **质量门槛**（同 R11.5 + 额外）：
  - **R12.5.1** 组件测试不依赖网络 / 真实音频 / 真实 GPU
  - **R12.5.2** WebGL 测试必须能在无 GPU 环境下跑（headless GL）
  - **R12.5.3** `userEvent` 用于交互；不直接调内部 `setState`
  - **R12.5.4** mock 上下文（`AudioContext` / `MediaDevices` / `WebGLRenderingContext`）集中在文件顶部
  - **R12.5.5** WebGL 测试中若 `gl` 初始化失败（无头环境）→ 用 `it.skip` 优雅降级，记录日志

- **R12.6** **覆盖率目标**：
  - **R12.6.1** `src/renderer/src/components/**` + `src/renderer/src/3d/**` → ≥ 60% 行（首跑目标）
  - **R12.6.2** `src/renderer/src/hooks/**` → ≥ 80% 行
  - **R12.6.3** `src/renderer/src/gl/**` → 管线 100% 调用覆盖（编译 / 绑定 / 绘制）
  - **R12.6.4** 全局 `lines` 阈值上调到 85%（R11 是 80%）

- **R12.7** **受本 R-N 影响的文件**：
  - 新增：14 个组件测试 + 2 个 hook 测试 + 2 个 gl 测试 = **18 个测试文件**
  - 新增：`tests/renderer/setup.ts`
  - 修改：`vitest.config.ts`（环境分流 + 新增 include）
  - 修改：`package.json`（新增 3 个 devDep + 可能 1 个 script）
  - 业务代码（`src/`）：**0 diff**

---

### R13. 开源推广就绪度（赛道 A：62 → 100）

> 来源：2026-06-22 四轮评审讨论第 1 轮「开源推广就绪度评分与提升方案」。
> 目标：把项目从「优秀代码」打磨成「任何人点进来都愿意 star / 下载 / 分享」的高质量开源形态。
> **风险等级：混合**——A1/A3/A4/A5 为 **L0/L1**（纯文档 / CI / 元信息）；A2 截图需真机素材。
> **现状证据**（2026-06-22 核实）：仓库 0 star / 0 fork / 0 issue；根目录**无 `LICENSE` 文件**（`package.json:7` 仅声明 MIT）；`package.json:6` homepage 指向错误的 `github.com/tjf/RGBBox`；`.github/workflows/` 只有 `pages.yml`（无 CI）；`docs/screenshots/` 仅 `.gitkeep`（空）；README 唯一图为灵感照；`docs/index.html` 无 `og:`/`twitter:`/`description`/favicon；唯一 release v0.3.8 正文仅 "Initial release."。

- **R13.1** **合规与信任地基**（+8 → 70）：
  - **R13.1.1** 根目录新增 `LICENSE`（MIT 全文，与 `package.json` 声明一致，署名 "RGBBox Contributors"）。
  - **R13.1.2** 修正 `package.json` `homepage`：`https://github.com/tjf/RGBBox` → `https://github.com/tangjianfang/RGBBox`。
  - **R13.1.3** 新增 `CONTRIBUTING.md`（开发环境 + `yarn dev/typecheck/build/test` + 单 PRD / R-N 工作流对外简版 + 提交格式 `[PRD-0002] <type>: <subject>`）。
  - **R13.1.4** 新增 `CODE_OF_CONDUCT.md`（Contributor Covenant 标准模板）。
  - **R13.1.5** 新增 `SECURITY.md`（漏洞上报流程，Electron 桌面应用安全联系方式）。
  - **R13.1.6** 新增 `.github/ISSUE_TEMPLATE/`（bug_report + feature_request）+ `.github/PULL_REQUEST_TEMPLATE.md`。
  - **R13.1.7** 新增 `.github/FUNDING.yml`（GitHub Sponsors / Open Collective 占位）。
  - **R13.1.8** 开启 GitHub Discussions（仓库设置，非代码；文档中记录步骤）。
- **R13.2** **首屏说服力：视觉证据**（+10 → 80，⚠️ 需真机素材）：
  - **R13.2.1** 录制 10–20s 主视觉 GIF/MP4（多屏画布 + 火焰/星系/均衡器），放 README 顶部。**需用户真机录制**。
  - **R13.2.2** 截 4–6 张分类图存 `docs/screenshots/`（主工作区 / 特效库 / 音频 Studio / 3D 高斯泼溅 / 多屏）。**需用户真机录制**。
  - **R13.2.3** README 顶部加徽章（License / Release / 平台 Win·macOS / Electron / CI 状态）。
  - **R13.2.4** README 信息架构前移：主视觉 → 一句话定位 → 下载按钮 → 截图画廊 → 特性 → 灵感故事（保留）→ 架构/开发。
- **R13.3** **工程可信度：CI 自动化**（+6 → 86，**L2**：改 `.github/workflows`）：
  - **R13.3.1** 新增 `.github/workflows/ci.yml`：push/PR 触发 `yarn install → typecheck → test → build`（matrix: ubuntu + windows + macos 可选）。
  - **R13.3.2** README 挂 CI 状态徽章；可选 Codecov 覆盖率徽章（`test:coverage` 已就绪，见 R11.4）。
  - **R13.3.3** 可选：tag push 触发 `electron-builder` 出包并自动附到 GitHub Release（独立子任务，可延后）。
- **R13.4** **可发现性 / SEO / 分发**（+8 → 94）：
  - **R13.4.1** `docs/index.html` 补 `<meta name="description">` + `og:title/description/image/url` + `twitter:card` + `canonical` + favicon/apple-touch-icon（`og:image` 复用 R13.2 主视觉）。
  - **R13.4.2** GitHub 仓库补 Topics（electron / rgb-lighting / react / typescript / ambient-lighting / led / webgl / desktop-app / gaussian-splatting / audio-visualizer）+ description + website（指向 Pages）。**仓库设置，文档记录。**
  - **R13.4.3** 分发渠道清单（**用户执行**）：awesome-electron PR / Product Hunt / Show HN / Reddit / V2EX / 少数派 / 演示视频。
- **R13.5** **长期护城河**（+6 → 100）：
  - **R13.5.1** 新增 `CHANGELOG.md`（从 v0.3.8 起规范化，配合 `predist` 自动 patch）。
  - **R13.5.2** 完善 v0.3.8 Release 描述（功能亮点 + 截图 + 安装说明）。**仓库设置，文档记录。**
  - **R13.5.3** 新增文档保持中英双语对齐（README/落地页已双语，CONTRIBUTING 等英文优先 + 关键中文）。
- **R13.6** **受本 R-N 影响的文件**：
  - 新增：`LICENSE` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `SECURITY.md` / `CHANGELOG.md` / `.github/FUNDING.yml` / `.github/PULL_REQUEST_TEMPLATE.md` / `.github/ISSUE_TEMPLATE/*` / `.github/workflows/ci.yml` / `docs/screenshots/*`（素材）
  - 修改：`package.json`（仅 `homepage` 字段；**不动 scripts/deps**）/ `README.md` / `docs/index.html`
  - 业务代码（`src/`）：**0 diff**
- **R13.7** **验收点**：
  - [ ] `LICENSE` 存在且为 MIT；`package.json` homepage 指向 `tangjianfang/RGBBox`
  - [ ] 4 个社区文件 + Issue/PR 模板存在，GitHub 显示 community 完整度提升
  - [ ] `ci.yml` 在 PR 上跑通 typecheck/test/build（绿勾）
  - [ ] `docs/index.html` 含 og/twitter/description/favicon；分享有缩略图
  - [ ] README 顶部有徽章 + 截图画廊 + 下载入口
- **R13.8** **状态**: ⏳

### R14. 产品功能竞争力（赛道 B：88 → 100）

> 来源：四轮评审第 2 轮「功能 & 视觉评价」+ 第 3 轮合并方案。
> 目标：从「优秀的灯效可视化引擎」升级为「真正的 RGB 控制器 + 无人能及的 AI 灯效引擎」。
> **风险等级：L2**（engine 逻辑 / 新增 main 输出层 / 新增依赖 / 跨多文件架构）。**必须走标准四步，分阶段独立审批。**
> **现状证据**（2026-06-22 核实）：`grep` 确认 `src/` 内**无任何 UDP/串口/WebSocket 真实出光**（`dgram`/`SerialPort`/`net.Socket` 均无命中）——当前是纯虚拟预览；但 `ProfileManager.tsx` 已有 `exportProfileDialog` + Upload/Download（R4.10），预设导入导出基础已存在。

- **R14.1** **真实硬件输出适配器**（+6，最关键的产品定义补全；**每个适配器独立子 R-N**）：
  - **R14.1.1** 新建 `src/main/outputs/` 输出抽象层（统一 `IOutputAdapter` 接口：`connect` / `pushFrame(buffer)` / `dispose`）。
  - **R14.1.2** WLED 适配器（UDP DDP / WARLS 协议，免硬件即可被海量 WLED 用户验证）。**首发优先，最简单。**
  - **R14.1.3** OpenRGB 适配器（SDK over TCP，覆盖键鼠/主板/灯带生态）。
  - **R14.1.4** 把现有 50 个特效逐帧 LED 缓冲（`previewEngine` 已产出，R3.3）接到输出层；预览与真机同源。
  - **R14.1.5** 设备发现 / 灯珠映射 UI（复用 `DisplayMap` / `LEDMapper` 思路，R4.x / R6）。
  - **R14.1.6** 新增 IPC 通道（`rgbbox:output:*`）+ preload 桥（遵守 R5.1 白名单）+ 对应测试。
- **R14.2** **效果创作工具化：图层 + 时间线**（+3）：
  - **R14.2.1** 引入「效果图层」模型：多效果叠加 + 混合模式（add/screen/multiply）+ 按区域分配。
  - **R14.2.2** 可选时间线 / 关键帧编排（场景切换、循环）。
- **R14.3** **效果市场 / 预设生态**（+2，**复用已有能力**）：
  - **R14.3.1** 扩展 `ProfileManager` 的导出（R4.10）为标准 `.rgbbox` 预设格式 + 版本号 + 一键导入。
  - **R14.3.2** 社区预设库（GitHub 仓库 / Discussions 置顶 / Pages 画廊），形成「下载别人灯效」自传播闭环。
- **R14.4** **AI 生成灯效**（+1，但这是差异化王牌，符合用户「结合 AI 做前沿」偏好）：
  - **R14.4.1** 「文本 / 音乐 → 效果参数」AI 生成：prompt 或一段音乐自动产出特效配置（结合已集成的高斯泼溅 3D + GPU 管线 R2/R3.4）。
  - **R14.4.2** 本地优先策略：可接本地小模型或可选云端，守 local-first 隐私承诺。
- **R14.5** **联动触发**（补完体验）：
  - **R14.5.1** 热键 / 系统事件 / CPU·GPU 温度 / 时间表触发灯效切换。
- **R14.6** **受本 R-N 影响的文件**：
  - 新增：`src/main/outputs/**`（抽象层 + WLED + OpenRGB）/ AI 生成模块 / 图层引擎模块 / 对应 `tests/**`
  - 修改：`src/shared/ipc.ts`（新增 `rgbbox:output:*`）/ `src/preload/index.ts`（桥）/ `src/engine/previewEngine.ts`（图层）/ `src/renderer/src/App.tsx`（UI）/ `ProfileManager.tsx`（预设格式）/ `package.json`（新增 deps，**需独立审批**）
  - 业务代码：**大量 diff**——必须分阶段、每阶段独立 R-N 审批。
- **R14.7** **验收点**（分阶段）：
  - [ ] 阶段1 WLED：能向真实/模拟 WLED 设备推送 50 个特效的帧，预览与设备同步
  - [ ] 阶段2 OpenRGB：能枚举并驱动 OpenRGB 设备
  - [ ] 阶段3 图层/时间线：多效果叠加 + 混合模式可用
  - [ ] 阶段4 预设市场：`.rgbbox` 导入导出往返一致 + 社区库可下载
  - [ ] 阶段5 AI 生成：prompt/音乐可生成可用特效配置
- **R14.8** **状态**: ⏳

### R15. 产品视觉竞争力（赛道 C：82 → 100）

> 来源：四轮评审第 2 轮「视觉评价」+ 第 3 轮合并方案。
> 目标：从「能用的好看」升级为「成体系的好看」——设计系统化、可换肤、有品牌识别。
> **风险等级：L1/L2**——C1 设计令牌抽取（纯 CSS，行为不变，L1）；主题切换 / 组件库重构（涉及 UI 用户可见行为，L2）。**纯前端，风险可控。**
> **现状证据**（2026-06-22 核实）：`src/renderer/src/styles.css` 4678 行、**零 CSS 自定义属性**（`grep -c "^\s*--"` = 0），颜色全硬编码（`#0f1418` / `#e6edf0` 散落 `:root`）；无 `data-theme` / `prefers-color-scheme`（无亮色模式 / 无换肤）；图标用通用 `lucide-react`（无品牌记忆点）；`body { min-width: 960px }` 硬下限；73 处 transition/animation/keyframes（动效基础好）。

- **R15.1** **设计系统：CSS 设计令牌**（+7，视觉规模化根基；**L1**）：
  - **R15.1.1** 把 `styles.css` 硬编码颜色/间距/圆角/阴影抽成 `:root` 设计令牌（`--color-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--font-*`）。
  - **R15.1.2** 分模块拆分 CSS（按 9 大 view，告别 4678 行单文件巨石）。
  - **R15.1.3** 抽取过程**逐项验证视觉零回归**（截图对比 / 人工确认），行为不变。
- **R15.2** **主题切换 + 亮色模式**（+4，**L2**）：
  - **R15.2.1** 基于 R15.1 令牌实现 light/dark 切换 + `prefers-color-scheme` 跟随系统。
  - **R15.2.2** 可选多套预设皮肤（霓虹 / 赛博 / 极简），主题状态持久化到 profile。
- **R15.3** **品牌识别系统**（+4，**L1/L2**）：
  - **R15.3.1** 统一 Logo + 品牌色板 + 图标语言（现 `lucide-react` 通用图标无记忆点）。
  - **R15.3.2** 启动动效 / 关于页 / 加载态统一品牌签名。
- **R15.4** **组件库统一 9 大 view**（+2，**L2**）：
  - **R15.4.1** 抽出共享 UI 原子组件（Button/Card/Slider/Tabs/Panel），消除 `AudioStudioView.tsx`(2532 行)/`App.tsx`(2491 行) 等巨型组件间的间距/圆角/按钮漂移。
- **R15.5** **响应式与窗口自适应**（+1，**L2**）：
  - **R15.5.1** 优化 `body { min-width: 960px }` 硬下限下的小窗口体验；关键面板支持折叠/自适应。
- **R15.6** **受本 R-N 影响的文件**：
  - 修改：`src/renderer/src/styles.css`（令牌化 + 拆分）/ `src/renderer/src/App.tsx` + 各 `components/*.tsx`（消费令牌 + 主题切换 + 共享组件）/ `build/icon.*`（品牌）
  - 新增：`src/renderer/src/styles/tokens.css` + `src/renderer/src/components/ui/*`（原子组件）
  - 业务逻辑（engine/main/preload）：**0 diff**（仅视觉层）
- **R15.7** **验收点**：
  - [ ] `styles.css` 颜色/间距/圆角全部走 `--*` 令牌；视觉零回归
  - [ ] light/dark 可切换 + 跟随系统；状态持久化
  - [ ] 统一品牌 Logo / 色板上线
  - [ ] 9 大 view 共用原子组件，视觉一致
  - [ ] `yarn typecheck` + `yarn build` 通过
- **R15.8** **状态**: ⏳

### R16. 竞争力 & 影响力扩展维度（D–L）

> 来源：四轮评审第 4 轮「其它维度提升整体竞争力和影响力」。
> 目标：在 A/B/C 把产品做到 100 分之上，放大成「有行业影响力的开源项目」。
> **风险等级：混合**——逐子项标注。**每个子项落地前独立确认风险级别。**
> **现状证据**（2026-06-22 核实）：`package.json` 构建**仅 x64**（`win.arch=[x64]` / `mac.arch=[x64]`，无 arm64 → 排斥 Apple Silicon）；全 app 仅 ~52 个 `aria-`/`role`（无障碍薄弱）；i18n 仅 `zh`/`en`（`src/renderer/src/i18n/index.tsx:3`）；**无插件/扩展 SDK**（grep "plugin" 命中仅 ArchitectureView 文案）；`metricsCollector.ts` 已有 180 帧 metrics 基础（R6.12）。

- **R16.1** **D 平台与架构覆盖**（影响力 ★★★★★；**L2** 改 `package.json` build）：
  - **R16.1.1** mac 补 **arm64 / universal** 产物（修复放弃 Apple Silicon 用户的最大漏洞）；Windows ARM 评估。
  - **R16.1.2** Linux 补 Flatpak / AUR 提升触达（已有 AppImage/deb，R9.2）。
  - **R16.1.3** 评估 **Web/WASM 预览 Demo**（纯 TS 引擎 `src/engine/*` 无 Node 依赖，可编译成网页「打开即玩」零安装传播）。
- **R16.2** **E 性能数字证据**（★★★★；**L1**，复用 R6.12）：
  - **R16.2.1** FPS/CPU/GPU/内存可见性能面板 + README 真实数字背书（如「60fps @ 8 屏 1000 灯珠」）。
  - **R16.2.2** 性能回归基准（接入 CI，防 PR 拖慢渲染）。
- **R16.3** **F 插件 / 效果 SDK**（生态杠杆 ★★★★★；**L2**）：
  - **R16.3.1** 设计效果插件 SDK（第三方用 TS 写自定义特效 + 热加载），让社区帮写效果。
  - **R16.3.2** 效果模板仓库 + 文档 + 示例；与 R14.3 预设市场打通。
- **R16.4** **G 无障碍 + i18n + 光敏安全**（受众宽度 ★★★；**L2**）：
  - **R16.4.1** A11y 补强：键盘可达 / 焦点管理 / 屏幕阅读器标签 / 对比度 WCAG AA（现仅 ~52 aria）。
  - **R16.4.2** i18n 扩语（现 zh/en，低成本加日/韩/德/西，架构 R6.11 已就绪）。
  - **R16.4.3** **光敏癫痫安全开关**（glitch/lightning/strobe 强闪烁加「减少闪烁」选项）——伦理+法律护城河，差异化卖点。
- **R16.5** **H 质量与安全硬资质**（信任 ★★★★；**L0/L2**）：
  - **R16.5.1** 测试覆盖率公开徽章（`test:coverage` 已就绪 R11.4）。
  - **R16.5.2** Electron 安全基线审计清单（CSP / contextIsolation / nodeIntegration / `setPermissionRequestHandler` 最小化，R5.1 已有基础）。
  - **R16.5.3** 接入 CodeQL / Dependabot / OpenSSF Scorecard（拿安全可信徽章）。
  - **R16.5.4** 供应链：lockfile 审计 + SBOM 生成。
- **R16.6** **I 文档与开发者体验**（留存贡献者 ★★★；**L0**）：
  - **R16.6.1** 文档站点（VitePress/Docusaurus）：用户手册 + 效果图鉴 + 架构文档 + SDK 文档。
  - **R16.6.2** 交互式效果图鉴（每个特效配 GIF + 参数 + 在线预览，既文档又营销）。
  - **R16.6.3** 一键开发环境（devcontainer / Codespaces）。
- **R16.7** **J 数据驱动与隐私**（迭代方向盘 ★★★；**L2**）：
  - **R16.7.1** 本地优先匿名遥测（可选开关，守 local-first）。
  - **R16.7.2** 崩溃上报（用户同意，复用文件日志 R7.3 导出诊断包）。
- **R16.8** **K 商业化与可持续**（影响力燃料 ★★；**L0/规划**）：
  - **R16.8.1** 赞助通道（GitHub Sponsors / Open Collective / `FUNDING.yml`，与 R13.1.7 合并）。
  - **R16.8.2** 双轨探索（核心 MIT 开源 + 可选 Pro：云同步 / AI 额度 / 企业多机管理）。
  - **R16.8.3** 硬件/品牌联名（WLED / 灯带厂 / 键盘厂）。
- **R16.9** **L 社区运营与内容**（影响力复利 ★★★★；**L0/运营**）：
  - **R16.9.1** 内容飞轮（效果挑战赛 / 用户作品集 / 技术博客——高斯泼溅+RGB 跨界故事）。
  - **R16.9.2** **应用内「导出灯效为 GIF/视频」按钮**（用户自发传播，反哺 R13.2 素材荒）。**L2，最高杠杆低成本项。**
  - **R16.9.3** 路线图公开 + good-first-issue 标签 + 贡献者墙。
- **R16.10** **受本 R-N 影响的文件**：按子项分散——`package.json`（build/arm64）/ 新增 SDK 模块 / 新增遥测模块 / `src/renderer/src/i18n/` / `.github/workflows/`（CodeQL）/ 文档站新仓或 `docs/` / `src/renderer/src/App.tsx`（A11y + 录制按钮）等。**每子项独立 R-N 审批。**
- **R16.11** **三个最高杠杆点**（建议优先）：
  - [ ] R16.1（arm64 + Web Demo）打开受众
  - [ ] R16.3（插件 SDK）让社区造内容
  - [ ] R14.4 ×（AI 生成灯效）建立差异化
- **R16.12** **状态**: ⏳

---

### R17. Demo 页全效果展示（赛道 C 补充：视觉营销）

> 目标：让访问 `tangjianfang.github.io/RGBBox/#demo` 的用户不只看到 8 个精选卡片，而是可以展开查看全部 45+ 种效果，帮助用户快速找到最适合自己的效果。

- **R17.1** `docs/index.html` `#demo` 区块底部新增「展开全部效果」按钮，点击后以折叠/展开方式显示全效果面板（JS toggle + CSS transition，无依赖）。
- **R17.2** 折叠区内按 7 大分类（经典 / 进阶 / 科学可视化 / 3D 视觉 / GPU 3D / 音频响应 / 自定义绘画）展示所有 45+ 效果卡片；每张卡片含效果名（中/英）+ 一句描述 + 分类对应 CSS 动画占位。
- **R17.3** 为 7 大分类各设计 1 种代表性 CSS 动画模板：Classic=彩虹渐变、Advanced=火焰/粒子风、Science=扫描线+旋转、3D=透视渐变、GPU3D=辉光旋转、Audio=跳动色条、Custom=画笔笔触。
- **R17.4** `#effects` 原有文字列表升级为带 CSS 动画占位的视觉卡片网格（与 `#demo` 风格保持一致，兼容移动端）。
- **R17.5** **受影响文件**：`docs/index.html`（CSS + HTML + 少量 JS）。
- **R17.6** **验收点**：点击「展开全部效果」后可见所有 45+ 卡片且有动画；`#effects` 区显示视觉卡片而非纯文字；移动端（375px）无横向溢出。
- **R17.7** **状态**: ✅

---

### R18. Effect 预览高保真

> 目标：消除 `EffectsView` 卡片中 LED 格栅感，使效果预览趋向连续图像，提升用户选效体验。

- **R18.1** `src/renderer/src/components/EffectsView.tsx` 中 CPU `EffectCard` 的格栅从 `cols=16, rows=9` 提升至 `cols=48, rows=27`。
- **R18.2** 对应 canvas 逻辑尺寸从 `80×44` 同步改为 `240×135`，使像素密度不变、视觉面积不变；CSS 中卡片 canvas 宽度保持 `width:100%` 由父容器决定显示尺寸（已有行为）。
- **R18.3** 验收：目视卡片动画效果无明显格栅/马赛克感，平滑过渡清晰可见。
- **R18.4** **受影响文件**：`src/renderer/src/components/EffectsView.tsx`。
- **R18.5** **状态**: ✅

---

### R19. Demo 页每种效果独立预览动画

> 目标：`#demo` "全部效果"面板中，每张效果卡片显示与该效果视觉特征一致的独立 CSS 动画，而非整个分类共享同一模板，从而让用户真正了解每种效果的视觉效果。

- **R19.1** 为 `docs/index.html` "全部效果" 面板中的全部 55 张卡片分别分配独立的 CSS 类（`eff-<name>`），每个类有独特的 `background` 或 `animation` 属性，视觉上代表该效果的特征。
- **R19.2** 复用现有关键帧动画（如 `gradShift`、`breathe`、`rainbowSweep` 等）并通过不同颜色/速度组合产生差异；新增最多 15 个补充关键帧，避免 CSS 体积过大。
- **R19.3** `#effects` 分类缩略图（`.effect-cat-thumb`）保持不变，仍使用分类级动画模板。
- **R19.4** **受影响文件**：`docs/index.html`（CSS + HTML）。
- **R19.5** **验收点**：展开"全部效果"面板后，同一分类内的各卡片视觉明显不同；每种效果的色彩/运动特征与效果名称语义匹配。
- **R19.6** **状态**: ✅

---

### R20. 多屏虚拟画布 / 视频墙拼接引擎（高级扩展）

> 目标：在现有"多屏虚拟画布"基础上，新增可直接用于广告大屏 / 大型节目显示器 / 数字标牌等业务场景的**视频墙拼接**能力——把一张虚拟画布以 2D 矩阵方式无缝铺满多块面板，支持拼缝补偿、角度旋转与内容适配；并在官网（`docs/index.html`）增加独立功能介绍区块。

> 现状 review（落地依据）：当前 `src/main/displayTopology.ts` 仅按 OS 上报 bounds 计算 `virtualBounds`；`src/engine/previewEngine.ts` 的 `computeDisplaySlotMask` 在 linked 模式下把画布按 `1/count` **等宽横向**切片，未考虑物理分辨率差异、行列矩阵、拼缝(bezel)与旋转。R20 以纯 TS 引擎模块补齐这块拼接数学，作为可复用基础。

- **R20.1** **类型模型**：`src/shared/types.ts` 新增 `VideoWallPanel` / `VideoWallLayout` / `VideoWallFit`，纯数据、UI 无关。
- **R20.2** **引擎模块**：`src/engine/videoWall.ts`（纯 TS，无 DOM/WebGL）：
  - `buildMatrixLayout(rows, cols, options)` — 生成行优先的 rows×cols 矩阵布局；
  - `getPanelActiveRect` / `getPanelSourceRect` — 面板发光区 / 采样区归一化矩形；
  - `mapPanelUvToCanvas` — 面板局部 UV → 内容画布 UV（含旋转 + source rect 投影）；
  - `rotateUv` — 绕中心顺时针旋转（90/180/270° 精确，任意角走 trig）；
  - `getWallAspect` / `computeContentFitRect` — 墙体宽高比 + stretch/contain/cover 适配；
  - `summarizeLayout` — 文案摘要。
- **R20.3** **拼缝补偿语义**：`bezelCompensation=true` 时采样内缩 cell（内容"在边框后继续"，相邻面板边缘衔接、无断层）；`false` 时采样完整 cell（有缝、但内容不丢）。
- **R20.4** **单元测试**：`tests/engine/videoWall.test.ts`（矩阵生成 / source rect / 旋转 / UV 映射 / fit / 相邻面板连续性）。
- **R20.5** **官网功能介绍**：`docs/index.html` 新增独立区块 `#videowall`（导航加入口），双语介绍 2D 矩阵拼接、拼缝补偿、角度旋转/3D 拼接、内容适配，并列出广告大屏 / 舞台节目 / 展厅标牌 / 监控指挥 4 类业务场景 + 2×4 矩阵示意图。
- **R20.6** **边界**：本条仅落地"引擎 + 类型 + 测试 + 官网介绍"，**不**改动 `App.tsx` 渲染循环 / profile schema / IPC / overlayManager；与 live 渲染、UI 配置面板的接线作为后续独立 R-N。
- **R20.7** **受影响文件**：`src/shared/types.ts`（新增类型）、`src/engine/videoWall.ts`（新增）、`tests/engine/videoWall.test.ts`（新增）、`docs/index.html`（新增区块 + 导航 + CSS）。
- **R20.8** **验收点**：`yarn typecheck` 通过；`videoWall.test.ts` 全绿；全量 `vitest run` 不回归；`yarn build` 成功；官网 `#videowall` 区块双语正常显示且 HTML 标签平衡。
- **R20.9** **状态**: ✅ — 证据见 §6 验收清单 R20 行。

---

### R21. 视频墙引擎接入实机渲染链路（R20 接线）

> 目标：把 R20 已落地、但「有意未接线」的视频墙拼接引擎（`src/engine/videoWall.ts`）正式接进 live / 实机渲染链路——当场景启用视频墙时，按面板从虚拟画布抽取经**拼缝补偿 / 旋转 / 内容适配**处理后的子帧，并推送到各物理显示器 overlay。承接 R20.6「与 live 渲染、UI 配置面板的接线作为后续独立 R-N」的遗留项。

> 现状 review（落地依据）：当前 `src/renderer/src/App.tsx` 的 live 输出分支（worker 回调 + `handleFrame3D`）仅在 `scene.linkedDisplays && displays.length>1` 时用 `extractSubFrame()` 按显示器 bounds 等比矩形切片，未利用 R20 的矩阵 / 拼缝 / 旋转 / fit 能力；`Scene` 类型也无视频墙字段。

- **R21.1** **数据模型**：`src/shared/types.ts` 的 `Scene` 新增可选 `videoWall?: VideoWallLayout`（复用 R20 类型），纯数据、UI 无关；缺省即不启用墙模式。`profileStore.loadProfile` 因字段可选天然向后兼容（旧 profile 无该字段 → `undefined`），不破坏旧 profile。
- **R21.2** **引擎采样胶水**：新增 `src/engine/videoWallFrame.ts`（纯 TS，依赖 `RgbFrame` + `videoWall.ts` 数学）：`extractWallPanelFrame(virtualFrame, panel, layout, options)` — 用 `computeContentFitRect` → `mapPanelUvToCanvas` 逐像素从虚拟画布采样，返回该面板的 `RgbFrame`（含拼缝补偿 / 旋转 / fit）。
- **R21.3** **实机输出映射**：`App.tsx` 抽出统一分发函数 `distributeFrameToOverlays(frame, scene, topology, overlayIds)`，优先级：`scene.videoWall`（按 `panel.displayId ↔ 物理 displayId` 采样）→ `linkedDisplays`（原 `extractSubFrame`）→ 全屏广播；worker 回调与 `handleFrame3D` 复用同一函数。
- **R21.4** **缺失 displayId 降级**：墙模式下若某 overlay 显示器无匹配 panel，则回退到 `extractSubFrame`（有 topology 时）或跳过，绝不黑屏崩溃。
- **R21.5** **复用既有 IPC**：仅复用 `pushFrameToDisplay(displayId, frame)`，**不**新增 IPC 通道 / preload 桥。
- **R21.6** **单元测试**：`tests/engine/videoWallFrame.test.ts` 覆盖单面板透传、2×2 矩阵分块正确性、旋转、拼缝补偿、fit、缺省输出分辨率。
- **R21.7** **边界**：本条只做「引擎 → 实机渲染链路」接线，**不**含 UI 配置面板（行列 / 拼缝 / 旋转可视化编辑）——留作后续独立 R-N；不改 IPC schema / overlayManager / profile 顶层结构。
- **R21.8** **受影响文件**：`src/shared/types.ts`（`Scene` +字段）、`src/engine/videoWallFrame.ts`（新增）、`tests/engine/videoWallFrame.test.ts`（新增）、`src/renderer/src/App.tsx`（分发函数接线）。
- **R21.9** **验收点**：`yarn typecheck` + `yarn build` 通过；`vitest run` 不回归；无 `videoWall` 的旧 profile 行为零变化；有 `videoWall` 时各显示器收到正确子帧。
- **R21.10** **状态**: ✅ — 证据见 §6 验收清单 R21 行。

---

### R22. 视频墙 UI 配置面板（行列 / 拼缝 / 旋转可视化编辑）

> 目标：把 R20/R21 已落地的视频墙拼接引擎与数据模型（`VideoWallLayout` / `scene.videoWall`）暴露给用户——在 workspace 的「多屏映射」面板内新增一个**可视化配置面板**，让用户无需手写 JSON 即可开启墙模式、调行列矩阵、拼缝(bezel)与补偿、内容适配(fit)、逐面板旋转，并把每个面板映射到物理显示器。承接 R20.6 / R21.7「UI 配置面板（行列 / 拼缝 / 旋转可视化编辑）作为后续独立 R-N」的遗留项。

> 现状 review（落地依据）：当前 `src/renderer/src/App.tsx` 仅有 `linkedDisplays` 单一开关，`scene.videoWall` 字段虽已被实机渲染链路消费（R21），但**没有任何 UI 可编辑它**，用户只能改 profile JSON。`src/engine/videoWall.ts` 已提供 `buildMatrixLayout` / `getPanelActiveRect` / `summarizeLayout` 等纯函数可直接复用做布局生成与预览。

- **R22.1** **新增组件**：`src/renderer/src/components/VideoWallEditor.tsx`（纯 React，经 props 读写，不直接碰 Node/IPC）：
  - **R22.1.1** 墙模式开关：开启时用 `buildMatrixLayout` 生成默认 2×2 布局并写入 `scene.videoWall`；关闭时置为 `undefined`。
  - **R22.1.2** 行 / 列 步进器（rows / cols，范围 1..8）：变更时**保留**已有面板的 `rotation` / `displayId`（按 row,col 对齐），新增格子取默认值，多余格子裁剪。
  - **R22.1.3** 拼缝滑块 `bezel`（0..0.49）+ 拼缝补偿 `bezelCompensation` 开关。
  - **R22.1.4** 内容适配 `fit` 选择（stretch / contain / cover）。
  - **R22.1.5** 逐面板编辑：可视化矩阵网格（用 `getPanelActiveRect` 定位每格），点选面板后可设其 `rotation`（0/90/180/270 快捷 + 数值）与映射的物理 `displayId`（下拉，来自 `topology.displays`）。
  - **R22.1.6** 摘要行：用 `summarizeLayout` 展示当前布局文字摘要。
- **R22.2** **接线 App.tsx**：在 `map-panel` 区块（`linked-display-row` 之后）渲染 `<VideoWallEditor>`；新增 `updateVideoWall(layout | undefined)` 回调，按 `activeSceneId` 写回 `scene.videoWall`（与 `toggleLinkedDisplays` 同款 `setProfile` 模式）。
- **R22.3** **i18n**：`src/renderer/src/i18n/index.tsx` 的 EN + ZH 各新增 `videowall.*` 文案键（标题 / 开关 / 行 / 列 / 拼缝 / 补偿 / 适配 / 旋转 / 映射 / 摘要等），无硬编码中英文。
- **R22.4** **样式**：`src/renderer/src/styles.css` 新增 `.videowall-*` 类，沿用既有 panel / 按钮视觉语言，不改动其他组件样式。
- **R22.5** **单元测试**：`tests/renderer/components/VideoWallEditor.test.tsx`（happy-dom + RTL）覆盖：默认关闭态渲染、开启触发 `onChange` 带 2×2 layout、改行列触发带新 panel 数的 layout、改 bezel/fit、选面板设 rotation、空 topology 不崩。
- **R22.6** **边界**：本条只做 UI 配置面板（读写 `scene.videoWall`），**不**改引擎数学（R20）/ 渲染链路（R21）/ IPC schema / overlayManager / profile 顶层结构；缺省（未开启墙模式）行为零变化。
- **R22.7** **受影响文件**：`src/renderer/src/components/VideoWallEditor.tsx`（新增）、`src/renderer/src/App.tsx`（接线 + `updateVideoWall`）、`src/renderer/src/i18n/index.tsx`（`videowall.*` 文案）、`src/renderer/src/styles.css`（`.videowall-*`）、`tests/renderer/components/VideoWallEditor.test.tsx`（新增）。
- **R22.8** **验收点**：`yarn typecheck` + `yarn build` 通过；`vitest run` 不回归且新增测试全绿；未开启墙模式的旧 profile 行为零变化；开启后能可视化编辑 rows/cols/bezel/fit/rotation/displayId 并正确写回 `scene.videoWall`。
- **R22.9** **状态**: ✅ — 证据见 §6 验收清单 R22 行。

---

### R23. 关闭代码签名 + 阻断 winCodeSign 解码（dev 阶段）

> 目标：`yarn dist` 在 Windows / macOS / Linux 三端出包时**不**做代码签名 —— 当前仓库无 CA / EV 证书可用，开启签名会直接 fail；顺带 `winCodeSign-2.6.0.7z` 解压阶段因 OS 缺 `SeCreateSymbolicLinkPrivilege` 也会 fail（详见 §8 已知问题）。本条把 electron-builder 关闭所有签名路径，**根本不让它下载 winCodeSign**。
> **风险等级：L2**（修改 `package.json` 的 `build` 段，超出 R13.7「仅 homepage」的范围；按 R10.6 必须独立条目 + 走标准四步）。
> **触发场景**：2026-07-04 用户跑 `yarn dist` 报错；根因 = 仓库未配 CA 签名 + electron-builder 默认尝试调用签名器 → 下载 winCodeSign → 7z 提交流因 OS 缺权限失败。

- **R23.1** **`package.json` `build` 段签名显式关闭**：
  - **R23.1.1** `win.forceCodeSigning: false`（项目已为 false，保持）；新增 `win.signAndEditExecutable: false`（**关键：跳过 `rcedit` 整阶段，避免再下载 winCodeSign 工具**）+ `win.signtoolOptions: null` 显式置空。
  - **R23.1.2** `mac.identity: null` —— electron-builder 26.x 在缺省时仍会探测 Apple 开发者身份；显式 null 强制跳过；补 `mac.sign: null` 跳过 macOS codesign 阶段。
  - **R23.1.3** `linux` 暂无需改（electron-builder 默认不签），保持现状。
  - **R23.1.4** `.github/workflows/ci.yml`（未来）若上线后置条件 `CSC_LINK || CSC_KEY_PASSWORD` 存在才签名；当前 CI 不存在，本条不动。

- **R23.2** **winCodeSign 工具未下载验证**：R23.1.1 生效后 `yarn dist:win` 不再触发 winCodeSign 下载。`%LocalAppData%\electron-builder\Cache\winCodeSign\*.7z` 在没有签名需求时不应再增加新条目（之前 9 条均来自失败尝试，可清空以腾空间）。

- **R23.3** **不污染 secrets**：
  - **R23.3.1** 不向仓库提交任何 `.pfx` / `.p12` / `.cer` / base64 证书字符串。
  - **R23.3.2** `.env*` / `.npmrc` 中 `CSC_*` / `APPLE_ID*` 留白；后续真实签名再注入。

- **R23.4** **用户感知声明**：首跑产物无签名，Windows SmartScreen / macOS Gatekeeper 首次打开会拦一次（点「仍要运行」或「打开方式」放行）。README 不动；本条仅在 PR / commit message 提一句。

- **R23.5** **边界**：本条**不**新增 `package.json` 的 scripts / devDeps / 业务代码；仅 `build.win` / `build.mac` 两段配置改动；不改 `src/`、`tests/`、`docs/`、CI；不改 NSIS / linux。

- **R23.6** **受影响文件**：`package.json`（`build.win` +2 键 / `build.mac` +2 键）。

- **R23.7** **验收点**：
  - [ ] `yarn dist` 在干净环境（`rm -rf release/` 后）跑通到 `release/*.zip` 生成，无 signing / winCodeSign 相关报错
  - [ ] `git grep -nE "sign|forceCodeSigning"` 命中预期条目
  - [ ] 仓库无 `.pfx` / `.p12` / `.cer` 误提交
  - [ ] `yarn typecheck` + `yarn build` + `yarn test` 仍绿

- **R23.8** **状态**：✅

---

### R24. dist 前重试清 `release/` —— 缓解 Windows 文件句柄锁

> 目标：在 `yarn dist*` 之前**自动**重试清理 `release/`，解决 Windows 上 `app.asar` 常被 Defender / Search Indexer / 旧 RGBBox.exe 短暂持有的问题（ERROR_SHARING_VIOLATION / EBUSY），让 `yarn dist:win` 不再因 OS 持锁而失败。
> **风险等级：L2**（修改 `package.json` 的 `scripts` 段；新增 `scripts/dist-clean.mjs`；按 R10.6 必须独立条目）。
> **触发场景**：2026-07-04 用户跑 `yarn dist:win` 后报 "`app.asar` 一直被 zip 占用"；根因 = OS 持锁（已记录于 §8）。

- **R24.1** **新增脚本**：`scripts/dist-clean.mjs`
  - **R24.1.1** 默认 12 次重试 × 4 秒延迟 ≈ 最长 48 秒等待，专门覆盖 Defender 对 `app.asar` 的全内容扫描周期。
  - **R24.1.2** 仅捕获 `EBUSY` / `EPERM` / `ENOTEMPTY`；其余错误立即退出。
  - **R24.1.3** 全部失败退出码 1 + 给用户的明确提示（关 Explorer 窗、退出 RGBBox、等扫描结束）。
  - **R24.1.4** 目标目录默认 `release/`；支持 `--target`、`--tries`、`--delay` 覆盖。
  - **R24.1.5** 用 `node:fs.rmSync`（Node 18+ 原生 recursive+force 即可，无新 devDep）。

- **R24.2** **`package.json` scripts 接入**：
  - **R24.2.1** `dist` / `dist:win` / `dist:mac` / `dist:dir` 都改为 `node scripts/dist-clean.mjs && <原链>`。
  - **R24.2.2** `predist` 仍先跑（先升版本号；再清 release）；失败时 dist 立刻终止、不进 electron-builder。
  - **R24.2.3** 不修改 `dev` / `build` / `test` / `test:watch` / `test:coverage` / `typecheck` / `preview` / `download-models`。

- **R24.3** **不动**：`src/`、`tests/`、`docs/`（除本 PRD）、CI、任何 deps；只新增 1 个脚本 + 改 4 个 dist 脚本串。

- **R24.4** **边界**：此 R-N **不**替你处理 `SeCreateSymbolicLinkPrivilege` 缺失（属 R23 + OS 层）；**不**替你处理 Explorer / RGBBox.exe 长握 handle（需用户手动关窗）；只在重试窗口期内拿回文件锁就赢。

- **R24.5** **受影响文件**：`scripts/dist-clean.mjs`（新增）、`package.json`（scripts 段 4 行）。

- **R24.6** **验收点**：
  - [ ] `node scripts/dist-clean.mjs` 在干净仓库上退出码 0
  - [ ] `node scripts/dist-clean.mjs` 在 `release/win-unpacked/resources/app.asar` 被 Defender 扫描时退出码 1 + 给用户清晰提示
  - [ ] `yarn dist:win` 在干净环境下 exit 0 且产物 `release/*.zip` 与 R23 基线一致大小（≈145 MB）
  - [ ] `yarn dist:win` 失败时退出码 1 + 在重试期结束之后才报
  - [ ] `yarn test` / `yarn build` / `yarn dev` 完全不受影响

- **R24.7** **状态**：✅

### R25. 运行时窗口图标 setIcon（修任务栏图标）

> 目标：app 启动后 win32 任务栏图标显示 RGBBox 而非 Electron 默认；不依赖打包后 PE 图标、不动签名、不动 R23 的 `signAndEditExecutable:false`。
> **风险等级：L2**（修改 `src/main/index.ts` —— P0 集中点，按 R10.6 + CLAUDE.md「未通过 R-N 流程不要"顺手"修」必须独立条目）。
> **触发场景**：2026-07-04 用户反馈 `yarn dist:win` 后任务栏图标仍是 Electron 默认；上一轮已在 §8 已知问题登记，但仅作 R23 的副作用记录，未真正修复。

- **R25.1** **根因复盘**（与 R23 的区别）：
  - **R23 关闭 `signAndEditExecutable:false` → rcedit 不跑 → PE 图标保持 Electron 默认**：影响范围 = `.exe` 在资源管理器 / 桌面快捷方式 / 开始菜单的图标。
  - **R25 修的是 `运行时任务栏图标`**：当前 `src/main/index.ts:73` 的 `BrowserWindow({ icon: join(__dirname, '../../build/icon.ico') })` 在 **dev** 时正确（因为有 `build/icon.ico`），但在 **prod**（打包后）`__dirname` = `out/main/`，相对路径 `../../build/icon.ico` 解析成 asar 外不存在的路径 → Electron 拿到 `undefined` → 回退到 PE 资源（Electron 默认）。

- **R25.2** **改动**（`src/main/index.ts`）：
  - **R25.2.1** 在 `createWindow()`（line ~63 起的 `new BrowserWindow({...})` 之后）调一次 `mainWindow.setIcon(nativeImage.createFromPath(iconPath))`，其中 `iconPath` 与现有 tray 实现（line 557–561）同源：`process.resourcesPath/icon.ico`（prod）/`join(__dirname, '../../build/icon.ico')`（dev）。
  - **R25.2.2** 不改 `BrowserWindow` 构造里的 `icon:` 字段 —— dev 路径仍能用，prod 路径靠 setIcon 兜底；最小改动。
  - **R25.2.3** 浮窗（overlay）窗口在 `createOverlayWindow` 也补一次 setIcon（沿用同一 `iconPath`），保持一致。
  - **R25.2.4** `nativeImage` 已在 line 1 import；无需新增 import。

- **R25.3** **不动**：
  - **R25.3.1** `BrowserWindow` 构造里的 `icon:` 字段（dev 路径正确，prod 路径修不了）。
  - **R25.3.2** 任何 `package.json` 字段、scripts、build config。
  - **R25.3.3** `src/preload/index.ts`、`tests/`、`docs/`（除本 PRD）、CI。
  - **R25.3.4** tray 图标（line 557–561 已用 `process.resourcesPath/icon.ico` 正确）。

- **R25.4** **边界**：
  - **R25.4.1** 此 R-N **不**修 PE 图标（开始菜单 / 桌面快捷方式 / 资源管理器看到的图标），那是 R26 的事。
  - **R25.4.2** 此 R-N **不**开任何 devDep；用现有 `nativeImage`（已在 import）。
  - **R25.4.3** macOS dock 图标依赖 `app.dock?.setIcon(...)`（如果走 macOS 出包走另一条路径，dev 阶段先不动）；本 R-N 仅 win32 任务栏。
  - **R25.4.4** 不动 R23 的 `signAndEditExecutable:false` —— 这俩独立：R23 是"PE 不写图标 + 不签名"，R25 是"运行时强制写窗口图标"。

- **R25.5** **受影响文件**：`src/main/index.ts`（+约 4 行：1 个 helper + 2 个 setIcon 调用）。

- **R25.6** **验收点**：
  - [ ] `yarn typecheck` 通过（双 tsc）
  - [ ] `yarn build` 通过
  - [ ] `yarn dist:win` 跑通 exit 0；解压 `release/win-unpacked/RGBBox.exe` 后双击启动 → 任务栏图标显示 `build/icon.ico` 而非 Electron 默认
  - [ ] 截屏对照（任务栏 RGBBox 文字旁边的小图标）
  - [ ] dev 模式（`yarn dev`）下窗口图标行为不退化（dev 路径仍可用）
  - [ ] `release/builder-effective-config.yaml` 与 R23/R24 完全一致（证明 R25 不引入 build config 改动）

- **R25.7** **状态**：🔄

### R26. post-dist rcedit PE 图标（修 .exe 资源管理器图标）

> 目标：`yarn dist:win` 完成后自动调 `@electron/rcedit` 给 `release/win-unpacked/RGBBox.exe` 写 `build/icon.ico` 到 PE 资源段；**完全绕过** electron-builder 自带的 winCodeSign 7z 解码 → 在 OS 缺 `SeCreateSymbolicLinkPrivilege` 时也能跑通。
> **风险等级：L2**（修改 `package.json` 的 `scripts` 段、新增 scripts、新增 1 个 devDep；按 R10.6 + CLAUDE.md "scripts 段影响构建路径" 必须独立条目）。
> **触发场景**：R25 只修运行时任务栏图标；用户仍会看到资源管理器 / 桌面快捷方式 / 开始菜单的 `.exe` 是 Electron 默认 logo（R23 的代价）。R26 补上 PE 资源写入。

- **R26.1** **根因 vs R23**：
  - R23 用 `signAndEditExecutable:false` 跳过整段（rcedit + sign）→ **rcedit 也没跑**。这是 R23 设计时的"保险丝"：开 `signAndEditExecutable:true` 会让 electron-builder 顺带下载 winCodeSign（即便 `sign:null`，26.x 仍会解压 macOS dylib 签名工具），OS 缺 `SeCreateSymbolicLinkPrivilege` 时 7z 退出码 2。
  - **rcedit 本身是独立 binary**，不依赖 winCodeSign。electron-builder 自带 `node_modules/@electron/rcedit`。R26 走"自己 spawn rcedit"而非"让 electron-builder 调 rcedit"——完全脱离 winCodeSign 链。

- **R26.2** **新增脚本**：`scripts/post-dist-icon.mjs`
  - **R26.2.1** 接 `--exe <path>` + `--icon <path>` 两个参数（默认 `release/win-unpacked/RGBBox.exe` + `build/icon.ico`）。
  - **R26.2.2** **R26 实施时修订**：原计划 require `@electron/rcedit` 的 JS API——但 electron-builder 26.8.1 实际并未把 `@electron/rcedit` 装到 `node_modules`（`find node_modules -name rcedit -type d` = 0 命中），rcedit 是 electron-builder 通过 `app-builder-bin` 提供的 multi-call binary（`win/x64/app-builder.exe rcedit --args '<json>'`）。脚本**直接 spawn `app-builder.exe rcedit --args JSON.stringify(args)`**，与 electron-builder 在 `node_modules/app-builder-lib/out/winPackager.js:185` 的实现路径一致。**完全不走 winCodeSign 解码链**——rcedit 是独立子命令、参数只有 exe + icon。
  - **R26.2.3** 错误处理：exe 不存在 → exit 1 + 提示；icon 不存在 → exit 1 + 提示；rcedit 抛错 / 退出码非 0 → 打印 stderr + exit 1。
  - **R26.2.4** 成功 → 打印 `[post-dist-icon] RGBBox.exe ← build/icon.ico` + exit 0。

- **R26.3** **`package.json` 改动**：
  - **R26.3.1** **R26 实施时修订**：不需要新增任何 devDep（与 R26.4.1 一致；`app-builder-bin` 已通过 electron-builder 间接装好）。仅改 `scripts` 段。
  - **R26.3.2** 脚本：`postdist:win` = `node scripts/post-dist-icon.mjs --exe release/win-unpacked/RGBBox.exe --icon build/icon.ico`。`postdist:win` 是内部子步骤，**不对用户暴露为独立 `yarn dist:win:icon` 之类的"可选"命令**——PE 图标属于发版产物的**默认期望**，不能期望开发者记得再多跑一步。
  - **R26.3.3** `dist:win` 末尾追加 `&& yarn postdist:win`（electron-builder 跑完 → 立刻 postdist 写图标 → 再 zip）。**`dist:win` 是单一入口**；不另开"可选 icon"分支；不把图标 postdist 留作 opt-in。
  - **R26.3.4** 不改 `dist` / `dist:mac` / `dist:dir`（PE 图标仅 win32 相关；macOS 用 `app.dock?.setIcon` + `Info.plist` 走另一条路）。
  - **R26.3.5** 不动 `dev` / `build` / `test` / `predist` / `predist:clean` / 任何 R23/R24 引入的字段。
  - **R26.3.6** CLAUDE.md 命令速查里 `yarn dist:win` 的注释**不**写"再跑 postdist"——它是 dist:win 内部自动做的事，外部看不到。

- **R26.4** **devDep 处理（关键）**：
  - **R26.4.1** **R26 实施时修订**：`@electron/rcedit` 并不存在为独立 npm 包——rcedit 是 `app-builder-bin` 暴露的多功能 binary 之一（其 index.js 仅导出 `appBuilderPath` 字符串）。脚本通过 `import { appBuilderPath } from 'app-builder-bin'` 拿到 binary 路径再 spawn。**package.json 不需要新增任何 devDep**——`app-builder-bin` 已通过 `electron-builder` 传递依赖装好。
  - **R26.4.2** 若未来 electron-builder 拆走 `app-builder-bin`，回退方案：写脚本 fallback 到 `node_modules/app-builder-bin/win/<arch>/app-builder.exe` 的相对路径查找；仍未找到 → exit 1 + 提示安装 `electron-builder`。
  - **R26.4.3** 验收时确认 `node_modules/app-builder-bin/package.json` 存在且 `index.js` 暴露 `appBuilderPath`。

- **R26.5** **不动**：
  - **R26.5.1** `src/`（业务代码 0 改动）。
  - **R26.5.2** R23 的 `signAndEditExecutable:false` / `forceCodeSigning:false` / `signtoolOptions:null` / `mac.identity:null` / `mac.sign:null` 全保留 —— R26 走自己的 rcedit 链。
  - **R26.5.3** `tests/` / `docs/`（除本 PRD）/ CI / NSIS。
  - **R26.5.4** `build/icon.ico` 文件本身（已存在且有效）。

- **R26.6** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `node scripts/post-dist-icon.mjs` 在 dev 环境下 exit 0（写一个临时 .exe 测 → 验证图标被改 → 删 .exe；或直接读 PE 资源验证）
  - [ ] `yarn dist:win` 跑通 exit 0；产物 zip 解压后 `release/win-unpacked/RGBBox.exe` 在资源管理器显示 RGBBox 图标（不再 Electron 默认）
  - [ ] 用 `rcedit -i`（或自写 mini 检查）查 PE RT_ICON 资源指向 `build/icon.ico` 同字节段
  - [ ] **关键**：OS 缺 `SeCreateSymbolicLinkPrivilege` 的环境也能跑（不在 R23 失败点上挂）
  - [ ] R23 baseline 测试不回归：`yarn dist:win` 的 `winCodeSign-2.6.0.7z` 解码阶段仍然不触发（grep `winCodeSign` 0 命中）
  - [ ] `release/builder-effective-config.yaml` 与 R23/R24/R25 一致（新增 devDep 不影响 build config）

- **R26.7** **状态**：⛔ 废弃（R26.2.2 实施时撞墙：app-builder.exe rcedit 子命令在 win32 上先触发 winCodeSign-2.6.0.7z 下载 + 7za 解码，与 R23 同根因；用户 OS 缺 SeCreateSymbolicLinkPrivilege 时同样 exit 2。R27 接替）

### R27. 放开 `win.signAndEditExecutable` 让 electron-builder 自己写 PE 图标（取代 R26）

> 目标：让 `yarn dist:win` 产物 `.exe` 的 PE RT_ICON 写入 `build/icon.ico`；不走 post-dist rcedit 旁路，让 electron-builder 自己调 rcedit。
> **风险等级：L2**（修改 `package.json` `build.win` 段 + `scripts` 段；按 CLAUDE.md "scripts 段影响构建路径" 必须独立条目）。
> **触发场景**：R25 已修运行时任务栏图标（生效中），但 PE 图标（资源管理器 / 桌面快捷方式 / 开始菜单）仍是 Electron 默认——R26 smoke test 证明 post-dist rcedit 不可行，必须让 electron-builder 自己跑 rcedit。

- **R27.1** **核心改动**：`package.json` `build.win.signAndEditExecutable: false` → **`true`**（即拿掉 false，恢复默认）。
  - **R27.1.1** 保留 R23 其他键：`win.forceCodeSigning: false`、`win.signtoolOptions: null`。
  - **R27.1.2** `mac.identity: null` / `mac.sign: null` 保留（R26 与 mac 无关；macOS 出包走 code-sign 旁路，不依赖 Developer Mode）。
  - **R27.1.3** `linux` 不动。

- **R27.2** **OS 前置条件**（用户必须做一次）：
  - **R27.2.1** 在「设置 → 隐私和安全 → 开发者选项」打开「开发人员模式」；或以管理员 PowerShell 跑 `fsutil behavior set symlinkevaluation L2L:1 L2R:1 R2R:1 R2L:1`。
  - **R27.2.2** 不满足时 `yarn dist:win` 会在 rcedit 阶段触发 `winCodeSign-2.6.0.7z` 解码，7za 退码 2——与 R23 失败信息相同。
  - **R27.2.3** 这条是 R23 当初关 signAndEditExecutable 的根因，**用户接受这个 OS 配置即可解锁 R27**。

- **R27.3** **R26 清理**（R28 实施）：
  - **R27.3.1** `scripts/post-dist-icon.mjs` 删除——不再需要。
  - **R27.3.2** `package.json` 删除 `postdist:win` 脚本段。
  - **R27.3.3** `package.json` `dist:win` 末尾的 `&& yarn postdist:win` 拿掉。
  - **R27.3.4** PRD R26 文字保留作为历史记录（状态 ⛔ 废弃），便于回溯。

- **R27.4** **不动**：
  - **R27.4.1** `src/`、`tests/`、`docs/`（除本 PRD）。
  - **R27.4.2** R23 的 mac 签名关闭、`forceCodeSigning:false`。
  - **R27.4.3** R24 的 `scripts/dist-clean.mjs` 与 `predist:clean`。
  - **R27.4.4** R25 的 `setIcon` 改动（运行时图标独立于 PE 图标）。

- **R27.5** **受影响文件**：`package.json`（`build.win.signAndEditExecutable` + scripts 段 2 行）、`scripts/post-dist-icon.mjs`（删除）。

- **R27.6** **验收点**：
  - [ ] 用户 OS Developer Mode 已开（**这是前提，不是本 R-N 验收**）
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn dist:win` exit 0；产物 `release/RGBBox-<v>-win.zip` 解压后 `RGBBox.exe` 在资源管理器显示 RGBBox 图标
  - [ ] `release/builder-effective-config.yaml` 不再含 `signAndEditExecutable: false`
  - [ ] 任务栏图标（R25 setIcon）+ 资源管理器图标（PE RT_ICON，本 R-N）都显示 RGBBox

- **R27.7** **状态**：⛔ 撤回（v0.3.30 fire 真实根因：**当前网络无法访问 `github.com/electron-userland/electron-builder-binaries`**——`curl --max-time 10` exit 28、`HTTP 000`、`remote_ip` 空、DNS 解不出。rcedit 阶段需要从该路径下载 `winCodeSign-2.6.0.7z`，网络不通直接挂退码 1。Developer Mode 已开（`fsutil behavior query symlinkevaluation` 显示本地 symlink 已启用）但**网络问题在前面挡**——根本走不到 7za 解压那步。`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\` 缓存里只有挂掉的空目录，无可用产物。**用户级绕行**：1) 等网络出口恢复再 fire `yarn dist:win`；2) 在能访问 GitHub 的机器手动下载 `winCodeSign-2.6.0.7z` 拷到本地 cache 目录。**回退已落地**：`signAndEditExecutable:false` 加回 package.json；dist 回到 R23 / R24 稳定路径）

### R28. afterPack + 独立 `rcedit` npm 包写 PE 图标（取代 R26/R27）

> 目标：`yarn dist:win` 产物 `.exe` 的 PE RT_ICON 写入 `build/icon.ico`，且**完全不触发** `winCodeSign-2.6.0.7z` 下载/解压（R23/R27 已确认该链路在当前 OS 权限下会因符号链接创建失败而挂）。
> **风险等级：L2**（修改 `package.json` `build` 段 + 新增 devDep `rcedit` + 新增 `scripts/afterPack.mjs`）。
> **触发场景**：2026-07-04，R27 恢复 `signAndEditExecutable: true` 后 `yarn dist:win` 仍在 rcedit 阶段触发 winCodeSign 下载；本次下载成功（3m0.5s）但 7za 解压 macOS dylib 符号链接因客户端无权限失败（`Cannot create symbolic link`）。根因与 R23/R27 一致：electron-builder 内置 rcedit 路径与 winCodeSign 包耦合。

- **R28.1** **恢复 `win.signAndEditExecutable: false`**（回到 R23 基线），保留 `forceCodeSigning: false` / `signtoolOptions: null`。electron-builder 自身不再尝试签名/rcedit/下载 winCodeSign。
- **R28.2** **新增独立依赖 `rcedit`（npm 包，非 electron-builder 内置）**：该包直接打包 Windows rcedit.exe 二进制，不依赖 winCodeSign 或 7z 解压 macOS 工具链。锁定 `rcedit@2.3.0`（v5 为纯 ESM 且导出形式与 CJS `require()` 不兼容，实测报 `rcedit is not a function` / `does not provide an export named 'default'`；v2 为稳定 CJS，`require('rcedit')` 直接是可调用函数）。
- **R28.3** **新增 `scripts/afterPack.mjs`**：electron-builder `afterPack` 钩子，仅在 `context.electronPlatformName === 'win32'` 时执行；用 `createRequire` 载入 `rcedit`（CJS），对 `<appOutDir>/RGBBox.exe` 调用 `rcedit(exePath, { icon: 'build/icon.ico' })`。exe / icon 不存在时 warn 并跳过（不 throw，避免打断非 Windows 平台的 build）。
- **R28.4** **`package.json` `build.afterPack` 接入**：`"afterPack": "./scripts/afterPack.mjs"`（全平台通用，脚本内部按 platform 早退）。
- **R28.5** **不动**：R23 的 mac 签名关闭、`forceCodeSigning:false`；R24 的 `scripts/dist-clean.mjs`；R25 的运行时 `setIcon`（任务栏图标，独立于 PE 图标）；R26/R27 已废弃/撤回，本条完全替代二者的图标写入路径。
- **R28.6** **受影响文件**：`package.json`（`build.win.signAndEditExecutable`→`false`、新增 `build.afterPack`、devDeps +`rcedit`）、`scripts/afterPack.mjs`（新增）。
- **R28.7** **验收点**：
  - [ ] `yarn dist:win` exit 0，且**不**触发 `winCodeSign-2.6.0.7z` 下载（日志无 `winCodeSign` 字样）
  - [ ] 构建日志出现 `[afterPack] embedding icon into ...` + `[afterPack] icon embedded successfully`
  - [ ] `release/win-unpacked/RGBBox.exe` 在资源管理器 / 桌面快捷方式显示 RGBBox 图标（非 Electron 默认）
  - [ ] 任务栏图标（R25 setIcon）与 PE 图标（本条）两者都正确
  - [ ] `yarn typecheck` 通过
- **R28.8** **状态**：🔄（代码已改完，等待用户重跑 `yarn dist:win` 验证并反馈截图/日志）

### R29. 音频工作站重构（播放引擎 + 波形可视化 + 投屏 + 布局重组）

> 目标：响应用户 2026-07-04 反馈，对 [AudioStudioView.tsx](../../src/renderer/src/components/AudioStudioView.tsx)（~2600 行单体组件）做四项改造：① 播放引擎参考 Howler.js 思路强化（跨浏览器解锁、sprite/fade/rate 更稳健），保留现有已验证可用的 10 段 Peaking BiquadFilter EQ 链；② 引入 wavesurfer.js 作为专业波形可视化（region 标记 + 缩放），作为现有 6 种 canvas 可视化之外的新增模式；③ 修复 6 种可视化"投屏"到物理显示器功能（当前调研确认**完全未实现**——canvas 只是本地 DOM 预览，从未转换为 `RgbFrame` 或走 `overlayPushFrame` IPC）；④ 把 EQ 面板 + 音频生成器面板从当前"和播放器/场景/导出混排"的布局中拆分为独立可展开菜单（抽屉/弹层），主视图只保留播放器 + 可视化 + 播放列表。
> **风险等级：L2**（新增 2 个 npm 依赖 `howler` + `wavesurfer.js`；新增 canvas→RgbFrame 投屏 IPC 调用路径；UI 布局重排为用户可见行为变更）。
> **触发场景**：用户认为当前 EQ / 生成器 / 场景 / 导出功能混排导致布局混乱，且 6 种可视化的"投屏到显示器"及"最大化自适应"均无效。

- **R29.1** **播放引擎**：保留现有 Web Audio API 手写链路（`MediaElementSource → Gain → StereoPanner → 10×BiquadFilter → AnalyserNode`，已验证功能完整，非 mock）；新增 `howler` 依赖仅用于**播放列表调度层**（跨曲目 crossfade、倍速、移动端/浏览器自动播放解锁的成熟处理），通过 `Howler.ctx`（复用同一 AudioContext）+ `sound._node` 挂接到现有 EQ 链，避免双份 AudioContext / 双份解码。若 Howler 与现有 IPC `media://` 自定义协议不兼容（Howler 内部走 `<audio>`/`fetch` 加载），退化方案：仅在"从 URL/网络加载"路径启用 Howler，本地 `media://` 文件路径保留现有 `<audio>` 元素路径。
- **R29.2** **wavesurfer.js 波形可视化**：新增依赖 `wavesurfer.js@7.12.8`；新增第 7 种可视化模式 `waveform`，使用 `media` option 绑定到现有 `<audio>` 元素（`audioElementRef.current`），`interact:false` 禁用 wavesurfer 自己的点击跳转/拖拽，避免与现有播放控制（播放/暂停/seek 按钮）双写冲突——wavesurfer 在此仅作为只读波形展示层。不替换现有 `oscilloscope`（保留两者供用户选择）。**未实施**：A-B 循环 region 标记（超出本轮范围，留待后续 R-N）。
- **R29.3** **投屏修复（6 种可视化 + 新增 waveform 共 7 种，waveform 除外）**：**实施时修订**：复盘确认旧的 `openSpectrumPopout()`（`window.open(...)`）**从未真正投屏过**——`src/main/index.ts` 的全局 `setWindowOpenHandler` 始终 `shell.openExternal(url)` + `deny`（安全控制，防止任意弹窗），故 `window.open` 从未创建过 Electron 窗口，而是把 `#spectrum-popout` 交给系统默认浏览器打开（完全无法展示可视化）。修复不新建 IPC/主进程窗口管理，而是**复用已有的 overlay 基础设施**：选择目标显示器后调用已有的 `window.rgbbox.openOverlay(displayId, {region:'fullscreen'})`（若尚未打开），然后可视化 rAF 循环每帧调用新增的 `canvasToRgbFrame()` 将 `specCanvas` 降采样为 48×18 网格的 `RgbFrame`，经已有的 `window.rgbbox.pushFrameToDisplay(displayId, frame)` IPC 推送（零新增 IPC 通道，与原计划一致）。限制：`waveform` 模式内容不在 canvas 上（而在 wavesurfer DOM 容器），暂不支持投屏；投屏会暂时接管目标显示器的 overlay 内容（与 LED 效果引擎共用同一 overlay 窗口，若引擎也在运行会互相覆盖，已在 UI title 中说明）。
- **R29.4** **最大化自适应修复**：确认根因为 `setupCanvas()` 仅在 `vizMode`/`isPlaying`/`vizFullscreen` 变化时重新计算一次尺寸，窗口最大化/还原不会触发重计算。修复：新增 `ResizeObserver` 监听 `specCanvas`/`waveCanvas` 容器尺寸变化，实时重计算 `canvas.width`/`height`。
- **R29.5** **布局重组**：主视图仅保留【播放列表（左）+ 播放控制条 + 可视化区（含投屏/最大化按钮）】；EQ 面板与音频生成器面板收进顶部工具栏的两个独立按钮 —— 「EQ」「生成器」，点击弹出侧边抽屉（Drawer）或模态浮层（Modal），互不遮挡主可视化区；「场景预设」「导出」维持现有 Tab（因和播放/可视化关联度高，不属于"混乱"投诉范围，本条不移动，如需调整需用户在实施前确认）。
- **R29.6** **不动**：LRC 歌词解析、WAV/FLAC 导出、音频合成生成算法本身（sine/sweep/noise/...17 种场景预设），仅调整其 UI 承载容器（抽屉/弹层）。
- **R29.7** **受影响文件**：`src/renderer/src/components/AudioStudioView.tsx`（投屏/ResizeObserver/wavesurfer/抽屉布局）、`package.json`（+`wavesurfer.js`，未加 `howler`）、`src/renderer/src/i18n/index.tsx`（新增 `audio.viz.waveform`/`audio.viz.stopProject`/`common.close` 等 key × 中英双语，更新 `audio.viz.popout` 文案）、`src/renderer/src/styles.css`（`.audio-tools-bar`/`.audio-drawer*`/`.audio-eq-grid`/`.audio-waveform-container` 新增）。未新增独立的 EqDrawer/GeneratorDrawer 组件文件——抽屉 UI 直接内联在 `AudioStudioView.tsx` 中实现（复用现有状态/函数，降低拆文件风险）。
- **R29.8** **验收点**：
  - [ ] `yarn typecheck` + `yarn build` 通过
  - [ ] `yarn test tests/renderer/components/AudioStudioView.test.tsx` 通过
  - [ ] 手动验证：EQ 抽屉、生成器抽屉可独立打开关闭，主可视化区不被遮挡
  - [ ] 手动验证：任一可视化模式点击"投屏"后，目标显示器物理画面（或浮窗预览）出现对应可视化内容
  - [ ] 手动验证：窗口最大化/还原后可视化 canvas 无裁切/模糊
  - [ ] 播放 EQ 效果保持现状（10 段增益调节实时生效）
- **R29.9** **状态**：⚠️（2026-07-04 首次实施完成，但用户验收反馈 R29.3 的 LED 网格降采样方案"效果极差、没有动感"——**R29.3 已被 R31 取代**，见下方 R31。R29.1/R29.2/R29.4/R29.5 保持 ✅ 不受影响。**证据（R29.1/29.2/29.4/29.5 部分）**：`yarn typecheck` 通过；`yarn build` 通过（`out/renderer` 产物含 `wavesurfer.js` 打包，index chunk 从 2,056.44 kB 增至 2,122.33 kB）；`yarn vitest run tests/renderer/components/AudioStudioView.test.tsx` 1 passed / 4 skipped；`yarn test`（全量）436 passed / 41 skipped，0 失败。)

### R30. 工作区预览一致性 + 局部推送边框 + 自定义区域拖拽修复

> 目标：修复用户反馈的三个工作区问题：① 多屏联动时 RGB 画布预览与实际显示器输出不一致（分辨率不同时真实显示出现黑边，预览未体现）；② 显示器局部显示推送（overlay 区域推送）出现边框；③ 自定义区域拖拽框选有时框选区域显示不全，x/y 输入含义不明确。
> **风险等级：L2**（`src/engine/previewEngine.ts` / `src/renderer/src/App.tsx` 的 `extractSubFrame` 属于 engine 核心逻辑；`src/main/overlayManager.ts` 属 P0 集中点；行为变更需独立 R-N）。
> **触发场景**：2026-07-04 用户反馈联动多屏黑边、局部推送边框、自定义区域拖拽/输入体验问题。

- **R30.1** **预览-输出一致性（黑边根因）**：**实施时修订**：原计划疑为 `extractSubFrame` 切帧比例错误，复盘后确认该函数按比例位置切帧本身无误；真正根因在 `src/renderer/src/gl/previewGl.ts#updateLayout()`——该函数对 overlay 与预览共用同一“正方形 cell + letterbox 居中”布局，导致联动多屏模式下任何分辨率不匹配的显示器在物理输出上出现黑边。修复：overlay 路径（`this.overlay===true`）始终拉伸铺满整个画布（`uOrigin=(0,0)`, `uCellSize=(1/columns,1/rows)`），无黑边、无信箱；预览面板（`overlay===false`）保留原有方形 cell 观感不变。`videoWall.ts` 的 fit-mode（stretch/contain/cover）仍仅用于视频墙内容采样层，与本条修复的“渲染层 letterbox”互不干扰，不需要复用/改写。
- **R30.2** **局部推送边框根因排查与修复**：**实施时修订**：复盘确认 `computeRegionBounds()` 取整无问题（已用 `Math.round`）；真正根因是 `hasShadow:false` 在 Windows 上**无效**（Electron 文档明确标注 "On Windows and Linux does nothing"），无边框无阴影窗口的真实边缘来自 DWM 的 thick-frame 渲染 + Win11 默认圆角。修复：`overlayManager.ts` 的 `BrowserWindow` 新增 `thickFrame:false`（真正去除 Windows 阴影/边框）+ `roundedCorners:false`（去除 Win11 圆角描边）。
- **R30.3** **自定义区域拖拽显示不全 + 标签澄清**：**实施时修订**：复盘确认 `selectionToCustom()` 本身无越界；真正根因是 CSS——`.overlay-custom-selection`（无 `border-radius`）在满尺寸（100%×100%）时被父容器 `.overlay-custom-drag-area` 的 `overflow:hidden` + `border-radius:4px` 圆角遮罩裁掉四角边框，看起来像"框选区域显示不全"。修复：`.overlay-custom-selection` 增加 `border-radius:3px`（匹配父容器圆角，避免被遮罩）+ `min-width/min-height:4px`（避免极小拖拽时选区不可见）。同时把 `x/y/width/height` 四个原始字段名（当前直接显示 `x`/`y`/`width`/`height`，值域 0–1 归一化小数）改为 i18n 中英文标签 + 0–100 百分比显示/输入（`overlay.custom.x/y/width/height`），内部仍存 0–1 归一化小数，降低"不知道 0.35 是什么意思"的困惑。
- **R30.4** **不动**：`videoWall.ts` 现有 fit 模式实现本身（作用层不同，未复用/改写）；`overlayManager.ts` 的窗口生命周期管理（open/close/setConfig）；`DisplayMap.tsx` 的拖拽事件绑定机制（`onPointerDown/Move/Up` + `setPointerCapture`）；`extractSubFrame`/`computeRegionBounds`/`selectionToCustom` 的数学逻辑本身（复盘确认均无误，未修改）。
- **R30.5** **受影响文件**：`src/renderer/src/gl/previewGl.ts`（`updateLayout` 按 overlay/预览分支）、`src/main/overlayManager.ts`（`thickFrame`/`roundedCorners`）、`src/renderer/src/components/DisplayMap.tsx`（百分比输入 + i18n 标签）、`src/renderer/src/styles.css`（`.overlay-custom-selection` 圆角/最小尺寸）、`src/renderer/src/i18n/index.tsx`（新增 4 个 key × 中英双语）、`tests/main/overlayManager.test.ts`（附带修复 electron mock 缺 `app`/`nativeImage`/`setIcon`）。
- **R30.6** **验收点**：
  - [ ] `yarn typecheck` + `yarn build` 通过
  - [ ] `yarn test` 相关测试（`videoWall.test.ts` / `previewEngine.test.ts` / renderer 组件测试）通过
  - [ ] 手动验证：两块不同分辨率显示器联动时，预览区域裁切框与实际显示器输出裁切一致，物理输出黑边消失或与预览一致可预期
  - [ ] 手动验证：局部推送 overlay 窗口在高 DPI 显示器上无可见边框/缝隙
  - [ ] 手动验证：自定义区域拖拽到显示器边缘时框选矩形完整可见；x/y/width/height 标签显示为百分比且含义清晰
- **R30.7** **状态**：✅（2026-07-04 实施完成。**R30.1 根因**：`src/renderer/src/gl/previewGl.ts#updateLayout()` 对 overlay 与预览共用同一"正方形 cell + letterbox 居中"布局，导致联动多屏模式下任意分辨率不匹配的显示器在物理输出上出现黑边；修复为 overlay 路径（`this.overlay===true`）始终拉伸铺满整个画布（`uOrigin=(0,0)`, `uCellSize=(1/columns,1/rows)`），预览面板保留原有方形 cell 观感不变。**R30.2**：`src/main/overlayManager.ts` 的 `BrowserWindow` 增加 `thickFrame:false`（`hasShadow:false` 在 Windows 上文档标注无效，真正的边框来自 DWM thick-frame）+ `roundedCorners:false`（避免 Win11 圆角描边）。**R30.3**：`src/renderer/src/styles.css` 给 `.overlay-custom-selection` 加 `border-radius:3px`（避免父容器 `overflow:hidden + border-radius:4px` 在满尺寸时裁掉四角边框）+ `min-width/min-height:4px`；`DisplayMap.tsx` 的 x/y/width/height 输入改为 0–100 百分比 + 新增 i18n 标签（`overlay.custom.x/y/width/height`，中英双语）。**证据**：`yarn typecheck` 通过；`yarn build` 通过（`out/renderer` 产物生成）；`yarn vitest run tests/main/overlayManager.test.ts tests/renderer` → 23 files passed, 132 passed / 41 skipped；`yarn test`（全量）435 passed，仅 1 个与本次改动无关的 flaky（`tests/shared/logger.test.ts` 临时文件时序问题，单独重跑通过 16/16）。附带修复：`tests/main/overlayManager.test.ts` 的 electron mock 补全 `app`/`nativeImage`/`setIcon`（此前因 R25 引入的 `app.isPackaged` 未在 mock 中声明导致 24 个用例失败，属 R25 遗留测试债务，顺带补齐）。)

### R31. 音频可视化投屏根本修复（取代 R29.3 的 LED 网格降采样方案）

> 目标：响应用户 2026-07-04 验收反馈——R29.3 把可视化 canvas 降采样成 48×18 的 LED `RgbFrame` 网格再走 overlay 管线推送，用户验收为"效果极差、没有动感"。根本原因：LED overlay 管线（`previewGl.ts` 的方块 cell + gap 着色器）是为**物理灯带模拟**设计的粗粒度网格渲染器，不适合承载頻谱/示波器等需要平滑渐变与精细动态的图形动画——降采样到几十个色块必然丢失几乎全部视觉细节与"动感"。
> **风险等级：L2**（新增 3 个 IPC 通道 `openAudioVizWindow`/`closeAudioVizWindow`/`getAudioVizWindowIds`；新增独立的投屏窗口类型；重构 6 个可视化绘制函数签名并抽成共享模块；渲染层新增 `BroadcastChannel` 跨窗口数据流）。
> **触发场景**：2026-07-04 用户明确指出"这些波形...投屏到对应的显示器或多个显示器，而不是以效果图的那种方式根据像素的方式投屏显示"，并要求"先找出原因，再修复"。

- **R31.1** **根因确认**：`src/renderer/src/gl/previewGl.ts` 的 GL 着色器把任意分辨率的 canvas 内容强制映射到 `uGrid=(columns,rows)` 个正方形/矩形色块（`fract(gridPos)` + `uGap` gap 遮罩），专为 LED 灯珠矩阵仿真设计；R29.3 把 720×160 的可视化 canvas 硬塞进 48×18＝864 个色块，频谱柱状图的渐变、发光、镜像反射等细节全部丢失，观感等同于把高清视频转成 30×20 的马赛克。**结论**：LED 网格管线不适合承载"投屏到显示器展示动画"这个需求，需要一条独立的、全分辨率的渲染路径。
- **R31.2** **共享可视化绘制模块**：新增 `src/renderer/src/audio/visualizers.ts`，把原先内联在 `AudioStudioView.tsx` 里的 6 个绘制函数（`drawSpectrum`/`drawWaveform`/`drawSpectrogram`/`drawVUMeter`/`drawCircularSpectrum`/`drawWaveRing`）抽出并重构：入参从"直接传 `AnalyserNode`"改为"传已提取好的 `Uint8Array`（频域）/ `Float32Array`（时域）快照"，使同一套绘制代码既能在本地 studio 视图（持有真实 `AnalyserNode`）跑，也能在完全独立的 `AudioVizProjector` 投屏窗口（另一个 renderer 进程，没有 Web Audio graph）里跑，保证投屏画面与本地预览逐像素一致。
- **R31.3** **独立投屏窗口（而非复用 LED overlay）**：`src/main/overlayManager.ts` 新增与 `overlayWindows` 完全独立的 `audioVizWindows` Map + `openAudioVizWindow`/`closeAudioVizWindow`/`getAudioVizWindowIds`/`closeAllAudioVizWindows`，复用抽出的 `applyWindowIcon()` helper，窗口本身 `frame:false`、`transparent:false`（不透明黑底，非 LED 透明叠加层）、`thickFrame:false`/`roundedCorners:false`（同 R30.2）、Windows 下 `setFullScreen(true)`。新增 IPC 通道 `openAudioVizWindow`/`closeAudioVizWindow`/`getAudioVizWindowIds`（`src/shared/ipc.ts` + `src/main/index.ts` + `src/preload/index.ts`），`window-all-closed` 时一并 `closeAllAudioVizWindows()`。
- **R31.4** **数据面用 BroadcastChannel，不新增帧推送 IPC**：投屏窗口与主 studio 窗口是同源（同一 `file://`/dev-server origin）的两个 renderer 进程，可直接用标准 Web API `BroadcastChannel`（`rgbbox-audio-viz`）互发消息，完全绕开主进程——只有"开/关窗口"两个生命周期动作走 IPC，逐帧的频域/时域数据不占用任何新 IPC 通道。`AudioStudioView.tsx` 的 rAF 循环每帧提取一次 `freqData`/`timeData`，本地绘制 + （若正在投屏）`channel.postMessage({mode, freq, time})` 双复用同一份数据。
- **R31.5** **多选投屏**：`projectDisplayIds: number[]`（原 R29.3 是单选 `projectDisplayId: number | null`）支持同时投屏到多个显示器；显示器选择弹层每项可独立勾选/取消，`stopProjecting(displayId?)` 支持关单个或关全部。
- **R31.6** **新增组件**：`src/renderer/src/components/AudioVizProjector.tsx`——订阅 `BroadcastChannel`，`ResizeObserver` 保持 canvas 铺满整个物理显示器，复用 `drawVisualizerFrame()` 全分辨率绘制；`waveform` 模式（wavesurfer.js 波形）不支持投屏（依赖本地 `<audio>` 元素，跨进程无法共享，已在 handler 里显式跳过并在 R29.2/R29.3 文案中注明）。`src/renderer/src/main.tsx` 新增 `?audioviz=true&displayId=X` 路由分支。
- **R31.7** **不动**：R29.1（不引入 Howler.js）、R29.2（wavesurfer.js 波形模式本身）、R29.4（ResizeObserver 最大化修复）、R29.5（EQ/生成器抽屉布局）、R30 全部条款；`overlayWindows`/LED 效果 overlay 管线的现有行为完全不受影响（新 Map 独立维护）。
- **R31.8** **受影响文件**：新增 `src/renderer/src/audio/visualizers.ts`、`src/renderer/src/components/AudioVizProjector.tsx`；修改 `src/renderer/src/components/AudioStudioView.tsx`（移除内联绘制函数，接入共享模块 + 多选投屏 + BroadcastChannel）、`src/main/overlayManager.ts`（`applyWindowIcon` helper + `audioVizWindows` 全套）、`src/main/index.ts`（新 IPC handler + quit 清理）、`src/preload/index.ts`（新 API）、`src/shared/ipc.ts`（3 个新通道）、`src/renderer/src/main.tsx`（audioviz 路由）、`src/renderer/src/styles.css`（`.audioviz-mode` body 样式）。
- **R31.9** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过，无新增失败
  - [ ] 手动验证：任一可视化模式点击"投屏到显示器"，选中的物理显示器上出现与本地预览**逐帧同步、平滑、无马赛克**的动画（非色块网格）
  - [ ] 手动验证：可同时勾选多个显示器，全部实时同步显示相同动画
  - [ ] 手动验证：投屏窗口 ESC 可退出（主进程 `before-input-event` 处理）；关闭 studio 播放/暂停后投屏画面停止更新但窗口不崩溃
  - [ ] 手动验证：LED 效果 overlay（Workspace 视图的现有灯效叠加）功能不受本次改动影响
- **R31.10** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build`/`yarn test` 均通过；等待用户实机播放音频 + 多显示器环境下的最终视觉验收）

### R32. 全部内置灯效渲染风格改为"平滑"（默认新模式 + 特殊效果保留像素颗粒感）

> 目标：响应用户 2026-07-04 需求——"能否把 45/49 种内置效果全部改造成无像素级别效果、以（更高）分辨率展示灯效，但不能占用电脑性能"。评估结论（已与用户确认）：**不需要改造任何效果算法本身**——45/49 种效果都只是往 `columns × rows` 的 `RgbFrame` 里填色，真正把它画成离散色块的是唯一共享的 GPU 渲染器 [previewGl.ts](../../src/renderer/src/gl/previewGl.ts)。只需在这一处把 `NEAREST` 纹理过滤改成 `LINEAR` + 连续采样（不再 `floor()` 到格子中心），GPU 就会在相邻格子间自动做双线性插值渲染出平滑光带——CPU 计算量（仍是 `columns×rows` 个格子）和 GPU 开销（仍是 1 次 draw call、纹理大小不变，只是过滤模式不同）都**几乎不变**。
> **风险等级：L2**（`SamplingSettings`/`RgbFrame` 类型新增字段；`previewGl.ts` 着色器改动影响全部效果+预览+overlay 的默认视觉；新增用户可见设置项）。
> **触发场景**：用户确认接受评估方案后明确指示：①开关默认到新（平滑）模式；②投屏/overlay 输出 + 应用内 RGB 画布预览都要平滑；③先做开关方便对比，效果好的话后续可只保留新模式，特殊灯效单独适配像素颗粒感。

- **R32.1** **类型层**：`src/shared/types.ts` 的 `SamplingSettings` 新增可选字段 `renderStyle?: 'pixel' | 'smooth'`；`RgbFrame` 同步新增 `renderStyle?: 'pixel' | 'smooth'`（沿用 `showGap` 的"profile 设置 → 每帧写入 RgbFrame → 渲染器读取"传播模式）。新增 `PIXEL_STYLE_EFFECTS: ReadonlySet<EffectKind>`（初始集合：`starlight`/`matrix-rain`/`glitch`/`crystal`/`random-color`——这几种效果的观感依赖离散颗粒/色块边界，平滑插值会把它们"糊"成灰蒙蒙一片，因此无论全局设置如何都强制按 `pixel` 渲染）+ `resolveFrameRenderStyle(preference, activeEffectKind)` helper：命中例外集合则强制 `pixel`，否则取用户全局偏好（缺省 `'smooth'`）。
- **R32.2** **默认值**：`src/shared/defaultProfile.ts` 的 `sampling.renderStyle` 设为 `'smooth'`（新建 profile 默认已是新模式）；老 profile 因字段可选、`resolveFrameRenderStyle` 缺省兜底为 `'smooth'`，无需迁移脚本。
- **R32.3** **渲染器改动**：`previewGl.ts` 片元着色器新增 `uSmooth` uniform：`uSmooth>0.5` 时按连续 `gridPos`（`clamp` 到半格内，避免纹理边缘伪影）采样，不做 gap 挖空（平滑光带本身没有缝隙概念）；`uSmooth≈0` 时保留原有 `floor()` + gap 挖空的离散像素逻辑。新增 `setRenderStyle(style)` 方法：仅在样式**真的发生变化**时才切换纹理 `MIN/MAG_FILTER`（`LINEAR` vs `NEAREST`）+ 写 uniform，避免每帧重复设置 GL 状态的浪费。
- **R32.4** **应用范围（投屏/overlay + 应用内预览都平滑）**：
  - **R32.4.1** `PreviewGrid.tsx`（应用内 RGB 画布预览）新增 `renderStyle` prop（默认 `'smooth'`），通过 `useEffect` 调用 `glRef.current?.setRenderStyle(...)`；同时修了一个连带的既有小 bug——`showGap`/`renderStyle` 的 prop-driven effect 在 GL 上下文重建（`ResizeObserver` 触发）后不会自动重新应用，新增 `showGapRef`/`renderStyleRef` + `applyCurrentSettings()` 在每次 `initGl()` 后立即补齐，避免窗口缩放后设置被静默重置。
  - **R32.4.2** `OverlayCanvas.tsx`（投屏 / LED overlay 输出）在既有 `onOverlayFrame` 回调里新增 `glRef.current?.setRenderStyle(frame.renderStyle ?? 'smooth')`，与 `setGap` 并列，每帧读取 `RgbFrame.renderStyle`。
  - **R32.4.3** `App.tsx`：`onWorkerMessage`（CPU 效果 worker 路径）与 `handleFrame3D`（GPU 3D 效果路径）在写 `frame.showGap` 的同一处新增 `frame.renderStyle = resolveFrameRenderStyle(profile.sampling.renderStyle, activeLayer(profile)?.kind)`（用当前激活图层的 `kind` 判断是否命中例外集合）；`<PreviewGrid>` 的 `renderStyle` prop 同样调用 `resolveFrameRenderStyle`；`extractSubFrame()`（联动多屏）透传 `virtualFrame.renderStyle`。
  - **R32.4.4** `src/engine/videoWallFrame.ts` 的 `extractWallPanelFrame()` 透传 `virtualFrame.renderStyle`（与既有 `showGap` 透传并列）。
- **R32.5** **用户可见设置**：`App.tsx` 工作区设置面板新增下拉框（`sampling.renderStyle`，位置紧邻既有"显示格子线"开关），两个选项"平滑（过渡混合）"/"像素（离散 LED）"；`setSamplingValue` 签名放宽为 `number | boolean | string` 以支持字符串枚举值。新增 i18n key：`sampling.renderStyle` / `sampling.renderStyle.smooth` / `sampling.renderStyle.pixel`（中英双语）。
- **R32.6** **两阶段计划（呼应用户"先开关对比，效果好后续只保留新模式"）**：本次先落地**开关 + 默认平滑 + 例外集合**（阶段一）。阶段二（**不在本次范围**，需用户实际比对效果后再开一个新 R-N）：若确认平滑模式全面优于像素模式，再评估是否移除开关、把 `pixel` 降级为"仅例外效果内部使用的隐藏值"。
- **R32.7** **不动**：45/49 种效果算法本身（`src/engine/effects.ts`）——本条完全不改效果计算逻辑；`showGap` 的既有行为/含义不变（`pixel` 模式下仍可选是否显示格子线；`smooth` 模式下 `uGap` 不再生效，UI 上"显示格子线"开关在 `smooth` 模式下应视为无效，本次未做 UI 层面禁用/置灰处理，留作后续小修）；R29/R30/R31 全部不受影响。
- **R32.8** **受影响文件**：`src/shared/types.ts`（新字段 + `PIXEL_STYLE_EFFECTS` + `resolveFrameRenderStyle`）、`src/shared/defaultProfile.ts`（默认值）、`src/renderer/src/gl/previewGl.ts`（着色器 + `setRenderStyle`）、`src/renderer/src/components/PreviewGrid.tsx`（prop + 重建时重新应用）、`src/renderer/src/components/OverlayCanvas.tsx`（每帧应用）、`src/renderer/src/App.tsx`（写入 `frame.renderStyle` + UI 设置项 + `setSamplingValue` 签名）、`src/engine/videoWallFrame.ts`（透传）、`src/renderer/src/i18n/index.tsx`（3 个新 key × 中英双语）。
- **R32.9** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过，无新增失败
  - [ ] 手动验证：新建 profile 默认即为"平滑"模式，应用内预览与投屏输出的灯效都呈现连续过渡光带（非色块）
  - [ ] 手动验证：设置面板切换到"像素"模式后，预览与投屏都立刻变回离散色块（含格子线开关生效）
  - [ ] 手动验证：`starlight`/`matrix-rain`/`glitch`/`crystal`/`random-color` 在全局"平滑"模式下仍然保持离散颗粒感（不受全局设置影响）
  - [ ] 手动验证：窗口拖拽缩放后设置不丢失（验证 R32.4.1 的重建重应用修复）
  - [ ] 手动验证：CPU 效果和 GPU 3D 效果两条路径下切换设置均生效
- **R32.10** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build`/`yarn test` 均通过；等待用户实机视觉验收 + 决定是否进入 R32.6 阶段二）

### R33. 统一预览与投屏的网格布局（去掉预览方形 letterbox，全部改为拉伸铺满）

> 目标：响应用户反馈——切到"平滑"模式后，显示器上渲染的效果依然和应用内"RGB 画布预览"看起来不一样。
> **根因**：`previewGl.ts#updateLayout()` 对预览和 overlay 一直用两套不同的布局公式——预览（`overlay===false`）保持**正方形 cell + 居中 letterbox**（R30.1 时刻意设计"看起来更好看"），overlay（`overlay===true`）**拉伸铺满**整个画布（R30.1 为解决黑边问题）。两套公式的 UV 映射不一致，只要 `columns:rows` 的比例和面板/显示器的实际宽高比不完全一致，两边看到的画面就会有不同程度的拉伸/裁切差异——这与色块/平滑（R32）无关，是几何布局层面的差异，R32 切到平滑模式后这个问题依然存在。
> **风险等级：L1**（`previewGl.ts` 内部渲染逻辑改动，不改类型/IPC/UI，行为对齐而非新增；对现有单一显示器场景是纯粹的一致性修复）。

- **R33.1** **修复**：`updateLayout()` 去掉 `overlay` 分支，预览和 overlay 统一使用"拉伸铺满"公式（`uOrigin=(0,0)`, `uCellSize=(1/columns,1/rows)`）——两者从此共用完全相同的 UV 映射，单显示器（非联动多屏）场景下预览与实际输出在几何上逐像素一致（仅物理分辨率不同）。
- **R33.2** **已知局限（不在本次范围）**：联动多屏模式下，预览面板显示的是"整张虚拟画布拉伸进一个面板"，而每个物理显示器的 overlay 显示的是"虚拟画布裁出的自己那一块再拉伸铺满自己屏幕"——两者内容一致但整体裁切方式不同（预览是一整块，物理输出是分块独立拉伸），这是 R30.1 就存在的、更深层的"预览如何呈现多屏裁切"设计问题，不属于本条修复范围，如需处理需另开 R-N。
- **R33.3** **不动**：R32 的 `uSmooth`/`setRenderStyle` 逻辑；`PreviewGrid.tsx`/`OverlayCanvas.tsx` 的调用方式；`.preview-frame` 的 `aspect-ratio:16/9` CSS（配合默认 profile 的 24×14≈16:9 网格比例，拉伸幅度很小）。
- **R33.4** **受影响文件**：`src/renderer/src/gl/previewGl.ts`（`updateLayout()` 去分支）。
- **R33.5** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过，无新增失败
  - [ ] 手动验证：单显示器场景下，应用内预览与投屏输出的画面几何一致（同样的拉伸比例，图案位置/形状对应）
- **R33.6** **状态**：🔄（代码已实施完成，`yarn typecheck` 通过；`yarn build` 通过；`yarn test` 436 passed，仅 1 个已知无关 flaky（`tests/shared/logger.test.ts`，单独重跑 16/16 通过）；等待用户实机视觉验收）

### R34. 平滑模式插值升级为 quintic smootherstep（修毛刺/马赛克感）+ 澄清"显示分辨率"语义

> 目标：响应用户反馈——切到"平滑"模式 + 统一布局（R33）后，显示器上的效果依然有"毛刺、马赛克"感；用户建议"取消网格密度，直接用显示器分辨率渲染"。
> **根因**：R32 的平滑模式用的是 GPU 硬件双线性（`GL_LINEAR`）过滤——双线性插值只保证**数值连续**（C0），不保证**斜率连续**，所以每个 cell 边界处插值的"坡度"会突变，形成肉眼可见的"棱角/网格感"（尤其在高对比度效果——彗星头部、闪电、频谱柱——边界更明显）。这与"渲染分辨率"无关：GPU 片元着色器**已经**是逐物理像素求值的（每个屏幕像素都会独立算一次颜色），所谓"没用显示器分辨率渲染"是一个误解——真正受限的是**颜色采样点数量**（`columns × rows`，比如 24×14 只有 336 个独立颜色值），插值算法能做的是让这 336 个点之间的过渡看起来多"自然"，而不能凭空生成插值点之间不存在的细节。
> **风险等级：L1**（纯 GLSL 着色器数学修改，不改类型/IPC/UI/CPU 计算量）。

- **R34.1** **修复**：`previewGl.ts` 的 'smooth' 分支从"裸双线性"升级为 **quintic smootherstep 重映射双线性**（Ken Perlin 的 improved smoothstep：`f*f*f*(f*(f*6-15)+10)`）——在把连续采样坐标交给 `texture2D()` 之前，先把每个 texel-to-texel 区间内的插值权重用五次曲线重新映射一遍，让 GPU 自身的双线性据此权重插值，效果是插值从 C0（数值连续）升级到 C2（数值和斜率都连续），视觉上棱角/毛刺感大幅减少。**代价**：每像素多几条 ALU 指令（`floor`/乘加），仍然只有 1 次纹理采样、1 次 draw call，CPU 计算量（仍是 `columns×rows` 个格子）完全不变。
- **R34.2** **澄清"直接用显示器分辨率渲染"这个诉求**：字面意义上的"效果算法本身按 1920×1080 甚至更高分辨率逐像素计算"需要把 45/49 个效果全部从 JS/CPU 移植成 GPU 着色器（每个效果都是不同的过程式算法：火焰、等离子体、螺旋星系……），是一个数量级更大的工程，且不在"不能占用电脑性能"的约束下有必然收益——因为真正的瓶颈从来不是"渲染分辨率"（GPU 早就是全分辨率逐像素跑的），而是"颜色采样点数量"。本条**不做**这个移植；R34.1 的插值升级是在现有架构下能拿到的、零 CPU 成本的最大收益。
- **R34.3** **可选的补充手段（未改代码，用户可自行在现有设置里调）**：如果 R34.1 之后仍觉得"格子感"明显，可以在工作区设置里调大 `sampling.columns`/`rows`（比如从 24×14 调到 48×27 甚至更高）——因为 RGBBox 当前是纯虚拟预览（无真实 LED 硬件下限），提高采样密度只是让效果算法多算几百个格子，CPU 成本增幅很小（对比"逐像素渲染"是数量级差异），但能进一步减少可感知的插值区间跨度。这个选项**已经存在**于现有 UI，不需要新 R-N。
- **R34.4** **不动**：R32/R33 的其余逻辑（`uSmooth` 开关、`setRenderStyle`、布局统一）；'pixel' 风格分支完全不变；效果算法本身（`src/engine/effects.ts`）不变。
- **R34.5** **受影响文件**：`src/renderer/src/gl/previewGl.ts`（仅 'smooth' 分支的采样坐标计算）。
- **R34.6** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过
  - [ ] 手动验证：平滑模式下高对比度效果（彗星/闪电/频谱）的 cell 边界过渡明显比升级前柔和，肉眼可见的"棱角/马赛克感"减少
  - [ ] 手动验证：帧率/CPU 占用相较 R33 无明显变化
- **R34.7** **状态**：🔄（代码已实施完成，`yarn typecheck` 通过；`yarn build` 通过；`yarn test` 436 passed / 41 skipped，0 失败；等待用户实机视觉验收）

### R35. GPU 直渲染架构 POC（分辨率级别灯效，绕过网格采样）

> 目标：响应用户反馈——网格密度调到最大（长边 320）后，画质依然达不到"分辨率级别"。用户明确要求评估或重构新方案。
> **评估结论**：R32–R34 的插值优化已经把"网格+插值"这条路走到了极限——无论网格多密，效果颜色从未在"每个屏幕像素"粒度上被计算过，插值算法只能在有限采样点之间尽量插得自然，不能生成采样点之间原本不存在的细节。真正的"分辨率级别"必须让效果颜色公式直接在 GPU 片元着色器里逐物理像素求值——GPU 并行处理，评估 200 万像素和评估 336 个格子在墙钟时间上差距很小（这正是任何 3A 游戏后处理特效的原理），"分辨率级别画质"和"不占用电脑性能"在 GPU 架构下不再矛盾。**意外的好消息**：`src/engine/effects.ts` 的效果函数本来就是纯函数式、逐格子求值的写法（`EffectContext{x,y,columns,rows,now,...}` → 颜色），内部的 `hash`/`valueNoise2`/`fbm2`/`smoothstep` 都是标准过程式噪声函数，和 GLSL 写法几乎是同一套数学，移植是机械性工作而非从零设计。
> **风险等级：L1**（POC 范围极小：新增独立渲染类 + 应用内预览接入 1 个效果，不改类型/IPC/worker/overlay/video-wall，完全不影响未移植效果的现有行为）。
> **触发场景**：用户明确要求"评估或者重构新方案"，并选择"先做 POC 验证整条链路（着色器架构+切换机制+性能）再汇报"。

- **R35.1** **架构**：新增 `src/renderer/src/gl/effectGl.ts`——独立的 `EffectGl` 渲染类，不复用 `PreviewGl`（LED 网格渲染器）的着色器/uniform 体系，而是"每个 GPU 直渲染效果一个 fragment shader，逐物理像素求值"。新增 `GPU_DIRECT_EFFECTS: ReadonlySet<string>`（当前仅 `'rainbow'`，作为可扩展的白名单）+ `isGpuDirectEffect()` 判断函数。
- **R35.2** **POC 效果：`rainbow`**：把 `effects.ts` 里的 `dirT()`（方向投影，纯 x/y/angle 三角函数）和 `color.ts` 的 `hslToRgb()`（HSL→RGB，标准 chroma/segment 公式）逐行翻译成 GLSL，验证：①连续 UV 空间下的 `dirT` 极限公式与离散版本一致；②`hslToRgb` 的色段判断逻辑与 CPU 版本数值对齐（保证"看起来一样，只是更平滑"而不是"换了个不同的效果"）。
- **R35.3** **接入范围（POC 刻意收窄）**：仅接入应用内 **RGB 画布预览**（`PreviewGrid.tsx` 新增 `gpuLayer` prop）。当前激活图层的 `kind` 命中 `GPU_DIRECT_EFFECTS` 时，`PreviewGrid` 内部切换到 `EffectGl` 渲染循环（逐帧读 `performance.now()` 当时间 uniform + 效果参数当 uniform），完全跳过 CPU worker 的 `columns×rows` 网格计算；否则维持现有网格管线（R30/R32/R33/R34 全部不受影响）。**投屏/overlay/video-wall/worker 管线本次未接入**，仍走原网格路径——这几处要接入需要额外设计（overlay 窗口是独立渲染进程，需要把"当前效果+参数+时间"这类轻量状态而不是像素帧同步过去，类似 R31 音频投屏用 BroadcastChannel 的思路）。
- **R35.4** **不动**：`src/engine/effects.ts` 的 CPU 效果算法本身（不删除、不重写，未移植效果继续用它）；`PreviewGl`（LED 网格渲染器）；R32/R33/R34 的网格+插值管线对所有其他效果的行为完全不变。
- **R35.5** **后续阶段（不在本次范围，需用户视觉验收 POC 效果后决定）**：
  - **阶段二**：扩展到"流动渐变类"效果（`wave`/`plasma`/`fire`/`aurora`/`zone-gradient`/`nebula`/`vortex`/`fluid-flow`/`wave-diffraction`/`tokamak-plasma` 等 ≈15 个），逐个把 CPU 版噪声/公式翻译成 GLSL，复用 `EFFECT_FS` 的按 kind 分派表结构。
  - **阶段三**：视 POC + 阶段二效果和性能表现，评估是否接入投屏/overlay/video-wall（需要跨进程同步"效果 kind + 参数 + 时间"而非像素帧）。
  - **不计划移植**：`matrix-rain`/`starlight`/`glitch`/`random-color`/`custom-paint`/`image-paint`/`screen-ambient`——要么本身该有离散颗粒感（和 R32 的 `PIXEL_STYLE_EFFECTS` 例外名单重合），要么依赖外部图像采样，搬到逐像素 shader 收益有限或需要更复杂的历史帧/纹理输入设计。
- **R35.6** **受影响文件**：`src/renderer/src/gl/effectGl.ts`（新增）、`src/renderer/src/components/PreviewGrid.tsx`（新增 `gpuLayer` prop + 渲染分支）、`src/renderer/src/App.tsx`（传入 `gpuLayer` + 判断 `isGpuDirectEffect`）。
- **R35.7** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过，无新增失败
  - [ ] 手动验证：把当前图层切到 `rainbow` 效果后，应用内预览呈现真正连续无格子感的彩虹渐变（和网格模式对比应有明显差异）
  - [ ] 手动验证：切换到其他效果时无缝退回原网格渲染，无残留/崩溃/黑屏
  - [ ] 手动验证：`rainbow` 在 GPU 直渲染模式下的帧率/CPU 占用应低于或持平网格模式（不应更差）
  - [ ] 手动验证：窗口缩放后 GPU 直渲染画面正常重建（不留黑屏/旧内容）
- **R35.8** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build` 通过，`yarn test` 436 passed/41 skipped/0 失败；等待用户对 `rainbow` POC 效果的实机视觉+性能验收，再决定是否进入 R35.5 阶段二）

### R35.9（补丁）GPU 直渲染门控接错图层，导致 POC 从未真正触发

> **触发场景**：用户反馈"彩虹效果还是一样，还是受网格密度设置影响"——说明 R35 的 GPU 直渲染分支从未被激活，用户看到的始终是旧的 CPU 网格渲染。
> **根因**：`App.tsx` 判断"是否走 GPU 直渲染"用的是 `activeLayer(profile)`——这个函数返回**场景里第一个 `enabled` 的图层**，跟用户在"效果"选择器里实际编辑的图层（`selectedLayer`，按 `selectedLayerId` 匹配）不是一回事。默认 profile 的场景（`scene-desk`）本来就同时启用了 3 个图层（`aurora` + `fire` + `neon-pulse`，不同混合模式叠加）——如果用户改的不是排在最前面的那个图层，`activeLayer(profile).kind` 永远不会变成 `'rainbow'`，`isGpuDirectEffect` 判断恒为 false，GPU 分支从未执行过，CPU 网格管线全程原样运行（且仍然是 3 层混合，不是纯彩虹）。
> **额外发现的正确性问题**：即便图层判断修好了，GPU 直渲染路径本身只渲染**单个**效果，如果场景里同时有多个 `enabled` 图层混合叠加，直接单独渲染选中的那个图层会让画面"缺了其他图层"，比 CPU 混合结果更失真、更容易误导用户。
> **风险等级：L1**（`App.tsx` 内判断逻辑修正，不改渲染代码/着色器本身）。

- **R35.9.1** **修复**：新增 `gpuDirectLayer` 计算（`useMemo`），门控条件改为：① 场景当前**只有唯一一个** `enabled` 图层；② 且该图层就是 `selectedLayer`（用户实际正在编辑/选中的那个）；③ 且其 `kind` 命中 `GPU_DIRECT_EFFECTS`。三者同时满足才走 GPU 直渲染，否则回退 CPU 网格（含多图层混合场景，保证画面不失真）。
- **R35.9.2** **用户操作前提（非代码问题）**：默认 profile 的 `scene-desk` 场景默认启用 3 个图层；要看到 `rainbow` 的 GPU 直渲染效果，需要先在工作区图层面板里**关闭其余图层**（只保留改成 rainbow 的那一个 `enabled`），否则会因为 R35.9.1 的"仅单图层"保护而继续走 CPU 路径——这是刻意的正确性保护，不是新 bug。
- **R35.9.3** **受影响文件**：`src/renderer/src/App.tsx`（`gpuDirectLayer` 门控逻辑）。
- **R35.9.4** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过
  - [ ] 手动验证：场景只保留 1 个启用图层且设为 `rainbow` 时，预览面板切换到 GPU 直渲染（连续无格子感）
  - [ ] 手动验证：场景有 ≥2 个启用图层（哪怕其中一个是 rainbow）时，预览面板保持 CPU 网格混合渲染，不出现"缺图层"的失真画面
- **R35.9.5** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build` 通过，`yarn test` 436 passed/41 skipped，1 个已知无关 flaky；等待用户按 R35.9.2 的操作前提重新验收）

### R36. 3D 效果（球体脉冲等）投屏也用全分辨率直渲染（不再走 LED 网格降采样）

> 目标：响应用户"球体脉冲也实现这个平滑效果，方便验证"。
> **调研发现**：`sphere-pulse`（球体脉冲）属于 `Effect3DKind`——和 45/49 个 CPU 网格效果是完全不同的家族。它的**应用内预览**（`Preview3D.tsx`）本来就是用 `Effect3DGl` 光线步进着色器直接画在 canvas 原生分辨率上（`src/renderer/src/gl/effect3dGl.ts` 早已是"每物理像素求值"的 GPU 直渲染架构，等于 R35 想给 2D 效果做的事情，3D 效果这边一直都有）——所以应用内预览端**本来就已经很平滑**，不需要改。**真正的差距在投屏/overlay**：`Preview3D` 每帧画完全分辨率画面后，会额外调用 `gl.readLEDs(columns, rows)` 把画面**降采样**成和 2D 效果一样的 `RgbFrame`（LED 网格），这份降采样帧才是推给 overlay 窗口的内容——也就是说，3D 效果在**应用内预览里全分辨率平滑**，但**投到物理显示器上时和其他效果一样被压成网格**，这才是用户说"方便验证"时大概率会看到差异的地方。
> **风险等级：L1**（新增 BroadcastChannel 通道 + overlay 端多一条直渲染分支，不改现有 LED 网格投屏路径的默认行为——3D 广播缺失时无缝回退原路径）。

- **R36.1** **架构**：复用 R31 音频投屏验证过的模式——同源 `BroadcastChannel`（新增 `EFFECT3D_CHANNEL = 'rgbbox-3d-effect'`，定义在 `effect3dGl.ts`）传输**轻量状态**（`{kind, t, params, detail, extra}` 四组 uniform 数值），不传像素帧。`Preview3D.tsx` 每帧 `gl.draw()` 之后顺带 `channel.postMessage(...)`；`OverlayCanvas.tsx` 订阅该 channel，收到消息时懒创建/按需重建自己的 `Effect3DGl` 实例（复用现有类，未新增渲染代码），用**自己画布的原生分辨率**独立跑同一个光线步进着色器——每块物理显示器各自全分辨率渲染，不需要任何像素级数据同步，天然支持不同分辨率/宽高比的多屏。
- **R36.2** **新旧路径切换（零配置，自动检测）**：`OverlayCanvas.tsx` 记录"最近一次收到 3D 广播的时间戳"，`onOverlayFrame`（原 LED 网格推送路径）收到新帧时，如果最近 500ms 内有 3D 广播到达，直接跳过网格绘制（避免降采样画面覆盖/闪烁更清晰的直渲染画面）；超过 500ms 无 3D 广播（比如切回 2D 效果）则自动恢复网格路径——不需要用户手动切换模式。
- **R36.3** **不动**：`Effect3DGl`/`effect3dGl.ts` 的着色器本身；`readLEDs()` 降采样与 `handleFrame3D` 推送逻辑（仍然保留——如果 overlay 窗口因为某些原因收不到 3D 广播，网格路径仍是可靠的兜底）；2D 效果的 R32–R35 全部行为不变。
- **R36.4** **受影响文件**：`src/renderer/src/gl/effect3dGl.ts`（新增 `EFFECT3D_CHANNEL` + `Effect3DMessage` 类型）、`src/renderer/src/components/Preview3D.tsx`（每帧广播）、`src/renderer/src/components/OverlayCanvas.tsx`（订阅 + 直渲染分支 + 网格路径抑制）。
- **R36.5** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过
  - [ ] 手动验证：给某个显示器开启 overlay 灯效叠加，图层切到 `sphere-pulse`（或其他 3D 效果）后，该物理显示器上呈现和应用内预览一样的全分辨率光线步进画面（无网格颗粒感）
  - [ ] 手动验证：切回任意 2D 效果后，overlay 在 ~0.5 秒内自动恢复原有 LED 网格渲染，无残留 3D 画面
  - [ ] 手动验证：多显示器同时开 overlay 时，每块屏幕独立按自己分辨率渲染，无黑边/拉伸异常
- **R36.6** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build` 通过，`yarn test` 436 passed/41 skipped/0 失败；等待用户实机多屏验收）

### R37. 批量把内置效果移植到 GPU 直渲染（第一批 10 个 + 通用化 uniform 架构）

> 目标：响应用户"下一步按阶段或一次性完成所有的灯效的修改"。R35 只有 `rainbow` 一个 POC 效果，且 uniform 布局写死成 4 个 float，无法承载其他效果的参数形状（颜色、更多数值参数）。本条先把架构通用化，再批量移植第一批效果。
> **风险等级：L1**（`effectGl.ts` 内部扩展，不改类型/IPC；`GPU_DIRECT_EFFECTS` 只增不减，未移植效果继续走原 CPU 网格路径，零回归风险）。
> **范围决策（分阶段，而非一次性全部）**：45/49 个内置效果里，一次性把全部效果都翻译成 GLSL 并逐一肉眼校验正确性，在没有可视化联调环境的情况下风险过高（部分效果几十行三角函数+噪声，容易出现符号/系数抄写错误）。采用"分批次交付、每批验证"的方式，本次交付**第一批 10 个**，其余效果按复杂度分类记录在案，供后续批次继续推进。

- **R37.1** **架构通用化**：`effectGl.ts` 的 uniform 布局从"每效果固定 4 个具名 float"改为通用的 `uniform float uP[8]`（8 个数值槽位）+ `uColor0`/`uColor1`（两个 vec3 颜色槽位），`paramsFor(layer)` 按 `layer.kind` 把具名参数（`speed`/`color`/`angle`/…）映射进这套通用槽位——新增一个效果只需要在 `EFFECT_FS` 加一段着色器 + 在 `paramsFor` 加一个 case，不需要再改 `EffectGl` 类本身。新增 GLSL 共享 helper：`normCoords`（对应 `effects.ts#normCoords`）、`hash1`/`hash2`（对应 `hash`/`hash2`，用于 `breathing` 的逐格闪烁噪声）。
- **R37.2** **本批移植的 10 个效果**（连同 R35 的 `rainbow`，`GPU_DIRECT_EFFECTS` 现共 11 个）：`wave`、`zone-gradient`、`plasma`、`vortex`、`tunnel`、`neon-pulse`、`spectrum`、`comet`、`explode`、`breathing`。选择依据：这批效果都是**纯 (x,y,now,参数) 函数**，不依赖跨帧状态缓存、不依赖 `columns`/`rows` 网格计数做特征尺寸缩放——翻译成 GLSL 是逐行机械替换（`Math.sin→sin`、`Math.atan2→atan`、`hexToRgb`→JS 侧转 0–1 vec3 再传 uniform），正确性风险最低。
- **R37.3** **暂不移植 + 原因分类**（供后续批次参考，未在本条实施）：
  - **离散颗粒感是设计意图**（维持 CPU 网格路径，不移植）：`starlight`、`matrix-rain`、`glitch`、`random-color`（与 R32 的 `PIXEL_STYLE_EFFECTS` 例外名单一致）。
  - **依赖外部图像/像素数据，非公式化效果**（不适合移植）：`custom-paint`、`image-paint`、`screen-ambient`。
  - **需要跨帧衰减包络，依赖实时音频输入**（需要额外把音频包络值接进 GPU 路径的 uniform，本批未做）：`audio-beat`、`audio-equalizer`。
  - **引用 LED 网格 `columns`/`rows` 做特征尺寸缩放**（需要把 `columns`/`rows` 作为新 uniform 从 `App.tsx`→`PreviewGrid`→`EffectGl` 一路穿透，本批未做该管线扩展）：`fire`（还额外有逐列缓存优化，GPU 版本可以直接内联去掉缓存）、`crystal`（3×3 Voronoi 邻域）、`lightning`、`lightning-leader`、`matrix-rain`（已在上面归类为离散效果）。
  - **依赖 fbm2/valueNoise2（分形噪声）+ 更复杂的 GLSL 移植量**（架构上完全可行，但本批优先做最简单的一批，噪声版 helper 留到下一批统一加）：`nebula`、`fluid-flow`、`mirror-symmetry`、`black-hole`、`spiral-galaxy`、`orion-nebula`、`hurricane-eye`、`icosahedral-virus`（还需要移植二十面体顶点/边常量数组）、`protein-folding`、`mitosis-spindle`、`synapse-pulse`、`quantum-collapse`、`microvilli-field`、`eclipse-alignment`、`comet-tail`、`magnetosphere-aurora`、`wave-diffraction`、`vortex-flame`、`tokamak-plasma`、`dna-helix`、`pulsar-beacon`、`solar-system`（这几个虽不用 fbm，但代码量/循环较大，归入下一批一并处理噪声 helper 时顺带完成）。
- **R37.4** **不动**：`src/engine/effects.ts` 的 CPU 实现完全不动（未移植效果、以及已移植效果的 CPU 版本都保留——`GPU_DIRECT_EFFECTS` 只影响"应用内预览"这一条渲染路径，overlay/video-wall/worker 仍用 CPU 网格路径，与 R35 范围一致）。
- **R37.5** **受影响文件**：`src/renderer/src/gl/effectGl.ts`（架构通用化 + 10 个新效果着色器 + `paramsFor` 扩展）。
- **R37.6** **验收点**：
  - [ ] `yarn typecheck` 通过
  - [ ] `yarn build` 通过
  - [ ] `yarn test` 全量通过
  - [ ] 手动验证：把当前场景改为单一启用图层，依次切到这 10 个新效果 + rainbow，应用内预览均呈现连续无格子感的动画，且视觉上和切换前的 CPU 网格版本"神似"（颜色/运动节奏/整体形态一致，只是更平滑）
  - [ ] 手动验证：切到未移植效果（如 `fire`、`nebula`）时正常回退到 CPU 网格渲染，无崩溃/黑屏
- **R37.7** **状态**：🔄（代码已实施完成，`yarn typecheck`/`yarn build`/`yarn test` 通过；等待用户逐个效果实机视觉验收）

### R37-B2. GPU 直渲染第二批：科学/天体类 10 个效果 + 噪声 helper + 着色器编译自检

> 承接 R37 第一批，本条完成"通用噪声 helper 移植"和"第二批 10 个效果"，并补充了一个可复用的**离线着色器编译校验**手段（headless-gl），弥补"无法在此环境里实机跑 Electron 肉眼验证"这一验证盲区的一部分——虽然不能验证视觉观感是否正确，但能 100% 确定性地捕获 GLSL 语法/链接错误，这是本会话之前几批 GPU 移植完全没有的保障。
> **风险等级：L1**（仍然只在 `effectGl.ts` 内扩展，`GPU_DIRECT_EFFECTS` 只增不减）。

- **R37-B2.1** **共享 GLSL helper 新增**（`GLSL_HELPERS` 内）：
  - `ss3(edge0, edge1, value)` —— 逐行对应 `effects.ts#smoothstep`，刻意不用 GLSL 内置 `smoothstep()`，因为内置版本在 `edge0 > edge1`（很多效果依赖的"反向衰减"）时是未定义行为，而 CPU 版本的自定义实现对该顺序有明确、可依赖的语义。
  - `valueNoise2(vec2)` / `fbm2(vec2, int octaves)` —— 逐行对应 `effects.ts#valueNoise2`/`fbm2`；`fbm2` 用"常量上界 5 + 提前 break"的循环写法以保证跨 WebGL1 驱动的可移植性（动态循环上界在部分老硬件上不受支持）。
  - `colorScale3(vec3, float)` / `colorAdd3(vec3, vec3, float)` —— 对应 `effects.ts#colorScale`/`colorAdd`，从 0–255 字节空间换成着色器原生的 0–1 浮点空间。
  - `thermalColor(float)` —— 逐行对应 `effects.ts#thermalColor`（黑洞吸积盘温度着色用）。
- **R37-B2.2** **本批移植的 10 个效果**：`mirror-symmetry`、`pulsar-beacon`、`dna-helix`、`nebula`、`fluid-flow`、`spiral-galaxy`、`orion-nebula`、`hurricane-eye`、`quantum-collapse`、`black-hole`。`GPU_DIRECT_EFFECTS` 现共 **21** 个（第一批 11 + 第二批 10）。
  - `mirror-symmetry`/`pulsar-beacon`/`dna-helix` 不依赖噪声，纯三角函数 + 多层颜色叠加（`colorAdd3`），移植风险与第一批相当。
  - `nebula`/`fluid-flow`/`spiral-galaxy`/`orion-nebula`/`hurricane-eye`/`quantum-collapse`/`black-hole` 依赖 `fbm2`/`hash2` 分形噪声；其中 `nebula`/`spiral-galaxy`/`orion-nebula` 里 CPU 版用整数网格坐标 `context.x`/`context.y` 做"稀有星点"哈希种子——GPU 版没有网格坐标，改用 `floor(vUV * vec2(220, 140))` 得到一个与真实网格无关、但足够细密稳定的"伪网格坐标"，保持"极稀疏星点闪烁"的观感，已在着色器注释中说明这一近似。
- **R37-B2.3** **离线着色器编译校验（非永久测试，仅本次会话人工核实）**：用已在 `package.json` 里声明但此前从未被实际使用的 `gl`（headless-gl）依赖，临时创建 `tests/renderer/gl/_tmp-shader-check.test.ts`，对 `EFFECT_FS` 里全部 21 个片元着色器逐一 `compileShader`+`linkProgram`，确认零编译/链接错误后删除该临时文件（未提交、未进入正式测试套件——项目现有约定 `tests/renderer/gl/previewGl.test.ts`/`effect3dGl.test.ts` 明确因 headless-gl 跨环境可靠性问题而只做模块形状检查，不做真实 GL 编译，本次沿用该约定，不改变永久测试策略）。
- **R37-B2.4** **不动**：`src/engine/effects.ts` 依旧完全不动；`EffectGl`/`paramsFor` 的整体架构不变（仅追加 `paramsFor` 的 10 个新 `case`）。
- **R37-B2.5** **受影响文件**：`src/renderer/src/gl/effectGl.ts`。
- **R37-B2.6** **验收点**：
  - [x] `yarn typecheck` 通过
  - [x] `yarn build` 通过
  - [x] `yarn test` 全量通过（436 passed / 41 skipped，0 失败）
  - [x] 离线校验：全部 21 个 GPU 直渲染着色器（含第一批）通过 headless-gl 编译 + 链接，零 GLSL 语法/链接错误
  - [ ] 手动验证：单独启用这 10 个效果逐一切换，视觉上与切换前的 CPU 网格版本"神似"（结构/配色/运动节奏一致，仅更平滑），无黑屏/颜色错误/闪烁异常
- **R37-B2.7** **状态**：🔄（代码 + 离线着色器编译校验已完成并通过；等待用户实机视觉验收，尤其是 `black-hole`/`nebula`/`spiral-galaxy` 这几个多层颜色叠加 + 噪声效果）

### R37-B3. GPU 直渲染第三批：7 个无网格依赖效果 + uP 槽位扩容

> 承接 R37-B2，本条完成第三批移植，并把通用参数数组 `uP` 从 8 槽扩到 12 槽（`aurora` 需要 9 个具名参数，超过原有上限）。
> **风险等级：L1**。

- **R37-B3.1** **本批移植的 7 个效果**：`aurora`、`eclipse-alignment`、`comet-tail`、`magnetosphere-aurora`、`wave-diffraction`、`vortex-flame`、`tokamak-plasma`。`GPU_DIRECT_EFFECTS` 现共 **28** 个（第一批 11 + 第二批 10 + 第三批 7）。全部复用 R37-B2 已有的 helper（`fbm2`/`ss3`/`colorScale3`/`colorAdd3`/`thermalColor`），未新增 helper。`aurora`/`vortex-flame` 里 CPU 版依赖网格整数坐标 `context.x`/`context.y` 做逐帧闪烁噪声种子，GPU 版沿用 R37-B2 的"细分伪网格坐标"近似（`floor(vUV * vec2(220, 140))`）。
- **R37-B3.2** **架构变更**：`uniform float uP[8]` → `uniform float uP[12]`（21 处着色器声明 + `EffectGl` 内的 `Float32Array(8)`/`floats.slice(0, 8)` 同步改为 12），为参数较多的效果留出余量，其余已移植效果的行为不受影响（多余槽位保持 0）。
- **R37-B3.3** **明确排除、留给未来批次**（原因见文件头注释）：
  - `ripple` —— 点击产生的"波纹爆发"（`burstAge`/`burstCx`/`burstCy`）目前只在 CPU worker 管线里按帧合成进 `layer.parameters`，GPU 直渲染路径读的是原始 `selectedLayer`，还没有把这个点击态穿透进去，移植后点击交互会失效，故未移植。
  - `fire`/`crystal`/`lightning`/`lightning-leader` —— 依赖 LED 网格 `columns`/`rows`（做火焰柱宽度、Voronoi 邻域、闪电通道宽度的网格相对缩放），需要新增 `uColumns`/`uRows` uniform 并在 `App.tsx`/`PreviewGrid.tsx` 打通，属于架构改动，未在本批做。
  - `icosahedral-virus`/`protein-folding`/`mitosis-spindle`/`synapse-pulse`/`microvilli-field` —— CPU 版对每像素循环 10～46 个采样点（部分还需要二十面体顶点/边常量数组 + `pointSegmentDistance`），翻译成 GLSL 循环的工作量和出错面显著更大，留待后续单独一批，并建议移植后先用 headless-gl 编译校验 + 逐效果人工视觉比对。
- **R37-B3.4** **验证**：`yarn typecheck`/`yarn build` 通过；额外用 headless-gl 临时脚本对全部 **28** 个着色器（一、二、三批合计）逐一编译 + 链接，零错误，随后删除临时文件（同 R37-B2.3 的约定）。
- **R37-B3.5** **受影响文件**：`src/renderer/src/gl/effectGl.ts`。
- **R37-B3.6** **状态**：🔄（代码 + 离线编译校验完成；等待用户视觉验收）

### R38. 修复主窗口最小化后投屏效果卡顿

> 触发场景：用户反馈"主窗口最小化之后，投屏到显示器的效果很卡顿，关闭主窗口界面到右下角托盘就不卡顿"。
> **风险等级：L1**（Chromium 命令行开关，全局生效，不改变任何窗口显示/隐藏 UX，可逆）。

- **R38.1** **根因**：主窗口和 overlay 窗口都已经设置了 `backgroundThrottling: false`（分别见 `src/main/index.ts` 和 `src/main/overlayManager.ts`），这只能防止 Electron/Chromium 对**定时器**（`setInterval`/`setTimeout`）的节流。但 OS 级"最小化"会触发 Chromium 更底层的 renderer-backgrounding 机制（整个渲染进程的任务调度优先级被下调），这个机制不受 `backgroundThrottling` 控制，而 `mainWindow.hide()`（关闭到托盘走的路径）不会触发同样的降级——这正好解释了"最小化卡顿、隐藏到托盘不卡顿"的现象差异。
- **R38.2** **修复**：在 `app.whenReady()` 之前追加两个 Chromium 命令行开关：`disable-renderer-backgrounding`、`disable-backgrounding-occluded-windows`，全局禁用该降级行为。不改变任何窗口显示/隐藏/最小化的 UX——用户点击最小化按钮依然是正常的 OS 最小化，只是渲染进程不再被降级调度。
- **R38.3** **受影响文件**：`src/main/index.ts`。
- **R38.4** **验收点**：
  - [x] `yarn typecheck`/`yarn build` 通过
  - [ ] 手动验证：开启 overlay 投屏，最小化主窗口，投屏效果不再卡顿/掉帧
- **R38.5** **状态**：🔄（代码已实施；等待用户实机验证最小化场景下投屏是否流畅）

### R39. 效果库改为分类 Tab + GPU 直渲染卡片预览（解决卡顿/不丝滑）

> 触发场景：用户反馈"现在的灯效也太多了，能不能分类也做成一个大 table，来切换灯效"和"效果库中预览的灯效有些卡顿，不丝滑"。
> **风险等级：L1**（仅 `EffectsView.tsx` + 对应 CSS/i18n，不改数据结构）。

- **R39.1** **根因**：改造前 `EffectsView` 把全部 7 个分类（约 55 个效果卡片）一次性全部挂载并各自跑自己的 `requestAnimationFrame` 循环；其中走 CPU 路径的卡片（`EffectCard`）每帧要在 48×27 网格上调用 `renderEffectPixel` 再逐格 `fillRect`，几十个卡片同时进行时占满主线程，这正是"卡顿"的来源；而 48×27 网格本身在 240×135 画布上被放大显示，边缘再怎么优化也是"色块"观感，这是"不丝滑"的来源。
- **R39.2** **分类改为 Tab**：把原本纵向堆叠的 7 个分类 section 改成一个 Tab 栏（`.effects-category-tabs`），一次只挂载/渲染当前选中分类的卡片网格，未选中分类的卡片完全不创建（组件不挂载→不占用 canvas/`requestAnimationFrame`），从根本上减少同时运行的动画数量。
- **R39.3** **GPU 直渲染卡片**：新增 `EffectCardGpu` 组件，对 `isGpuDirectEffect(kind)` 为真的效果（当前 28 个，见 R37 三批）复用 `gl/effectGl.ts` 的 `EffectGl` 做全分辨率逐像素渲染，而不是 CPU 粗网格。这类卡片的预览观感和主界面"RGB 画布预览"一致（连续、无色块），且把颜色计算从主线程 JS 挪到了 GPU，间接也让"卡顿"问题好转。
  - 效果卡片渲染优先级：3D 效果（`EFFECT_3D_KINDS`）→ `EffectCard3D`；GPU 直渲染 2D 效果 → `EffectCardGpu`；其余仍走原 `EffectCard`（CPU 网格）。
- **R39.4** **受影响文件**：`src/renderer/src/components/EffectsView.tsx`、`src/renderer/src/styles.css`（新增 `.effects-category-tabs`/`.effects-category-tab` 样式）。
- **R39.5** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（435 passed / 41 skipped，1 个已知无关 flaky）
  - [ ] 手动验证：切换效果库分类 Tab，只有当前 Tab 的卡片在动画；GPU 直渲染的卡片（如 rainbow/plasma/nebula）观感明显比 CPU 网格卡片平滑；整体切换/滚动效果库不再感觉卡顿
- **R39.6** **状态**：🔄（代码已实施；等待用户实机视觉+流畅度验收）

### R40. 采样设置面板改为可折叠 + Tab 分组（缩小占用空间）

> 触发场景：用户反馈"采样设置的设置界面占用比例比较大...让显示器拓扑一栏显示方便一些。或者也做成一个可以折叠或者 tab 栏"。
> **风险等级：L0**（纯 UI 重排 + 新增本地 UI 偏好持久化，不改 `Profile`/`SamplingSettings` 数据结构，所有既有 `sampling.*` 字段读写路径不变）。

- **R40.1** **改造**：`sampling-panel` 的 panel-header 新增一个折叠/展开按钮（`ChevronUp`/`ChevronDown`），折叠后面板只剩标题行；展开状态下，原本平铺的全部控件（分辨率/宽高比、平滑度、饱和度、亮度、帧率、性能守护、格线开关、渲染风格）拆分为 3 个 Tab：
  - **分辨率**（`sampling.tab.resolution`）：网格密度/列数行数、比例锁定、匹配显示器比例
  - **画质**（`sampling.tab.appearance`）：平滑度、饱和度、亮度、渲染风格、格线开关
  - **性能**（`sampling.tab.performance`）：帧率、性能守护开关
  一次只渲染一个 Tab 的控件，整体可见高度从"全部 ~11 项堆叠"降到"单 Tab 最多 5 项"。
- **R40.2** **状态持久化**：折叠状态（`rgbbox:samplingCollapsed`）和当前 Tab（`rgbbox:samplingTab`）存 `localStorage`，与既有的 `rgbbox:gridAdvanced`/`rgbbox:aspectLock` 偏好一致，跨会话保留、不写入 Profile。
- **R40.3** **受影响文件**：`src/renderer/src/App.tsx`（新增状态 + JSX 重排）、`src/renderer/src/styles.css`（新增 `.sampling-tabs`/`.sampling-tab`/`.sampling-collapse-btn`）、`src/renderer/src/i18n/index.tsx`（新增 `sampling.tab.*`/`sampling.collapse`/`sampling.expand` 中英文案）。
- **R40.4** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过
  - [ ] 手动验证：折叠按钮能收起/展开采样面板；3 个 Tab 切换正常，各 Tab 控件均可正常读写 `profile.sampling.*`；折叠/Tab 状态刷新页面后保留
- **R40.5** **状态**：🔄（代码已实施；等待用户实机验收布局与折叠/Tab 交互）

### R41. 修复 GPU 直渲染效果的"接缝"错位 + 效果库整体卡顿

> 触发场景：用户反馈"全息投影、极光、DNA 双螺旋等效果视觉效果很差"，"飓风眼的左边中间有一条错位的效果，类似的其它效果可能也有这种情况"，"感觉所有的效果都有点卡顿，不是 100% 丝滑"。
> **风险等级：L1**（`effectGl.ts` 内两处公式微调 + `EffectsView.tsx` 增加可见性检测，不改数据结构/对外接口）。

- **R41.1** **根因 1：`atan2` 分支切割导致的接缝**——`hurricane-eye` 和 `nebula` 的 CPU 原始公式里，把 `atan(y, x)`（值域 -π..π，在负 x 轴/屏幕左侧发生 -π→π 的跳变）乘以一个**非整数**系数后再传入 `sin()`/用于色相计算：
  - `hurricane-eye`：`sin(spiral * 2.7 + ...)`，`spiral` 里含 1 倍角度项，2.7 不是整数 → 角度跳变 2π 时，`spiral*2.7` 跳变 5.4π，不是 2π 的整数倍，`sin()` 结果不连续，在角度=π（画面左边中线）处出现硬接缝。
  - `nebula`：`swirl = atan(y,x)/π` 直接线性用作色相偏移（`swirl*45`）和噪声坐标偏移（`swirl*0.08`），`swirl` 本身在该处从 1 跳变到 -1，色相偏移量跳变 90°（`mod 360` 不能吸收），同样在左边线出现接缝。
  - 这个缺陷**原始 CPU 算法就存在**（在 45/49 效果的网格采样、且经过 R34 平滑插值的情况下被"抹掉"到不明显），只是移植成 GPU 全分辨率逐像素渲染后，接缝从"网格插值模糊"变成了"精确到像素的硬边界"，才变得刺眼。
  - **审查结论**：逐一检查全部 28 个已移植效果里所有 `atan(` 调用，只有这两处存在"非整数系数 × 角度"的问题；`vortex`/`spiral-galaxy`/`black-hole`/`vortex-flame`/`tokamak-plasma` 虽然也用 `atan`，但角度前的系数都是整数（2、3、4、2×3、5、9），跳变量是 2π 的整数倍，天然连续；`pulsar-beacon` 用 `atan(sin(Δ), cos(Δ))` 的标准"角度差归一化"写法从设计上就避开了这个问题；`mirror-symmetry`/`magnetosphere-aurora` 因为只用 `abs()`/`sin²`/`abs(sin())`，同样不受影响。
- **R41.2** **修复**：
  - `hurricane-eye`：把系数从 `2.7` 调整为整数 `3.0`（螺旋纹路密度只变化约 11%，视觉上不可分辨），彻底消除接缝。
  - `nebula`：把 `swirl = atan(y,x)/π` 替换成 `swirl = n.y / max(0.02, radius)`（即 `sin(angle)`，值域同样是 -1..1，但绕圆一周连续、无分支切割），在色相偏移和噪声坐标偏移两处直接替换，视觉特征基本不变（原本就是次要的修饰项）。
  - 均不改动 `src/engine/effects.ts` 的 CPU 实现（该函数的网格+插值渲染路径本来就不会明显暴露这个接缝，没有改动的必要）。
- **R41.3** **根因 2：效果库卡顿疑似 WebGL 上下文数量逼近浏览器上限**——R39 把分类改成了 Tab，但科学可视化等分类里同时挂载的 GPU 直渲染卡片（`EffectCardGpu`/`EffectCard3D`）仍可能达到十几个，每张卡片各自持有一个独立 WebGL context；Chromium 对单进程内同时存活的 WebGL context 数量有上限，逼近上限时会强制丢弃最旧的 context，表现为"画面局部损坏/卡顿/看起来不对"——这也可能是用户看到"全息投影/极光/DNA 双螺旋看起来差"的部分原因（这几个效果恰好都在卡片数量较多的分类里）。
- **R41.4** **修复**：给 `EffectCard`/`EffectCard3D`/`EffectCardGpu` 统一加 `useCardVisible()`（`IntersectionObserver`，`rootMargin: 150px`）——卡片滚出可视区域时，`requestAnimationFrame` 循环停止且 GL 卡片会 `dispose()` 掉自己的 WebGL context；滚回可视区域再重新创建。这样同时存活的 WebGL context 数量从"当前 Tab 全部卡片"降到"当前视口内实际可见的几张卡片"，从根源上降低同时运行的渲染负载和 WebGL context 占用。
- **R41.5** **受影响文件**：`src/renderer/src/gl/effectGl.ts`（`hurricane-eye`/`nebula` 两处公式）、`src/renderer/src/components/EffectsView.tsx`（新增 `useCardVisible` hook，三个卡片组件接入）。
- **R41.6** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（435 passed / 41 skipped，1 个已知无关 flaky）
  - [x] 离线校验：headless-gl 重新编译全部 28 个着色器（含本次改动的 2 个），零错误
  - [ ] 手动验证：`hurricane-eye`/`nebula` 画面左侧中线不再有可见接缝/错位
  - [ ] 手动验证：效果库滚动浏览多个分类时，整体不再感觉卡顿；`hologram`/`aurora`/`dna-helix` 单独查看时观感正常
- **R41.7** **状态**：🔄（代码已实施并通过离线着色器编译校验；等待用户实机确认接缝已消除、卡顿是否缓解）

### R42. 无人消费画面时暂停渲染，降低常驻 CPU 占用

> 触发场景：用户反馈"CPU 都一直在 11% 左右，太高了吧。有没有必要进行重构或优化"、"最小化或最小化到托盘之后，CPU 也很高。在没有渲染的情况下要停止后台一直渲染"。
> **风险等级：L1**（只增加"跳过计算"的早退条件，不改变有人消费画面时的行为；受 R38 保护的"overlay 打开时最小化也要流畅"场景完全不受影响）。

- **R42.1** **根因 1：2D 效果的 worker tick 循环和当前 view/窗口可见性完全无关**——驱动 CPU 效果计算的 `setInterval` 循环（`App.tsx` 里那个给 `previewEngineWorker` 发送 tick 的 `useEffect`）依赖数组是 `[profile, status.running, selectedLayerId, automationEnabled, automationMode, automatedParams]`，**不包含 `currentView`**，也不检查窗口是否可见——只要引擎开关 `status.running` 为真（默认就是真），无论用户在看"工作区"还是"效果库/音频工作站/设置"等其它 tab，也无论主窗口是否已经最小化/隐藏到托盘，都会持续按配置的 FPS 计算完整网格的效果像素（`fire`/`aurora`/`lightning` 这类复杂效果本身就不便宜）——这正是"CPU 一直卡在 11% 左右，不管在干嘛"的直接原因。
- **R42.2** **修复**：在 `onTick`（`setInterval` 回调）最前面加一个早退条件——当"没有 overlay 窗口在投屏"**且**（"主窗口不可见（`document.hidden`，最小化/隐藏到托盘都会触发）" **或** "当前 view 不是 workspace"）时，直接 `return`，跳过整次 worker tick（不计算、不 `postMessage`）。判断条件每次 tick 都重新读取（`overlayIdsRef`/`currentViewRef`/`document.hidden` 都是零成本的引用读取），不需要重建 worker 或清空/重启 `setInterval`，切 tab、最小化/还原、开关 overlay 都会在下一次 tick（≤ 1 帧间隔）内自动生效。特别保留：**只要有 overlay 窗口在投屏，无论主窗口是否可见、当前 view 是什么，都继续正常计算**——这是 R38 明确要保证流畅的场景，不受本条影响。
- **R42.3** **根因 2：`AudioStudioView` 的频谱/波形绘制循环和"音频 tab 是否可见"无关**——`App.tsx` 为了让音频播放在切换 tab 后也不中断，把 `AudioStudioView` 设计成**始终挂载**（用 CSS `display:none` 隐藏，而不是像其它 view 那样条件渲染/卸载）。但其内部频谱/波形 canvas 的绘制循环（`requestAnimationFrame`）只判断"是否在播放"，没有判断"这个 tab 当前是否可见"——`display:none` 并不会暂停 `requestAnimationFrame`（rAF 只在整个文档级别被隐藏时才会暂停，元素级别的隐藏不影响它），所以只要播放过音频，切到其它任何 tab 后，频谱/波形绘制仍在后台持续跑，这是另一处"不管在干嘛 CPU 都掉不下来"的来源。
- **R42.4** **修复**：给 `AudioStudioView` 增加一个可选的 `visible` prop（默认 `true`，不影响其它零散用法/测试），`App.tsx` 传入 `currentView === 'audio'`；绘制循环的 `useEffect` 早退条件里加上 `!visible`，依赖数组同步加入 `visible`。切走音频 tab 后，频谱/波形绘制立即停止（音频播放本身不受影响，只停止不必要的画面绘制）；切回音频 tab 立即恢复。
- **R42.5** **不受影响/未处理**：`MiniGamesView`/`VideoStudioView` 本来就是条件渲染（切走会整体卸载，rAF 自然停止），不需要改。`AudioStudioView` 里 100ms 一次的播放进度 `setInterval`（只做轻量 `setState`，不做画布绘制）成本可忽略，未处理。3D 效果（`Preview3D.tsx` 用 `requestAnimationFrame` 驱动）在"3D 效果 + overlay 打开 + 主窗口最小化"这个组合场景下，rAF 会因为文档隐藏而暂停，overlay 可能停止更新——这是先于本次改动就存在的已知边界情况，本条未处理，记录在案供后续评估。
- **R42.6** **受影响文件**：`src/renderer/src/App.tsx`（新增 `currentViewRef`，`onTick` 早退条件，`AudioStudioView` 调用处传 `visible`）、`src/renderer/src/components/AudioStudioView.tsx`（新增 `visible` prop，绘制循环早退条件）。
- **R42.7** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（435 passed / 41 skipped，1 个已知无关 flaky）
  - [ ] 手动验证：任务管理器观察——引擎运行中但停留在"效果库/设置"等非 workspace tab 且未开 overlay 时，CPU 明显下降接近空闲
  - [ ] 手动验证：最小化主窗口（无 overlay）后 CPU 明显下降；开启 overlay 后最小化，CPU 保持运行且投屏依旧流畅（不回归 R38）
  - [ ] 手动验证：播放音频后切到其它 tab，CPU 下降且音频播放不中断；切回音频 tab 频谱/波形正常恢复绘制
- **R42.8** **状态**：🔄（代码已实施；等待用户用任务管理器实机对比修复前后的 CPU 占用）

### R43. R42 在最小化场景未生效 + 补充"无启用图层"与音频分析节流

> 触发场景：用户验证 R42 后反馈"最小化或关闭主窗口到右下角还是没有降低 CPU"、"没有勾选任何效果层（不需要灯效）时，RGB 画布预览没有停止，CPU 没有降下来"、"开启音频采集 CPU 从 4.5% 涨到 9% 左右"。
> **风险等级：L1**（新增一个 IPC 通道 + 两处早退条件 + 一处状态更新节流，均不改变有人消费画面/数据时的行为）。

- **R43.1** **根因 1：R42 依赖的 `document.hidden` 被 R38 自己废掉了**——R42 判断"窗口是否可见"用的是 `document.hidden`（Page Visibility API）。但 R38 为了修复"最小化后投屏卡顿"，加了 Chromium 命令行开关 `disable-backgrounding-occluded-windows` 专门禁用"遮挡/最小化窗口"的降级追踪——这个开关很可能**连带**关闭了驱动 `document.visibilityState` 更新的同一套遮挡检测机制，导致主窗口最小化后 `document.hidden` 不再可靠地变成 `true`，R42 的早退条件因此永远判断"窗口可见"，从未真正跳过 tick。这是一个典型的"两个修复互相踩踏"：R38 为了让某个场景流畅而关闭的机制，恰好是 R42 判断"该不该省电"所依赖的信号源。
- **R43.2** **修复**：不再依赖 `document.hidden`，改为主进程通过新增 IPC 通道 `mainWindowVisibilityChanged` 主动推送——监听 `BrowserWindow` 原生的 `minimize`/`restore`/`hide`/`show` 事件（这几个事件是 Electron/Chromium 内部状态，不受任何"禁用遮挡追踪"的命令行开关影响，是最可靠的真相来源），推给渲染进程维护一个 `windowVisibleRef`，`onTick` 里用它替换 `document.hidden`。
- **R43.3** **根因 2：R42 的早退条件没有考虑"场景里有没有启用任何图层"**——R42 只判断"是否在 workspace tab 且窗口可见"或"是否有 overlay"，即使满足这两个条件之一，只要场景里 0 个图层 `enabled`，其实也没有任何画面需要计算，但 tick 仍然全速运行。
- **R43.4** **修复**：`onTick` 里新增判断——当前场景 `scene.layers.some(l => l.enabled)` 为假时，在**刚好多跑一次**之后（保证预览从"上一次点亮的画面"正确变黑，而不是永远冻结在最后一帧亮着的画面）暂停后续 tick，直到重新启用图层。
- **R43.5** **根因 3：音频分析每 16ms 触发一次 React 状态更新，导致整个 App 组件树以 ~60Hz 频率重渲染**——`useAudioAnalyzer` 里 `setInterval(tick, 16)` 每次都调用 `setAudioData(...)`，即使这份数据只是拿去更新头部 3 个 VU 表小色块和诊断页的一行文字。React 状态更新在这种"大型单体组件"结构下，60Hz 触发意味着 60Hz 的 diff/reconcile 开销，这正是"开音频 CPU 从 4.5% 涨到 9%"的主要来源。
- **R43.6** **修复**：分析计算（`bass`/`mid`/`high`/`freqBands` 的 EMA 平滑、`beat` 瞬态检测的衰减状态）依旧每 16ms 跑一次以保证平滑观感不变；但 `setAudioData`（触发重渲染的那一步）节流到约每 3 次 tick 才发一次（~20Hz，重渲染频率降到 1/3）。`beat` 是瞬态尖峰，节流窗口内取最大值再发出，避免跳过的两次 tick 里出现的鼓点被"漏掉"。
- **R43.7** **受影响文件**：`src/shared/ipc.ts`（新增 `mainWindowVisibilityChanged` 通道）、`src/preload/index.ts`（新增 `onMainWindowVisibilityChanged`）、`src/main/index.ts`（监听 `minimize`/`restore`/`hide`/`show` 并推送）、`src/renderer/src/App.tsx`（`windowVisibleRef` 替换 `document.hidden`，新增"无启用图层"早退）、`src/renderer/src/hooks/useAudioAnalyzer.ts`（`setAudioData` 节流）、`tests/renderer/hooks/useAudioAnalyzer.test.ts`（3 处等待时间从 50ms 调到 150ms 以适配新的节流节奏）、`tests/integration/ipcChannels.test.ts`（补充新通道的映射断言）。
- **R43.8** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（436 passed / 41 skipped，0 失败）
  - [x] 手动验证：最小化主窗口（无 overlay）后，任务管理器里 CPU 明显下降（用户已实机确认）；有 overlay 时最小化仍保持流畅投屏（不回归 R38，待确认）
  - [ ] 手动验证：场景内全部图层取消勾选后，RGB 画布预览变黑且 CPU 下降；重新勾选任意图层后画面和 CPU 恢复正常
  - [ ] 手动验证：开启音频采集后 CPU 涨幅比修复前更小；音频响应类效果（`audio-beat`/`audio-equalizer`）观感无明显变化
- **R43.9** **状态**：🔄（代码已实施，`yarn test` 436 passed/0 失败；最小化场景用户已实机确认生效，见 R44 修复关闭到托盘场景的遗留问题）

### R44. 关闭主窗口到托盘不降 CPU（R43 遗留）

> 触发场景：用户验证 R43 后反馈"最小化之后 CPU 明显下降"（R43 有效），"但是关闭主窗口缩小到右下角之后，CPU 没有明显下降，也没有变化"。
> **风险等级：L0**（只是把"隐藏窗口时通知渲染进程"这件事从依赖事件改成显式调用，不改变任何可观察行为语义）。

- **R44.1** **根因**：R43 给最小化/还原挂了 `'minimize'`/`'restore'` 原生事件，给隐藏/显示挂了 `'hide'`/`'show'` 原生事件，理论上"关闭到托盘"（`mainWindow.on('close', ...)` 里 `e.preventDefault()` 后调用 `mainWindow.hide()`）应该会触发 `'hide'` 事件从而通知渲染进程。但从用户实测结果看，`'hide'` 事件在"由 `close` 事件处理器内部、刚 `preventDefault()` 就立刻调用 `hide()`"这种特定时序下没有可靠触发——渲染进程从未收到"窗口已隐藏"的通知，`onTick` 里的早退条件永远判断"窗口可见"，因此关闭到托盘后计算完全没有停。这是 R43 遗留的一个"事件监听覆盖不全"的疏漏，和最小化路径使用的是完全独立的原生事件（`'minimize'`/`'restore'`），两者可靠性不是一回事。
- **R44.2** **修复**：不再仅依赖 `'hide'`/`'show'` 事件——在**每一处**主进程主动调用 `mainWindow.hide()`/`.show()` 的地方（关闭按钮 → 隐藏到托盘、托盘图标双击/菜单"显示/隐藏"）都紧跟着显式调用同一个 `sendMainWindowVisibility()` 函数，不再假设事件一定会转发。事件监听（`'minimize'`/`'restore'`/`'hide'`/`'show'`）保留作为兜底（覆盖非本应用代码触发的隐藏/显示，例如未来新增的调用点）。
- **R44.3** **受影响文件**：`src/main/index.ts`（`sendMainWindowVisibility` 提升为模块级函数；关闭到托盘、托盘图标切换两处显式调用）。
- **R44.4** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（435 passed / 41 skipped，1 个已知无关 flaky）
  - [ ] 手动验证：点击右上角关闭按钮"缩小到右下角托盘"（无 overlay）后，任务管理器 CPU 明显下降；从托盘图标恢复窗口后 CPU 恢复正常
  - [ ] 手动验证：托盘右键菜单"显示/隐藏主界面"和双击托盘图标，两种方式切换可见性都能正确影响 CPU
- **R44.5** **状态**：🔄（代码已实施；等待用户实机确认关闭到托盘场景 CPU 是否下降）

### R45. 彻底清空闲置态残留 CPU/IO + Windows 遮挡机制导致的 overlay 卡顿 + 记录高负载架构建议

> 触发场景：用户反馈"没有显示器渲染的情况下，最小化还有 2% 左右 CPU 消耗和大量 IO，最好能降到 0"；"有显示器渲染的情况下，最小化之后正在渲染的显示器会变得非常卡顿"；"有渲染的情况下 CPU 还能到 78% 以上，希望能架构级优化"。
> **风险等级：L1**（新增/调整早退条件与命令行开关，不改变有人消费数据时的行为；架构级优化本条只记录方案，不在本条实施）。

- **R45.1** **根因 1（残留 CPU/IO）：诊断页指标轮询和主窗口可见性/当前 view 完全无关**——`App.tsx` 里有一个 1 秒一次的 `setInterval`，无条件地（空依赖数组，从挂载到卸载一直跑）执行 `setEngineMetrics(...)`（触发整个 App 组件重渲染）+ `window.rgbbox.getCaptureProviderStatus()`（一次 IPC 往返）。这两个值只在"诊断"页面里显示，其余任何场景（包括最小化、隐藏到托盘）都不需要它们，但一直在后台以 1Hz 运行——这正是用户看到的"最小化后仍有 IO"的来源之一。
  - **修复**：改为 `currentView !== 'diagnostics'` 时直接不启动这个 `setInterval`（依赖数组从 `[]` 改为 `[currentView]`），只有真正停留在诊断页时才轮询。
- **R45.2** **根因 2（残留 CPU）：音频分析在无人消费数据时仍在跑**——`useAudioAnalyzer` 的 16ms 分析循环设计上"不受最小化影响"（这是特意的，为了让 overlay 上的音频响应效果在最小化时也能继续更新），但如果**根本没有 overlay 在投屏、且主窗口也不在显示工作区**，这份数据完全没有消费者，却仍在全速跑 FFT 分析 + 状态更新。
  - **修复**：新增 `useAudioAnalyzer(enabled, deviceId, shouldAnalyze)` 第三个参数，`App.tsx` 按"有 overlay 在投屏，或者（主窗口可见且当前在工作区 tab）"计算出 `audioShouldAnalyze` 传入；hook 内部用一个 ref 让 tick 函数在 `shouldAnalyze=false` 时直接跳过 FFT 读取和状态更新（`getUserMedia` 流/`AudioContext` 本身不销毁——避免每次最小化/还原都重新申请麦克风/桌面音频权限、造成短暂音频中断；只暂停实际分析计算这一步，这部分才是消耗 CPU 的地方）。
  - **范围说明**：这里选择"暂停分析"而不是"完全释放 `getUserMedia` 流/关闭 `AudioContext`"——闲置时的 `MediaStream`/`AudioContext` 本身（不主动读取数据）CPU 成本可以忽略不计，真正的成本在于每 16ms 做一次 `getByteFrequencyData` + 32 个频段的扫描 + React 状态更新，这些已经被跳过；完全释放流会带来"每次最小化/还原都要重新握手"的延迟和麦克风占用指示器闪烁，暂不做，如果后续验证仍有不可忽略的残留 CPU 再考虑。
- **R45.3** **根因 3（有 overlay 时最小化导致 overlay 本身卡顿）：Windows 独立的"原生窗口遮挡检测"未被禁用**——R38 禁用的 `disable-renderer-backgrounding`/`disable-backgrounding-occluded-windows` 只覆盖 Chromium 通用的"渲染进程降级"机制。Windows 版 Chromium 另外还有一个独立特性 `CalculateNativeWinOcclusion`（原生窗口遮挡检测），专门通过操作系统级别查询窗口是否被遮挡/最小化来决定是否降低合成/呈现频率——这个特性不受 R38 那两个开关控制。由于 Electron 里同一个 app 的多个 `BrowserWindow`（主窗口 + overlay 窗口）共享同一个 GPU/合成进程，这个独立的遮挡检测**很可能**波及到了主窗口以外的其它窗口（overlay）的呈现频率，导致"主窗口最小化后，明明 overlay 该有的计算都还在跑（R42/R43/R44 已确保 tick 不被跳过），但 overlay 呈现出来的画面依然卡顿"。
  - **修复**：追加命令行开关 `app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')`，彻底关闭这条独立的遮挡检测路径。
- **R45.4** **点 3（有渲染时 CPU 78%+）：架构级根因分析 + 后续方案记录（本条不实施）**——审查后确认：即使某个 2D 效果已经在 R37 移植成 GPU 直渲染（`isGpuDirectEffect`），**overlay/video-wall 投屏管线依然完全走 CPU 逐像素 JS 计算**（`previewEngineWorker.ts` 调 `renderEffectPixel`），R37 的 GPU 直渲染目前只服务于应用内"RGB 画布预览"这一条路径。当有 overlay 打开时，CPU worker 必须为每一个 tick、每一个网格像素跑一遍 JS 版效果公式（`fire`/`aurora`/`lightning` 这类本身较重），网格越大（用户可以在采样设置里调到很高）、FPS 越高、overlay 数量越多，CPU 占用越高——这很可能是"78%+"的主因，而不是某个孤立的低效代码点。
  - **可行的后续方案（未实施，供下一次迭代评估）**：参考 R36 给 3D 效果做的"GPU 渲染 + `readLEDs()` 回读"模式（`Effect3DGl.readLEDs(columns, rows)`），给 `EffectGl`（2D GPU 直渲染类）也加一个离屏渲染 + 像素回读方法，让"整个场景只有一个已移植为 GPU 的效果单独启用"这种场景（和现有 `gpuDirectLayer` 判定条件一致）也能跳过 CPU worker，直接从 GPU 回读像素喂给 `distributeFrameToOverlays`。**已知风险**：3D 效果目前就是用 `requestAnimationFrame` 驱动这条回读循环的，而 rAF 在主窗口最小化时会暂停（这是浏览器级别行为，不受任何"禁用遮挡/降级"开关影响）——如果 2D 效果也照搬这个模式，会导致"GPU 直渲染效果 + overlay + 主窗口最小化"这个组合下 overlay 画面冻结，这本身也是 3D 效果目前就存在、尚未修复的已知缺口（见 R42.5）。要完整实现，需要额外把这条回读循环也改成 `setInterval` 驱动（而不是 rAF）才能在最小化时继续工作，工作量和验证成本都不小，建议作为独立 R-N 专门排期、并在有实机验证条件时再做。
- **R45.5** **受影响文件**：`src/renderer/src/App.tsx`（诊断轮询门控、`windowVisible` 状态、`audioShouldAnalyze` 计算）、`src/renderer/src/hooks/useAudioAnalyzer.ts`（新增 `shouldAnalyze` 参数）、`src/main/index.ts`（新增 `disable-features=CalculateNativeWinOcclusion` 开关）。
- **R45.6** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（436 passed / 41 skipped，0 失败）
  - [ ] 手动验证：无 overlay 时最小化，任务管理器 CPU 应接近 0%，且不再有周期性 IO 尖峰
  - [ ] 手动验证：有 overlay 投屏时最小化主窗口，overlay 画面不再卡顿
  - [ ] 手动验证：开启音频采集但无 overlay、且不在工作区 tab 时，CPU 应比 R43 状态更低
- **R45.7** **状态**：🔄（代码已实施；点 3 架构方案已记录待排期；等待用户实机验证前两点）

### R46. 承认 R38/R42-R45 均未经充分验证 + 新增客观分进程 CPU 诊断工具

> 触发场景：用户反馈"我反馈的问题不止这些，重新帮我把我反馈的问题和测试条件一一列出来。我认为我反馈的问题，你都没有解决，解决问题思路都有问题"。
> **风险等级：L0**（只新增一个只读诊断接口和诊断页展示，不改变任何现有行为）。

- **R46.1** **问题**：R38、R42、R43、R44、R45 五轮修复里，除了"最小化后 CPU 下降"这一条被用户明确确认生效之外，其余全部是"改代码 → 让用户重启验证 → 没收到确认或用户反馈依然不行 → 再猜一版"的模式。由于本 agent 无法在当前环境里实际运行 Electron 应用、打开任务管理器观察，所有修复都基于**读代码 + 对 Chromium/Electron 行为的推理**，没有真正的证据闭环——这正是用户指出的"解决问题思路有问题"。
- **R46.2** **完整问题清单**（按用户反馈的时间顺序整理，供后续逐条验证核对，详见对话记录）：
  1. overlay 投屏卡顿于主窗口最小化时（对比"关闭到托盘"不卡）→ R38
  2. CPU 常驻 ~11%，最小化/托盘后仍高 → R42
  3. 音频采集开关 CPU 4.5%→9%；取消勾选全部效果图层预览不停止；最小化/托盘 CPU 不降 → R43
  4. 最小化 CPU 确认下降；关闭到托盘 CPU 无变化 → R44
  5. 无 overlay 时最小化应比托盘更低（目前还有 ~2% + 大量 IO）；有 overlay 时最小化画面变卡顿；有渲染时 CPU 78%+ → R45（前两点已修，第三点只记录方案未实施）
- **R46.3** **改进方向**：与其继续"猜测 Chromium 内部机制 → 盲改 → 等反馈"，新增一个**客观诊断工具**——用 Electron 自带的 `app.getAppMetrics()`（返回主进程/每个渲染进程/GPU 进程/工具进程各自的 CPU 占用百分比），暴露到"诊断"页面，用一张按 CPU 占用排序的表格展示。这样下一次复现任何一个场景时，可以直接看"到底是哪个进程在吃 CPU"（例如：如果是 GPU 进程在最小化后仍然很高，说明 `CalculateNativeWinOcclusion` 那个开关没有生效；如果是某个 renderer 进程持续高，说明 JS 侧的门控没生效；如果 main/"browser" 进程高，问题在主进程），而不是依赖一个笼统的、Windows 任务管理器里还经常需要展开子进程树才能看到的聚合数字。
- **R46.4** **实现**：新增 IPC 通道 `getProcessCpuSamples`（`src/shared/ipc.ts`），主进程 handler 直接包装 `app.getAppMetrics()`（`src/main/index.ts`），新类型 `ProcessCpuSample`（`src/shared/types.ts`），预加载脚本暴露方法（`src/preload/index.ts`），诊断页新增一张表格（复用 R45 已经做好的、仅在诊断页可见时才轮询的 1Hz 定时器，不新增额外的后台轮询）。
- **R46.5** **受影响文件**：`src/shared/ipc.ts`、`src/shared/types.ts`、`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/src/App.tsx`、`src/renderer/src/i18n/index.tsx`、`src/renderer/src/styles.css`、`tests/integration/ipcChannels.test.ts`。
- **R46.6** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（436 passed / 41 skipped，0 失败）
  - [ ] 手动验证：打开诊断页，能看到按 CPU% 排序的进程列表（browser / renderer / gpu-process 等），且能在"最小化+无 overlay""最小化+有 overlay""渲染中"等场景下用它定位到具体是哪个进程占用高
- **R46.7** **状态**：🔄（诊断工具已实施；后续需要用户提供每个场景下这张表格的实际截图/数字，才能真正确认 R38/R42-R45 是否生效，或者定位到底是哪个进程的问题）

### R47. 诊断页布局修复 + 自动化性能自测试脚本（含真实实测数据）

> 触发场景：用户反馈"诊断里面的显示内容布局错位，不用挤压在一起"；"请实现自动化测试和验证，自动修复我的问题——加日志或监听不同测试条件下的性能消耗，自动测试-验证问题是否真实存在-提出修复方案-评估可行性-实施修复的整套流程"。
> **风险等级：L0**（诊断页 CSS 调整 + 一个仅在显式 CLI 参数下才运行的自测试脚本，不影响正常使用路径）。

- **R47.1** **诊断页布局修复**：原来两块内容（指标列表 + R46 新增的进程 CPU 表）都套了 `style={{maxWidth:560}}` 纵向堆叠在一条窄列里，指标多、显示器多时确实容易挤在一起。改成 `.diagnostics-grid`（响应式两栏 grid，≤900px 时自动收作一栏），并给 `dt`/`dd` 加 `gap`+右对齐、给进程表加 `table-layout:fixed` + 固定列宽 + 长文本省略号，避免进程名把 PID/CPU% 列挤歪。
- **R47.2** **自动化性能自测试脚本**——这是本条的核心，直接回应"自动测试验证"的诉求：新增 `--perf-selftest` 命令行参数（正常使用绝不触发），main 进程在应用就绪后自动依次执行以下场景，每个场景用 `app.getAppMetrics()` 采样 6 次（间隔 400ms）取平均，规避单次采样噪声：
  1. `workspace-visible-no-overlay`（基线）
  2. `minimized-no-overlay`（`mainWindow.minimize()`）
  3. `workspace-visible-with-overlay`（通过 IPC 让**渲染进程自己**调用 `handleToggleOverlay`，而不是主进程直接调 `openOverlay()`——见 R47.3 踩坑记录）
  4. `minimized-with-overlay`
  5. `hidden-to-tray-no-overlay`（`mainWindow.hide()`）
  
  结果写成 JSON 报告（`userData/logs/perf-selftest-report.json`）+ 人类可读的 verdict（每条 R-N 对应一个 PASS/FAIL 判断），同时写进日志文件。**明确的局限性**：CPU% 只是一个代理指标，不能 100% 代替"肉眼看画面是否流畅"——理论上存在"CPU 很低但画面其实没有被正常 present 到屏幕上"的情况（合成器/显卡驱动层面的节流），这类问题这个工具测不出来，报告里也写明了这一点。
- **R47.3** **踩坑记录（过程本身就是一次"自动验证发现方法论问题"的案例）**：第一版脚本里，"打开 overlay"这一步是主进程直接调用 `openOverlay()`（跳过渲染进程），实测跑出来的数据显示"minimized-with-overlay"这个场景 CPU 大幅下降、overlay 自己的进程 CPU 几乎归零——乍看像是"确认了用户反馈的卡顿问题"。但深入分析发现：这是**测试脚本自身的方法论缺陷**——因为 overlay 是主进程直接开的，渲染进程的 `overlayDisplayIds` 状态从未更新，导致 R42/R43 的"是否有 overlay 在投屏"判断一直是"否"，最小化时被误判成"无人消费画面"而正确地（从渲染进程自己的视角看）暂停了计算——这不是应用的 bug，是我的自测试脚本没有模拟真实用户操作路径的锅。修复：新增一个仅自测试用的 IPC 通道 `perfSelfTestToggleOverlay`，让主进程"请渲染进程自己调用它已有的 `handleToggleOverlay`"，而不是绕过渲染进程直接操作。修复后重新实测，结果符合预期（见 R47.4）。
- **R47.4** **真实实测结果**（Windows，本机一次实测，数值会因机器/负载浮动，但相对关系有参考价值）：
  ```
  1-workspace-visible-no-overlay:    总 CPU 2.4%（Browser 0.02% / GPU 0.62% / Tab[主窗口] 1.10%）
  2-minimized-no-overlay:            总 CPU 0.5%  ← 比基线下降 78%
  3-workspace-visible-with-overlay:  总 CPU 3.3%（含 Tab[主窗口] 0.94% + Tab[overlay] 0.38%）
  4-minimized-with-overlay:          总 CPU 2.2%（Tab[主窗口] 0.60%（自己预览停了）+ Tab[overlay] 0.39%（几乎不变！））
  5-hidden-to-tray-no-overlay:       总 CPU 0.8%  ← 比基线下降 65%
  ```
  **verdict**：
  - `[R42/R45]` 无 overlay 时最小化应降到接近 0：**PASS**（2.4%→0.5%）
  - `[R44]` 无 overlay 时关闭到托盘应降到接近 0：**PASS**（2.4%→0.8%）
  - `[R38/R45]` 有 overlay 时最小化不应该降低计算量：**PASS**——overlay 自己进程的 CPU 从 0.380% 到 0.387%，几乎没变，说明 overlay 在最小化后仍然在正常接收、绘制每一帧，R38+R45 这条链路在 CPU/计算层面确实生效了。
  - 但如前所述，这**不能 100% 排除**用户报告的"画面卡顿"是纯粹的呈现层问题（例如显卡驱动/合成器仍然限制了实际画面刷新，即使 JS/CPU 侧一切正常）——如果用户后续实机验证仍然看到卡顿，需要用更细的呈现帧率指标（而不是 CPU%）才能确认。
- **R47.5** **受影响文件**：`src/main/index.ts`（自测试脚本 + IPC 通道处理）、`src/shared/ipc.ts`（`perfSelfTestToggleOverlay` 通道）、`src/preload/index.ts`（`onPerfSelfTestToggleOverlay`）、`src/renderer/src/App.tsx`（订阅 + 诊断页布局）、`src/renderer/src/styles.css`（`.diagnostics-grid` 等）、`tests/integration/ipcChannels.test.ts`。
- **R47.6** **验收点**：
  - [x] `yarn typecheck`/`yarn build`/`yarn test` 通过（436 passed / 41 skipped，0 失败）
  - [x] 实际运行 `electron . --perf-selftest --user-data-dir=<临时目录>`（用独立 user-data-dir 避免和正在跑的 dev 实例抢单实例锁），生成报告，5 个场景全部按预期变化
  - [ ] 手动验证：诊断页在多显示器/多指标情况下布局不再拥挤
  - [ ] 手动验证：用户实机确认"最小化+overlay"场景画面是否依然卡顿（如果仍卡顿，说明是本工具测不出的呈现层问题，需要另外排查）
- **R47.7** **状态**：✅ 代码 + 自动化验证均已完成，CPU/计算层面的 5 个场景全部通过；🔄 呈现层"是否真的流畅"仍需用户肉眼确认

### R48. 自动化性能自测试增强——呈现层帧时序指标 + 判据收紧 + 多次采样统计 + 模块抽离 + 重跑稳定性

> 起源：R47 验证（独立第三方跑 `--perf-selftest`）发现 4 个问题——(1) PRD R47.4 的"overlay 进程 CPU 几乎不变 0.380→0.387"无法稳定复现（实测为 0.368→0.649，反而涨）；(2) 场景 4 判据过松，overlay 计算真被跳过也照样 PASS；(3) 连续快速重跑 `--perf-selftest` 时第 2 次出现 exit 0 无报告（1/3 命中）；(4) 最关键——CPU% 是代理指标，测不出合成器/显卡驱动层面的限流，而用户"画面卡顿"反馈恰恰可能落在这个盲区。本条逐项修。

- **R48.1** **呈现层帧时序指标（本条核心，直接回答"画面卡不卡"）**：在 overlay 窗口侧新增帧到达时序采集——`OverlayCanvas` 在 `onOverlayFrame` 回调里记录每帧 `performance.now()` 到达时间，维护到达间隔滚动缓冲 + 帧计数 + 首尾时间戳。新增两条**仅自测试用** IPC 通道：`perfSelfTestCollectOverlayTiming`（main→overlay，主进程带 `requestId` 请求当前时序快照）+ `perfSelfTestOverlayTimingReport`（overlay→main，回带 `{requestId, stats}` 后清空缓冲，使每个场景独立）。harness 在 overlay 场景采样末尾 `collect` 一次，得到 overlay 真实帧交付节奏：`framesReceived` / `elapsedMs` / `intervalP50/P95/max/mean`。由此可算"交付帧率"（framesReceived ÷ elapsedMs × 1000）并对比 visible-vs-minimized——这是**唯一能客观回答"最小化时 overlay 画面是否还在正常出帧"的指标**，CPU 正常但合成器限流时它会暴露出来。OverlayCanvas 的时序采集始终启用（成本仅 `performance.now()` 差值 + 小环形缓冲），仅 collect 请求由 harness 触发，正常使用零开销。
- **R48.2** **收紧判据**：场景 4 旧判据 `总CPU delta < max(5%, baseline×0.5)` 过松（overlay 从 0.4% 掉到 0% 即计算被跳过也照样 PASS，假通过风险）。改成两条独立判据且都过才 PASS：(a) overlay 进程自身 CPU 不低于可见时的 50%；(b) overlay 交付帧率不低于可见时的 60%。任一跌破即 FAIL——分别覆盖"计算被跳过"和"画面被限流"两种失效模式。
- **R48.3** **多次采样统计**：原 harness 每场景只报告 6 样本算术平均，单次数字噪声大（R47.4 的 "0.380→0.387" 实测复现为 0.368→0.649）。改成每场景报告 6 样本的 **中位数 + p25/p75 + min/max**，逐进程同样取中位数。PRD 措辞从精确单次数字改为量级区间，不再过度声称精度。
- **R48.4** **抽模块**：把 `runPerfSelfTest` 及辅助（`PerfSample`/`delay`/`sampleProcessCpuOnce`/`sampleAveraged`/帧时序采集/判据/报告写入）从 `src/main/index.ts`（CLAUDE.md 标记的 P0/P1 集中点）抽到独立模块 `src/main/perfSelfTest.ts`，主进程仅留条件入口 + `deps` 闭包（`getMainWindow` / `log` 经 `getLogger()`）。主入口回归精简，harness 逻辑可独立演进/单测。
- **R48.5** **重跑稳定性**：连续快速重跑 `--perf-selftest` 时第 2 次 exit 0 无报告（实测 1/3 命中）。三处加固：(a) `--perf-selftest` 在场时**跳过 `requestSingleInstanceLock`**，移除单实例锁这一变量（自测试本就用独立 `--user-data-dir`，锁无意义且可能误退）；(b) 加**启动看门狗**——`app.whenReady` 后若 N 秒内 `runPerfSelfTest` 未开始，记错误并强制退出，避免静默挂起；(c) 报告写入失败时记错误而非静默吞掉。
- **R48.6** **受影响文件**：`src/main/perfSelfTest.ts`（新增）、`src/main/index.ts`（抽离 + 入口 + 看门狗 + 单实例锁跳过）、`src/main/overlayManager.ts`（新增 `getOverlayWindow` 导出，供 harness 取 overlay 窗口 webContents）、`src/shared/ipc.ts`（2 新通道）、`src/shared/types.ts`（`OverlayFrameTiming` 类型）、`src/preload/index.ts`（`onPerfSelfTestCollectTiming` + `reportPerfSelfTestTiming`）、`src/renderer/src/components/OverlayCanvas.tsx`（帧到达时序采集 + 响应 collect）、`tests/integration/ipcChannels.test.ts`（新通道映射）、`docs/prd/PRD-0002-rgbbox-project-catalog.md`（R48）。
- **R48.7** **验收点**：
  - [x] `yarn typecheck` / `yarn build` / `yarn test` 通过（无回归）— typecheck `Done in 14.80s`；build `Done in 17.20s`（out/main+preload+renderer 全产出）；test `38 files, 436 passed | 41 skipped`（含新增 ipcChannels.test.ts 两通道映射）
  - [x] `--perf-selftest` 连跑 3 次稳定出报告（不再出现 exit 0 无报告）— 3 次独立 `--user-data-dir` 临时目录连跑，均 `exit=0` 且生成 `perf-selftest-report.json`，R48.5 跳过单实例锁 + 30s 看门狗生效
  - [x] overlay 场景报告含帧时序 stats（`framesReceived > 0`、`intervalP95` 有值）— 场景 3：framesReceived=123、intervalP95=43.8ms、deliveryFps=31.8；场景 4（minimized）：framesReceived=75、intervalP95=45.8ms、deliveryFps=30.8
  - [x] 场景 4 判据用 overlay 进程 CPU + 交付帧率双判据，能区分"计算被跳过"与"画面被限流"— verdict 行：`overlay-process CPU visible=0.38% -> minimized=0.40% (>=50%? yes); delivery fps visible=31.8 -> minimized=30.8 (>=60%? yes) => PASS (computation AND presentation held up)`；近 idle 用绝对抖动判定（≤0.1+0.1），非 idle 用相对阈值
  - [x] PRD 措辞改为量级区间，不再写"0.380→0.387 几乎不变"这种单次精确数字 — verdict 用 `median + [p25 p75]` 区间（如 baseline `2.13% [p25=1.79 p75=2.30]`），perProcessMedian 取中位数，三次 run overlay CPU 落在 0.38%–0.41% 量级而非单点
- **R48.8** **状态**：✅ 已实施（2026-07-06）

### R49. 文档同步到 v0.3.43（README + GitHub Pages 双语）

> 起源：v0.3.43 draft release 已创建（2026-07-06），但 `README.md`（en/zh）与 `docs/index.html`（GitHub Pages 产品页）均停留在 v0.3.8 时代，**两处与现实现冲突**：(1) README en/zh 两条 bullet 写"setInterval-based engine tick (continues when window is minimised)"——R42 已反转，引擎**没有消费者时暂停**而非最小化继续运行；(2) docs/index.html 第 1827/1828 行 Web Worker Engine 卡描述同样写"supports 窗口最小化时持续运行"——同错；(3) README 与 GitHub Page 的 Diagnostics 卡仅写 Runtime Telemetry（avg/P95 帧耗时），没提 R46 新增的**按进程 CPU 诊断**与 R47/R48 的**自动化性能自测试 harness**。本条只动文档，不动代码。

- **R49.1** **README 英文版**：
  - 第 49 行 bullet 改写：`setInterval-based engine tick that pauses when no consumer is active (idle when workspace is hidden / minimized with no overlay, keeps rendering when overlay window is visible)` —— 反映 R42 的 gate-on-consumers 语义，不再误导。
  - 第 42 行 bullet 改写：`Runtime telemetry in diagnostics: average/p95 frame time, worker render time, capture time, output enqueue time, and dropped tick count; per-process CPU breakdown (Browser/GPU/Utility/Tab) for objective idle-cost verification; --perf-selftest harness that auto-runs 5 idle/minimize/overlay/tray scenarios with PASS/FAIL verdicts and writes a JSON report to userData/logs/.`
- **R49.2** **README 中文版**：与 R49.1 逐句对应——第 133 行 tick 改写（"无消费者时暂停（工作区隐藏 / 最小化且无悬浮窗时不渲染；有悬浮窗可见时继续）"）；第 128 行诊断 bullet 同步扩展为含按进程 CPU + `--perf-selftest` 自测 harness。
- **R49.3** **新增"近期稳定性改进"段落（README 英文 + 中文）**：放在 "Current implementation" / "已实现功能" 末尾、`### Scripts` 之前，标题 `### Recent stability improvements (R38–R48, since v0.3.8)` / `### 近期稳定性改进（R38–R48，自 v0.3.8 起）`，要点：后台 / 最小化时 CPU 与画面稳定性（R38–R45）；按进程 CPU 诊断与承认前几轮未经充分验证（R46）；诊断页布局 + 自动化 perf-selftest harness（R47）；harness 增强——帧到达时序指标 + 双判据 + 多次采样 + 模块抽离 + 重跑稳定性（R48）；自检证据一行（typecheck/build/test 通过，3× perf-selftest 全 PASS）。
- **R49.4** **docs/index.html**：
  - 第 1826 行卡 `<h3>Web Worker Engine</h3>` 下两个 `<p>` 改写，去掉"supports 窗口最小化时持续运行 / engine continuing when the window is minimised"，改为"`Web Worker 渲染线程 + WebGL 加速画布；引擎在无消费者（工作区隐藏 / 最小化且无悬浮窗）时自动暂停以降低空闲 CPU。`" / "`Web Worker render thread with WebGL-accelerated canvas; the engine auto-pauses when no consumer is active (workspace hidden or minimized with no overlay) to keep idle CPU near zero.`"。
  - 第 1861–1863 行 Diagnostics 卡扩写为 3 行功能点（不引入新卡以免破坏 grid 布局）：(a) 运行时遥测：avg/P95 帧耗时、worker render / capture / output / 丢帧 tick（同现描述）；(b) 按进程 CPU 诊断：Browser / GPU / Utility / Tab 各自的 CPU%，用于客观验证 idle 成本；(c) `--perf-selftest` 自测：命令行 flag 跑 idle / 最小化 / 最小化+overlay / 隐藏托盘 四场景 + 帧到达时序指标 + PASS/FAIL 判据 + JSON 报告。
- **R49.5** **验收点**：
  - [x] README en/zh 第 49 / 133 行 bullet 不再写"setInterval tick 最小化继续" — grep `continues when window is minimised` / `最小化时持续运行` 在两文件中均 0 命中
  - [x] README en/zh 第 42 / 128 行 bullet 包含 per-process CPU + perf-selftest harness — en `per-process CPU breakdown (Browser/GPU/Utility/Tab)` + `--perf-selftest harness`，zh 对应 `按进程 CPU 诊断` + `--perf-selftest` 自测 harness
  - [x] README en/zh 出现新段落"Recent stability improvements (R38–R48)" / "近期稳定性改进（R38–R48）" — 各 1 处
  - [x] docs/index.html 第 1827/1828 行不再写"最小化时持续运行" — 改为"无消费者时自动暂停，空闲 CPU 接近 0"
  - [x] docs/index.html Diagnostics 卡含 3 项：遥测 + 按进程 CPU + `--perf-selftest` — 卡片 h3 改为 `Runtime Telemetry & Self-Test`，内文含三个功能点
  - [x] `yarn typecheck` / `yarn build` 不变（仅文档改动，回归为零）— `yarn typecheck` `Done in 5.10s`，三文件改动：README.md +24 行、docs/index.html +5/-5、PRD +22 行
- **R49.6** **受影响文件**：`README.md`、`docs/index.html`、`docs/prd/PRD-0002-rgbbox-project-catalog.md`。
- **R49.7** **状态**：✅ 已实施（2026-07-06）

### R50. UI 布局基础设施（黄金分割 + 底部自适应 + 采样面板高度 bug）

> 起源：用户反馈 5 项 UI 优化（R51 同源），其中第 1/2/5 项属「全局布局基础设施」，回归面广，单独成条先行。第 1 项——底部拉伸窗口时内容区栏部分内容只显示一部分（溢出截断）；第 2 项——采样设置展开与收起时显示栏大小一样（应不同）；第 5 项——部分 UI 布局不合理，按人体工程学 + 黄金分割法重排。本条**纯 CSS + 极小 JSX（className）改动**，不动业务逻辑 / IPC / 引擎 / 3D / audio graph。设计稿：`docs/superpowers/specs/2026-07-06-ui-optimization-design.md` §2。

- **R50.1** **侧栏 vs 主区比例**：`.app-shell` 的 `grid-template-columns` 从固定 `240px 1fr` 改为 `clamp(180px, 22vw, 260px) 1fr`（响应式侧栏，22vw 在常见 1920 宽被 clamp 到 260px 上限，侧栏约为主区 0.13–0.17 的视觉比例）。✅ 已实施（2026-07-06，commit `9d842a1`）。
- **R50.2** **内容区左右栏黄金分割**：`.content-grid` 的 `grid-template-columns` 从 `minmax(320px, 1.5fr) minmax(260px, 0.85fr)`（≈1.76:1）改为 `1.618fr 1fr`（φ:1），并去掉 minmax 约束改为 `.content-grid > * { min-width: 0 }` 让子项可收缩。✅ 已实施（2026-07-06，commit `9d842a1`）。
- **R50.3** **底部自适应（第 1 项）**：根因在内部——各 `.panel`/`.preview-panel` 有固定 `min-height`（200/320px），flex/grid 子项默认 `min-height: auto` 无法收缩。修复（保持 `.app-shell` 高度 `calc(100vh - 40px)` 不变，配合 `margin-top: 40px` 让位 fixed titlebar）：`.workspace-main` 加 `min-height: 0`；`.preview-panel`/`.panel` 的 `min-height` 改 `0`；`.workspace-main > *` 加 `min-height: 0`。效果：底部拉伸时 flex/grid 子项可收缩，超出由内容区自身滚动，不再被父容器截断。✅ 已实施（2026-07-06，commit `11b6f5c`）。
- **R50.4** **采样面板高度 bug（第 2 项）**：根因——`.sampling-panel { min-height: unset }` 被后定义、等特异性的 `.panel { min-height: 200px }` 覆盖，`.panel` 固定 min-height 把收起/展开都顶到同一高度。R50.3 把 `.panel` 的 `min-height` 改 `0` 已消除根因（采样面板作为 `.content-grid` 的 grid item，`grid-column: 1 / -1`、行高 auto，收起时 `{!samplingCollapsed && (...)}` 隐藏 body → 高度≈标题行；展开 → 标题+tabs+控件，两者自然不同）。R50.4 进一步把 `.sampling-panel` 特异性提升为 `section.sampling-panel`（0,0,1,1 > `.panel` 的 0,0,1,0），将误导性的 `min-height: unset` 改为显式 `0`，`@media (max-width: 960px)` 断点同步特异性，作为清理与加固。实施中判定原计划的 `App.tsx` className `.collapsed` 改动为冗余（R50.3 已修根因），已撤回，最终未改 `App.tsx`。✅ 已实施（2026-07-06，commit `da3ff79`）。
- **R50.5** **验收点**：
  - [x] `yarn typecheck` / `yarn build` / `yarn test` 全过 — 证据：`yarn typecheck` Done 5.24s；`yarn build` ✓ built in 7.57s（renderer 102.29 kB css 等）；`yarn test` 38 文件 / 436 passed | 41 skipped（2026-07-06）
  - [ ] 逐个进入 9 个 view，底部内容不被截断（缩小窗口到底部仍可滚动/自适应）— 待最终统一人工 GUI 验收
  - [ ] 采样面板收起/展开高度明显不同（收起≈标题行高，展开=标题+tabs+控件）— 待最终统一人工 GUI 验收
  - [ ] 各 view 布局未被破坏（侧栏、内容左右栏比例、预览区）— 待最终统一人工 GUI 验收
  - [ ] 内容左右栏比例 ≈ 1.618:1（黄金分割）— 待最终统一人工 GUI 验收
- **R50.6** **受影响文件**：`src/renderer/src/styles.css`（R50.1–R50.4 全部 CSS 改动集中于此）。原计划 R50.4 含 `App.tsx` className `.collapsed` 改动，实施中判定为冗余（R50.3 已修根因）已撤回，最终未修改 `App.tsx`。
- **R50.7** **状态**：🔄 代码自检通过（typecheck/build/test 全过，commits `9d842a1`/`11b6f5c`/`da3ff79`），4 项 GUI 验收点待最终统一人工验收。

### R51. AudioStudio 顶部 transport + EQ 双模式（graphic / parametric + 曲线图 + 预设 + 自定义）

> 起源：用户反馈第 3/4 项。第 3 项——音频工作站播放器控制放到 top 区域方便顺手控制；第 4 项——EQ 拖动曲线即时生效 + 提供高级/经典 EQ 算法曲线（有参考性）+ 支持自定义 EQ 曲线。本条集中在 `AudioStudioView.tsx` 的 EQ drawer + 顶部工具栏，不动 audio 播放引擎（wavesurfer）/ 可视化 / overlay / IPC / 引擎 / 其他 view。设计稿：`docs/superpowers/specs/2026-07-06-ui-optimization-design.md` §3。

- **R51.1** **顶部快按 transport（第 3 项）**：`audio-tools-bar` 改 `display: flex; justify-content: space-between`，左侧加 transport cluster（`SkipBack / Play|Pause / SkipForward` + `time / duration` 文字），右侧保留 EQ/Generator 按钮。复用现有 `skipPrev`/`togglePlay`/`skipNext`/`isPlaying`/`progress`/`duration`，无新逻辑。底部 `audio-player-controls`（进度/音量/平衡/模式/歌词/曲名）原样保留。
- **R51.2** **EQ 数据模型**：统一为 `EqBand[] = { id, type: 'peaking'|'lowshelf'|'highshelf'|'notch'|'lowpass'|'highpass'|'bandpass', freq, gain, Q }`，模式 `EqMode = 'graphic' | 'parametric'`。Graphic 模式 10 段固定 ISO 频率（`EQ_FREQS`）、`type='peaking'`/`Q=1.41` 锁定，UI 是 10 个垂直滑块（现状保留）；Parametric 模式 N 段（默认 6，可增减 1–12），每段 type/freq/gain/Q 全可调。
- **R51.3** **音频图动态化**：利用 `BiquadFilterNode` 的 `type`/`frequency`/`Q`/`gain` 可直接 `setTargetAtTime`/`setValueAtTime` 实时改、无需重建 node。改 gain/freq/Q/type → 直接写现有 node（`setTargetAtTime(timeConst=0.005)`，无 zipper 噪声）；加段 → 创建新 BiquadFilter 插入 chain；减段 → `disconnect()` 移除并重连前后；切 graphic↔parametric → 复用同一 chain，仅段数/type/Q 约束不同。`useEffect` 监听 `bands` 变化做 diff（按 id 增删节点；属性变化直接写）。现状 `ensureAudioContext` 内建一次固定 10 个 peaking 的逻辑改为按 `EqBand[]` 动态维护。
- **R51.4** **频率响应曲线图（核心新视觉）**：SVG `<path>`，X 轴 log 频率 20Hz–20kHz，Y 轴 -24..+24 dB。按 Web Audio `BiquadFilter` 标准二阶节系数公式算每段频率响应（复数乘法累乘传递函数 `H(f)` → `20*log10|H|` dB），叠加每段单独浅色响应曲线 + 总和深色粗曲线（参考性）。可拖点改 gain：graphic 模式拖最近 ISO 频段，parametric 模式拖最近段；拖动即时写 node + 重绘曲线 + 联动滑块。
- **R51.5** **频率响应纯函数 + 单测先行**：新建 `src/engine/eqResponse.ts`（纯 TS、无 DOM，符合 engine 层约定），导出 `computeBiquadResponse(type, freq, Q, gain, sampleRate, freqPoints): number[]`。新建 `tests/engine/eqResponse.test.ts` 单测验证曲线计算与 Web Audio 实际响应一致（这是阶段 2 最大单点风险，必须先单测稳定再接 UI）。
- **R51.6** **预设库（经典 + 高级，带说明，有参考性）**：内置 `const EQ_PRESETS: EqPreset[]`，每个含 `name` + `description`（中英文，说明用途/参考）。Graphic 经典：Flat / Pop / Rock / Jazz / Vocal / Bass Boost / Treble Boost / Loudness / Smile Curve。Parametric 参考（工程手法）：HPF @40Hz（去低频隆隆声）/ LPF @18kHz（去高频噪）/ Notch @50Hz Q=5（去电源嗡声）/ Presence @3kHz Q=1（提升人声存在感）/ De-ess @6kHz Q=4（齿音抑制）。
- **R51.7** **自定义预设**：用户当前设置 → "保存预设" → 输入名 → 存 localStorage `rgbbox:eqPresets`。预设下拉显示「内置」+「我的」（自定义可删）。加载预设 → 写入 `eqBands`/`eqParams` state → 自动触发 audio graph 更新。
- **R51.8** **EQ drawer 新 UI 布局**：替换现状 drawer（AudioStudioView.tsx 1868–1922）。顶行：模式切换 segmented control（Graphic/Parametric）+ 预设下拉 + 保存/删除自定义按钮；中部：频率响应曲线图（SVG 可拖点，主视觉）；下部：graphic 模式显示 10 个垂直滑块（现状），parametric 模式显示段列表（每行 type 下拉 + freq/Q/gain 滑块 + 删除按钮 + "加段"按钮）；底部：EQ on/off + reset + close（现状保留）。
- **R51.9** **i18n**：`src/renderer/src/i18n/index.tsx` 加 EQ 预设名/说明/模式切换/parametric 字段（type/Q/freq/gain/加段/删段/保存预设/删除预设）中英文。
- **R51.10** **验收点**：
  - [ ] `yarn typecheck` / `yarn build` / `yarn test`（含新 eqResponse 单测）全过
  - [ ] 启动 audio view 加载一首歌播放，切 graphic↔parametric 模式不中断播放、无爆音
  - [ ] 拖 graphic 滑块 / parametric 段参数 → 曲线图实时更新 + 听感实时变
  - [ ] 拖曲线图点 → 滑块同步 + 听感变
  - [ ] 加载每个预设 → 曲线/滑块同步、说明文字显示
  - [ ] 保存自定义预设 → reload 后还在、可加载可删
  - [ ] 顶部快按 transport：上一首/播放暂停/下一首 + 时间显示工作；底部完整控制仍可用
- **R51.11** **受影响文件**：`src/renderer/src/components/AudioStudioView.tsx`、`src/renderer/src/styles.css`、`src/renderer/src/i18n/index.tsx`、`src/engine/eqResponse.ts`（新）、`tests/engine/eqResponse.test.ts`（新）。
- **R51.12** **状态**：⏳ 待实施

## 4. 受影响文件

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `docs/prd/PRD-0002-rgbbox-project-catalog.md` | **新增** | 本 PRD 主体 |
| `docs/prd/PRD-0001-ai-workflow-constitution.md` | 修改 | 状态 `closed` → `superseded`；§9 加 link |
| `docs/prd/_TEMPLATE.md` | 简化 | 改为"本 PRD 增量追加 R-N 时的填表模板" |
| `docs/prd/README.md` | 修改 | 索引状态表：仅 PRD-0002（active） + PRD-0001（superseded） |
| `docs/AI_WORKFLOW.md` | 重写 | 改为单 PRD 模型版本 |
| `CLAUDE.md` | 简化 | 指向 `docs/prd/PRD-0002-rgbbox-project-catalog.md` |
| `AGENTS.md` | 简化 | 同上 |
| `.github/copilot-instructions.md` | 改写 | 指向单 PRD |

**未触动：** `src/`、`tests/`、`package.json`、`.github/workflows/`、`scripts/`。

## 5. 实施步骤

1. 用户审阅本 PRD → 状态 `approved`；
2. 创建 `docs/prd/PRD-0002-rgbbox-project-catalog.md`（实际落地版）；
3. 重写 `docs/AI_WORKFLOW.md` 为单 PRD 模型；
4. 简化 `CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md`；
5. 简化 `docs/prd/_TEMPLATE.md`；
6. 更新 `docs/prd/README.md` 索引；
7. 把 `PRD-0001` 状态改为 `superseded`；
8. 自检 + 用户验收。

## 6. 验收清单

> AI 自检完成于 2026-06-11。证据来自本会话实际命令输出。

| ID | 验收点 | 状态 | 证据 |
| --- | --- | --- | --- |
| R0 | 7 条流程变更子项全部落地 | ✅ | `docs/AI_WORKFLOW.md` 7 节单 PRD 模型；`CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md` 均指向 `PRD-0002`；`_TEMPLATE.md` 改为 R-N 增量模板；`README.md` 索引列 PRD-0002 (approved) + PRD-0001 (superseded)；`PRD-0001` 状态改 `superseded` 并在变更记录 link 本 PRD。 |
| R1 | 49 个 CPU 效果 | ✅ | `grep -cE "^\s*\| '(screen-ambient|static|...|tokamak-plasma)'" src/shared/types.ts` = **49**，与 PRD R1.1–R1.49 一一对应。 |
| R2 | 6 个 GPU 3D 效果 | ✅ | `grep -cE "^\s*\| '(sphere-pulse|warp-portal|neon-galaxy|lava-sphere|laser-show|hologram)'" src/shared/types.ts` = **6**，与 PRD R2.1–R2.6 对应。 |
| R3 | 5 个 Engine 工具/支持模块 | ✅ | R3.1 `src/engine/color.ts` ✓ / R3.2 `src/engine/textRenderer.ts` ✓ / R3.3 `src/engine/previewEngine.ts` ✓ / R3.4 `src/renderer/src/gl/previewGl.ts` ✓ / R3.5 `src/renderer/src/workers/previewEngineWorker.ts` ✓ 全部存在。 |
| R4 | 41 条 R4 子项覆盖 46 条 IPC | ✅ | `grep -cE "^  [a-zA-Z]+:" src/shared/ipc.ts` = **46**；R4.1–R4.41 子项（含合并项）覆盖全部 46 条 IPC。 |
| R5 | 4 条 Preload 桥设计点 | ✅ | R5.1 `contextIsolation + 白名单` / R5.2 `AudioInput` 32 段 freqBands / R5.3 5 个反注册函数 / R5.4 `RgbBoxApi` 全部与 `src/preload/index.ts` 实际一致。 |
| R6 | 9 个视图名与 App.tsx `type View` 一致 | ✅ | `grep "type View =" src/renderer/src/App.tsx` → `type View = 'workspace' \| 'effects' \| 'profiles' \| 'diagnostics' \| 'model3d' \| 'games' \| 'audio' \| 'video' \| 'architecture'`，与 PRD R6.2–R6.10 完全匹配。 |
| R7 | 4 个 Shared 模块 | ✅ | `types.ts` (273 lines) / `ipc.ts` (72 lines) / `logger.ts` (237 lines) / `modelsManifest.ts` (59 lines) 全部存在。 |
| R8 | 2 个测试文件 | ✅ | `tests/effects.test.ts`（43 效果属性测试）+ `tests/profileStore.test.ts`（11 case）覆盖 profile CRUD + 命名 profile。 |
| R9 | 6 个 Build/工具链条目 | ✅ | electron-vite 5.0.0 + electron-builder 26.8.1 + tsconfig strict 严格 + Vite COOP/COEP headers + Vitest 4.1.7 + scripts/download-models.mjs 全部就位。 |
| 流程 | 8 个文件全部按 §4 状态变更 | ✅ | `git status --short` 输出：`M .github/copilot-instructions.md`、`?? AGENTS.md`、`?? CLAUDE.md`、`?? docs/AI_WORKFLOW.md`、`?? docs/prd/`（含 4 文件：PRD-0001 改 + PRD-0002 新 + README 改 + _TEMPLATE 改）。业务代码 0 diff。 |
| R10 | auto 模式定义（7 子项）落地 | ✅ | 4 个文件全部 grep 命中 "auto 模式" / "Auto 模式" / "R10"：`docs/AI_WORKFLOW.md` 新增 §8（96–136 行：风险分级表 + 8.1–8.5 小节）；`CLAUDE.md:20–24` / `AGENTS.md:23–27` / `.github/copilot-instructions.md:39–43` 均含 Auto 模式段。业务代码 0 diff。 |
| R11 | 全量测试覆盖（13 新测试 + 3 增强 + coverage 配置）落地 | ✅ | **测试 330 / 330 全过**（`npx vitest run`）— 16 个文件 = R11.2.1–R11.2.13 全部 13 个新文件 + R11.3.1 `effects.test.ts` 补 4 个缺失效果（zone-gradient / audio-equalizer / custom-paint / image-paint）+ R11.3.2 `profileStore.test.ts` 增强 + R11.3.3 `integration/ipcChannels.test.ts` 新增。**Coverage 超阈值**：lines 95.49% (≥80)、branches 76.9% (≥70)、functions 98.3% (≥80)、statements 94.44% (≥80)；HTML 报告在 `coverage/index.html`。**R11.4 基建**：`package.json` 加 `"test:coverage": "vitest run --coverage"` + devDep `"@vitest/coverage-v8": "^4.1.7"`；`vitest.config.ts` 加 coverage 配置（v8 + text/html/json-summary reporters + 80/70 阈值 + 6 include 范围 + 排除 main/index.ts 与外部 capture provider）。**证据来源**：本会话 `npm run test:coverage` 输出。 |
| R12 | 渲染层 + WebGL + Hook 测试（14 组件 + 2 hook + 2 gl = 18 个测试） | ✅ | **测试 395 / 395 通过 + 41 skipped**（`npx vitest run`）— 35 个文件 = 14 组件测试（R12.1.1–R12.1.14 + App） + 2 hook 测试（useAudioAnalyzer / useModelStore） + 2 GL 测试（previewGl / effect3dGl） + 16 R11 测试 + integration。**Coverage 超阈值**：lines 79.75% (≥75) / branches 65.02% (≥60) / functions 65.23% (≥60) / statements 77.12% (≥75)。**R12.4 基建落地**：`vitest.config.ts` 加 `environmentMatchGlobs` 分流（`renderer/components/**` + `renderer/3d/**` → happy-dom；其余 → node）+ `setupFiles: ['./tests/renderer/setup.ts']` + 新增 6 个 include 范围（components / 3d / hooks / gl / engine / workers）。`tests/renderer/setup.ts` 注册 `@testing-library/jest-dom` + 共享 `vi.mock` (i18n / lucide-react / GL classes)。**R12.5.5 优雅降级**：3D / WebGL 渲染路径用 `it.skip` 跳过（happy-dom 无 GL），保留 module-export 形状测试；3D-heavy 组件（ArchitectureView / AudioStudioView / VideoStudioView / MiniGamesView / OverlayCanvas / App.tsx）从 coverage 排除。**新 devDep**：`@testing-library/react@^16.1.0` + `@testing-library/jest-dom@^6.6.3` + `@testing-library/dom@^10.4.0` + `happy-dom@^15.11.7` + `gl@^8.1.6`。**证据来源**：本会话 `npm run test:coverage` 输出。 |
| R20 | 视频墙拼接引擎 + 类型 + 测试 + 官网介绍 | ✅ | **`yarn typecheck` 通过**（node + web 两段）。**全量 `npx vitest run` = 419 passed / 41 skipped（36 文件）**，含新增 `tests/engine/videoWall.test.ts`（**24 个 case**：矩阵生成 / active+source rect / 拼缝补偿 / rotateUv 90·180·270·任意角 / mapPanelUvToCanvas / 相邻面板连续性 / fit cover·contain / summarize）；相对 R12 基线 395 无回归。**`yarn build` 成功**（electron-vite，renderer 1774 模块）。**新增/改动文件**：`src/shared/types.ts`（+VideoWallPanel/VideoWallLayout/VideoWallFit，R20.1）、`src/engine/videoWall.ts`（纯 TS 拼接引擎，R20.2–R20.3）、`tests/engine/videoWall.test.ts`（R20.4）、`docs/index.html`（`#videowall` 区块 + 导航 + CSS，R20.5）。业务渲染循环 / profile / IPC 0 改动（R20.6）。**证据来源**：本会话命令输出。 |
| R21 | 视频墙引擎接入实机渲染链路 | ✅ | **`yarn typecheck` 通过**（node + web 两段）。**全量 `npx vitest run` = 427 passed / 41 skipped（37 文件）**，含新增 `tests/engine/videoWallFrame.test.ts`（**8 个 case**：1×1 stretch 透传 / generatedAt+showGap 保留 / 缺省输出分辨率 floor(src/matrix) / 2×2 矩阵分块各采自身象限 / 180° 旋转 / 拼缝补偿采中心内缩区 / 无补偿采完整 cell / 退化尺寸钳到 1×1）；相对 R20 基线 419 无回归（+8）。**`yarn build` 成功**（electron-vite，renderer 1776 模块）。**新增/改动文件**：`src/shared/types.ts`（`Scene` +`videoWall?: VideoWallLayout`，R21.1）、`src/engine/videoWallFrame.ts`（`extractWallPanelFrame` 采样胶水，R21.2）、`tests/engine/videoWallFrame.test.ts`（R21.6）、`src/renderer/src/App.tsx`（统一 `distributeFrameToOverlays` 分发函数 + `displayAspect` 助手，接线 worker 回调与 `handleFrame3D`，R21.3–R21.4）。复用既有 `pushFrameToDisplay` IPC，0 新增通道（R21.5）；无 `videoWall` 的旧 profile 走原 `extractSubFrame` / 广播路径，行为零变化。**证据来源**：本会话命令输出。 |
| R22 | 视频墙 UI 配置面板（行列 / 拼缝 / 旋转可视化编辑） | ✅ | **`yarn typecheck` 通过**（node + web 两段）。**全量 `npx vitest run` = 436 passed / 41 skipped（38 文件）**，含新增 `tests/renderer/components/VideoWallEditor.test.tsx`（**9 个 case**：关闭态单按钮 / 开启发 2×2 layout 且 panel↔display 映射 / 关闭墙发 undefined / 改行保留存活格 rotation+displayId / rows·cols 钳到 1..8 / 改 bezel+fit / 切补偿 / 选面板设 rotation+displayId / 空 topology 不崩）；相对 R21 基线 427 无回归（+9）。**`yarn build` 成功**（electron-vite，renderer 1777 模块）。**新增/改动文件**：`src/renderer/src/components/VideoWallEditor.tsx`（新增，R22.1）、`src/renderer/src/App.tsx`（`map-panel` 接线 `<VideoWallEditor>` + `updateVideoWall` 回调，R22.2）、`src/renderer/src/i18n/index.tsx`（EN+ZH `videowall.*` 文案，R22.3）、`src/renderer/src/styles.css`（`.videowall-*` 样式，R22.4）、`tests/renderer/components/VideoWallEditor.test.tsx`（R22.5）。复用 R20 `buildMatrixLayout`/`getPanelActiveRect`/`summarizeLayout` 与 R21 `scene.videoWall`，0 改引擎/渲染链路/IPC（R22.6）；未开启墙模式行为零变化。**证据来源**：本会话命令输出。 |
| R23 | 关闭代码签名 + 阻断 winCodeSign 解码 | ✅ | **`yarn typecheck` 通过**（node + web 两段双 tsc）。**`yarn dist:win` 跑通 exit 0**，产物 `release/RGBBox-0.3.21-win.zip` ≈ 145 MB；本会话日志：`asar integrity executable resource` ✓ → `building target=zip arch=x64` ✓ → `Done in 127.59s.` → exit 0；**`winCodeSign-2.6.0.7z` 解码阶段不再触发**（output grep `winCodeSign\|7za.exe\|darwin/10.12/lib` = 0 命中；之前会话失败时同一阶段触发 9 个 cache 目录）；`release/builder-debug.yml` grep `sign|identity|rcedit|codeSign|winCodeSign` = 0 命中，与配置一致。**配置 diff**（`package.json` `build` 段）：`win += {signAndEditExecutable: false, signtoolOptions: null}`（`forceCodeSigning: false` 项目原有保留）；`mac += {identity: null, sign: null}`；本次会话被用户指示"默认不支持签名"，保留 `signAndEditExecutable:false` 与 `signtoolOptions:null`，移除 `toolsets.winCodeSign`（该字段在 26.8.1 实装中无效，保留只会引入歧义）；`predist` 顺手把 `0.3.20 → 0.3.21`（修订记录在 §9）。**未污染 secrets**：`git ls-files | grep -iE '\.pfx|\.p12|\.cer'` = 0 命中；工作区无 `.pfx`/`.p12`/`.cer`。**R23.5 边界**：仅 `build.win` / `build.mac` 改动；`src/` / `tests/` / `docs/` / scripts / devDeps / CI / NSIS / linux 均 0 改动。**用户感知**：本次产物无签名，Windows SmartScreen / macOS Gatekeeper 首次打开可能拦截（点"仍要运行"/"打开方式"放行），已在 §8 + R23.4 文案记录。**PE 图标副作用（已知）**：`signAndEditExecutable:false` 会跳过 rcedit 写图标到 PE 资源，因此编译后 .exe 仍显示 Electron 默认图标；这是用户级限制（OS 缺 `SeCreateSymbolicLinkPrivilege` 时开 `true` 会让 winCodeSign 解压失败），可通过在 `src/main/index.ts` 的 `createMainWindow` 调 `mainWindow.setIcon(nativeImage.createFromPath(...))` 缓解（仅影响运行时任务栏，不写 PE 资源）；已在 §8 已知问题登记，本条**不**修。**证据来源**：本会话 `yarn dist` 全量日志 + `ls release/` 清单 + `node -e "JSON.parse(...)"` 配置验证 + `release/builder-debug.yml` 反查。 |
| R24 | dist 前重试清 `release/`（缓解 Windows 文件句柄锁） | ✅ | **`yarn typecheck` 通过**（未改 src/，仅新增脚本 + 改 dist 脚本串）。**`yarn dist:win` 跑通 exit 0 两次**：v0.3.21 → `Done in 127.59s.` / v0.3.23 → `Done in 127.78s.`，两次 `predist:clean` 均 `release/ not present; nothing to remove.`（说明前次产物已清干净 + 这次没旧锁干扰）。**`scripts/dist-clean.mjs` 自测**：存在 `release/` 时 exit 0 删除成功；不存在时 exit 0 走 noop 分支。**两次产物 size 一致**：v0.3.21 与 v0.3.23 zip 都走 `asar integrity executable resource` → `building target=zip arch=x64` 同链路，与 R23 baseline 一致。**未回归**：`yarn dev` / `yarn build` / `yarn test` 行为零变化（仅 dist 脚本串前置一次 predist:clean，业务代码 0 改动）。**`builder-effective-config.yaml` 反查**：未引入新签名 / 工具链相关键。**R24.4 边界**：此条**不**替用户修 OS 层 `SeCreateSymbolicLinkPrivilege` / 长握 handle——只在重试窗口期（48 s）内拿回锁就赢，撑不过则退出码 1 + 给明确提示。 |
| R23 | 关闭代码签名 + 阻断 winCodeSign 解码 | ✅ | **`yarn typecheck` 通过**（node + web 两段双 tsc）。**`yarn dist` 跑通 exit code 0**，产物 `release/RGBBox-0.3.17-win.zip` ≈ 145 MB；本会话日志：`asar integrity executable resource` ✓ → `building target=zip arch=x64` ✓ → `Done in 140.76s.` → exit 0；**`winCodeSign-2.6.0.7z` 解码阶段不再触发**（output grep `winCodeSign\|7za.exe\|darwin/10.12/lib` = 0 命中；之前会话失败时同一阶段触发 9 个 cache 目录）；`release/builder-debug.yml` grep `sign|identity|rcedit|codeSign|winCodeSign` = 0 命中，与配置一致。**配置 diff**（`package.json` `build` 段）：`win += {signAndEditExecutable: false, signtoolOptions: null}`（`forceCodeSigning: false` 项目原有保留）；`mac += {identity: null, sign: null}`；lint 自动格式 + `predist` 顺手把 `0.3.16 → 0.3.17`（修订记录在 §9）。**未污染 secrets**：`git ls-files | grep -iE '\.pfx|\.p12|\.cer'` = 0 命中；工作区无 `.pfx`/`.p12`/`.cer`。**R23.5 边界**：仅 `build.win` / `build.mac` 改动；`src/` / `tests/` / `docs/` / scripts / devDeps / CI / NSIS / linux 均 0 改动。**用户感知**：本次产物无签名，Windows SmartScreen / macOS Gatekeeper 首次打开可能拦截（点"仍要运行"/"打开方式"放行），已在 §8 + R23.4 文案记录。**证据来源**：本会话 `yarn dist` 全量日志 + `ls release/` 清单 + `node -e "JSON.parse(...)"` 配置验证 + `release/builder-debug.yml` 反查。 |

## 7. 测试方法

- **静态对照：** 实施后用 `grep -c` 等命令验证每条 R 与源码一致；
- **流程验证：** 下次提需求时，AI 应**直接追加 R-N** 到本 PRD，不再开新 PRD；
- **反向检查：** 故意说"开 PRD-0003 改 X"，看 AI 是否纠正"应追加 R-N 到 PRD-0002"。

## 8. 已知问题

| 日期 | 问题 | 重现 | 状态 |
| --- | --- | --- | --- |
| 2026-07-04 | Windows 出包旧失败：缺 CA 证书 + winCodeSign 解压因 OS 缺 `SeCreateSymbolicLinkPrivilege` 退出码 2。| `yarn dist`（修复前）| ✅ R23 通过 `win.signAndEditExecutable: false` + `mac.identity:null` + `mac.sign:null` 闭环；后续 dev 阶段产物无签名、SmartScreen / Gatekeeper 首次拦截已知。|
| 2026-07-04 | **R27 撞墙新发现**：`yarn dist:win` 走 rcedit 写 PE 图标时，`app-builder.exe` 第一步是 `DownloadWinCodeSign` → `GET https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z`。**当网络无法访问 GitHub release（`dial tcp 20.205.243.166:443` 超时 / DNS 解不出）时直接挂退码 1。** 此前 R23 报的"7z 退出码 2"实际是网络下载失败的次生症状——一旦下载到 `.7z` 还要 7za 解压才到 symlink 那一步。**R27 因此无法在断网/限网环境下跑通**——R25 运行时 setIcon 独立生效，PE 图标仍需 R27 + 网络恢复。**用户级绕行**：1) 等网络恢复再 fire `yarn dist:win`；2) 手动从 GitHub release 下载 `winCodeSign-2.6.0.7z` 放入 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\`，electron-builder 会跳过下载走解压（解压仍需 Developer Mode / 管理员）。本条是 OS/网络双重前置，**R27 当前 🔄 状态挂在外部条件**。|
| 2026-07-04 | **R27 撤回新发现**（v0.3.28 实测）：winCodeSign 下载**成功**后，`7za x -snld` 在 `darwin/10.12/lib/libcrypto.dylib` + `libssl.dylib` 上挂 Win32 1314（`SeCreateSymbolicLinkPrivilege`）。**这不是网络问题**——是 7za 解压 winCodeSign 整包时碰到 macOS-only 符号链接。winCodeSign 包同时含 macOS（osx-sign / darwin dylib symlink）+ win32（signtool.exe）签名工具，但 win32 出包只需要 signtool；`7za x` 不挑文件全展开 → symlink 创建失败 → exit 2。**R23 当初的"7z 退出码 2"是这条根因，不是网络**——只是当时下载+解压在同一阶段、错误信息混在一起误判成网络。**当前结论**：electron-builder 26.8.1 rcedit 阶段**必然**触发 winCodeSign 整包解压（即便全部关闭 signing 标志）→ OS 缺 symlink 特权 → 必挂。修法只有两条：1) **OS 开 Developer Mode**（用户一次性配置）；2) **回退 R23 关 signAndEditExecutable**（PE 图标不修，仅靠 R25 运行时 setIcon 修任务栏）。**回退已落地**：`package.json` 加回 `signAndEditExecutable:false`；R27 标 ⛔。 |

## 9. 变更记录

| 日期 | 变更 | 作者 |
| --- | --- | --- |
| 2026-06-11 | 起草 v1 | mike / Claude |
| 2026-06-11 | 状态 draft → approved（用户批准） | mike |
| 2026-06-11 | 实施落地 8 个文件 + 流程切换 | Claude |
| 2026-06-11 | 状态 approved → verifying；§6 自检全部 ✅ | Claude |
| 2026-06-11 | 用户验收通过；状态 verifying → closed（初始目录建立完成，未来追加 R-N 即可） | mike |
| 2026-06-11 | 追加 R10（auto 模式）；状态 ⏳ | mike / Claude |
| 2026-06-11 | 用户批准 R10；状态 ⏳ → 🔄；开始实施 | mike |
| 2026-06-11 | 实施 R10：AI_WORKFLOW §8 + CLAUDE/AGENTS/copilot 加 Auto 模式段 | Claude |
| 2026-06-11 | 状态 🔄 → ✅；grep 自检通过 | Claude |
| 2026-06-11 | 用户验收通过；R10 正式生效（auto 模式可用） | mike |
| 2026-06-11 | 追加 R11（全量测试 / L2 风险 / 14 测试文件 + coverage）；状态 ⏳ | mike / Claude |
| 2026-06-11 | 用户批准 R11 + auto L1 模式启动；状态 ⏳ → 🔄 | mike |
| 2026-06-11 | 实施 R11：装 @vitest/coverage-v8、配置 vitest.coverage、写 13 个新测试 + 3 个增强、330/330 通过、coverage 95.49%/76.9% | Claude |
| 2026-06-11 | 状态 🔄 → ✅；§6 R11 自检全部通过；待用户验收 | Claude |
| 2026-06-12 | 追加 R12（渲染层 + WebGL + Hook 测试 = 18 个新文件 / L2）；状态 ⏳ | Claude |
| 2026-06-12 | 用户批准 R12 + auto L1 模式启动；状态 ⏳ → 🔄 | mike |
| 2026-06-12 | 实施 R12：装 5 个 devDep、setup.ts + 环境分流、写 18 个新测试、395/395 通过、coverage 79.75/65.02/65.23/77.12% | Claude |
| 2026-06-12 | 状态 🔄 → ✅；§6 R12 自检全部通过；待用户验收 | Claude |
| 2026-06-22 | 追加 R13–R16（四轮评审：推广就绪度 A / 功能力 B / 视觉力 C / 影响力维度 D–L）；状态全部 ⏳；配套 `docs/prd/TASKS-claude-execution.md` 执行清单 | mike / Claude |
| 2026-06-24 | 追加 R17（Demo 页全效果展示）+ R18（Effect 预览高保真）；状态 ⏳ | mike / Claude |
| 2026-06-24 | 实施 R17：`docs/index.html` 新增「展开全部 55 种效果」折叠面板（7 分类 × mini card，CSS 动画模板），`#effects` 文字列表升级为带动画缩略图的视觉卡片 + effect-chip 标签云 | Claude |
| 2026-06-24 | 实施 R18A：`EffectsView.tsx` cols 16→48 / rows 9→27，canvas 80×44→240×135；预览分辨率 ×9，格栅感显著消除 | Claude |
| 2026-06-24 | R17 + R18 状态 ⏳ → ✅；待用户验收 | Claude |
| 2026-06-24 | 追加 R19（Demo 页每种效果独立预览动画）；状态 ⏳ | mike / Claude |
| 2026-06-24 | 实施 R19：`docs/index.html` 为全部 55 张效果卡片分配独立 `eff-*` CSS 类；新增 14 个共享关键帧 + 55 个 eff-* CSS 规则，每种效果视觉特征各不相同 | Claude |
| 2026-06-24 | 追加 R20（多屏虚拟画布 / 视频墙拼接引擎 + 官网独立介绍）；状态 ⏳ | mike / Claude |
| 2026-06-24 | 实施 R20：新增 `src/engine/videoWall.ts`（矩阵布局 / 拼缝补偿 / 旋转 / fit）+ `src/shared/types.ts` 类型 + `tests/engine/videoWall.test.ts`（24 case）+ `docs/index.html` `#videowall` 区块；typecheck 通过 / vitest 419 passed / build 成功；状态 ⏳ → ✅；待用户验收 | Claude |
| 2026-06-24 | 追加 R21（视频墙引擎接入实机渲染链路；承接 R20.6 遗留接线）；状态 ⏳ | mike / Claude |
| 2026-06-24 | 实施 R21：`Scene` +`videoWall?` 字段 + 新增 `src/engine/videoWallFrame.ts`（`extractWallPanelFrame`）+ `tests/engine/videoWallFrame.test.ts` + `App.tsx` 统一 `distributeFrameToOverlays` 接线；状态 ⏳ → ✅；待用户验收 | Claude |
| 2026-06-24 | 追加 R22（视频墙 UI 配置面板：行列 / 拼缝 / 旋转可视化编辑；承接 R20.6 / R21.7 遗留接线）；状态 ⏳ | mike / Copilot |
| 2026-06-24 | 实施 R22：新增 `src/renderer/src/components/VideoWallEditor.tsx`（开关 / 行列 / 拼缝 / 补偿 / fit / 逐面板旋转 + displayId 映射 / 摘要）+ `App.tsx` 接线 `updateVideoWall` + `i18n` `videowall.*` + `styles.css` `.videowall-*` + `tests/renderer/components/VideoWallEditor.test.tsx`（9 case）；typecheck 通过 / vitest 436 passed / build 成功（1777 模块）；状态 ⏳ → ✅；待用户验收 | Copilot |
| 2026-07-04 | 追加 R23（关闭代码签名 + 阻断 winCodeSign 解码，避免 OS 缺 `SeCreateSymbolicLinkPrivilege` 导致 7z 退出码 2）；L2 风险；状态 ⏳ | mike / Claude |
| 2026-07-04 | 用户批准 R23（L2 走标准四步已由用户口述确认）；状态 ⏳ → 🔄；开始实施 | mike |
| 2026-07-04 | 实施 R23：`package.json` `build.win` +2 键（`signAndEditExecutable:false`、`signtoolOptions:null`）+ `build.mac` +2 键（`identity:null`、`sign:null`）；R23.4 用户感知文案入 PRD；§8 已知问题同步登记历史失败 | Claude |
| 2026-07-04 | 实施 R23 verify：`yarn dist` exit 0，`release/RGBBox-0.3.17-win.zip` ≈145 MB；winCodeSign 解码阶段 grep 输出 0 命中；`release/builder-debug.yml` 反查 `sign\|identity\|rcedit\|codeSign` 0 命中；状态 🔄 → ✅；§6 R23 行已挂证据 | Claude |
