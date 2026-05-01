import { app, BrowserWindow, ipcMain, Menu, powerSaveBlocker, shell } from 'electron'
import { join } from 'node:path'
import type { AudioInput } from '../engine/previewEngine'
import { renderPreviewFrame } from '../engine/previewEngine'
import { defaultProfile } from '../shared/defaultProfile'
import { ipcChannels } from '../shared/ipc'
import type { EngineStatus, Profile, RgbFrame } from '../shared/types'
import { getDisplayTopology } from './displayTopology'
import { closeAllOverlays, closeOverlay, getOverlayDisplayIds, openOverlay, pushFrameToOverlays } from './overlayManager'
import { loadProfile, saveProfile } from './profileStore'
import { captureScreenFrame } from './screenCapture'

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)

let mainWindow: BrowserWindow | null = null
let lastPreviewFrame: RgbFrame | undefined
let powerSaveBlockerId: number | null = null
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.getPowerSaveBlock, () => powerSaveBlockerId !== null)
  ipcMain.handle(ipcChannels.setPowerSaveBlock, (_event, enable: boolean) => {
    if (enable && powerSaveBlockerId === null) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    } else if (!enable && powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId)
      powerSaveBlockerId = null
    }
    return powerSaveBlockerId !== null
  })

  ipcMain.handle(ipcChannels.appVersion, () => app.getVersion())
  ipcMain.handle(ipcChannels.getDisplayTopology, () => getDisplayTopology())
  ipcMain.handle(ipcChannels.getDefaultProfile, () => loadProfile())
  ipcMain.handle(ipcChannels.saveProfile, (_event, profile: Profile) => saveProfile(profile))
  ipcMain.handle(ipcChannels.getEngineStatus, () => engineStatus)
  ipcMain.handle(ipcChannels.setEngineRunning, (_event, running: boolean) => {
    engineStatus = { ...engineStatus, running }
    return engineStatus
  })
  ipcMain.handle(ipcChannels.renderPreviewFrame, async (_event, profile: Profile, audio?: AudioInput) => {
    // Detect if any enabled layer needs real screen capture.
    // Skip capture when overlays are active: the overlay covers the display,
    // so capturing would read back the overlay itself and create a feedback loop.
    const scene = profile.scenes.find((s) => s.id === profile.activeSceneId) ?? profile.scenes[0]
    const hasOverlays = getOverlayDisplayIds().length > 0
    const needsCapture =
      !hasOverlays &&
      scene.layers.some((l) => l.enabled && l.kind === 'screen-ambient')

    let screenSample: RgbFrame | undefined
    if (needsCapture) {
      const topology = getDisplayTopology()
      const primaryDisplay = topology.displays.find((d) => d.primary) ?? topology.displays[0]
      if (primaryDisplay) {
        const captured = await captureScreenFrame(primaryDisplay.id, profile.sampling.columns, profile.sampling.rows)
        screenSample = captured ?? undefined
      }
    }

    const frame = renderPreviewFrame(profile, undefined, lastPreviewFrame, audio, screenSample)
    lastPreviewFrame = frame
    engineStatus = {
      ...engineStatus,
      fps: profile.sampling.fps,
      lastFrameAt: frame.generatedAt
    }

    // Push to any open overlay windows
    pushFrameToOverlays(frame)

    return frame
  })

  // Overlay management
  ipcMain.handle(ipcChannels.openOverlay, (_event, displayId: number) => {
    // Discard the smoothing history so the first overlay frame is fresh (not lerped from old screen captures)
    lastPreviewFrame = undefined
    return openOverlay(displayId, isDevelopment, process.env.ELECTRON_RENDERER_URL)
  })
  ipcMain.handle(ipcChannels.closeOverlay, (_event, displayId: number) => {
    return closeOverlay(displayId)
  })
  ipcMain.handle(ipcChannels.getOverlayDisplayIds, () => {
    return getOverlayDisplayIds()
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
}

app.whenReady().then(() => {
  registerIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeAllOverlays()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
