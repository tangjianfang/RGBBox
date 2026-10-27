# NOTICE — Third-Party Components

RGBBox ships with and depends on the following third-party components.
Licenses are those of the respective projects; this file exists so a
distribution of RGBBox carries the required acknowledgements (R306/T15).

## Runtime dependencies

| Component | License | Use |
|---|---|---|
| `three` | MIT | 3D preview + gaussian-splat renderer |
| `@mkkellogg/gaussian-splats-3d` | MIT | `.splat`/`.spz` model loading and sorting |
| `react` / `react-dom` | MIT | renderer UI |
| `@huggingface/transformers` | Apache-2.0 | local AI models runtime |
| `kokoro-js` | Apache-2.0 | local TTS voice engine |
| `onnxruntime-node` | MIT | ONNX inference for AI voices |
| `piper-phonemize` | **GPL-3.0-or-later** | phonemization for AI voices |
| `fix-webm-duration` | MIT | audio export duration fix |
| `pinyin-pro` | MIT | Chinese text segmentation |
| `electron` | MIT | application shell |

> `piper-phonemize` is the only GPL-licensed runtime dependency; it is used
> unmodified as an npm package. Consult its license text before redistributing
> RGBBox builds.

## Vendored into this repository

| Component | License | Path |
|---|---|---|
| MediaPipe Tasks Vision bundle (`vision_bundle.js`) | Apache-2.0 | `src/renderer/public/vendor/mediapipe/` |
| ONNX Runtime Web wasm | MIT | `src/renderer/public/vendor/ort/` |
| MediaPipe hand landmarker model (`hand_landmarker.task`) | Apache-2.0 | `src/renderer/public/models/` |
| MediaPipe face landmarker model (`face_landmarker.task`) | Apache-2.0 | `src/renderer/public/models/` |

MediaPipe models © Google LLC, provided under the Apache-2.0 license
(https://developers.google.com/mediapipe).

### Bundled UI fonts (R321)

Shipped inside the renderer bundle so the UI renders identically on every
machine instead of depending on the host's installed fonts. All three are
licensed under the SIL Open Font License 1.1; the full license texts and the
subsetting provenance live in `src/renderer/src/assets/fonts/`.

| Font | License | Copyright / source | Path |
|---|---|---|---|
| Inter Variable (latin, latin-ext) | OFL-1.1 | © 2016 The Inter Project Authors — https://github.com/rsms/inter (via `@fontsource-variable/inter` 5.3.0, unmodified) | `src/renderer/src/assets/fonts/Inter-*.woff2` |
| Noto Sans SC (400 / 600 / 700, **subset**) | OFL-1.1 | Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' — Noto Sans SC derives from Source Han Sans; https://github.com/notofonts/noto-cjk (via `@expo-google-fonts/noto-sans-sc` 0.4.4; glyph subset only, family name stays "Noto Sans SC", the Reserved Font Name is not used) | `src/renderer/src/assets/fonts/NotoSansSC-*.woff2` |
| Cascadia Mono (latin, 400 / 700) | OFL-1.1 | copyright notice exactly as shipped in `LICENSE-CascadiaMono.txt`; upstream https://github.com/microsoft/cascadia-code (via `@fontsource/cascadia-mono` 5.3.0, unmodified) | `src/renderer/src/assets/fonts/CascadiaMono-*.woff2` |

## Development-only (not shipped in distributions)

| Component | License |
|---|---|
| `playwright-core` | Apache-2.0 |
| `vite` / `vitest` / `typescript` / etc. | MIT |

App icon and local-only gaussian-splat sample assets (`*.splat`, `*.ksplat`,
`*.spz`, `*.ply`) are excluded from release packages (`electron-builder.files`).
