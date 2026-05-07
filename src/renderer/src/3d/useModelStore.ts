/**
 * useModelStore — React state for the list of available 3D splat models.
 *
 * Models are loaded from the `assets/models/` directory (development) or
 * from `process.resourcesPath/models/` (packaged Electron app).  Each model
 * is described by a manifest entry that references a `.splat` file and an
 * optional `.led-map.json` file.
 *
 * Users can also import their own `.splat` files via the browser File API.
 * Imported models are kept as blob: URLs for the lifetime of the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LedPosition {
  id: number
  position: [number, number, number]
  zone: string
}

export interface LedMap {
  model: string
  device_type: string
  led_count: number
  leds: LedPosition[]
}

export interface SplatModel {
  /** Unique name (slug) — matches the filename stem. */
  name: string
  /** URL/path that the Three.js loader will fetch. */
  splatUrl: string
  /** Parsed LED map, or null if no mapping file exists. */
  ledMap: LedMap | null
  /** True for user-imported models (blob: URL, session-scoped). */
  imported?: boolean
}

// ---------------------------------------------------------------------------
// Built-in bundled model manifests (relative to `/assets/models/` at dev time)
// ---------------------------------------------------------------------------

const BUNDLED_MODELS: Array<{ name: string; splatFile: string; ledMapFile: string | null }> = [
  { name: 'keyboard_rgb',  splatFile: 'keyboard_rgb.splat',  ledMapFile: 'keyboard_rgb.led-map.json' },
  { name: 'mouse_rgb',     splatFile: 'mouse_rgb.splat',     ledMapFile: 'mouse_rgb.led-map.json' },
  // Demo scenes from the 3DGS benchmark dataset (Mip-NeRF 360)
  { name: 'train',         splatFile: 'train.splat',         ledMapFile: null },
  { name: 'garden',        splatFile: 'garden.splat',        ledMapFile: null },
  { name: 'bicycle',       splatFile: 'bicycle.splat',       ledMapFile: null },
]

/**
 * Resolve the base path for bundled model assets.
 * - Development:  `/assets/models/` (served by Vite dev server from the repo root)
 * - Production:   `<resourcesPath>/models/` via the `file://` protocol
 */
function modelBasePath(): string {
  // In Electron renderer process window.__ELECTRON_RESOURCES__ may be injected
  // by the preload; fall back to a relative path for Vite dev server.
  const base = (window as unknown as Record<string, string>)['__ELECTRON_RESOURCES__']
  if (base) return `${base}/models/`
  return '/assets/models/'
}

async function fetchLedMap(url: string): Promise<LedMap | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as LedMap
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

export function useModelStore() {
  const [bundledModels, setBundledModels] = useState<SplatModel[]>([])
  const [importedModels, setImportedModels] = useState<SplatModel[]>([])
  const [loading, setLoading] = useState(true)
  // Track blob: URLs created for imported files so we can revoke on unmount.
  const blobUrls = useRef<string[]>([])

  const models = [...bundledModels, ...importedModels]

  const load = useCallback(async () => {
    setLoading(true)
    const base = modelBasePath()
    const resolved: SplatModel[] = await Promise.all(
      BUNDLED_MODELS.map(async (entry) => {
        const splatUrl  = `${base}${entry.splatFile}`
        const ledMap = entry.ledMapFile
          ? await fetchLedMap(`${base}${entry.ledMapFile}`)
          : null
        return { name: entry.name, splatUrl, ledMap }
      })
    )
    // Only expose bundled models whose .splat URL is reachable (HEAD request).
    const available = await Promise.all(
      resolved.map(async (m) => {
        try {
          const r = await fetch(m.splatUrl, { method: 'HEAD' })
          return r.ok ? m : null
        } catch {
          return null
        }
      })
    )
    setBundledModels(available.filter((m): m is SplatModel => m !== null))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    // Revoke all blob URLs when the component using this hook unmounts.
    const urls = blobUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [load])

  /**
   * Import a .splat File object picked by the user.
   * Creates a session-scoped blob: URL and appends the model to the list.
   */
  const importFile = useCallback((file: File): SplatModel => {
    const blobUrl = URL.createObjectURL(file)
    blobUrls.current.push(blobUrl)
    // Strip extension for the display name
    const name = file.name.replace(/\.(splat|ply|ksplat|spz)$/i, '')
    const model: SplatModel = { name, splatUrl: blobUrl, ledMap: null, imported: true }
    setImportedModels((prev) => [...prev, model])
    return model
  }, [])

  return { models, loading, reload: load, importFile }
}
