import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, nativeTheme, powerSaveBlocker, protocol, screen, session, shell, Tray } from 'electron'
import { access, mkdir, readdir, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { pipeline } from 'node:stream/promises'
import { readFile, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defaultProfile } from '../shared/defaultProfile'
import { ipcChannels } from '../shared/ipc'
import { initLogger } from '../shared/logger'
import { MODELS_MANIFEST } from '../shared/modelsManifest'
import { renderPreviewFrame, type AudioInput } from '../engine/previewEngine'
import type { DesktopAudioSource, CaptureSource, EngineStatus, ModelDownloadProgress, OverlayConfig, Profile, ProcessCpuSample, RgbFrame, ScreenCaptureRequest } from '../shared/types'
import { getDisplayTopology } from './displayTopology'
import { closeAllAudioVizWindows, closeAllOverlays, closeAudioVizWindow, closeOverlay, getAudioVizWindowIds, getOverlayDisplayIds, openAudioVizWindow, openOverlay, pushFrameToDisplay, pushFrameToOverlays, reopenOverlay, setOverlayClosedCallback } from './overlayManager'
import { deleteProfile, listProfiles, loadProfile, loadProfileById, saveProfile, saveProfileAs } from './profileStore'
import { captureScreenFrame, captureVirtualScreenFrame } from './screenCapture'
import { getCaptureProviderStatus, initializeCaptureProviders } from './captureProviders'

// Initialize file logger — must be done after imports but before app.whenReady
const log = initLogger(join(app.getPath('userData'), 'logs'), { minLevel: 'debug' })

// ── Single instance lock ──────────────────────────────────────────────────
log.info('App', `RGBBox starting, version=${app.getVersion()}, platform=${process.platform}`)
const gotSingleLock = app.requestSingleInstanceLock()

// Register media:// as a privileged scheme so the renderer can load local
// audio files from any origin (http://localhost in dev, file:// in prod).
// Must be called BEFORE app is ready.
protocol.registerSchemesAsPrivileged([{
  scheme: 'media',
  privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}])
if (!gotSingleLock) {
  log.warn('App', 'Another instance is running, quitting.')
  app.quit()
  process.exit(0)
}

// R38: When the main window is OS-minimized (as opposed to Electron's own
// `.hide()`, used by the close-to-tray flow), Chromium's renderer-backgrounding
// heuristics kick in and aggressively downgrade the whole renderer process's
// scheduling priority — throttling the worker/tick pipeline that feeds frames
// to overlay windows and causing visible stutter on the projected displays,
// even though the overlay windows themselves have `backgroundThrottling:
// false`. `.hide()` does not trigger the same downgrade, which is why
// "hide to tray" stays smooth. These switches disable that backgrounding
// behaviour app-wide (must be set before `app.whenReady()`), so minimizing
// behaves the same as hiding from a performance standpoint without changing
// any window show/hide UX.
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// R45: Windows-specific — Chromium's "Native Window Occlusion" feature polls
// the OS for whether a window is actually covered/minimized and throttles
// compositing for it independently of the generic backgrounding switches
// above. Because Electron's multiple BrowserWindows (main + overlay) share
// one GPU/compositor process, this has been reported (and matches user
// testing here: the overlay display kept rendering fine while the main
// window was minimized right after R38, but visibly stuttered once R43/R44
// also stopped the *tick loop* itself from being throttled — i.e. the CPU
// work was happening, but presentation to the overlay window was still being
// throttled by this separate occlusion mechanism) to also affect sibling
// windows' presentation rate, not just the occluded/minimized one. Disabling
// it removes that whole code path.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let powerSaveBlockerId: number | null = null
// Capture source id pre-selected by the Video Studio for the next getDisplayMedia()
// call (see ipcChannels.selectCaptureSource + setDisplayMediaRequestHandler).
let pendingCaptureSourceId: string | null = null
let engineStatus: EngineStatus = {
  running: true,
  fps: defaultProfile.sampling.fps,
  output: 'virtual-preview'
}

// R44: module-level so both createMainWindow() (close-to-tray) and
// createTray() (tray icon double-click / context menu toggle) can call it
// explicitly at every point they programmatically hide/show the window,
// instead of relying solely on the 'hide'/'show' events — which do not
// reliably fire when hide() is called from inside a 'close' handler that
// just preventDefault()-ed the close (confirmed by user testing: minimize
// correctly lowered CPU, close-to-tray did not change it at all).
function sendMainWindowVisibility(visible: boolean): void {
  mainWindow?.webContents.send(ipcChannels.mainWindowVisibilityChanged, visible)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: 'RGBBox',
    backgroundColor: '#0f1418',
    show: false,
    // Remove native title bar; use Window Controls Overlay for seamless dark chrome
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#11191f',
      symbolColor: '#9cb7c3',
      height: 40
    },
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Prevent Chromium from throttling timers when the window is occluded
      // by the overlay (otherwise the render loop drops to ~1 fps)
      backgroundThrottling: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // R43: tell the renderer definitively when the window stops/starts being
  // visible to the user, so it can pause the effect-computation tick loop
  // (see App.tsx) instead of relying on document.hidden — which, after R38
  // disabled Chromium's occluded-window backgrounding, no longer reliably
  // reflects minimize state. R44: also called explicitly below (and in
  // createTray()) since the 'hide' event alone is not reliable for every path.
  mainWindow.on('minimize', () => sendMainWindowVisibility(false))
  mainWindow.on('restore', () => sendMainWindowVisibility(true))
  mainWindow.on('hide', () => sendMainWindowVisibility(false))
  mainWindow.on('show', () => sendMainWindowVisibility(true))

  // Close button → hide to tray (minimize to tray pattern).
  // isQuitting is set by the tray "Quit" action and app.on('before-quit').
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      // R44: 'hide' does NOT reliably fire when hide() is called from inside
      // a 'close' handler that just preventDefault()-ed the close — this is
      // exactly this path, confirmed by user testing: minimize correctly
      // lowered CPU, close-to-tray did not change it at all. Send explicitly.
      sendMainWindowVisibility(false)
      tray?.displayBalloon?.({ title: 'RGBBox', content: '已最小化到系统托盘，右键托盘图标可退出。', iconType: 'info' })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // F2 toggles DevTools (available in all builds for diagnostics)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F2') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  // F2 toggles DevTools in both dev and prod
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F2' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // R25: force the runtime window icon in packaged builds. BrowserWindow's `icon:`
  // option resolves `build/icon.ico` relative to `__dirname` (out/main/), which is
  // only present in dev; in prod the file lives under `process.resourcesPath/icon.ico`
  // (see extraResources in package.json). Without this override Windows falls back to
  // the PE RT_ICON that electron-builder left untouched (R23 keeps it off), so the
  // taskbar shows the Electron default. R26 fixes the PE icon for the .exe itself.
  {
    const isDev = !app.isPackaged
    const iconPath = process.platform === 'win32'
      ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
      : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      mainWindow.setIcon(img)
    }
  }

  if (isDevelopment) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  log.info('IPC', 'Registering IPC handlers')
  ipcMain.handle(ipcChannels.getPowerSaveBlock, () => powerSaveBlockerId !== null)
  ipcMain.handle(ipcChannels.setPowerSaveBlock, (_event, enable: boolean) => {
    log.info('Power', `Power save block ${enable ? 'enabled' : 'disabled'}`)
    if (enable && powerSaveBlockerId === null) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!enable && powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    return powerSaveBlockerId !== null
  })

  ipcMain.handle(ipcChannels.getAutoLaunch, () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle(ipcChannels.setAutoLaunch, (_event, enable: boolean) => {
    log.info('System', `Auto-launch ${enable ? 'enabled' : 'disabled'}`)
    app.setLoginItemSettings({ openAtLogin: enable })
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(ipcChannels.appVersion, () => app.getVersion())
  ipcMain.handle(ipcChannels.getDisplayTopology, () => getDisplayTopology())
  ipcMain.handle(ipcChannels.getDefaultProfile, () => loadProfile())
  ipcMain.handle(ipcChannels.saveProfile, (_event, profile: Profile) => {
    log.info('Profile', `Saving active profile: id=${profile.id}, name="${profile.name}"`)
    return saveProfile(profile)
  })
  ipcMain.handle(ipcChannels.getEngineStatus, () => engineStatus)
  ipcMain.handle(ipcChannels.setEngineRunning, (_event, running: boolean) => {
    log.info('Engine', `Engine ${running ? 'started' : 'stopped'}`)
    engineStatus = { ...engineStatus, running }
    return engineStatus
  })
  ipcMain.handle(
    ipcChannels.renderPreviewFrame,
    (_event, profile: Profile, audio?: AudioInput, textMasks?: Record<string, boolean[]>) => {
      return renderPreviewFrame(profile, undefined, undefined, audio, undefined, textMasks)
    }
  )
  ipcMain.handle(ipcChannels.captureScreenSample, async (_event, request: ScreenCaptureRequest) => {
    if (request.hasOverlays) return null  // avoid feedback loop when overlays are active
    const topology = getDisplayTopology()
    if (request.linkedDisplays && topology.displays.length > 1) {
      return captureVirtualScreenFrame(topology, request.columns, request.rows)
    }
    const primaryDisplay = topology.displays.find((d) => d.id === request.displayId) ?? topology.displays.find((d) => d.primary) ?? topology.displays[0]
    if (!primaryDisplay) return null
    const captured = await captureScreenFrame(primaryDisplay.id, request.columns, request.rows)
    return captured ?? null
  })
  ipcMain.handle(ipcChannels.getCaptureProviderStatus, () => getCaptureProviderStatus())

  // R46: per-process CPU% breakdown for objective diagnostics (see ipc.ts).
  ipcMain.handle(ipcChannels.getProcessCpuSamples, (): ProcessCpuSample[] => {
    return app.getAppMetrics().map((m) => ({
      pid: m.pid,
      type: m.type,
      cpuPercent: m.cpu.percentCPUUsage,
      name: m.name
    }))
  })

  // Renderer → main: push a rendered frame to open overlay windows (fire-and-forget)
  ipcMain.on(ipcChannels.overlayPushFrame, (_event, frame: RgbFrame) => {
    pushFrameToOverlays(frame)
    engineStatus = { ...engineStatus, fps: frame.columns > 0 ? engineStatus.fps : engineStatus.fps, lastFrameAt: frame.generatedAt }
  })

  // Renderer → main: push a rendered frame to ONE specific display overlay (linked-display mode)
  ipcMain.on(ipcChannels.overlayPushFrameForDisplay, (_event, displayId: number, frame: RgbFrame) => {
    pushFrameToDisplay(displayId, frame)
  })

  // Notify main renderer when an overlay is closed externally (e.g. double-click close)
  // Guard against destroyed webContents: mainWindow may be non-null but already destroyed
  // when this callback fires during the main-window-close sequence.
  setOverlayClosedCallback((displayId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(ipcChannels.overlayClosed, displayId)
    }
  })

  // Overlay management
  ipcMain.handle(ipcChannels.openOverlay, (_event, displayId: number, config?: OverlayConfig) => {
    log.info('Overlay', `Opening overlay for display ${displayId}, region=${config?.region ?? 'fullscreen'}`)
    return openOverlay(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL, config)
  })
  ipcMain.handle(ipcChannels.closeOverlay, (_event, displayId: number) => {
    log.info('Overlay', `Closing overlay for display ${displayId}`)
    return closeOverlay(displayId)
  })
  ipcMain.handle(ipcChannels.setOverlayConfig, (_event, displayId: number, config?: OverlayConfig) => {
    log.info('Overlay', `Updating overlay config for display ${displayId}, region=${config?.region ?? 'fullscreen'}`)
    return reopenOverlay(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL, config)
  })
  ipcMain.handle(ipcChannels.getOverlayDisplayIds, () => {
    return getOverlayDisplayIds()
  })

  // R29.3 (revised): audio visualizer projector windows — full-resolution,
  // separate from the LED overlay pipeline above.
  ipcMain.handle(ipcChannels.openAudioVizWindow, (_event, displayId: number) => {
    log.info('AudioViz', `Opening audio visualizer projector for display ${displayId}`)
    return openAudioVizWindow(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL)
  })
  ipcMain.handle(ipcChannels.closeAudioVizWindow, (_event, displayId: number) => {
    log.info('AudioViz', `Closing audio visualizer projector for display ${displayId}`)
    return closeAudioVizWindow(displayId)
  })
  ipcMain.handle(ipcChannels.getAudioVizWindowIds, () => {
    return getAudioVizWindowIds()
  })

  // Return the first screen's desktopCapturer sourceId for system audio loopback (legacy)
  ipcMain.handle(ipcChannels.getDesktopAudioSourceId, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    return sources[0]?.id ?? null
  })

  // Return ALL desktop audio capture sources (screens/displays)
  ipcMain.handle(ipcChannels.getDesktopAudioSources, async (): Promise<DesktopAudioSource[]> => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })

  // Return screen + window capture sources with thumbnails (Video Studio)
  ipcMain.handle(
    ipcChannels.getCaptureSources,
    async (_event, types?: Array<'screen' | 'window'>): Promise<CaptureSource[]> => {
      const wanted = types && types.length > 0 ? types : (['screen', 'window'] as Array<'screen' | 'window'>)
      const sources = await desktopCapturer.getSources({
        types: wanted,
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('window:') ? 'window' : 'screen',
        thumbnail: s.thumbnail?.isEmpty() ? '' : s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
      }))
    }
  )

  // Remember which source the renderer wants the next getDisplayMedia() call to
  // stream. The Video Studio sets this immediately before calling getDisplayMedia,
  // and the display-media request handler (registered in app.whenReady) resolves
  // it to a concrete desktopCapturer source.
  ipcMain.handle(ipcChannels.selectCaptureSource, (_event, sourceId: string): boolean => {
    pendingCaptureSourceId = typeof sourceId === 'string' ? sourceId : null
    return true
  })

  // Named profile management
  ipcMain.handle(ipcChannels.listProfiles, () => listProfiles())
  ipcMain.handle(ipcChannels.loadProfileById, (_event, id: string) => {
    log.info('Profile', `Loading profile by id: ${id}`)
    return loadProfileById(id)
  })
  ipcMain.handle(ipcChannels.saveProfileAs, (_event, profile: Profile) => {
    log.info('Profile', `Saving profile as: id=${profile.id}, name="${profile.name}"`)
    return saveProfileAs(profile)
  })
  ipcMain.handle(ipcChannels.deleteProfile, (_event, id: string) => {
    log.info('Profile', `Deleting profile: id=${id}`)
    return deleteProfile(id)
  })
  ipcMain.handle(ipcChannels.exportProfileDialog, async (_event, profile: Profile) => {
    log.info('Profile', `Exporting profile: "${profile.name}"`)
    const result = await dialog.showSaveDialog({
      title: 'Export Profile',
      defaultPath: `${profile.name.replace(/[^a-zA-Z0-9_\- ]/g, '_')}.json`,
      filters: [{ name: 'JSON Profile', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, JSON.stringify(profile, null, 2), 'utf-8')
    log.info('Profile', `Profile exported to: ${result.filePath}`)
    return true
  })
  ipcMain.handle(ipcChannels.importProfileDialog, async () => {
    log.info('Profile', 'Importing profile from file dialog')
    const result = await dialog.showOpenDialog({
      title: 'Import Profile',
      filters: [{ name: 'JSON Profile', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      log.info('Profile', `Profile imported from: ${result.filePaths[0]}`)
      return JSON.parse(raw) as Profile
    } catch {
      log.error('Profile', `Failed to import profile from: ${result.filePaths[0]}`)
      return null
    }
  })

  // Overlay context menu (called from overlay renderer)
  ipcMain.handle(
    ipcChannels.overlayShowContextMenu,
    (event, displayId: number, effects: Array<{ kind: string; label: string }>) => {
      const senderWin = BrowserWindow.fromWebContents(event.sender)
      if (!senderWin) return

      const effectItems = effects.map((e) => ({
        label: e.label,
        click: () => {
          // Notify main window so it can update the profile and push new frames
          mainWindow?.webContents.send(ipcChannels.overlayEffectChanged, e.kind)
        }
      }))

      const menu = Menu.buildFromTemplate([
        { label: '切换效果', enabled: false },
        { type: 'separator' },
        ...effectItems,
        { type: 'separator' },
        {
          label: '关闭此覆盖层',
          click: () => {
            closeOverlay(displayId)
            mainWindow?.webContents.send(ipcChannels.overlayEffectChanged, null)
          }
        }
      ])

      menu.popup({ window: senderWin })
    }
  )

  // ── On-demand 3D model download ──────────────────────────────────────────

  const modelsDir = join(app.getPath('userData'), 'models')

  /** Return a file:// URL if the model is already cached, otherwise undefined. */
  async function getCachedModelUrl(fileName: string): Promise<string | undefined> {
    const filePath = join(modelsDir, fileName)
    try {
      await access(filePath)
      return pathToFileURL(filePath).toString()
    } catch {
      return undefined
    }
  }

  /** Follow HTTPS/HTTP redirects and stream to dest, pushing progress events. */
  function downloadWithProgress(
    url: string,
    dest: string,
    onProgress: (p: ModelDownloadProgress, name: string) => void,
    name: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (currentUrl: string, redirects = 0): void => {
        if (redirects > 10) { reject(new Error('Too many redirects')); return }
        const getter = currentUrl.startsWith('https://') ? httpsGet : httpGet
        getter(currentUrl, (res) => {
          if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            attempt(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10)
          let receivedBytes = 0
          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length
            const percent = totalBytes > 0 ? Math.round(receivedBytes / totalBytes * 100) : 0
            onProgress({ name, receivedBytes, totalBytes, percent, done: false }, name)
          })
          const out = createWriteStream(dest)
          pipeline(res, out)
            .then(() => { onProgress({ name, receivedBytes, totalBytes, percent: 100, done: true }, name); resolve() })
            .catch(reject)
        }).on('error', reject)
      }
      attempt(url)
    })
  }

  // ── Audio Studio file path persistence ────────────────────────────────────
  const audioConfigPath = join(app.getPath('userData'), 'config', 'audio-playlist.json')

  ipcMain.handle(ipcChannels.audioGetSavedPaths, async () => {
    try {
      const raw = await readFile(audioConfigPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  ipcMain.handle(ipcChannels.audioSavePaths, async (_event, paths: Array<{ id: string; name: string; path: string; group: string }>) => {
    await mkdir(join(app.getPath('userData'), 'config'), { recursive: true })
    await writeFile(audioConfigPath, JSON.stringify(paths, null, 2), 'utf-8')
  })

  const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['wav', 'flac', 'mp3', 'aac', 'm4a', 'ogg', 'opus', 'weba'] }]

  ipcMain.handle(ipcChannels.audioOpenFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Audio Files',
      properties: ['openFile', 'multiSelections'],
      filters: AUDIO_FILTERS,
    })
    if (result.canceled) return []
    return result.filePaths.map(p => ({ path: p, name: basename(p) }))
  })

  ipcMain.handle(ipcChannels.audioOpenFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Audio Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const folderPath = result.filePaths[0]
    const folderName = basename(folderPath)
    let entries: string[] = []
    try { entries = await readdir(folderPath) } catch { return [] }
    return entries
      .filter(f => /\.(wav|flac|mp3|aac|m4a|ogg|opus|weba)$/i.test(f))
      .map(f => ({ path: join(folderPath, f), name: f, folder: folderName }))
  })

  // ── Video Studio file path persistence ────────────────────────────────────
  const videoConfigPath = join(app.getPath('userData'), 'config', 'video-playlist.json')

  ipcMain.handle(ipcChannels.videoGetSavedPaths, async () => {
    try {
      const raw = await readFile(videoConfigPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  ipcMain.handle(ipcChannels.videoSavePaths, async (_event, paths: Array<{ id: string; name: string; path: string; group: string }>) => {
    await mkdir(join(app.getPath('userData'), 'config'), { recursive: true })
    await writeFile(videoConfigPath, JSON.stringify(paths, null, 2), 'utf-8')
  })

  const VIDEO_FILTERS = [{ name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'ts', 'm4v', 'wmv'] }]

  ipcMain.handle(ipcChannels.videoOpenFiles, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Video Files',
      properties: ['openFile', 'multiSelections'],
      filters: VIDEO_FILTERS,
    })
    if (result.canceled) return []
    return result.filePaths.map(p => ({ path: p, name: basename(p) }))
  })

  ipcMain.handle(ipcChannels.videoOpenFolder, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Add Video Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const folderPath = result.filePaths[0]
    const folderName = basename(folderPath)
    let entries: string[] = []
    try { entries = await readdir(folderPath) } catch { return [] }
    return entries
      .filter(f => /\.(mp4|webm|mkv|mov|avi|flv|ts|m4v|wmv)$/i.test(f))
      .map(f => ({ path: join(folderPath, f), name: f, folder: folderName }))
  })

  // ── System display list ────────────────────────────────────────────────────
  ipcMain.handle(ipcChannels.getDisplays, () => {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      label: `Display ${d.id}`,
      bounds: d.bounds,
      primary: d.id === primaryId,
    }))
  })

  // Return mapping of model name → file:// URL for every model already cached
  ipcMain.handle(ipcChannels.modelGetCachedPaths, async () => {
    await mkdir(modelsDir, { recursive: true })
    const result: Record<string, string> = {}
    // Also check dev-time public assets directory so devs don't need to re-download
    const devPublicDir = isDevelopment
      ? join(__dirname, '../../src/renderer/public/assets/models')
      : null
    for (const entry of MODELS_MANIFEST) {
      const url = await getCachedModelUrl(entry.file)
      if (url) {
        result[entry.name] = url
      } else if (devPublicDir) {
        const devPath = join(devPublicDir, entry.file)
        try {
          await access(devPath)
          result[entry.name] = pathToFileURL(devPath).toString()
        } catch { /* not present */ }
      }
    }
    return result
  })

  // Download a model by name; push progress events; return file:// URL when done
  ipcMain.handle(ipcChannels.modelDownload, async (_event, name: string) => {
    const entry = MODELS_MANIFEST.find((m) => m.name === name)
    if (!entry) throw new Error(`Unknown model: ${name}`)

    await mkdir(modelsDir, { recursive: true })
    const destPath = join(modelsDir, entry.file)

    // Return cached copy immediately without re-downloading
    const cached = await getCachedModelUrl(entry.file)
    if (cached) return cached

    log.info('Model', `Downloading model: ${name} from ${entry.url}`)

    // Remove any partial file from a previous failed attempt
    try { await unlink(destPath) } catch { /* ignore */ }

    const sendProgress = (p: ModelDownloadProgress): void => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(ipcChannels.modelDownloadProgress, p)
      }
    }

    try {
      await downloadWithProgress(entry.url, destPath, sendProgress, name)
      log.info('Model', `Model download complete: ${name}`)
    } catch (err) {
      try { await unlink(destPath) } catch { /* ignore */ }
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('Model', `Model download failed: ${name}, error: ${errMsg}`)
      sendProgress({ name, receivedBytes: 0, totalBytes: 0, percent: 0, done: true, error: errMsg })
      throw err
    }

    return pathToFileURL(destPath).toString()
  })
}

function createTray(): void {
  const isDev = !app.isPackaged
  const iconPath = process.platform === 'win32'
    ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
    : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('RGBBox')

  const toggleMainWindow = (): void => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
      sendMainWindowVisibility(false)
    } else {
      mainWindow.show()
      mainWindow.focus()
      sendMainWindowVisibility(true)
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏主界面', click: toggleMainWindow },
    { type: 'separator' },
    {
      label: '退出 RGBBox',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', toggleMainWindow)
}

// ── R46: automated CPU/IO performance self-test ────────────────────────────
// Answers "does this fix actually work?" with real Electron process metrics
// instead of a human reading Task Manager — run via:
//   node_modules/.bin/electron . --perf-selftest
// It drives the exact scenarios reported across R38/R42-R45 (idle workspace,
// minimized, minimized+overlay, hidden-to-tray) using real BrowserWindow
// minimize()/restore()/hide()/show() calls and real openOverlay()/closeOverlay()
// calls (so genuine renderer/GPU work happens, not a simulation), samples
// `app.getAppMetrics()` (per-OS-process CPU%) across each one, writes a JSON
// report + human-readable verdicts to the log directory, then quits itself.
// Caveat: CPU% is a proxy, not a substitute for actually watching the overlay
// render — a process could show low CPU while still failing to *present*
// frames (a compositor/GPU scheduling issue), so a "PASS" here means "this
// scenario isn't burning CPU it doesn't need to", not "the picture is 100%
// smooth". Only gated behind an explicit CLI flag; never runs in normal use.
interface PerfSample {
  label: string
  atMs: number
  totalCpuPercent: number
  perProcess: Array<{ pid: number; type: string; cpuPercent: number }>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sampleProcessCpuOnce(): { total: number; perProcess: PerfSample['perProcess'] } {
  const perProcess = app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, cpuPercent: m.cpu.percentCPUUsage }))
  const total = perProcess.reduce((sum, p) => sum + p.cpuPercent, 0)
  return { total, perProcess }
}

/** Samples repeatedly over a short window and averages, to smooth over one-off spikes/noise. */
async function sampleAveraged(label: string, sampleCount = 6, intervalMs = 400): Promise<PerfSample> {
  const totals: number[] = []
  let lastPerProcess: PerfSample['perProcess'] = []
  for (let i = 0; i < sampleCount; i++) {
    await delay(intervalMs)
    const { total, perProcess } = sampleProcessCpuOnce()
    totals.push(total)
    lastPerProcess = perProcess
  }
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length
  return { label, atMs: Date.now(), totalCpuPercent: avg, perProcess: lastPerProcess }
}

async function runPerfSelfTest(): Promise<void> {
  const results: PerfSample[] = []
  try {
    log.info('PerfSelfTest', 'Starting automated performance self-test (--perf-selftest)')
    // Prime app.getAppMetrics(): Electron measures CPU% over the interval
    // since the previous call for each process, so the very first reading
    // needs a throwaway call to establish that baseline window.
    sampleProcessCpuOnce()
    await delay(2500) // let the renderer finish mounting / the tick loop settle

    results.push(await sampleAveraged('1-workspace-visible-no-overlay'))

    mainWindow?.minimize()
    results.push(await sampleAveraged('2-minimized-no-overlay'))

    mainWindow?.restore()
    await delay(500)
    const topology = getDisplayTopology()
    const primary = topology.displays.find((d) => d.primary) ?? topology.displays[0]
    if (primary) {
      // R46: route through the renderer's own handleToggleOverlay (via IPC
      // push) instead of calling openOverlay() directly from main — the
      // latter left the renderer's overlayDisplayIds state (and thus the
      // R42/R43 tick-loop gate) unaware an overlay existed, which silently
      // invalidated the "minimized + overlay" scenario in an earlier run of
      // this harness (it looked like overlay computation was being paused
      // when minimized, but it was actually the gate correctly seeing zero
      // known overlays and pausing as designed).
      mainWindow?.webContents.send(ipcChannels.perfSelfTestToggleOverlay, primary.id)
      await delay(2000) // let the renderer's openOverlay() invoke + overlay window load complete
    } else {
      log.warn('PerfSelfTest', 'No display found — skipping overlay-dependent scenarios')
    }
    results.push(await sampleAveraged('3-workspace-visible-with-overlay'))

    if (primary) {
      mainWindow?.minimize()
      results.push(await sampleAveraged('4-minimized-with-overlay'))
      mainWindow?.restore()
      await delay(500)
      mainWindow?.webContents.send(ipcChannels.perfSelfTestToggleOverlay, primary.id)
      await delay(500)
    }

    mainWindow?.hide()
    results.push(await sampleAveraged('5-hidden-to-tray-no-overlay'))
    mainWindow?.show()
    await delay(300)

    const verdicts: string[] = []
    const byLabel = (l: string): PerfSample | undefined => results.find((r) => r.label === l)
    const baseline = byLabel('1-workspace-visible-no-overlay')
    const minNoOverlay = byLabel('2-minimized-no-overlay')
    if (baseline && minNoOverlay) {
      const pass = minNoOverlay.totalCpuPercent < Math.max(3, baseline.totalCpuPercent * 0.4)
      verdicts.push(`[R42/R45] minimize (no overlay) should drop CPU close to 0: baseline=${baseline.totalCpuPercent.toFixed(1)}% -> minimized=${minNoOverlay.totalCpuPercent.toFixed(1)}% => ${pass ? 'PASS' : 'FAIL'}`)
    }
    const hidden = byLabel('5-hidden-to-tray-no-overlay')
    if (baseline && hidden) {
      const pass = hidden.totalCpuPercent < Math.max(3, baseline.totalCpuPercent * 0.4)
      verdicts.push(`[R44] hide-to-tray (no overlay) should drop CPU close to 0: baseline=${baseline.totalCpuPercent.toFixed(1)}% -> hidden=${hidden.totalCpuPercent.toFixed(1)}% => ${pass ? 'PASS' : 'FAIL'}`)
    }
    const withOverlay = byLabel('3-workspace-visible-with-overlay')
    const minWithOverlay = byLabel('4-minimized-with-overlay')
    if (withOverlay && minWithOverlay) {
      const delta = Math.abs(minWithOverlay.totalCpuPercent - withOverlay.totalCpuPercent)
      const pass = delta < Math.max(5, withOverlay.totalCpuPercent * 0.5)
      verdicts.push(`[R38/R45] overlay computation should NOT drop when main window minimizes: visible=${withOverlay.totalCpuPercent.toFixed(1)}% -> minimized=${minWithOverlay.totalCpuPercent.toFixed(1)}% => ${pass ? 'PASS (CPU stayed comparable — computation not skipped; does NOT confirm visual smoothness, only that work is still happening)' : 'FAIL (CPU dropped a lot — computation is likely being throttled while minimized)'}`)
    }

    const report = { generatedAt: new Date().toISOString(), results, verdicts }
    const reportPath = join(app.getPath('userData'), 'logs', 'perf-selftest-report.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8')
    log.info('PerfSelfTest', `Report written to ${reportPath}`)
    for (const r of results) {
      log.info('PerfSelfTest', `${r.label}: total=${r.totalCpuPercent.toFixed(1)}% | ` + r.perProcess.map((p) => `${p.type}#${p.pid}=${p.cpuPercent.toFixed(1)}%`).join(', '))
    }
    for (const v of verdicts) {
      log.info('PerfSelfTest', v)
    }
  } catch (err) {
    log.error('PerfSelfTest', `Self-test failed: ${String(err)}`)
  } finally {
    log.flushSync()
    isQuitting = true
    app.quit()
  }
}

app.whenReady().then(() => {
  // Force dark theme so native title bar and system chrome match the dark UI
  nativeTheme.themeSource = 'dark'
  // Remove the default application menu (File / Edit / View / …)
  Menu.setApplicationMenu(null)

  // Grant media + display-capture permissions so the Video Studio can access
  // cameras, microphones and screen/window sources. All other permissions are
  // denied (tighter than Electron's permissive default).
  const MEDIA_PERMISSIONS = new Set(['media', 'audioCapture', 'videoCapture', 'display-capture'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(MEDIA_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return MEDIA_PERMISSIONS.has(permission)
  })

  // Modern screen/window capture path. The Video Studio calls
  // navigator.mediaDevices.getDisplayMedia() after pre-selecting a source id via
  // ipcChannels.selectCaptureSource. This handler resolves that id to a concrete
  // desktopCapturer source. Chromium's getDisplayMedia capturer correctly streams
  // GPU-accelerated windows (e.g. browsers) that the legacy chromeMediaSource
  // constraint often rendered black or failed to capture.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const chosen = sources.find((s) => s.id === pendingCaptureSourceId) ?? sources[0]
        pendingCaptureSourceId = null
        if (chosen) {
          callback({ video: chosen })
        } else {
          // No source available — deny gracefully.
          callback({})
        }
      })
      .catch((err) => {
        log.error('Video', `setDisplayMediaRequestHandler failed: ${String(err)}`)
        callback({})
      })
  }, { useSystemPicker: false })

  // Serve local audio files via the media:// custom scheme.
  // net.fetch does NOT support file:// — use readFile + Response instead.
  const AUDIO_MIME: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg',
    opus: 'audio/opus', weba: 'audio/webm',
  }
  protocol.handle('media', async (request) => {
    try {
      // Path is stored as query param ?p= to avoid Windows drive-letter mangling
      // e.g. media://local?p=C%3A%5CUsers%5C...  →  C:\Users\...
      const filePath = new URL(request.url).searchParams.get('p') ?? ''
      console.log('[media://] filePath:', filePath)
      const data = await readFile(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      console.log('[media://] serving', data.byteLength, 'bytes, ext:', ext)
      return new Response(data, {
        headers: {
          'Content-Type': AUDIO_MIME[ext] ?? 'audio/octet-stream',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      console.error('[media://] error:', request.url, err)
      return new Response('File not found', { status: 404 })
    }
  })

  void initializeCaptureProviders()
  log.info('App', 'Capture providers initialized')
  registerIpc()
  createMainWindow()
  createTray()
  log.info('App', 'Application ready — main window and tray created')

  if (process.argv.includes('--perf-selftest')) {
    mainWindow?.once('ready-to-show', () => {
      void runPerfSelfTest()
    })
  }

  // Notify the renderer whenever display topology changes (hotplug)
  const notifyTopologyChanged = (): void => {
    mainWindow?.webContents.send(ipcChannels.displayTopologyChanged)
  }
  screen.on('display-added', notifyTopologyChanged)
  screen.on('display-removed', notifyTopologyChanged)
  screen.on('display-metrics-changed', notifyTopologyChanged)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('second-instance', () => {
  // A second launch was attempted — focus the existing window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  log.info('App', 'Application quitting')
  log.flushSync()
  isQuitting = true
})

app.on('window-all-closed', () => {
  log.info('App', 'All windows closed')
  closeAllOverlays()
  closeAllAudioVizWindows()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
