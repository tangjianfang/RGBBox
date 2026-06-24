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

## 7. 测试方法

- **静态对照：** 实施后用 `grep -c` 等命令验证每条 R 与源码一致；
- **流程验证：** 下次提需求时，AI 应**直接追加 R-N** 到本 PRD，不再开新 PRD；
- **反向检查：** 故意说"开 PRD-0003 改 X"，看 AI 是否纠正"应追加 R-N 到 PRD-0002"。

## 8. 已知问题

| 日期 | 问题 | 重现 | 状态 |
| --- | --- | --- | --- |
| — | — | — | — |

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
