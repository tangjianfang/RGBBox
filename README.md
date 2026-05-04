# RGBBox

RGBBox is a local-first Electron desktop client for multi-display RGB lighting. It provides a virtual RGB canvas preview with configurable sampling granularity, a layered effect engine, audio-reactive effects, and an OpenRGB-compatible output path planned after the virtual preview foundation is stable.

## Current implementation

- Electron + Vite + React + TypeScript application shell.
- Secure preload bridge with IPC channels for app version, display topology, profile persistence, engine status, overlay management, and screen capture.
- Multi-display topology discovery and linked-display virtual canvas mode.
- Local profile persistence with named profiles and duplicate/rename support.
- **17 built-in effects** across three categories:
  - *Classic*: Screen Ambient, Static (with dot-matrix text), Breathing, Rainbow, Wave, Zone Gradient, Random Color
  - *Advanced*: Fire (discrete gust events, per-column height envelopes, 4-stop colour ramp), Starlight, Ripple (click-to-burst), Spectrum (diagonal colour wash), Comet, Lightning, Aurora, Explode
  - *Audio Reactive*: Audio Beat (attack/decay envelope), Equalizer (32-band FFT, anti-aliased bar edges, asymmetric EMA)
- Web Worker engine loop: renders frames off the main thread, prevents worker message backlog via `tickPending` gate.
- WebGL-accelerated canvas preview renderer with inter-cell gap lines.
- Overlay windows for each physical display, pushed from the virtual canvas frame.
- Audio capture: microphone or system audio loopback (Windows), 32 log-spaced FFT bands.
- FPS estimation hint in the resolution slider (calibrated for complex effects).
- setInterval-based engine tick (continues when window is minimised).

## Scripts

```bash
npm run dev        # start in development mode
npm run typecheck  # TypeScript type check (node + web)
npm run build      # typecheck + electron-vite build
npm run dist:win   # build + package Windows installer
npm run dist:mac   # build + package macOS DMG
```

## Architecture

```text
src/main      Electron main process — IPC, display topology, profile store,
              screen capture, overlay manager
src/preload   Context-isolated renderer API bridge
src/shared    Shared types, IPC channel names, default profile and effect presets
src/engine    Pure TypeScript effect engine (effects.ts, previewEngine.ts, color.ts)
src/renderer  React UI — workspace, display map, layered effect controls,
              virtual preview (WebGL), effects library, audio analyzer hook
```

## Roadmap

- Capture-provider abstraction for Windows (DXGI) / macOS (ScreenCaptureKit)
- OpenRGB output adapter and device-zone mapping editor
- Performance guard telemetry (frame timing, worker queue depth)
- 4-worker tile parallelism for larger grids
- WebGL GLSL effect shaders (targeting 960×540 at 60fps)
