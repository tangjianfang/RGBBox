# RGBBox

RGBBox is a local-first Electron desktop client for multi-display RGB lighting. The MVP focuses on screen-driven virtual lighting, configurable sampling granularity, preset-based effects, and an OpenRGB-compatible output path planned after the virtual preview foundation is stable.

## Current implementation

- Electron + Vite + React + TypeScript application shell.
- Secure preload bridge with IPC channels for app version, display topology, profile persistence, engine status, and preview frame rendering.
- Multi-display topology discovery through Electron's `screen` API.
- Local profile persistence in the app user data directory.
- Layered virtual effect engine with screen ambient, static color, breathing, rainbow, wave, and zone gradient presets.
- Renderer dashboard with display map, virtual RGB canvas preview, sampling controls, effect selection, and diagnostics.

## Scripts

```bash
npm run dev
npm run typecheck
npm run build
```

## Architecture

```text
src/main      Electron main process, system orchestration, IPC, display topology, profile store
src/preload   Context-isolated renderer API surface
src/shared    Shared types, IPC channel names, default profile and effect presets
src/engine    Pure TypeScript preview/effect engine used by the first MVP slice
src/renderer  React UI for workspace, display map, controls, diagnostics, and virtual preview
```

## MVP direction

The next implementation slices are a capture-provider abstraction for Windows/macOS, OpenRGB output adapter, device-zone mapping editor, and performance guard telemetry for sampling load. First-party vendor protocols, cloud sync, accounts, and node-based effect editing are intentionally out of scope for the MVP.
