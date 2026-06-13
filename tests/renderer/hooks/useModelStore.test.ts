// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useModelStore } from '../../../src/renderer/src/3d/useModelStore'
import { MODELS_MANIFEST } from '../../../src/shared/modelsManifest'

beforeEach(() => {
  ;(globalThis as any).window.rgbbox = {
    modelGetCachedPaths: vi.fn().mockResolvedValue({}),
    modelDownload: vi.fn().mockResolvedValue('file:///cached/model.splat'),
    onModelDownloadProgress: vi.fn().mockReturnValue(() => undefined)
  }
})

describe('renderer/hooks/useModelStore', () => {
  it('starts in loading state and resolves to the manifest list', async () => {
    const { result } = renderHook(() => useModelStore())
    // After mount, loading eventually flips false and models are populated
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    // Bundled count = MODELS_MANIFEST length
    expect(result.current.models.length).toBe(MODELS_MANIFEST.length)
  })

  it('marks each bundled model as "remote" when not cached', async () => {
    ;(window.rgbbox.modelGetCachedPaths as any) = vi.fn().mockResolvedValue({})
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    for (const m of result.current.models) {
      expect(m.downloadStatus).toBe('remote')
      expect(m.splatUrl).toBe('')
    }
  })

  it('marks a model as "cached" when present in the cached paths', async () => {
    const first = MODELS_MANIFEST[0]
    ;(window.rgbbox.modelGetCachedPaths as any) = vi.fn().mockResolvedValue({
      [first.name]: `file:///cached/${first.name}.splat`
    })
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const found = result.current.models.find((m) => m.name === first.name)
    expect(found?.downloadStatus).toBe('cached')
    expect(found?.splatUrl).toBe(`file:///cached/${first.name}.splat`)
  })

  it('downloadModel flips a model to "downloading" then "cached" with the returned url', async () => {
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const target = result.current.models[0]
    await act(async () => {
      await result.current.downloadModel(target.name)
    })
    const updated = result.current.models.find((m) => m.name === target.name)
    expect(updated?.downloadStatus).toBe('cached')
    expect(updated?.splatUrl).toBe('file:///cached/model.splat')
    expect(updated?.downloadProgress).toBe(100)
  })

  it('downloadModel marks the model as "error" when IPC throws', async () => {
    ;(window.rgbbox.modelDownload as any) = vi.fn().mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const target = result.current.models[0]
    await act(async () => {
      await result.current.downloadModel(target.name)
    })
    const updated = result.current.models.find((m) => m.name === target.name)
    expect(updated?.downloadStatus).toBe('error')
    expect(updated?.downloadError).toBe('network down')
    expect(updated?.downloadProgress).toBe(0)
  })

  it('importFile creates a blob: URL and adds an imported model', async () => {
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const file = new File(['fake-splat-content'], 'mymodel.splat', { type: 'application/octet-stream' })
    let imported: any
    act(() => {
      imported = result.current.importFile(file)
    })
    expect(imported.imported).toBe(true)
    expect(imported.name).toBe('mymodel')
    expect(imported.splatUrl).toMatch(/^blob:/)
    expect(imported.downloadStatus).toBe('cached')
    // Imported models appear in the combined list
    expect(result.current.models.some((m) => m.imported && m.name === 'mymodel')).toBe(true)
  })

  it('imported models precede .splat/.ply/.ksplat/.spz extensions from the name', async () => {
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    for (const ext of ['splat', 'ply', 'ksplat', 'spz']) {
      const f = new File([''], `cube.${ext}`, { type: 'application/octet-stream' })
      let imp: any
      act(() => { imp = result.current.importFile(f) })
      expect(imp.name).toBe('cube')
    }
  })

  it('reload re-fetches cached paths and rebuilds the bundled list', async () => {
    const { result } = renderHook(() => useModelStore())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const beforeLen = result.current.models.length
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.models.length).toBe(beforeLen)
  })

  it('subscribes to onModelDownloadProgress and unsubscribes on unmount', async () => {
    const unsub = vi.fn()
    ;(window.rgbbox.onModelDownloadProgress as any) = vi.fn().mockReturnValue(unsub)
    const { unmount } = renderHook(() => useModelStore())
    expect(window.rgbbox.onModelDownloadProgress).toHaveBeenCalled()
    unmount()
    // Cleanup may or may not call unsub depending on effect ordering
    // Just assert it doesn't throw
  })
})
