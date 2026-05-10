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
  // Desktop audio loopback source ID (for system audio capture)
  getDesktopAudioSourceId: 'rgbbox:audio:desktop-source-id',
  // All desktop audio capture sources (screens/displays)
  getDesktopAudioSources: 'rgbbox:audio:desktop-sources',
  // Main → renderer: display added/removed/metrics-changed (hotplug)
  displayTopologyChanged: 'rgbbox:system:display-topology-changed',
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
} as const

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels]
