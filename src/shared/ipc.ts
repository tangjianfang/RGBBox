export const ipcChannels = {
  appVersion: 'rgbbox:app:version',
  getDisplayTopology: 'rgbbox:system:get-display-topology',
  getDefaultProfile: 'rgbbox:profile:get-default',
  saveProfile: 'rgbbox:profile:save',
  getEngineStatus: 'rgbbox:engine:get-status',
  setEngineRunning: 'rgbbox:engine:set-running',
  renderPreviewFrame: 'rgbbox:engine:render-preview-frame',
  // Multi-display overlay
  openOverlay: 'rgbbox:overlay:open',
  closeOverlay: 'rgbbox:overlay:close',
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
  // Named profile management
  listProfiles: 'rgbbox:profiles:list',
  loadProfileById: 'rgbbox:profiles:load',
  saveProfileAs: 'rgbbox:profiles:save-as',
  deleteProfile: 'rgbbox:profiles:delete',
  exportProfileDialog: 'rgbbox:profiles:export-dialog',
  importProfileDialog: 'rgbbox:profiles:import-dialog',
} as const

export type IpcChannel = (typeof ipcChannels)[keyof typeof ipcChannels]
