# Contributing to RGBBox

Thank you for your interest in contributing to RGBBox! This guide covers the essentials for getting started.

## Development Setup

**Prerequisites:** Node.js ≥ 18, Yarn

```bash
# Install dependencies
yarn install

# Start dev server (Electron + Vite hot reload)
yarn dev

# Type check
yarn typecheck

# Build
yarn build

# Run tests
yarn test

# Run tests with coverage
yarn test:coverage
```

## Project Structure

```
src/
  main/         – Electron main process (IPC handlers, capture, overlay)
  preload/      – contextBridge API surface (window.rgbbox)
  renderer/src/ – React UI, Web Worker engine loop, WebGL preview
  engine/       – Pure TS effects engine (CPU rendering, color utils)
  shared/       – IPC channel constants, types, logger, models manifest
tests/          – Vitest unit + integration tests
docs/           – Landing page and PRD documentation
```

## Workflow: Single-PRD Model

All features, bugs, and refactors are tracked as **R-N items** in [`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md).

**Before making any code change:**
1. Find the matching R-N item (or ask a maintainer to add one).
2. The R-N must have status ⏳ or 🔄.
3. Make your change and update the R-N status to ✅ with evidence.

See [`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md) for the full rules.

## Commit Format

```
[PRD-0002] <type>: <subject>
```

Types follow [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`, `build`, `ci`.

Examples:
- `[PRD-0002] feat: add WLED UDP output adapter`
- `[PRD-0002] fix: prevent overlay frame drop on disconnect`
- `[PRD-0002] docs: update architecture diagram`

## Pull Requests

- Link the R-N item in your PR description.
- Ensure `yarn typecheck && yarn build && yarn test` all pass.
- Keep changes focused; one R-N per PR is preferred.

## Code Style

- TypeScript strict mode (`strict: true` + `noUnusedLocals` + `noUnusedParameters`).
- Renderer code must not import Node.js APIs directly — use the `window.rgbbox` preload bridge.
- Engine logic (`src/engine/`) must remain pure TypeScript with no Electron/DOM dependencies.

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) to file issues.

## Questions?

Open a [Discussion](https://github.com/tangjianfang/RGBBox/discussions) or an [Issue](https://github.com/tangjianfang/RGBBox/issues).
