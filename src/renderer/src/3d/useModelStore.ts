/**
 * useModelStore — React state for the list of available 3D splat models.
 *
 * Models are loaded from the `assets/models/` directory (development) or
 * from `process.resourcesPath/models/` (packaged Electron app).  Each model
 * is described by a manifest entry that references a `.splat` file and an
 * optional `.led-map.json` file.
 */

import { useCallback, useEffect, useState } from 'react'

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
}

// ---------------------------------------------------------------------------
// Built-in bundled model manifests (relative to `/assets/models/` at dev time)
// ---------------------------------------------------------------------------

const BUNDLED_MODELS: Array<{ name: string; splatFile: string; ledMapFile: string | null }> = [
  { name: 'keyboard_rgb',  splatFile: 'keyboard_rgb.splat',  ledMapFile: 'keyboard_rgb.led-map.json' },
  { name: 'mouse_rgb',     splatFile: 'mouse_rgb.splat',     ledMapFile: 'mouse_rgb.led-map.json' },
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
  const [models, setModels] = useState<SplatModel[]>([])
  const [loading, setLoading] = useState(true)

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
    // Only expose models whose .splat URL is reachable (HEAD request).
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
    setModels(available.filter((m): m is SplatModel => m !== null))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  return { models, loading, reload: load }
}
