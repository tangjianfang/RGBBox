/**
 * modelsManifest.ts
 *
 * Single source of truth for bundled 3D model assets.
 * Imported by both the main process (to drive on-demand downloads)
 * and the renderer (useModelStore) to build the model list.
 *
 * Binary .splat files are NOT bundled in the app — they are downloaded
 * on demand via the `modelDownload` IPC channel and cached in
 * `app.getPath('userData')/models/`.
 */

interface ModelManifestEntry {
  /** Unique slug — matches the filename stem */
  name: string
  /** Asset filename */
  file: string
  /** Remote download URL */
  url: string
  /** Asset kind — splat models render in the 3D view; onnx models feed local inference */
  kind: 'splat' | 'onnx'
  /** R90.9 (onnx) / R279 (splat): expected size in bytes — a cached file outside
   *  ±10% is a corrupt/partial download and gets deleted so it re-downloads.
   *  Only pin VERIFIED sizes: a wrong pin deletes a valid cache with no
   *  re-download path. keyboard_rgb/mouse_rgb stay unpinned (custom assets,
   *  release URL dead — no verifiable source), so they keep existence-only
   *  cache checks until real sizes are pinned. */
  bytes?: number
  /** Optional LED position map JSON filename (shipped with the app) */
  ledMapFile?: string
  description?: string
}

/** R279 (W3): the R90.9 ±10% cache-size check, shared by onnx + splat entries.
 *  A cached file whose size falls outside ±10% of the pinned `bytes` is a
 *  partial/corrupt download (e.g. a resume left half a file) and must NOT be
 *  reported as cached — the caller deletes it so the UI re-offers the download. */
export function isCacheSizeOk(actualBytes: number, expectedBytes: number): boolean {
  return Math.abs(actualBytes - expectedBytes) <= expectedBytes * 0.1
}

export const MODELS_MANIFEST: ModelManifestEntry[] = [
  {
    name: 'keyboard_rgb',
    kind: 'splat',
    file: 'keyboard_rgb.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/keyboard_rgb.splat',
    ledMapFile: 'keyboard_rgb.led-map.json',
    description: 'RGB keyboard 3D Gaussian Splat',
  },
  {
    name: 'mouse_rgb',
    kind: 'splat',
    file: 'mouse_rgb.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/mouse_rgb.splat',
    ledMapFile: 'mouse_rgb.led-map.json',
    description: 'RGB mouse 3D Gaussian Splat',
  },
  {
    name: 'train',
    kind: 'splat',
    file: 'train.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/train.splat',
    // R279: pinned from the canonical public source (cakewalk/splat-data via
    // hf-mirror X-Linked-Size, probed 2026-10-11) — the manifest URL's own
    // release (models-v1) is 404, and these Mip-NeRF 360 conversions are the
    // exact files every splat demo (@mkkellogg/gaussian-splats-3d included) ships.
    bytes: 32848256,
    description: 'Demo scene — train (Mip-NeRF 360 dataset)',
  },
  {
    name: 'garden',
    kind: 'splat',
    file: 'garden.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/garden.splat',
    // R279: same provenance as train (see above)
    bytes: 186713088,
    description: 'Demo scene — garden (Mip-NeRF 360 dataset)',
  },
  {
    name: 'bicycle',
    kind: 'splat',
    file: 'bicycle.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/bicycle.splat',
    // R279: same provenance as train (see above)
    bytes: 196222528,
    description: 'Demo scene — bicycle (Mip-NeRF 360 dataset)',
  },
  // ── R90 P1: audio AI test-lab models (hard budget ≤100MB each, R90.2) ──
  // Both served from hf-mirror — GitHub direct connections time out in the
  // app's main process (no system proxy; verified ETIMEDOUT 2026-09-14).
  {
    name: 'silero_vad',
    kind: 'onnx',
    file: 'silero_vad.onnx',
    url: 'https://hf-mirror.com/onnx-community/silero-vad/resolve/main/onnx/model_quantized.onnx',
    bytes: 639335,
    description: 'Silero VAD voice-activity ONNX (~0.6MB)',
  },
  {
    name: 'ast_audioset',
    kind: 'onnx',
    file: 'ast_audioset_int8.onnx',
    url: 'https://hf-mirror.com/onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX/resolve/main/onnx/model_int8.onnx',
    bytes: 90592065,
    description: 'AST AudioSet 527-class classifier, int8 ONNX (~91MB)',
  },
  // ── R91.3b: DTLN real-time speech denoise (breizhn/DTLN pretrained, mirrored
  // on HF by niobures/DTLN — byte-identical, sha256 verified 2026-09-15;
  // GitHub direct times out from the main process, hf-mirror does not) ──
  {
    name: 'dtln_1',
    kind: 'onnx',
    file: 'dtln_model_1.onnx',
    url: 'https://hf-mirror.com/niobures/DTLN/resolve/main/models/DTLN/onnx/model_1.onnx',
    bytes: 1458237,
    description: 'DTLN stage 1 (mask estimation LSTM, ~1.5MB)',
  },
  {
    name: 'dtln_2',
    kind: 'onnx',
    file: 'dtln_model_2.onnx',
    url: 'https://hf-mirror.com/niobures/DTLN/resolve/main/models/DTLN/onnx/model_2.onnx',
    bytes: 2510010,
    description: 'DTLN stage 2 (separation LSTM, ~2.5MB)',
  },
  // ── R93 tier-1: anime video realtime super-resolution (RealESRGAN-AnimeVideo-v3
  // xs, SRVGGNetCompact). Single fp32 ×4 ONNX export with dynamic H×W from the
  // reproducible skillsafe-ai conversion of the official realesr-animevideov3.pth
  // (upstream pth sha256 pinned in the repo manifest; ort-CPU vs PyTorch verified
  // max_abs 3.6e-06; contract: input "input" NCHW RGB 0-1 float32 → output ×4).
  // hf-mirror URL + sha256 verified 2026-09-30. The UI's ×2/×3 scales are produced
  // by pre-scaling the model input (input = native × scale/4) — no verified public
  // ×2/×3 ONNX exists (official releases ship .pth/ncnn only). ──
  {
    name: 'realesr_animevideov3',
    kind: 'onnx',
    file: 'realesr_animevideov3_x4.onnx',
    url: 'https://hf-mirror.com/skillsafe-ai/realesr-animevideov3/resolve/main/model.onnx',
    bytes: 2492908,
    description: 'RealESRGAN-AnimeVideo-v3 xs ×4 super-resolution ONNX (fp32, ~2.4MB)',
  },
]
