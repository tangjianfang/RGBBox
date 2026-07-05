# RGBBox

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

RGBBox is a local-first Electron desktop client for multi-display RGB lighting. It provides a virtual RGB canvas preview with configurable sampling granularity, a layered effect engine, audio-reactive effects, and 3D model preview tooling.

### Inspiration

<p align="center">
  <img src="https://github.com/user-attachments/assets/ee5ed54c-9a08-4ad7-821b-d56610304b91" width="600" alt="LED panel displaying random colorful blocks at an Apple smart home store">
</p>

One day, while passing by an Apple smart home store with my son, we spotted an LED panel on display — it was continuously cycling through random colorful blocks, creating a mesmerizing mosaic of light. My son gazed at it and said, "That's so beautiful!" That moment stuck with me. When I got home, I decided to build a multi-display RGB lighting application that could recreate exactly that effect — and much more. The **Random Color** effect in RGBBox was born from that spark of inspiration.

### Current implementation

- Electron + Vite + React + TypeScript application shell.
- Secure preload bridge with IPC channels for app version, display topology, profile persistence, engine status, overlay management, screen capture, and diagnostics.
- Multi-display topology discovery, hotplug refresh, and linked-display virtual canvas mode.
- Local profile persistence with named profiles and explicit duplicate/rename support.
- **45 built-in effects** across six categories:
  - *Classic*: Screen Ambient, Static (with dot-matrix text), Breathing, Rainbow, Wave, Zone Gradient, Random Color
  - *Advanced*: Fire (discrete gust events, per-column height envelopes, 4-stop colour ramp), Starlight, Ripple (click-to-burst), Spectrum (diagonal colour wash), Comet, Lightning, Aurora, Explode
  - *3D Visual*: Plasma, Vortex, Tunnel, Crystal
  - *GPU 3D*: Sphere Pulse, Warp Portal, Neon Galaxy, Lava Sphere
  - *Audio Reactive*: Audio Beat (attack/decay envelope), Equalizer (32-band FFT, anti-aliased bar edges, asymmetric EMA)
  - *Science*: DNA Double Helix, Black Hole, Solar System, Spiral Galaxy, and more
- Effect favorites with a local quick-access strip, star controls in the effect library, and Alt+Arrow / Alt+number switching.
- Smart parameter randomizer for the selected layer with subtle, bold, calm, and high-energy modes, plus per-parameter locks for controlled exploration.
- Scheduled ambience MVP with local Day / Evening / Night effect slots that can automatically switch the selected layer by time of day.
- Parameter automation MVP for selected layer controls, with sine, triangle, and pulse curves evaluated before preview frames are rendered.
- Web Worker engine loop: renders frames off the main thread, prevents worker message backlog via `tickPending` gate.
- WebGL-accelerated canvas preview renderer with inter-cell gap lines.
- Overlay windows for each physical display, pushed from the virtual canvas frame, with fullscreen/preset/custom region controls.
- Capture provider architecture with Electron `desktopCapturer` fallback and diagnostics for active provider, capture time, and fallback state; native DXGI/ScreenCaptureKit providers are scaffolded for future builds.
- Runtime telemetry in diagnostics: average/p95 frame time, worker render time, capture time, output enqueue time, and dropped tick count; per-process CPU breakdown (Browser / GPU / Utility / Tab) for objective idle-cost verification; `--perf-selftest` harness that auto-runs 5 idle / minimize / overlay / tray scenarios with PASS/FAIL verdicts and writes a JSON report to `userData/logs/perf-selftest-report.json`.
- Audio capture: microphone or system audio loopback (Windows), 32 log-spaced FFT bands, and visible capture failure state.
- Audio Studio with playlist, generators, scenes and premium visualizers (spectrum / oscilloscope / spectrogram / VU meter) that support an in-app fullscreen mode.
- Video Studio: any-camera capture (resolution/frame-rate/hardware parameters), photo & video recording, screen/window source capture via `desktopCapturer`, a mainstream-format video player, live colour filters and in-app fullscreen.
- Gaussian Splat model viewer with cinematic rendering (PMREM image-based lighting, ACES tone-mapping, reflective ground + contact shadow, additive LED bloom halos, auto-rotate and live exposure/glow controls), on-demand model downloads, local cache detection, user model import, and LED mapping editor.
- Single-player mini games theme with a playable local balloon tower-defense arena in the renderer.
- FPS estimation hint in the resolution slider (calibrated for complex effects).
- `setInterval`-based engine tick that **pauses when no consumer is active** — idle when the workspace is hidden or minimized and no overlay window is open, keeps rendering as soon as an overlay becomes visible (the overlay tick-loop gate introduced to keep idle CPU near zero).
- Full Chinese/English UI toggle (persisted to localStorage).

### Recent stability improvements (R38–R48, since v0.3.8)

- **Background / minimized CPU & presentation stability (R38–R45)**: R38 fixed minimize stutter; R41 eliminated the `atan2` seam in hurricane-eye / nebula; R42 pauses frame computation when nothing consumes it; R43 fixed R42's minimize detection and throttles audio state updates; R44 addressed the close-to-tray case where CPU still wouldn't drop; R45 killed the residual idle CPU/IO and disabled Windows native window occlusion for overlays (the architectural follow-up — moving overlay rendering to a true GPU compositing surface — is documented but not yet implemented).
- **Objective per-process CPU diagnostics (R46)**: the diagnostics page now reports Browser / GPU / Utility / Tab CPU percentages individually via `app.getAppMetrics()`, replacing the previous "total CPU" view that couldn't distinguish a quiet renderer from a runaway GPU process. Earlier R38/R42–R45 fixes are explicitly marked as not having been verified before that.
- **Automated performance self-test harness (R47)**: `--perf-selftest` CLI flag auto-runs the four reported scenarios — workspace idle, main minimized, main minimized with overlay open, hidden to tray — and writes `userData/logs/perf-selftest-report.json` with PASS/FAIL verdicts. Drive the *real* `BrowserWindow.minimize()` / `hide()` and the real overlay spawn path so the numbers are trustworthy.
- **Harness hardening (R48)**: added overlay **frame-arrival timing** (the only signal that catches compositor/GPU frame throttling CPU% is blind to); tightened the scenario-4 verdict to **dual criterion** — overlay process CPU ≥ 50% of visible AND delivery fps ≥ 60% of visible, so "computation skipped" and "presentation throttled" failures no longer false-pass; multi-sample stats (median + p25/p75 + min/max) instead of single averages; extracted `src/main/perfSelfTest.ts` as a standalone module; fixed the rapid-rerun exit-0-no-report flakiness by skipping `requestSingleInstanceLock` and adding a 30 s watchdog.
- **Self-check evidence**: `yarn typecheck` / `yarn build` / `yarn test` all green; `--perf-selftest` × 3 stable reports, all three verdicts PASS.

### Scripts

```bash
yarn dev        # start in development mode
yarn typecheck  # TypeScript type check (node + web)
yarn build      # typecheck + electron-vite build
yarn dist:win   # build + package Windows installer
yarn dist:mac   # build + package macOS DMG
```

### Architecture

```text
src/main      Electron main process — IPC, display topology, profile store,
              screen capture providers, overlay manager
src/preload   Context-isolated renderer API bridge
src/shared    Shared types, IPC channel names, default profile and effect presets
src/engine    Pure TypeScript effect engine (effects.ts, previewEngine.ts, color.ts)
src/renderer  React UI — workspace, display map, layered effect controls,
               virtual preview (WebGL), effects library, audio analyzer hook,
               mini games, audio & video studios, 3D Gaussian Splat viewer and LED mapper
```

### 🌐 Online Introduction Page (GitHub Pages)

**Live site**: https://tangjianfang.github.io/RGBBox/

The `docs/index.html` page is a bilingual (zh/en) product showcase deployed to GitHub Pages via a GitHub Actions workflow.

To deploy: Settings → Pages → Source: **GitHub Actions**, then push any change to `docs/`.

### Roadmap

- Native capture providers for Windows (DXGI) / macOS (ScreenCaptureKit)
- Scene timeline editor and richer scheduled ambience transitions
- Region masks for layered multi-effect compositions
- 4-worker tile parallelism for larger grids
- WebGL GLSL effect shaders (targeting 960×540 at 60fps)

---

<a id="中文"></a>

## 中文

RGBBox 是一个**本地优先**的 Electron 桌面客户端，专为多屏 RGB 灯光控制设计。提供虚拟 RGB 画布预览、可配置的采样精度、分层特效引擎、音频响应特效以及 3D 模型预览工具。

### 灵感来源

<p align="center">
  <img src="https://github.com/user-attachments/assets/ee5ed54c-9a08-4ad7-821b-d56610304b91" width="600" alt="苹果智能家居店中展示随机彩色方块的 LED 面板">
</p>

有一天，我和儿子路过一家苹果智能家居体验店，店里展示着一块 LED 面板——它不停地显示着随机变换的彩色小方块，绚丽夺目。儿子看得入迷，说了一句："真漂亮！"这句话深深触动了我。回到家后，我决定做一款支持多显示器的 RGB 灯效软件，把那种随机色彩的效果完美复现出来。RGBBox 中的**随机颜色**特效，正是源于那一刻的灵感。

### 已实现功能

- Electron + Vite + React + TypeScript 应用框架。
- 安全预加载桥接，支持应用版本、显示器拓扑、Profile 持久化、引擎状态、悬浮窗管理、屏幕捕获和诊断等 IPC 通道。
- 多显示器拓扑自动发现，支持热插拔刷新和联动显示器虚拟画布模式。
- 本地 Profile 持久化，支持命名配置及显式复制/重命名操作。
- **45 种内置特效**，分为六大类别：
  - *经典*：屏幕采样、静态（点阵文字）、呼吸、彩虹、波浪、区域渐变、随机颜色
  - *进阶*：火焰（离散阵风、逐列高度包络、4 档色彩渐变）、星光、涟漪（点击爆发）、光谱（斜向色彩扫描）、彗星、闪电、极光、爆炸
  - *3D 视觉*：等离子、旋涡、隧道、水晶
  - *GPU 3D 渲染*：球体脉冲、跃迁门户、霓虹银河、熔岩球
  - *音频响应*：节拍（起音/衰减包络）、均衡器（32 频段 FFT、反锯齿边缘、非对称 EMA）
  - *科学可视化*：DNA 双螺旋、黑洞吸积盘、太阳系轨道、银河旋臂等
- 特效收藏与快速访问栏，支持星标收藏和 Alt+方向键 / Alt+数字切换。
- 智能参数随机器，支持轻微、大胆、平静、高能四种模式，并可对单个参数加锁控制随机范围。
- 定时氛围 MVP：本地白天/傍晚/夜间时间段自动切换当前图层效果。
- 参数自动化 MVP：支持正弦、三角、脉冲曲线，在预览帧渲染前应用。
- Web Worker 引擎循环：帧渲染在主线程之外处理，通过 `tickPending` 门控防止消息积压。
- WebGL 加速画布预览，支持格子间隔线显示。
- 每个物理显示器对应一个悬浮窗，从虚拟画布帧推送，支持全屏/预设/自定义区域控制。
- 捕获后端架构，Electron `desktopCapturer` 回退方案，含活跃后端/捕获耗时/回退状态诊断；Windows DXGI / macOS ScreenCaptureKit 原生后端已为未来版本预留脚手架。
- 运行时遥测诊断：平均/P95 帧耗时、Worker 渲染耗时、捕获耗时、输出耗时、丢帧 tick 计数；按进程 CPU 诊断（Browser / GPU / Utility / Tab），用于客观验证空闲态开销；`--perf-selftest` 自测 harness，自动跑 5 个 idle / 最小化 / overlay / 隐藏托盘场景，输出 PASS/FAIL 判据，JSON 报告写入 `userData/logs/perf-selftest-report.json`。
- 音频捕获：麦克风或系统音频回环（Windows），32 对数间隔 FFT 频段，并可显示捕获失败状态。
- 高斯泼溅模型查看器，支持按需下载模型、本地缓存检测、用户导入及 LED 映射编辑器。
- 单机小游戏模块，内置可运行的气球塔防竞技场。
- 分辨率滑块内置 FPS 估算提示（针对复杂特效进行校准）。
- 基于 setInterval 的引擎 tick，**无消费者时自动暂停** —— 工作区隐藏 / 最小化且无悬浮窗可见时不渲染（保持空闲 CPU 接近 0）；一旦有悬浮窗可见就恢复渲染（R42 引入的 tick-loop gate）。
- 完整的中英文 UI 切换（通过 localStorage 持久化）。

### 近期稳定性改进（R38–R48，自 v0.3.8 起）

- **后台 / 最小化时 CPU 与画面稳定性（R38–R45）**：R38 修复 minimize 时的 stutter；R41 消除 hurricane-eye / nebula 的 `atan2` seam；R42 没有消费者时暂停帧计算；R43 修正 R42 的 minimize 检测 + 限流 audio 状态更新；R44 解决 close-to-tray 时 CPU 仍降不下来的问题；R45 消除残余空闲 CPU/IO，禁用 Windows native window occlusion 对 overlay 的影响（真正的 GPU 合成层方案已记录但尚未实施）。
- **按进程 CPU 诊断（R46）**：诊断页现在通过 `app.getAppMetrics()` 分别报告 Browser / GPU / Utility / Tab 各自的 CPU%，替代原先的"总 CPU"视图（后者区分不出 renderer 安静 vs GPU 进程失控）。R38/R42–R45 那几轮 fix 也明确标注为此前未经充分验证。
- **自动化性能自测试 harness（R47）**：`--perf-selftest` 命令行 flag 自动跑四个报告场景（idle / 主窗口最小化 / 主窗口最小化+overlay / 隐藏到托盘），写 `userData/logs/perf-selftest-report.json`，附 PASS/FAIL 判据。驱动真实的 `BrowserWindow.minimize()` / `hide()` 与真实的 overlay 生成路径，数字可信。
- **Harness 增强（R48）**：新增 overlay **帧到达时序指标**（唯一能检测合成器/GPU 限流的信号，CPU% 看不到）；场景 4 判据收紧为**双判据**——overlay 进程自身 CPU ≥ 可见时 50% **且** 交付帧率 ≥ 可见时 60%——"计算被跳过"与"画面被限流"两类失效不再假通过；统计改为多次采样（中位数 + p25/p75 + min/max）；抽到 `src/main/perfSelfTest.ts` 独立模块；修复快速重跑 exit-0 无报告的 1/3 flaky（跳过单实例锁 + 30s 看门狗）。
- **自检证据**：`yarn typecheck` / `yarn build` / `yarn test` 全过；`--perf-selftest` × 3 稳定出报告，三项 verdict 全 PASS。

### 开发脚本

```bash
yarn dev        # 开发模式启动
yarn typecheck  # TypeScript 类型检查（node + web）
yarn build      # typecheck + electron-vite 构建
yarn dist:win   # 构建并打包 Windows 安装包
yarn dist:mac   # 构建并打包 macOS DMG
```

### 项目架构

```text
src/main      Electron 主进程 — IPC、显示器拓扑、Profile 存储、
              屏幕捕获后端、悬浮窗管理
src/preload   上下文隔离的渲染进程 API 桥接
src/shared    共享类型、IPC 通道名称、默认 Profile 和特效预设
src/engine    纯 TypeScript 特效引擎（effects.ts、previewEngine.ts、color.ts）
src/renderer  React UI — 工作区、显示器映射、分层特效控制、
               虚拟预览（WebGL）、特效库、音频分析钩子、
               小游戏、3D 高斯泼溅查看器与 LED 映射器
```

### 🌐 在线介绍页面（GitHub Pages）

**在线访问**: https://tangjianfang.github.io/RGBBox/

`docs/index.html` 是支持中英文切换的产品展示页，通过 GitHub Actions 自动部署到 GitHub Pages。

部署方式：仓库 Settings → Pages → Source 选择 **GitHub Actions**，然后推送对 `docs/` 目录的任何更改即可。

### 开发路线图

- Windows（DXGI）/ macOS（ScreenCaptureKit）原生捕获后端
- 场景时间轴编辑器与更丰富的定时氛围过渡效果
- 分层多特效合成的区域遮罩
- 更大网格的 4 Worker 分块并行渲染
- WebGL GLSL 特效着色器（目标：960×540 @ 60fps）
