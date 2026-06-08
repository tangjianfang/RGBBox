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
import type { DesktopAudioSource, CaptureSource, EngineStatus, ModelDownloadProgress, OverlayConfig, Profile, RgbFrame, ScreenCaptureRequest } from '../shared/types'
import { getDisplayTopology } from './displayTopology'
import { closeAllOverlays, closeOverlay, getOverlayDisplayIds, openOverlay, pushFrameToDisplay, pushFrameToOverlays, reopenOverlay, setOverlayClosedCallback } from './overlayManager'
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

  // Close button → hide to tray (minimize to tray pattern).
  // isQuitting is set by the tray "Quit" action and app.on('before-quit').
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
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
    } else {
      mainWindow.show()
      mainWindow.focus()
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
