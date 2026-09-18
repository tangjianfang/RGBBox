export const ipcChannels = {
  appVersion: 'rgbbox:app:version',
  getDisplayTopology: 'rgbbox:system:get-display-topology',
  getDefaultProfile: 'rgbbox:profile:get-default',
  saveProfile: 'rgbbox:profile:save',
  getEngineStatus: 'rgbbox:engine:get-status',
  setEngineRunning: 'rgbbox:engine:set-running',
  renderPreviewFrame: 'rgbbox:engine:render-preview-frame',
  // Capture only the screen sample (no render); used when engine runs in renderer worker
  captureScreenSample: 'rgbbox:engine:capture-screen-sample',
  getCaptureProviderStatus: 'rgbbox:capture:get-provider-status',
  // R46: per-OS-process CPU% breakdown (main/renderer/gpu-process/utility) via
  // Electron's app.getAppMetrics() — lets CPU investigations be based on
  // which process is actually consuming CPU instead of one aggregate number.
  getProcessCpuSamples: 'rgbbox:system:get-process-cpu-samples',
  // R46: main → renderer push, ONLY sent by the --perf-selftest harness. Asks
  // the renderer to toggle the overlay for a display through its OWN normal
  // openOverlay()/closeOverlay() invoke + setOverlayDisplayIds() state update
  // path — calling openOverlay() directly from the main process (bypassing
  // the renderer) left the renderer's overlayDisplayIds state (and thus the
  // R42/R43 tick-loop gate) unaware an overlay existed, invalidating the
  // "minimized + overlay" self-test scenario. Never sent during normal use.
  perfSelfTestToggleOverlay: 'rgbbox:system:perf-selftest-toggle-overlay',
  // R48.1: main → overlay-renderer push, ONLY sent by the --perf-selftest
  // harness. Asks the overlay window for a snapshot of its frame-arrival
  // timing (inter-frame intervals, frames received, elapsed) collected since
  // the previous collect — the only signal that can answer "is the overlay
  // still being delivered frames at the right cadence when the main window is
  // minimized", since CPU% can't see compositor/GPU frame throttling. The
  // overlay replies via perfSelfTestOverlayTimingReport with the same
  // requestId, then clears its buffer so each scenario is measured
  // independently. Never sent during normal use.
  perfSelfTestCollectOverlayTiming: 'rgbbox:perf-selftest:collect-overlay-timing',
  // R48.1: overlay-renderer → main, fire-and-forget, ONLY sent in response to
  // a perfSelfTestCollectOverlayTiming request. Carries { requestId, stats }.
  perfSelfTestOverlayTimingReport: 'rgbbox:perf-selftest:overlay-timing-report',
  // Renderer → main: push a rendered frame to any open overlay windows (fire-and-forget)
  overlayPushFrame: 'rgbbox:overlay:push-frame',
  // Renderer → main: push a rendered frame to ONE specific display overlay (for linked-display mode)
  overlayPushFrameForDisplay: 'rgbbox:overlay:push-frame-for-display',
  // Multi-display overlay
  openOverlay: 'rgbbox:overlay:open',
  closeOverlay: 'rgbbox:overlay:close',
  setOverlayConfig: 'rgbbox:overlay:set-config',
  getOverlayDisplayIds: 'rgbbox:overlay:get-ids',
  // Overlay push channel (main → renderer, not invokable)
  overlayFrame: 'overlay:frame',
  // Overlay closed by user (main → renderer push)
  overlayClosed: 'rgbbox:overlay:closed',
  // Overlay context menu & effect switch
  overlayShowContextMenu: 'rgbbox:overlay:show-context-menu',
  overlayEffectChanged: 'rgbbox:overlay:effect-changed',
  // Power save blocker
  setPowerSaveBlock: 'rgbbox:system:set-power-save-block',
  getPowerSaveBlock: 'rgbbox:system:get-power-save-block',
  // Auto-launch at login
  getAutoLaunch: 'rgbbox:system:get-auto-launch',
  setAutoLaunch: 'rgbbox:system:set-auto-launch',
  // Desktop audio loopback source ID (for system audio capture)
  getDesktopAudioSourceId: 'rgbbox:audio:desktop-source-id',
  // All desktop audio capture sources (screens/displays)
  getDesktopAudioSources: 'rgbbox:audio:desktop-sources',
  // Screen/window/display capture sources for the Video Studio
  getCaptureSources: 'rgbbox:video:capture-sources',
  // Pre-select the capture source that the next getDisplayMedia() call should use
  selectCaptureSource: 'rgbbox:video:select-capture-source',
  // Main → renderer: display added/removed/metrics-changed (hotplug)
  displayTopologyChanged: 'rgbbox:system:display-topology-changed',
  // R43: main → renderer, fired on minimize/restore/hide/show of the main
  // window. Page Visibility API (document.hidden) turned out unreliable for
  // this after R38 disabled Chromium's occlusion/backgrounding tracking
  // (disable-backgrounding-occluded-windows) — that flag apparently also
  // stops visibilitychange from firing reliably for minimize. The main
  // process always knows this state definitively via native BrowserWindow
  // events, so it's pushed explicitly instead.
  mainWindowVisibilityChanged: 'rgbbox:system:main-window-visibility-changed',
  // Named profile management
  listProfiles: 'rgbbox:profiles:list',
  loadProfileById: 'rgbbox:profiles:load',
  saveProfileAs: 'rgbbox:profiles:save-as',
  deleteProfile: 'rgbbox:profiles:delete',
  exportProfileDialog: 'rgbbox:profiles:export-dialog',
  importProfileDialog: 'rgbbox:profiles:import-dialog',
  // On-demand 3D model asset management
  modelGetCachedPaths: 'rgbbox:models:get-cached-paths',
  modelDownload: 'rgbbox:models:download',
  modelDownloadProgress: 'rgbbox:models:download-progress',
  // R91.3b: DTLN real-time speech denoise — inference lives in a utility
  // process; the renderer's AudioWorklet relays 16k blocks through here.
  denoiseStart: 'rgbbox:denoise:start',
  denoiseFrames: 'rgbbox:denoise:frames',
  denoiseStop: 'rgbbox:denoise:stop',
  denoiseFramesOut: 'rgbbox:denoise:frames-out',
  // Audio Studio file persistence
  audioGetSavedPaths: 'rgbbox:audio:get-saved-paths',
  audioSavePaths: 'rgbbox:audio:save-paths',
  // Audio Studio native file/folder picker
  audioOpenFiles: 'rgbbox:audio:open-files',
  audioOpenFolder: 'rgbbox:audio:open-folder',
  // Video Studio file persistence
  videoGetSavedPaths: 'rgbbox:video:get-saved-paths',
  videoSavePaths: 'rgbbox:video:save-paths',
  // Video Studio native file/folder picker
  videoOpenFiles: 'rgbbox:video:open-files',
  videoOpenFolder: 'rgbbox:video:open-folder',
  // System display list (for multi-monitor spectrum pop-out)
  getDisplays: 'rgbbox:system:get-displays',
  // R29.3 (revised): dedicated full-resolution "project audio visualizer to
  // display" windows — distinct from the LED overlay pipeline (openOverlay/
  // pushFrameToDisplay) so the smooth canvas animation is shown as-is instead
  // of being downsampled into a blocky LED grid.
  openAudioVizWindow: 'rgbbox:audioviz:open',
  closeAudioVizWindow: 'rgbbox:audioviz:close',
  getAudioVizWindowIds: 'rgbbox:audioviz:get-ids',
  // R73: OS-level scheduled shutdown (Windows `shutdown /s /t`, cancel /a)
  shutdownArm: 'rgbbox:system:shutdown-arm',
  shutdownCancel: 'rgbbox:system:shutdown-cancel',
  shutdownStatus: 'rgbbox:system:shutdown-status',
  // R74: light-effect screensaver (idle-triggered fullscreen effect windows)
  screensaverGetSettings: 'rgbbox:screensaver:get-settings',
  screensaverSetSettings: 'rgbbox:screensaver:set-settings',
  // R76: native clipboard write-image (Electron clipboard, deterministic
  // replacement for renderer navigator.clipboard which failed in practice)
  clipboardWriteImage: 'rgbbox:clipboard:write-image',
  // R77: persistent capture cache (filmstrip gallery)
  capturesList: 'rgbbox:captures:list',
  capturesAdd: 'rgbbox:captures:add',
  capturesDelete: 'rgbbox:captures:delete',
  capturesRead: 'rgbbox:captures:read',
  capturesImport: 'rgbbox:captures:import',
  // R78: clipboard text (annotator copy/paste) + native OCR
  clipboardWriteText: 'rgbbox:clipboard:write-text',
  // R116: dual-format clipboard write (text+html) for structured-document copy
  clipboardWriteRich: 'rgbbox:clipboard:write-rich',
  // R117: AI8 artifact cache — save generated docs/images locally + reveal
  ai8SaveArtifact: 'rgbbox:ai8:save-artifact',
  ai8ShowItemInFolder: 'rgbbox:ai8:show-item-in-folder',
  // R119: global selection AI (hotkey → floating window → active profile)
  selectionAiGetText: 'rgbbox:selection-ai:get-text',
  selectionAiRun: 'rgbbox:selection-ai:run',
  selectionAiClose: 'rgbbox:selection-ai:close',
  clipboardReadText: 'rgbbox:clipboard:read-text',
  ocrRecognize: 'rgbbox:ocr:recognize',
  // R80: standalone global snip tool (frozen-frame windows + annotator)
  snipGetFrame: 'rgbbox:snip:get-frame',
  snipFinish: 'rgbbox:snip:finish',
  snipCancel: 'rgbbox:snip:cancel',
  // R80.12: renderer i18n → main (tray menu follows UI language)
  uiSetLocale: 'rgbbox:ui:set-locale',
  // R81: global snip hotkey preference (preset whitelist)
  snipGetHotkey: 'rgbbox:snip:get-hotkey',
  snipSetHotkey: 'rgbbox:snip:set-hotkey',
  // R83: OCR AI-cleanup (settings + invoke)
  aiGetSettings: 'rgbbox:ai:get-settings',
  aiSetSettings: 'rgbbox:ai:set-settings',
  aiCleanupText: 'rgbbox:ai:cleanup-text',
  // R84: OCR text translation via the same OpenAI-compatible API
  aiTranslateText: 'rgbbox:ai:translate-text',
  aiTestConnection: 'rgbbox:ai:test-connection',
  aiChat: 'rgbbox:ai:chat',
  aiGetProfiles: 'rgbbox:ai:get-profiles',
  aiSaveProfile: 'rgbbox:ai:save-profile',
  aiDeleteProfile: 'rgbbox:ai:delete-profile',
  aiSetActiveProfile: 'rgbbox:ai:set-active-profile',
  // R111: AI8 embedded login — open the official site in a child window and
  // auto-capture the token from its localStorage once the user signs in
  ai8OpenLogin: 'rgbbox:ai8:open-login',
  // R121: remembered AI8 credentials — save/clear (safeStorage at rest) and
  // the main-side auto sign-in via the site's own POST /user/login
  ai8SaveCredentials: 'rgbbox:ai8:save-credentials',
  ai8ClearCredentials: 'rgbbox:ai8:clear-credentials',
  ai8AutoLogin: 'rgbbox:ai8:auto-login',
  // R90 P1: audio AI test lab
  audioAiStatus: 'rgbbox:audio-ai:status',
  audioAiRunVad: 'rgbbox:audio-ai:run-vad',
  audioAiRunAst: 'rgbbox:audio-ai:run-ast',
  audioAiStreamStart: 'rgbbox:audio-ai:stream-start',
  audioAiStreamFeed: 'rgbbox:audio-ai:stream-feed',
  audioAiStreamStop: 'rgbbox:audio-ai:stream-stop',
} as const

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels]
