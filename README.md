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
- Runtime telemetry in diagnostics: average/p95 frame time, worker render time, capture time, output enqueue time, and dropped tick count.
- Audio capture: microphone or system audio loopback (Windows), 32 log-spaced FFT bands, and visible capture failure state.
- Gaussian Splat model viewer with on-demand model downloads, local cache detection, user model import, and LED mapping editor.
- Single-player mini games theme with a playable local balloon tower-defense arena in the renderer.
- FPS estimation hint in the resolution slider (calibrated for complex effects).
- setInterval-based engine tick (continues when window is minimised).
- Full Chinese/English UI toggle (persisted to localStorage).

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
               mini games, 3D Gaussian Splat viewer and LED mapper
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
- 运行时遥测诊断：平均/P95 帧耗时、Worker 渲染耗时、捕获耗时、输出耗时、丢帧 tick 计数。
- 音频捕获：麦克风或系统音频回环（Windows），32 对数间隔 FFT 频段，并可显示捕获失败状态。
- 高斯泼溅模型查看器，支持按需下载模型、本地缓存检测、用户导入及 LED 映射编辑器。
- 单机小游戏模块，内置可运行的气球塔防竞技场。
- 分辨率滑块内置 FPS 估算提示（针对复杂特效进行校准）。
- 基于 setInterval 的引擎 tick（窗口最小化时继续运行）。
- 完整的中英文 UI 切换（通过 localStorage 持久化）。

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
