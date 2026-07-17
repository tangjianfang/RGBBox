// @vitest-environment happy-dom
// Per-test mock helpers for renderer component tests.
// All shared vi.mock declarations live in `tests/renderer/setup.ts` (hoisted).
// This module is plain TS — no vi.mock here so the hoisting doesn't get confused.

import { vi } from 'vitest'

/**
 * Polyfill `window.rgbbox` with stub implementations.
 * Returns the object so individual tests can override specific methods.
 */
export function setupRendererMocks() {
  const rgbbox = {
    getAppVersion: vi.fn().mockResolvedValue('0.0.0-test'),
    getDisplayTopology: vi.fn().mockResolvedValue([]),
    getDefaultProfile: vi.fn().mockResolvedValue({}),
    getEngineStatus: vi.fn().mockResolvedValue({ running: false }),
    setEngineRunning: vi.fn().mockResolvedValue({ running: true }),
    renderPreviewFrame: vi.fn().mockResolvedValue({}),
    getCaptureProviderStatus: vi.fn().mockResolvedValue({ provider: 'desktop-capturer' }),
    openOverlay: vi.fn().mockResolvedValue(true),
    closeOverlay: vi.fn().mockResolvedValue(true),
    setOverlayConfig: vi.fn().mockResolvedValue(true),
    getOverlayDisplayIds: vi.fn().mockResolvedValue([]),
    getDesktopAudioSourceId: vi.fn().mockResolvedValue(null),
    getDesktopAudioSources: vi.fn().mockResolvedValue([]),
    getCaptureSources: vi.fn().mockResolvedValue([]),
    selectCaptureSource: vi.fn().mockResolvedValue(true),
    showOverlayContextMenu: vi.fn().mockResolvedValue(undefined),
    getPowerSaveBlock: vi.fn().mockResolvedValue(false),
    setPowerSaveBlock: vi.fn().mockResolvedValue(true),
    getAutoLaunch: vi.fn().mockResolvedValue(false),
    setAutoLaunch: vi.fn().mockResolvedValue(true),
    listProfiles: vi.fn().mockResolvedValue([]),
    getDisplays: vi.fn().mockResolvedValue([]),
    loadProfileById: vi.fn().mockResolvedValue(null),
    saveProfile: vi.fn().mockResolvedValue({ id: 'p' }),
    saveProfileAs: vi.fn().mockResolvedValue({ id: 'p' }),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    exportProfileDialog: vi.fn().mockResolvedValue(true),
    importProfileDialog: vi.fn().mockResolvedValue(null),
    modelGetCachedPaths: vi.fn().mockResolvedValue({}),
    modelDownload: vi.fn().mockResolvedValue('file:///cached/x.splat'),
    onModelDownloadProgress: vi.fn().mockReturnValue(() => undefined),
    audioGetSavedPaths: vi.fn().mockResolvedValue([]),
    audioSavePaths: vi.fn().mockResolvedValue(undefined),
    audioOpenFiles: vi.fn().mockResolvedValue([]),
    audioOpenFolder: vi.fn().mockResolvedValue([]),
    videoGetSavedPaths: vi.fn().mockResolvedValue([]),
    videoSavePaths: vi.fn().mockResolvedValue(undefined),
    videoOpenFiles: vi.fn().mockResolvedValue([]),
    videoOpenFolder: vi.fn().mockResolvedValue([]),
    pushFrameToOverlays: vi.fn(),
    pushFrameToDisplay: vi.fn(),
    captureScreenSample: vi.fn().mockResolvedValue(null),
    onOverlayFrame: vi.fn().mockReturnValue(() => undefined),
    onOverlayClosed: vi.fn().mockReturnValue(() => undefined),
    onOverlayEffectChanged: vi.fn().mockReturnValue(() => undefined),
    onDisplayTopologyChanged: vi.fn().mockReturnValue(() => undefined),
    onPerfSelfTestCollectTiming: vi.fn().mockReturnValue(() => undefined),
    reportPerfSelfTestTiming: vi.fn().mockResolvedValue(undefined)
  }
  ;(globalThis as any).window.rgbbox = rgbbox
  return rgbbox
}
