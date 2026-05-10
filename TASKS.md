# README Feature Parity (Yarn Supported)

Scope: align the documented current implementation with working code and keep RGBBox focused on local-first virtual RGB preview, effects, overlays, audio, and 3D model tooling.

- [x] Confirm baseline and keep existing Yarn workflow
- [x] Register the missing engine preview IPC handler
- [x] Extend screen-ambient sampling for linked multi-display virtual canvas
- [x] Clean current UI/runtime defects
- [x] Make profile duplicate support explicit
- [x] Surface audio capture failure state
- [x] Sync README current features and Yarn commands
- [x] Verify with `yarn typecheck` and `yarn build`

Notes:

- Keep `yarn.lock`; do not migrate this project to npm-only scripts.
- Existing user-generated changes in `yarn.lock` are preserved.

---

## Capture/Telemetry Upgrade

- [x] Add shared capture provider and telemetry contracts
- [x] Refactor screen capture behind provider abstraction
- [x] Expose capture provider diagnostics
- [x] Add worker/frame telemetry collection
- [x] Show telemetry in diagnostics
- [x] Verify with `yarn typecheck` and `yarn build`

---

## Fun Feature Ideas Kickoff

- [x] Add local effect favorites and quick-access strips
- [x] Add favorite star controls to the effect library
- [x] Add Alt+Arrow and Alt+number quick switching
- [x] Add smart parameter randomizer modes for the selected layer
- [x] Update README with implemented creative workflow features
- [x] Verify with `yarn typecheck`

---

## Feature Evolution Queue

Process: move one item into **Active**, implement it, verify it, then mark it done before starting the next item.

### Done: Smart Randomizer Parameter Locks

- [x] Add per-parameter lock state for the selected layer controls
- [x] Make locked parameters immune to Smart Randomizer changes
- [x] Persist lock preferences locally for quick iteration
- [x] Update UI copy and styling
- [x] Update README with the evolved randomizer behavior
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Scene Timeline & Scheduled Mode MVP

- [x] Add a local scheduled-mode toggle
- [x] Add a compact day/evening/night scene schedule
- [x] Switch the selected layer effect from the current time block
- [x] Keep manual effect selection responsive when scheduled mode is off
- [x] Update README with scheduled ambience behavior
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Effect Parameter Automation MVP

- [x] Add looped automation modes for selected numeric parameters
- [x] Evaluate automation before frames are sent to the preview worker
- [x] Keep manual parameter editing as the source value
- [x] Add compact controls for speed, intensity, hue, and angle where available
- [x] Update README with automation behavior
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Region / Zone Masks for Layers

- [x] Add a mask model for layer regions
- [x] Apply mask weighting in compositing instead of individual effects
- [x] Add compact mask controls in the selected layer panel
- [x] Update README with mask behavior
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Multi-Display Scene Designer

- [x] Add a virtual multi-display canvas that joins all screens into one coordinate space
- [x] Let layers target specific displays or span all displays
- [x] Show per-display boundaries in the preview grid
- [x] Add display selector controls to the scene panel
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: 3D Model Lighting Stage

- [x] Add two new GPU 3D effects: Laser Show and Hologram
- [x] Register new kinds in Effect3DKind, EFFECT_3D_KINDS and SHADERS map
- [x] Add presets and i18n labels
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: GLSL 2D Shader Effects

- [x] Add Glitch effect (horizontal band corruption, RGB channel splits, scan lines)
- [x] Add Matrix Rain effect (per-column falling streaks with density control)
- [x] Add Neon Pulse effect (concentric rings with colour-interference shimmer)
- [x] Register kinds in EffectKind, add presets and i18n labels
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Ambient Intelligence Presets

- [x] Define 6 mood/context presets (Focus, Gaming, Party, Cinema, Relax, Sleep)
- [x] Each preset applies effect kind + tuned parameters + opacity + blend mode in one click
- [x] Add compact 3-column preset grid above the effect library
- [x] Add i18n labels in EN and ZH
- [x] Verify with `yarn typecheck` and `yarn build`

### Done: Shareable Effect Packs

- [x] Export selected layer as `*.rgbbox.json` pack (JSON with version tag + layer config)
- [x] Import a pack file, add as new layer in active scene
- [x] Upload (export) and Download (import) buttons in the Layers panel header
- [x] Hidden `<input type="file">` for native OS file picker
- [x] Add i18n labels (`pack.export`, `pack.import`, `pack.importError`) in EN and ZH
- [x] Verify with `yarn typecheck` and `yarn build`

### Backlog

