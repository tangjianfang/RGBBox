import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { DisplayTopology, EngineStatus, Profile, ProfileMeta, RgbFrame } from '../shared/types'

export interface AudioInput {
  bass: number
  mid: number
  high: number
  beat: number
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

  // Multi-display overlay
  openOverlay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.openOverlay, displayId),
  closeOverlay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.closeOverlay, displayId),
  getOverlayDisplayIds: (): Promise<number[]> =>
    ipcRenderer.invoke(ipcChannels.getOverlayDisplayIds),

  onOverlayFrame: (callback: (frame: RgbFrame) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: RgbFrame): void => callback(frame)
    ipcRenderer.on(ipcChannels.overlayFrame, handler)
    return () => ipcRenderer.off(ipcChannels.overlayFrame, handler)
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

  // Power save blocker
  getPowerSaveBlock: (): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.getPowerSaveBlock),
  setPowerSaveBlock: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.setPowerSaveBlock, enable),

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
}

contextBridge.exposeInMainWorld('rgbbox', api)

export type RgbBoxApi = typeof api

