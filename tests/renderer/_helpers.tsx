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
    // R70: audio visualizer projector window lifecycle (R31 IPC surface)
    openAudioVizWindow: vi.fn().mockResolvedValue(true),
    closeAudioVizWindow: vi.fn().mockResolvedValue(true),
    getAudioVizWindowIds: vi.fn().mockResolvedValue([]),
    // R73/R74: scheduled shutdown + light-effect screensaver
    shutdownArm: vi.fn().mockResolvedValue({ ok: true, armed: true, deadlineMs: Date.now() + 60000 }),
    shutdownCancel: vi.fn().mockResolvedValue({ ok: true, armed: false }),
    shutdownStatus: vi.fn().mockResolvedValue({ armed: false }),
    screensaverGetSettings: vi.fn().mockResolvedValue({ enabled: false, idleMinutes: 5 }),
    screensaverSetSettings: vi.fn().mockResolvedValue({ enabled: false, idleMinutes: 5 }),
    // R76: native clipboard write-image
    clipboardWriteImage: vi.fn().mockResolvedValue(true),
    // R77: persistent capture cache
    capturesList: vi.fn().mockResolvedValue([]),
    capturesAdd: vi.fn().mockResolvedValue({ id: 'c1', file: 'C:\\cap\\x.png', name: 'x.png', ts: 0, kind: 'photo' }),
    capturesDelete: vi.fn().mockResolvedValue(true),
    capturesRead: vi.fn().mockResolvedValue('data:image/png;base64,QQ=='),
    capturesImport: vi.fn().mockResolvedValue([]),
    // R78: clipboard text + OCR
    clipboardWriteText: vi.fn().mockResolvedValue(true),
    clipboardReadText: vi.fn().mockResolvedValue(''),
    ocrRecognize: vi.fn().mockResolvedValue({ ok: true, text: '', hint: undefined }),
    // R80: standalone global snip tool
    snipGetFrame: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
    snipFinish: vi.fn().mockResolvedValue(true),
    snipCancel: vi.fn(),
    setUiLocale: vi.fn(),
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
