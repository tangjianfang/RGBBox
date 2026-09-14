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

export interface ModelManifestEntry {
  /** Unique slug — matches the filename stem */
  name: string
  /** Asset filename */
  file: string
  /** Remote download URL */
  url: string
  /** Asset kind — splat models render in the 3D view; onnx models feed local inference */
  kind: 'splat' | 'onnx'
  /** R90.9: expected size in bytes for onnx assets — a cached file outside
   *  ±10% is a corrupt/partial download and gets deleted so it re-downloads. */
  bytes?: number
  /** Optional LED position map JSON filename (shipped with the app) */
  ledMapFile?: string
  description?: string
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
    description: 'Demo scene — train (Mip-NeRF 360 dataset)',
  },
  {
    name: 'garden',
    kind: 'splat',
    file: 'garden.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/garden.splat',
    description: 'Demo scene — garden (Mip-NeRF 360 dataset)',
  },
  {
    name: 'bicycle',
    kind: 'splat',
    file: 'bicycle.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/bicycle.splat',
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
]
