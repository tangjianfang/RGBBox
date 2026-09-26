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
    getDisplayTopology: vi.fn().mockResolvedValue({ displays: [] }),
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
    // R173/R179: VoiceScribe tts surface (own-downloader status shape)
    ttsEngineStatus: vi.fn().mockResolvedValue({
      complete: false,
      kokoroInstalled: true,
      bundledVoices: ['af_heart'],
      files: [
        { path: 'config.json', bytes: 5120, present: false },
        { path: 'tokenizer.json', bytes: 2726297, present: false },
        { path: 'onnx/model_q4.onnx', bytes: 305_000_000, present: false },
        { path: 'voices/af_heart.bin', bytes: 8_388_608, present: false },
      ],
    }),
    ttsModelDownload: vi.fn().mockResolvedValue({ ok: true }),
    onTtsModelProgress: vi.fn().mockReturnValue(() => undefined),
    ttsSynthesize: vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' }),
    ttsExport: vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' }),
    // R187: on-demand voice + lexicon file I/O
    ttsVoiceDownload: vi.fn().mockResolvedValue({ ok: true }),
    voiceLexiconExport: vi.fn().mockResolvedValue({ ok: true, path: 'C:/lex.json' }),
    voiceLexiconImport: vi.fn().mockResolvedValue({ ok: false, error: 'cancelled' }),
    // R172: agent workbench surface
    agentSend: vi.fn().mockResolvedValue({ ok: true, sessionId: 's-test' }),
    agentCancel: vi.fn().mockResolvedValue({ ok: true }),
    agentApprovalRespond: vi.fn().mockResolvedValue({ ok: true }),
    agentSessionsList: vi.fn().mockResolvedValue([]),
    agentSessionLoad: vi.fn().mockResolvedValue([]),
    agentSessionRename: vi.fn().mockResolvedValue({ ok: true }),
    agentSessionDelete: vi.fn().mockResolvedValue({ ok: true }),
    agentPickWorkspace: vi.fn().mockResolvedValue(null),
    onAgentEvent: vi.fn().mockReturnValue(() => undefined),
    // R91.3b: DTLN denoise surface (unmount cleanup calls denoiseStop)
    denoiseStart: vi.fn().mockResolvedValue({ ok: true }),
    denoiseSendFrames: vi.fn(),
    denoiseStop: vi.fn().mockResolvedValue({ ok: true }),
    onDenoiseFrames: vi.fn().mockReturnValue(() => undefined),
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
    ocrRecognize: vi.fn().mockResolvedValue({ ok: true, text: '', hint: undefined, engine: undefined }),
    // R80/R130: standalone global snip tool — 帧推送订阅（测试里由用例自行接管回调）+ 绘制 ack
    snipOnFrame: vi.fn().mockReturnValue(() => undefined),
    snipAckPainted: vi.fn(),
    snipFinish: vi.fn().mockResolvedValue(true),
    snipCancel: vi.fn(),
    setUiLocale: vi.fn(),
    snipGetHotkey: vi.fn().mockResolvedValue('Alt+A'),
    snipSetHotkey: vi.fn().mockResolvedValue({ ok: true, hotkey: 'Alt+A' }),
    // R83: OCR AI-cleanup
    aiGetSettings: vi.fn().mockResolvedValue({ baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-4-flash' }),
    aiSetSettings: vi.fn().mockResolvedValue({ baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-4-flash' }),
    aiCleanupText: vi.fn().mockResolvedValue({ ok: true, text: '' }),
    aiTranslateText: vi.fn().mockResolvedValue({ ok: true, text: '' }),
    // R88/R89: AI Lab
    aiTestConnection: vi.fn().mockResolvedValue({ ok: true, text: 'pong', latencyMs: 12 }),
    aiChat: vi.fn().mockResolvedValue({ ok: true, text: 'hi there', latencyMs: 20 }),
    aiGetProfiles: vi.fn().mockResolvedValue({
      profiles: [
        { id: 'p1', name: '智谱 GLM · glm-5.3', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'sk-x', model: 'glm-5.3' },
        { id: 'p2', name: 'DeepSeek · deepseek-v4-pro', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-v4-pro' },
      ],
      activeId: 'p1',
      unreadableIds: [],
      encryptionAvailable: true,
    }),
    aiSaveProfile: vi.fn().mockImplementation(async (p: { id: string; name: string; baseUrl: string; apiKey: string; model: string }) =>
      ({ id: p.id || 'p_new', name: p.name || 'Auto · name', baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model })),
    aiDeleteProfile: vi.fn().mockResolvedValue(undefined),
    aiSetActiveProfile: vi.fn().mockResolvedValue(undefined),
    // R90 P1: audio AI test lab
    audioAiStatus: vi.fn().mockResolvedValue({ sileroCached: true, astCached: true }),
    // R90.8: streaming detection session
    audioAiStreamStart: vi.fn().mockResolvedValue(undefined),
    audioAiStreamFeed: vi.fn().mockResolvedValue({ ok: true, prob: 0.42, top: undefined }),
    audioAiStreamStop: vi.fn().mockResolvedValue(undefined),
    audioAiRunVad: vi.fn().mockResolvedValue({ ok: true, prob: 0.97, frames: 31 }),
    audioAiRunAst: vi.fn().mockResolvedValue({
      ok: true,
      top: [
        { index: 0, score: 0.55 },
        { index: 66, score: 0.2 },
        { index: 137, score: 0.1 },
        { index: 315, score: 0.05 },
        { index: 493, score: 0.03 },
      ],
    }),
    pushFrameToOverlays: vi.fn(),
    pushFrameToDisplay: vi.fn(),
    captureScreenSample: vi.fn().mockResolvedValue(null),
    onOverlayFrame: vi.fn().mockReturnValue(() => undefined),
    onOverlayClosed: vi.fn().mockReturnValue(() => undefined),
    onOverlayEffectChanged: vi.fn().mockReturnValue(() => undefined),
    onDisplayTopologyChanged: vi.fn().mockReturnValue(() => undefined),
    // R131: main-window minimize/restore signal (vision input stops the camera)
    onMainWindowVisibilityChanged: vi.fn().mockReturnValue(() => undefined),
    // R136: hidden vision pipeline host window lifecycle
    visionHostOpen: vi.fn().mockResolvedValue(true),
    visionHostClose: vi.fn().mockResolvedValue(true),
    onPerfSelfTestCollectTiming: vi.fn().mockReturnValue(() => undefined),
    // R147 P0: App smoke — perf-selftest overlay toggle subscription + CPU samples
    onPerfSelfTestToggleOverlay: vi.fn().mockReturnValue(() => undefined),
    getProcessCpuSamples: vi.fn().mockResolvedValue([]),
    reportPerfSelfTestTiming: vi.fn().mockResolvedValue(undefined)
  }
  ;(globalThis as any).window.rgbbox = rgbbox
  return rgbbox
}
