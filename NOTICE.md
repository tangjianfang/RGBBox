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

## Development-only (not shipped in distributions)

| Component | License |
|---|---|
| `playwright-core` | Apache-2.0 |
| `vite` / `vitest` / `typescript` / etc. | MIT |

App icon and local-only gaussian-splat sample assets (`*.splat`, `*.ksplat`,
`*.spz`, `*.ply`) are excluded from release packages (`electron-builder.files`).
