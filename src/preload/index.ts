import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { DisplayTopology, EngineStatus, Profile, RgbFrame } from '../shared/types'

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
  renderPreviewFrame: (profile: Profile, audio?: AudioInput): Promise<RgbFrame> =>
    ipcRenderer.invoke(ipcChannels.renderPreviewFrame, profile, audio),

  // Multi-display overlay
  openOverlay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.openOverlay, displayId),
  closeOverlay: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.closeOverlay, displayId),
  getOverlayDisplayIds: (): Promise<number[]> =>
    ipcRenderer.invoke(ipcChannels.getOverlayDisplayIds),

  /**
   * Subscribe to overlay frame pushes.
   * Returns an unsubscribe function.
   */
  onOverlayFrame: (callback: (frame: RgbFrame) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, frame: RgbFrame): void => callback(frame)
    ipcRenderer.on(ipcChannels.overlayFrame, handler)
    return () => ipcRenderer.off(ipcChannels.overlayFrame, handler)
  },

  /**
   * Show the native overlay context menu.
   * effects: list of {kind, label} for effect switching options.
   */
  showOverlayContextMenu: (
    displayId: number,
    effects: Array<{ kind: string; label: string }>
  ): Promise<void> =>
    ipcRenderer.invoke(ipcChannels.overlayShowContextMenu, displayId, effects),

  /**
   * Subscribe to overlay effect-change events pushed from the main process
   * when the user picks an effect from the overlay context menu.
   * Callback receives null when an overlay is closed from the menu.
   */
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
    ipcRenderer.invoke(ipcChannels.setPowerSaveBlock, enable)
}

contextBridge.exposeInMainWorld('rgbbox', api)

export type RgbBoxApi = typeof api
