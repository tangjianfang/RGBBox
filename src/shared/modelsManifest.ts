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
  /** .splat filename */
  file: string
  /** Remote download URL */
  url: string
  /** Optional LED position map JSON filename (shipped with the app) */
  ledMapFile?: string
  description?: string
}

export const MODELS_MANIFEST: ModelManifestEntry[] = [
  {
    name: 'keyboard_rgb',
    file: 'keyboard_rgb.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/keyboard_rgb.splat',
    ledMapFile: 'keyboard_rgb.led-map.json',
    description: 'RGB keyboard 3D Gaussian Splat',
  },
  {
    name: 'mouse_rgb',
    file: 'mouse_rgb.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/mouse_rgb.splat',
    ledMapFile: 'mouse_rgb.led-map.json',
    description: 'RGB mouse 3D Gaussian Splat',
  },
  {
    name: 'train',
    file: 'train.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/train.splat',
    description: 'Demo scene — train (Mip-NeRF 360 dataset)',
  },
  {
    name: 'garden',
    file: 'garden.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/garden.splat',
    description: 'Demo scene — garden (Mip-NeRF 360 dataset)',
  },
  {
    name: 'bicycle',
    file: 'bicycle.splat',
    url: 'https://github.com/tjf/RGBBox/releases/download/models-v1/bicycle.splat',
    description: 'Demo scene — bicycle (Mip-NeRF 360 dataset)',
  },
]
