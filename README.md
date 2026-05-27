# RGBBox

RGBBox is a local-first Electron desktop client for multi-display RGB lighting. It provides a virtual RGB canvas preview with configurable sampling granularity, a layered effect engine, audio-reactive effects, and 3D model preview tooling.

## Current implementation

- Electron + Vite + React + TypeScript application shell.
- Secure preload bridge with IPC channels for app version, display topology, profile persistence, engine status, overlay management, screen capture, and diagnostics.
- Multi-display topology discovery, hotplug refresh, and linked-display virtual canvas mode.
- Local profile persistence with named profiles and explicit duplicate/rename support.
- **25 built-in effects** across five categories:
  - *Classic*: Screen Ambient, Static (with dot-matrix text), Breathing, Rainbow, Wave, Zone Gradient, Random Color
  - *Advanced*: Fire (discrete gust events, per-column height envelopes, 4-stop colour ramp), Starlight, Ripple (click-to-burst), Spectrum (diagonal colour wash), Comet, Lightning, Aurora, Explode
  - *3D Visual*: Plasma, Vortex, Tunnel, Crystal
  - *GPU 3D*: Sphere Pulse, Warp Portal, Neon Galaxy, Lava Sphere
  - *Audio Reactive*: Audio Beat (attack/decay envelope), Equalizer (32-band FFT, anti-aliased bar edges, asymmetric EMA)
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

## Scripts

```bash
yarn dev        # start in development mode
yarn typecheck  # TypeScript type check (node + web)
yarn build      # typecheck + electron-vite build
yarn dist:win   # build + package Windows installer
yarn dist:mac   # build + package macOS DMG
```

## Architecture

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

## 🌐 在线介绍页面（GitHub Pages）

RGBBox 提供了一个美化的 HTML 产品介绍页，部署在 GitHub Pages 上，用于直观展示软件功能。

**在线访问**: https://tangjianfang.github.io/RGBBox/

### 页面结构

```text
docs/
├── index.html              # 主介绍页面（单文件，无需构建工具）
└── screenshots/            # 截图目录
    ├── .gitkeep
    ├── main-canvas.png     # 主界面截图（待添加）
    ├── effects-library.png # 特效库截图（待添加）
    ├── audio-reactive.png  # 音频响应截图（待添加）
    └── 3d-viewer.png       # 3D查看器截图（待添加）
```

### 如何添加真实截图

1. 运行 RGBBox 并截取各功能界面的截图
2. 将截图保存为 PNG 格式，放入 `docs/screenshots/` 目录
3. 编辑 `docs/index.html`，将截图占位符替换为真实图片：

```html
<!-- 替换前（占位符） -->
<div class="screenshot-placeholder">
  <span>🖥️</span>
  <p>主界面 - 虚拟画布预览</p>
</div>

<!-- 替换后（真实截图） -->
<img src="screenshots/main-canvas.png" alt="主界面 - 虚拟画布预览" />
```

### 部署到 GitHub Pages

本仓库已配置 GitHub Actions 自动部署（`.github/workflows/pages.yml`），当 `docs/` 目录下的文件推送到 `main` 分支时自动触发部署。

**首次启用步骤：**

1. 打开仓库 Settings → Pages
2. 在 "Build and deployment" 下选择 **Source: GitHub Actions**
3. 推送任何对 `docs/` 目录的更改到 `main` 分支
4. Actions 会自动构建并部署到 `https://tangjianfang.github.io/RGBBox/`

**手动触发部署：**

也可以在 Actions 页面点击 "Deploy to GitHub Pages" workflow，手动触发 `workflow_dispatch`。

### 本地预览

```bash
# 方式一：直接打开
open docs/index.html          # macOS
start docs/index.html         # Windows

# 方式二：使用本地服务器（推荐，避免跨域问题）
npx serve docs
# 或
python -m http.server 8080 -d docs
```

## Roadmap

- Native capture providers for Windows (DXGI) / macOS (ScreenCaptureKit)
- Scene timeline editor and richer scheduled ambience transitions
- Region masks for layered multi-effect compositions
- 4-worker tile parallelism for larger grids
- WebGL GLSL effect shaders (targeting 960×540 at 60fps)
