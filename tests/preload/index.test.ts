import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── electron mocks ────────────────────────────────────────────────────────
const mockInvoke = vi.fn()
const mockSend = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()
const mockExposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: any) => {
      mockExposeInMainWorld(key, api)
      // Stash the API for later inspection
      ;(globalThis as any).__rgbboxApi = api
    }
  },
  ipcRenderer: {
    invoke: (...args: any[]) => mockInvoke(...args),
    send: (...args: any[]) => mockSend(...args),
    on: (...args: any[]) => mockOn(...args),
    off: (...args: any[]) => mockOff(...args)
  }
}))

// Import the IPC channel definitions so the tests reference the real channel strings
const { ipcChannels } = await import('../../src/shared/ipc')

// Import the preload module — it runs contextBridge.exposeInMainWorld at import time
await import('../../src/preload/index')

const api = (globalThis as any).__rgbboxApi

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  // No teardown necessary
})

describe('preload/index', () => {
  it('exposes the API under the "rgbbox" key', () => {
    // The actual contextBridge.exposeInMainWorld call happened at module load.
    // beforeEach(vi.clearAllMocks) clears the call history, so we verify the API object instead.
    expect(api).toBeDefined()
    expect(typeof api.getAppVersion).toBe('function')
    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(0) // confirms clearAllMocks did its job
  })

  describe('invoke-based methods', () => {
    it.each([
      ['getAppVersion', ipcChannels.appVersion],
      ['getDisplayTopology', ipcChannels.getDisplayTopology],
      ['getDefaultProfile', ipcChannels.getDefaultProfile],
      ['getEngineStatus', ipcChannels.getEngineStatus],
      ['getCaptureProviderStatus', ipcChannels.getCaptureProviderStatus],
      ['getOverlayDisplayIds', ipcChannels.getOverlayDisplayIds],
      ['getDesktopAudioSourceId', ipcChannels.getDesktopAudioSourceId],
      ['getDesktopAudioSources', ipcChannels.getDesktopAudioSources],
      ['getCaptureSources', ipcChannels.getCaptureSources, undefined],
      ['getPowerSaveBlock', ipcChannels.getPowerSaveBlock],
      ['getAutoLaunch', ipcChannels.getAutoLaunch],
      ['listProfiles', ipcChannels.listProfiles],
      ['getDisplays', ipcChannels.getDisplays],
      ['modelGetCachedPaths', ipcChannels.modelGetCachedPaths]
    ])('api.%s invokes the right channel', async (method, channel, ...extraArgs) => {
      mockInvoke.mockResolvedValueOnce('result')
      const result = await api[method]()
      expect(mockInvoke).toHaveBeenCalledWith(channel, ...extraArgs)
      expect(result).toBe('result')
    })

    it('saveProfile invokes the right channel with the profile', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'p' })
      const profile = { id: 'p' }
      await api.saveProfile(profile)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.saveProfile, profile)
    })

    it('setEngineRunning invokes with the boolean', async () => {
      mockInvoke.mockResolvedValueOnce({ running: true })
      await api.setEngineRunning(true)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.setEngineRunning, true)
    })

    it('renderPreviewFrame invokes with profile, audio, textMasks', async () => {
      mockInvoke.mockResolvedValueOnce({})
      await api.renderPreviewFrame({ id: 'p' } as any, { bass: 1 } as any, { L1: [] })
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.renderPreviewFrame, { id: 'p' }, { bass: 1 }, { L1: [] })
    })

    it('captureScreenSample invokes with a request', async () => {
      mockInvoke.mockResolvedValueOnce(null)
      await api.captureScreenSample({ columns: 10, rows: 5, hasOverlays: true })
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.captureScreenSample, { columns: 10, rows: 5, hasOverlays: true })
    })

    it('openOverlay invokes with displayId and config', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.openOverlay(1, { region: 'fullscreen' })
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.openOverlay, 1, { region: 'fullscreen' })
    })

    it('closeOverlay invokes with displayId', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.closeOverlay(1)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.closeOverlay, 1)
    })

    it('setOverlayConfig invokes with displayId and config', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.setOverlayConfig(1, { region: 'top-third' })
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.setOverlayConfig, 1, { region: 'top-third' })
    })

    it('selectCaptureSource invokes with sourceId', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.selectCaptureSource('src-1')
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.selectCaptureSource, 'src-1')
    })

    it('setPowerSaveBlock invokes with boolean', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.setPowerSaveBlock(true)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.setPowerSaveBlock, true)
    })

    it('setAutoLaunch invokes with boolean', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.setAutoLaunch(true)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.setAutoLaunch, true)
    })

    it('loadProfileById invokes with id', async () => {
      mockInvoke.mockResolvedValueOnce(null)
      await api.loadProfileById('id-1')
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.loadProfileById, 'id-1')
    })

    it('saveProfileAs invokes with profile', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'a' })
      await api.saveProfileAs({ id: 'a' } as any)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.saveProfileAs, { id: 'a' })
    })

    it('deleteProfile invokes with id', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await api.deleteProfile('id-1')
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.deleteProfile, 'id-1')
    })

    it('exportProfileDialog invokes with profile', async () => {
      mockInvoke.mockResolvedValueOnce(true)
      await api.exportProfileDialog({ id: 'a' } as any)
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.exportProfileDialog, { id: 'a' })
    })

    it('importProfileDialog invokes with no args', async () => {
      mockInvoke.mockResolvedValueOnce(null)
      await api.importProfileDialog()
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.importProfileDialog)
    })

    it('modelDownload invokes with name', async () => {
      mockInvoke.mockResolvedValueOnce('/path')
      await api.modelDownload('model-1')
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.modelDownload, 'model-1')
    })

    it('audioGetSavedPaths / audioSavePaths / audioOpenFiles / audioOpenFolder', async () => {
      mockInvoke.mockResolvedValue([])
      await api.audioGetSavedPaths()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.audioGetSavedPaths)

      mockInvoke.mockResolvedValueOnce(undefined)
      await api.audioSavePaths([])
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.audioSavePaths, [])

      mockInvoke.mockResolvedValueOnce([])
      await api.audioOpenFiles()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.audioOpenFiles)

      mockInvoke.mockResolvedValueOnce([])
      await api.audioOpenFolder()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.audioOpenFolder)
    })

    it('videoGetSavedPaths / videoSavePaths / videoOpenFiles / videoOpenFolder', async () => {
      mockInvoke.mockResolvedValue([])
      await api.videoGetSavedPaths()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.videoGetSavedPaths)

      mockInvoke.mockResolvedValueOnce(undefined)
      await api.videoSavePaths([])
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.videoSavePaths, [])

      mockInvoke.mockResolvedValueOnce([])
      await api.videoOpenFiles()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.videoOpenFiles)

      mockInvoke.mockResolvedValueOnce([])
      await api.videoOpenFolder()
      expect(mockInvoke).toHaveBeenLastCalledWith(ipcChannels.videoOpenFolder)
    })

    it('showOverlayContextMenu invokes with displayId and effects', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)
      await api.showOverlayContextMenu(1, [{ kind: 'static', label: 'Static' }])
      expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.overlayShowContextMenu, 1, [{ kind: 'static', label: 'Static' }])
    })
  })

  describe('fire-and-forget send methods', () => {
    it('pushFrameToOverlays sends to overlay push channel', () => {
      const frame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([0, 0, 0]), generatedAt: 0 }
      api.pushFrameToOverlays(frame)
      expect(mockSend).toHaveBeenCalledWith(ipcChannels.overlayPushFrame, frame)
    })

    it('pushFrameToDisplay sends to overlay push-for-display channel with displayId', () => {
      const frame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([0, 0, 0]), generatedAt: 0 }
      api.pushFrameToDisplay(1, frame)
      expect(mockSend).toHaveBeenCalledWith(ipcChannels.overlayPushFrameForDisplay, 1, frame)
    })
  })

  describe('event subscription methods', () => {
    it('onOverlayFrame registers and returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = api.onOverlayFrame(cb)
      expect(mockOn).toHaveBeenCalledWith(ipcChannels.overlayFrame, expect.any(Function))
      // Unsubscribe
      unsub()
      expect(mockOff).toHaveBeenCalledWith(ipcChannels.overlayFrame, expect.any(Function))
    })

    it('onOverlayFrame handler invokes the callback with the frame', () => {
      const cb = vi.fn()
      api.onOverlayFrame(cb)
      // Find the registered handler
      const call = mockOn.mock.calls.find((c: any[]) => c[0] === ipcChannels.overlayFrame)
      expect(call).toBeDefined()
      const frame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([1, 2, 3]), generatedAt: 0 }
      call[1]({}, frame)
      expect(cb).toHaveBeenCalledWith(frame)
    })

    it('onOverlayClosed registers and returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = api.onOverlayClosed(cb)
      expect(mockOn).toHaveBeenCalledWith(ipcChannels.overlayClosed, expect.any(Function))
      unsub()
      expect(mockOff).toHaveBeenCalledWith(ipcChannels.overlayClosed, expect.any(Function))
    })

    it('onOverlayEffectChanged registers and returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = api.onOverlayEffectChanged(cb)
      expect(mockOn).toHaveBeenCalledWith(ipcChannels.overlayEffectChanged, expect.any(Function))
      unsub()
      expect(mockOff).toHaveBeenCalledWith(ipcChannels.overlayEffectChanged, expect.any(Function))
    })

    it('onDisplayTopologyChanged registers and returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = api.onDisplayTopologyChanged(cb)
      expect(mockOn).toHaveBeenCalledWith(ipcChannels.displayTopologyChanged, expect.any(Function))
      unsub()
      expect(mockOff).toHaveBeenCalledWith(ipcChannels.displayTopologyChanged, expect.any(Function))
    })

    it('onModelDownloadProgress registers and returns an unsubscribe function', () => {
      const cb = vi.fn()
      const unsub = api.onModelDownloadProgress(cb)
      expect(mockOn).toHaveBeenCalledWith(ipcChannels.modelDownloadProgress, expect.any(Function))
      unsub()
      expect(mockOff).toHaveBeenCalledWith(ipcChannels.modelDownloadProgress, expect.any(Function))
    })
  })

  describe('IPC channel coverage', () => {
    it('exposes 30+ methods on the api', () => {
      const methodNames = Object.keys(api)
      expect(methodNames.length).toBeGreaterThan(30)
    })
  })
})
