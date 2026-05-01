- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions
- [x] Compile the Project
- [x] Create and Run Task
- [x] Launch the Project
- [x] Ensure Documentation is Complete

Project context:
- RGBBox is an Electron + Vite + React + TypeScript desktop RGB lighting client.
- MVP targets Windows and macOS, local-first usage, multi-display screen sampling, virtual preview, preset effects, and later OpenRGB output.
- Keep renderer code isolated from Node APIs through preload IPC.
- Keep engine logic in pure TypeScript modules until native capture/output adapters are introduced.
- Prefer focused changes and verify with `npm run typecheck` and `npm run build`.
