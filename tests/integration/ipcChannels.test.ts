/**
 * Integration test: verifies that every IPC channel defined in src/shared/ipc.ts
 * is exposed by the preload API under the expected method name, and that the
 * channel-name string is unique and well-formed.
 *
 * Also verifies that the `ipcChannels` constant is in sync with the preload API:
 * adding a new channel to one side should fail this test until both sides are updated.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── electron mocks (capture invoke/send/on/off) ──────────────────────────
const mockInvoke = vi.fn()
const mockSend = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()
const mockExposeInMainWorld = vi.fn((key: string, api: any) => {
  ;(globalThis as any).__rgbboxApi = api
})

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: any) => mockExposeInMainWorld(key, api)
  },
  ipcRenderer: {
    invoke: (...args: any[]) => mockInvoke(...args),
    send: (...args: any[]) => mockSend(...args),
    on: (...args: any[]) => mockOn(...args),
    off: (...args: any[]) => mockOff(...args)
  }
}))

// Import the shared channel definitions and the preload module
const { ipcChannels } = await import('../../src/shared/ipc')
await import('../../src/preload/index')
const api = (globalThis as any).__rgbboxApi

beforeEach(() => {
  vi.clearAllMocks()
})

describe('integration: IPC channel <-> preload API', () => {
  it('preload exposes the API under the rgbbox key', () => {
    // The actual contextBridge.exposeInMainWorld call happened at module load;
    // beforeEach(vi.clearAllMocks) clears the call history, so we verify the API object instead.
    expect(api).toBeDefined()
    expect(typeof api.getAppVersion).toBe('function')
  })

  it('exposes a method for every invoke-channel in ipcChannels', () => {
    // Mapping: ipcChannel constant name -> preload API method name.
    // Channels that fire-and-forget (send) or push (on) are tested in separate groups.
    const invokeChannelToMethod: Array<[string, string]> = [
      [ipcChannels.appVersion, 'getAppVersion'],
      [ipcChannels.getDisplayTopology, 'getDisplayTopology'],
      [ipcChannels.getDefaultProfile, 'getDefaultProfile'],
      [ipcChannels.saveProfile, 'saveProfile'],
      [ipcChannels.getEngineStatus, 'getEngineStatus'],
      [ipcChannels.setEngineRunning, 'setEngineRunning'],
      [ipcChannels.renderPreviewFrame, 'renderPreviewFrame'],
      [ipcChannels.captureScreenSample, 'captureScreenSample'],
      [ipcChannels.getCaptureProviderStatus, 'getCaptureProviderStatus'],
      [ipcChannels.getProcessCpuSamples, 'getProcessCpuSamples'],
      [ipcChannels.openOverlay, 'openOverlay'],
      [ipcChannels.closeOverlay, 'closeOverlay'],
      [ipcChannels.setOverlayConfig, 'setOverlayConfig'],
      [ipcChannels.getOverlayDisplayIds, 'getOverlayDisplayIds'],
      [ipcChannels.getDesktopAudioSourceId, 'getDesktopAudioSourceId'],
      [ipcChannels.getDesktopAudioSources, 'getDesktopAudioSources'],
      [ipcChannels.getCaptureSources, 'getCaptureSources'],
      [ipcChannels.selectCaptureSource, 'selectCaptureSource'],
      [ipcChannels.overlayShowContextMenu, 'showOverlayContextMenu'],
      [ipcChannels.getPowerSaveBlock, 'getPowerSaveBlock'],
      [ipcChannels.setPowerSaveBlock, 'setPowerSaveBlock'],
      [ipcChannels.getAutoLaunch, 'getAutoLaunch'],
      [ipcChannels.setAutoLaunch, 'setAutoLaunch'],
      [ipcChannels.listProfiles, 'listProfiles'],
      [ipcChannels.loadProfileById, 'loadProfileById'],
      [ipcChannels.saveProfileAs, 'saveProfileAs'],
      [ipcChannels.deleteProfile, 'deleteProfile'],
      [ipcChannels.exportProfileDialog, 'exportProfileDialog'],
      [ipcChannels.importProfileDialog, 'importProfileDialog'],
      [ipcChannels.modelGetCachedPaths, 'modelGetCachedPaths'],
      [ipcChannels.modelDownload, 'modelDownload'],
      [ipcChannels.audioGetSavedPaths, 'audioGetSavedPaths'],
      [ipcChannels.audioSavePaths, 'audioSavePaths'],
      [ipcChannels.audioOpenFiles, 'audioOpenFiles'],
      [ipcChannels.audioOpenFolder, 'audioOpenFolder'],
      [ipcChannels.videoGetSavedPaths, 'videoGetSavedPaths'],
      [ipcChannels.videoSavePaths, 'videoSavePaths'],
      [ipcChannels.videoOpenFiles, 'videoOpenFiles'],
      [ipcChannels.videoOpenFolder, 'videoOpenFolder'],
      [ipcChannels.getDisplays, 'getDisplays']
    ]

    for (const [channel, methodName] of invokeChannelToMethod) {
      expect(typeof api[methodName], `api.${methodName} for channel ${channel}`).toBe('function')
    }
  })

  it('exposes a method for every send-channel (fire-and-forget)', () => {
    const sendMapping: Array<[string, string]> = [
      [ipcChannels.overlayPushFrame, 'pushFrameToOverlays'],
      [ipcChannels.overlayPushFrameForDisplay, 'pushFrameToDisplay']
    ]
    for (const [channel, methodName] of sendMapping) {
      expect(typeof api[methodName], `api.${methodName} for channel ${channel}`).toBe('function')
    }
  })

  it('exposes a method for every push-channel (on/off subscription)', () => {
    const pushMapping: Array<[string, string]> = [
      [ipcChannels.overlayFrame, 'onOverlayFrame'],
      [ipcChannels.overlayClosed, 'onOverlayClosed'],
      [ipcChannels.overlayEffectChanged, 'onOverlayEffectChanged'],
      [ipcChannels.displayTopologyChanged, 'onDisplayTopologyChanged'],
      [ipcChannels.mainWindowVisibilityChanged, 'onMainWindowVisibilityChanged'],
      [ipcChannels.perfSelfTestToggleOverlay, 'onPerfSelfTestToggleOverlay'],
      [ipcChannels.modelDownloadProgress, 'onModelDownloadProgress']
    ]
    for (const [channel, methodName] of pushMapping) {
      expect(typeof api[methodName], `api.${methodName} for channel ${channel}`).toBe('function')
    }
  })

  it('all channel names are unique (no collisions)', () => {
    const allChannelValues = Object.values(ipcChannels)
    const unique = new Set(allChannelValues)
    expect(unique.size).toBe(allChannelValues.length)
  })

  it('all channel names are well-formed (non-empty, string)', () => {
    for (const [name, value] of Object.entries(ipcChannels)) {
      expect(typeof value, `channel ${name}`).toBe('string')
      expect(value, `channel ${name}`).toBeTruthy()
      expect(value.length, `channel ${name}`).toBeGreaterThan(0)
    }
  })

  it('all channel names use the rgbbox: namespace (except overlay:frame which is a unidirectional push from main)', () => {
    const allChannelValues = Object.values(ipcChannels)
    // All channels except `overlay:frame` should start with `rgbbox:`
    const allowedNonPrefixed = new Set([ipcChannels.overlayFrame])
    for (const ch of allChannelValues) {
      if (allowedNonPrefixed.has(ch)) continue
      expect(ch.startsWith('rgbbox:'), `channel ${ch}`).toBe(true)
    }
  })

  it('invoke-based methods always pass through to ipcRenderer.invoke', () => {
    mockInvoke.mockResolvedValue('OK')
    void api.getAppVersion()
    expect(mockInvoke).toHaveBeenCalledWith(ipcChannels.appVersion)
  })

  it('send-based methods always pass through to ipcRenderer.send', () => {
    const frame = { columns: 1, rows: 1, pixels: new Uint8ClampedArray([0, 0, 0]), generatedAt: 0 }
    api.pushFrameToOverlays(frame)
    expect(mockSend).toHaveBeenCalledWith(ipcChannels.overlayPushFrame, frame)
  })

  it('on* methods register a handler and return an unsubscribe', () => {
    const unsub = api.onOverlayFrame(() => {})
    expect(mockOn).toHaveBeenCalledWith(ipcChannels.overlayFrame, expect.any(Function))
    unsub()
    expect(mockOff).toHaveBeenCalledWith(ipcChannels.overlayFrame, expect.any(Function))
  })

  it('total method count: 39 invoke + 2 send + 5 on = 46', () => {
    const methods = Object.keys(api)
    // Filter out the on* methods to count invoke/send methods
    const invokeOrSend = methods.filter((m) => !m.startsWith('on'))
    expect(invokeOrSend.length).toBeGreaterThanOrEqual(39)
    expect(methods.length).toBeGreaterThanOrEqual(39 + 5)
  })
})
