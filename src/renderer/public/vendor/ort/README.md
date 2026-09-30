# vendor/ort — onnxruntime-web 1.30.0 runtime (R93 AI super-resolution)

Vendored, prebuilt onnxruntime-web runtime files. Loaded at RUNTIME via dynamic
import from this directory — never through the bundler / node_modules (this is
the R131 mediapipe pattern, and the fix for the R91.3b electron-vite + file://
wasm packaging pitfall that previously forced inference into a utilityProcess).

## Provenance

| file | bytes | sha256 |
|---|---|---|
| `ort.all.bundle.min.mjs` | 865,342 | `781899d39e1162c4*` (prefix; full hash in commit) |
| `ort-wasm-simd-threaded.jsep.mjs` | 46,851 | `709853412fd1ffc3*` |
| `ort-wasm-simd-threaded.jsep.wasm` | 28,312,028 | `3ad23231b5bd6d9d*` |

- Source: npm tarball `onnxruntime-web@1.30.0` (registry.npmmirror.com mirror of
  https://www.npmjs.com/package/onnxruntime-web), files copied verbatim from
  `dist/`. No patches.
- Why `ort.all.bundle.min.mjs`: includes every browser EP (wasm CPU / WebGL /
  WebGPU / WebNN) so the backend chain webgpu → webgl → wasm-cpu degrades in a
  single runtime, and the `bundle` variant INLINES the emscripten glue — the
  wasm binary is resolved relative to `import.meta.url`, i.e. next to this file.
- Why the `.jsep.mjs` glue is vendored anyway: insurance for any code path that
  sets `ort.env.wasm.wasmPaths` to a string prefix (that path fetches the glue).
- Runtime loads it via `media://app/vendor/ort/…` in packaged builds (dev:
  `document.baseURI`) — see `src/renderer/src/components/video/superres.ts`.

## License

onnxruntime-web is MIT licensed — https://github.com/microsoft/onnxruntime/blob/main/LICENSE
Copyright (c) Microsoft Corporation.
