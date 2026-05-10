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
              3D Gaussian Splat viewer and LED mapper
```

## Roadmap

- Native capture providers for Windows (DXGI) / macOS (ScreenCaptureKit)
- Scene timeline editor and richer scheduled ambience transitions
- Region masks for layered multi-effect compositions
- 4-worker tile parallelism for larger grids
- WebGL GLSL effect shaders (targeting 960×540 at 60fps)
