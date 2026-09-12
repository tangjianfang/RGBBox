import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { CaptureEntry, CaptureProviderStatus, CaptureSource, DesktopAudioSource, DisplayTopology, EngineStatus, ModelDownloadProgress, OverlayConfig, Profile, ProcessCpuSample, ProfileMeta, RgbFrame, ScreenCaptureRequest, OverlayFrameTiming } from '../shared/types'

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
  // R46: per-process CPU% breakdown (main/renderer/gpu-process/utility)
  getProcessCpuSamples: (): Promise<ProcessCpuSample[]> =>
    ipcRenderer.invoke(ipcChannels.getProcessCpuSamples),
  // R46: ONLY sent by the --perf-selftest harness — asks the renderer to
  // toggle the overlay for a display through its own normal open/close path.
  onPerfSelfTestToggleOverlay: (callback: (displayId: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, displayId: number): void => callback(displayId)
    ipcRenderer.on(ipcChannels.perfSelfTestToggleOverlay, handler)
    return () => ipcRenderer.off(ipcChannels.perfSelfTestToggleOverlay, handler)
  },
  // R48.1: ONLY used by the --perf-selftest harness — main asks the overlay
  // window for a frame-arrival timing snapshot (carrying a requestId to
  // correlate the reply). The overlay computes stats from its onOverlayFrame
  // interval buffer, sends them back via reportPerfSelfTestTiming, then clears
  // its buffer so each scenario is measured independently.
  onPerfSelfTestCollectTiming: (callback: (requestId: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, requestId: number): void => callback(requestId)
    ipcRenderer.on(ipcChannels.perfSelfTestCollectOverlayTiming, handler)
    return () => ipcRenderer.off(ipcChannels.perfSelfTestCollectOverlayTiming, handler)
  },
  reportPerfSelfTestTiming: (report: OverlayFrameTiming): void =>
    ipcRenderer.send(ipcChannels.perfSelfTestOverlayTimingReport, report),

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
  // R29.3 (revised): audio visualizer projector windows
  openAudioVizWindow: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.openAudioVizWindow, displayId),
  closeAudioVizWindow: (displayId: number): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.closeAudioVizWindow, displayId),
  getAudioVizWindowIds: (): Promise<number[]> =>
    ipcRenderer.invoke(ipcChannels.getAudioVizWindowIds),
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

  // R43: fired when the main window is minimized/restored/hidden/shown —
  // definitive signal from the main process (see ipc.ts for why
  // document.hidden isn't relied on for this).
  onMainWindowVisibilityChanged: (callback: (visible: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean): void => callback(visible)
    ipcRenderer.on(ipcChannels.mainWindowVisibilityChanged, handler)
    return () => ipcRenderer.off(ipcChannels.mainWindowVisibilityChanged, handler)
  },

  // Power save blocker
  getPowerSaveBlock: (): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.getPowerSaveBlock),
  setPowerSaveBlock: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.setPowerSaveBlock, enable),

  // R73: OS-level scheduled shutdown (Windows-first)
  shutdownArm: (seconds: number): Promise<{ ok: boolean; armed: boolean; deadlineMs?: number; error?: string }> =>
    ipcRenderer.invoke(ipcChannels.shutdownArm, seconds),
  shutdownCancel: (): Promise<{ ok: boolean; armed: boolean; error?: string }> =>
    ipcRenderer.invoke(ipcChannels.shutdownCancel),
  shutdownStatus: (): Promise<{ armed: boolean; deadlineMs?: number }> =>
    ipcRenderer.invoke(ipcChannels.shutdownStatus),

  // R74: light-effect screensaver
  screensaverGetSettings: (): Promise<{ enabled: boolean; idleMinutes: number }> =>
    ipcRenderer.invoke(ipcChannels.screensaverGetSettings),
  screensaverSetSettings: (settings: { enabled?: boolean; idleMinutes?: number }): Promise<{ enabled: boolean; idleMinutes: number }> =>
    ipcRenderer.invoke(ipcChannels.screensaverSetSettings, settings),
  // R76: write a PNG dataURL to the OS clipboard (main-process nativeImage)
  clipboardWriteImage: (dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.clipboardWriteImage, dataUrl),
  // R77: persistent capture cache
  capturesList: (): Promise<CaptureEntry[]> => ipcRenderer.invoke(ipcChannels.capturesList),
  capturesAdd: (dataUrl: string, kind: CaptureEntry['kind']): Promise<CaptureEntry | null> =>
    ipcRenderer.invoke(ipcChannels.capturesAdd, dataUrl, kind),
  capturesDelete: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.capturesDelete, id),
  capturesRead: (id: string): Promise<string | null> =>
    ipcRenderer.invoke(ipcChannels.capturesRead, id),
  capturesImport: (): Promise<CaptureEntry[]> => ipcRenderer.invoke(ipcChannels.capturesImport),
  // R78: clipboard text + native OCR
  clipboardWriteText: (text: string): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.clipboardWriteText, text),
  clipboardReadText: (): Promise<string> => ipcRenderer.invoke(ipcChannels.clipboardReadText),
  ocrRecognize: (dataUrl: string): Promise<{ ok: boolean; text: string; hint?: string; engine?: 'rapid' | 'winrt' }> =>
    ipcRenderer.invoke(ipcChannels.ocrRecognize, dataUrl),
  // R80: standalone global snip tool
  snipGetFrame: (displayId: number): Promise<{ dataUrl: string } | null> =>
    ipcRenderer.invoke(ipcChannels.snipGetFrame, displayId),
  snipFinish: (dataUrl: string, action: 'copy' | 'save'): Promise<boolean> =>
    ipcRenderer.invoke(ipcChannels.snipFinish, { dataUrl, action }),
  snipCancel: (): void => {
    ipcRenderer.send(ipcChannels.snipCancel)
  },
  // R80.12: notify main of UI language so the tray menu rebuilds to match
  setUiLocale: (l: 'zh' | 'en'): void => {
    ipcRenderer.send(ipcChannels.uiSetLocale, l)
  },
  // R81: global snip hotkey preference
  snipGetHotkey: (): Promise<string> => ipcRenderer.invoke(ipcChannels.snipGetHotkey),
  snipSetHotkey: (accel: string): Promise<{ ok: boolean; hotkey: string }> =>
    ipcRenderer.invoke(ipcChannels.snipSetHotkey, accel),

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

  // Video Studio file persistence
  videoGetSavedPaths: (): Promise<Array<{ id: string; name: string; path: string; group: string }>> =>
    ipcRenderer.invoke(ipcChannels.videoGetSavedPaths),
  videoSavePaths: (paths: Array<{ id: string; name: string; path: string; group: string }>): Promise<void> =>
    ipcRenderer.invoke(ipcChannels.videoSavePaths, paths),
  videoOpenFiles: (): Promise<Array<{ path: string; name: string }>> =>
    ipcRenderer.invoke(ipcChannels.videoOpenFiles),
  videoOpenFolder: (): Promise<Array<{ path: string; name: string; folder: string }>> =>
    ipcRenderer.invoke(ipcChannels.videoOpenFolder),

  // System display list (for multi-monitor spectrum pop-out)
  getDisplays: (): Promise<Array<{ id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; primary: boolean }>> =>
    ipcRenderer.invoke(ipcChannels.getDisplays),
}

contextBridge.exposeInMainWorld('rgbbox', api)

export type RgbBoxApi = typeof api

