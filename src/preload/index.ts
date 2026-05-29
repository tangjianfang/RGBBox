import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { CaptureProviderStatus, CaptureSource, DesktopAudioSource, DisplayTopology, EngineStatus, ModelDownloadProgress, OverlayConfig, Profile, ProfileMeta, RgbFrame, ScreenCaptureRequest } from '../shared/types'

export interface AudioInput {
  bass: number
  mid: number
  high: number
  beat: number
  freqBands?: number[]  // 32 log-spaced bands 20 Hz – 20 kHz, each 0..1
}


const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(ipcChannels.appVersion),
  getDisplayTopology: (): Promise<DisplayTopology> => ipcRenderer.invoke(ipcChannels.getDisplayTopology),
  getDefaultProfile: (): Promise<Profile> => ipcRenderer.invoke(ipcChannels.getDefaultProfile),
  saveProfile: (profile: Profile): Promise<Profile> => ipcRenderer.invoke(ipcChannels.saveProfile, profile),
  getEngineStatus: (): Promise<EngineStatus> => ipcRenderer.invoke(ipcChannels.getEngineStatus),
  setEngineRunning: (running: boolean): Promise<EngineStatus> => ipcRenderer.invoke(ipcChannels.setEngineRunning, running),
  renderPreviewFrame: (profile: Profile, audio?: AudioInput, textMasks?: Record<string, boolean[]>): Promise<RgbFrame> =>
    ipcRenderer.invoke(ipcChannels.renderPreviewFrame, profile, audio, textMasks),

  // Capture screen pixels only (no render) — used when engine runs in renderer worker
  captureScreenSample: (request: ScreenCaptureRequest): Promise<RgbFrame | null> =>
    ipcRenderer.invoke(ipcChannels.captureScreenSample, request),
  getCaptureProviderStatus: (): Promise<CaptureProviderStatus> =>
    ipcRenderer.invoke(ipcChannels.getCaptureProviderStatus),

  // Push a rendered frame to any open overlay windows (fire-and-forget)
  pushFrameToOverlays: (frame: RgbFrame): void =>
    ipcRenderer.send(ipcChannels.overlayPushFrame, frame),

  // Push a rendered frame to ONE specific display overlay (linked-display mode)
  pushFrameToDisplay: (displayId: number, frame: RgbFrame): void =>
    ipcRenderer.send(ipcChannels.overlayPushFrameForDisplay, displayId, frame),

  // Multi-display overlay
  openOverlay: (displayId: number, config?: OverlayConfig): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.openOverlay, displayId, config),
  closeOverlay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.closeOverlay, displayId),
  setOverlayConfig: (displayId: number, config?: OverlayConfig): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.setOverlayConfig, displayId, config),
  getOverlayDisplayIds: (): Promise<number[]> =>
    ipcRenderer.invoke(ipcChannels.getOverlayDisplayIds),
  getDesktopAudioSourceId: (): Promise<string | null> =>
    ipcRenderer.invoke(ipcChannels.getDesktopAudioSourceId),
  getDesktopAudioSources: (): Promise<DesktopAudioSource[]> =>
    ipcRenderer.invoke(ipcChannels.getDesktopAudioSources),
  getCaptureSources: (types?: Array<'screen' | 'window'>): Promise<CaptureSource[]> =>
    ipcRenderer.invoke(ipcChannels.getCaptureSources, types),
  selectCaptureSource: (sourceId: string): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.selectCaptureSource, sourceId),

  onOverlayFrame: (callback: (frame: RgbFrame) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: RgbFrame): void => callback(frame)
    ipcRenderer.on(ipcChannels.overlayFrame, handler)
    return () => ipcRenderer.off(ipcChannels.overlayFrame, handler)
  },

  onOverlayClosed: (callback: (displayId: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, displayId: number): void => callback(displayId)
    ipcRenderer.on(ipcChannels.overlayClosed, handler)
    return () => ipcRenderer.off(ipcChannels.overlayClosed, handler)
  },

  showOverlayContextMenu: (
    displayId: number,
    effects: Array<{ kind: string; label: string }>
  ): Promise<void> =>
    ipcRenderer.invoke(ipcChannels.overlayShowContextMenu, displayId, effects),

  onOverlayEffectChanged: (callback: (kind: string | null) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, kind: string | null): void =>
      callback(kind)
    ipcRenderer.on(ipcChannels.overlayEffectChanged, handler)
    return () => ipcRenderer.off(ipcChannels.overlayEffectChanged, handler)
  },

  // Fired when a display is added, removed, or its metrics change (hotplug)
  onDisplayTopologyChanged: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(ipcChannels.displayTopologyChanged, handler)
    return () => ipcRenderer.off(ipcChannels.displayTopologyChanged, handler)
  },

  // Power save blocker
  getPowerSaveBlock: (): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.getPowerSaveBlock),
  setPowerSaveBlock: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.setPowerSaveBlock, enable),

  // Auto-launch at login
  getAutoLaunch: (): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.getAutoLaunch),
  setAutoLaunch: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.setAutoLaunch, enable),

  // Named profile slots
  listProfiles: (): Promise<ProfileMeta[]> =>
    ipcRenderer.invoke(ipcChannels.listProfiles),
  loadProfileById: (id: string): Promise<Profile | null> =>
    ipcRenderer.invoke(ipcChannels.loadProfileById, id),
  saveProfileAs: (profile: Profile): Promise<ProfileMeta> =>
    ipcRenderer.invoke(ipcChannels.saveProfileAs, profile),
  deleteProfile: (id: string): Promise<void> =>
    ipcRenderer.invoke(ipcChannels.deleteProfile, id),
  exportProfileDialog: (profile: Profile): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.exportProfileDialog, profile),
  importProfileDialog: (): Promise<Profile | null> =>
    ipcRenderer.invoke(ipcChannels.importProfileDialog),

  // On-demand 3D model assets
  modelGetCachedPaths: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke(ipcChannels.modelGetCachedPaths),
  modelDownload: (name: string): Promise<string> =>
    ipcRenderer.invoke(ipcChannels.modelDownload, name),
  onModelDownloadProgress: (callback: (p: ModelDownloadProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, p: ModelDownloadProgress): void => callback(p)
    ipcRenderer.on(ipcChannels.modelDownloadProgress, handler)
    return () => ipcRenderer.off(ipcChannels.modelDownloadProgress, handler)
  },

  // Audio Studio file persistence
  audioGetSavedPaths: (): Promise<Array<{ id: string; name: string; path: string; group: string }>> =>
    ipcRenderer.invoke(ipcChannels.audioGetSavedPaths),
  audioSavePaths: (paths: Array<{ id: string; name: string; path: string; group: string }>): Promise<void> =>
    ipcRenderer.invoke(ipcChannels.audioSavePaths, paths),
  audioOpenFiles: (): Promise<Array<{ path: string; name: string }>> =>
    ipcRenderer.invoke(ipcChannels.audioOpenFiles),
  audioOpenFolder: (): Promise<Array<{ path: string; name: string; folder: string }>> =>
    ipcRenderer.invoke(ipcChannels.audioOpenFolder),
}

contextBridge.exposeInMainWorld('rgbbox', api)

export type RgbBoxApi = typeof api

