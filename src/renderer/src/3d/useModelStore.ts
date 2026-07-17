/**
 * useModelStore — React state for the list of available 3D splat models.
 *
 * Bundled models are defined in shared/modelsManifest.ts.  Their binary
 * .splat files are NOT shipped with the app — they are downloaded on demand
 * via the `modelDownload` IPC channel and cached in userData/models/.
 *
 * Users can also import their own .splat files via the browser File API.
 * Imported models are kept as blob: URLs for the lifetime of the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { MODELS_MANIFEST } from '../../../shared/modelsManifest'

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

export type ModelDownloadStatus = 'cached' | 'remote' | 'downloading' | 'error'

export interface SplatModel {
  /** Unique name (slug) — matches the filename stem. */
  name: string
  /**
   * URL/path that the Three.js loader will fetch.
   * Points to a file:// URL when cached, empty string when not yet downloaded.
   */
  splatUrl: string
  /** Parsed LED map, or null if no mapping file exists. */
  ledMap: LedMap | null
  /** True for user-imported models (blob: URL, session-scoped). */
  imported?: boolean
  /** Download / cache state for bundled models. Always 'cached' for imported ones. */
  downloadStatus: ModelDownloadStatus
  /** Download progress 0–100 (only meaningful when downloadStatus === 'downloading'). */
  downloadProgress: number
  /** Error message when downloadStatus === 'error'. */
  downloadError?: string
}

// ---------------------------------------------------------------------------
// LED map fetching
// ---------------------------------------------------------------------------

/** Base URL for LED-map JSON files (shipped inside the app bundle / Vite dev server). */
function ledMapBasePath(): string {
  return '/assets/models/'
}

async function fetchLedMap(fileName: string): Promise<LedMap | null> {
  try {
    const res = await fetch(`${ledMapBasePath()}${fileName}`)
    if (!res.ok) return null
    return (await res.json()) as LedMap
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

export function useModelStore(enabled = true) {
  const [bundledModels, setBundledModels] = useState<SplatModel[]>([])
  const [importedModels, setImportedModels] = useState<SplatModel[]>([])
  const [loading, setLoading] = useState(enabled)
  // Track blob: URLs created for imported files so we can revoke on unmount.
  const blobUrls = useRef<string[]>([])

  const models = [...bundledModels, ...importedModels]

  // ── Initial load: build model list from manifest + cached paths ──────────
  const load = useCallback(async () => {
    if (!enabled) return
    setLoading(true)

    // Ask main process which models are already cached (file:// URLs).
    const cachedPaths: Record<string, string> = await window.rgbbox.modelGetCachedPaths()

    const resolved: SplatModel[] = await Promise.all(
      MODELS_MANIFEST.map(async (entry) => {
        const cachedUrl = cachedPaths[entry.name]
        const ledMap = entry.ledMapFile ? await fetchLedMap(entry.ledMapFile) : null
        return {
          name: entry.name,
          splatUrl: cachedUrl ?? '',
          ledMap,
          downloadStatus: (cachedUrl ? 'cached' : 'remote') as ModelDownloadStatus,
          downloadProgress: 0,
        }
      })
    )

    setBundledModels(resolved)
    setLoading(false)
  }, [enabled])

  // ── Listen to download progress from main process ────────────────────────
  useEffect(() => {
    if (!enabled) return undefined
    const unsubscribe = window.rgbbox.onModelDownloadProgress((p) => {
      setBundledModels((prev) =>
        prev.map((m) => {
          if (m.name !== p.name) return m
          if (p.error) {
            return { ...m, downloadStatus: 'error', downloadProgress: 0, downloadError: p.error }
          }
          if (p.done) {
            // splatUrl will be updated by downloadModel's .then()
            return { ...m, downloadStatus: 'downloading', downloadProgress: 100 }
          }
          return { ...m, downloadStatus: 'downloading', downloadProgress: p.percent }
        })
      )
    })
    return unsubscribe
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setBundledModels([])
      setImportedModels([])
      setLoading(false)
      return undefined
    }
    void load()
    const urls = blobUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [enabled, load])

  // ── Trigger on-demand download for a bundled model ───────────────────────
  const downloadModel = useCallback(async (name: string): Promise<void> => {
    if (!enabled) return
    // Optimistically set status to downloading
    setBundledModels((prev) =>
      prev.map((m) =>
        m.name === name ? { ...m, downloadStatus: 'downloading', downloadProgress: 0, downloadError: undefined } : m
      )
    )
    try {
      const fileUrl = await window.rgbbox.modelDownload(name)
      setBundledModels((prev) =>
        prev.map((m) =>
          m.name === name ? { ...m, splatUrl: fileUrl, downloadStatus: 'cached', downloadProgress: 100 } : m
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setBundledModels((prev) =>
        prev.map((m) =>
          m.name === name ? { ...m, downloadStatus: 'error', downloadProgress: 0, downloadError: msg } : m
        )
      )
    }
  }, [enabled])

  // ── Import a user-picked .splat file ─────────────────────────────────────
  const importFile = useCallback((file: File): SplatModel => {
    const blobUrl = URL.createObjectURL(file)
    blobUrls.current.push(blobUrl)
    const name = file.name.replace(/\.(splat|ply|ksplat|spz)$/i, '')
    const model: SplatModel = {
      name,
      splatUrl: blobUrl,
      ledMap: null,
      imported: true,
      downloadStatus: 'cached',
      downloadProgress: 100,
    }
    setImportedModels((prev) => [...prev, model])
    return model
  }, [])

  return { models, loading, reload: load, importFile, downloadModel }
}

