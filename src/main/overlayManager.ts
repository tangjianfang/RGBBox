/*
 * @Author: MIS\mike 1255033066@qq.com
 * @Date: 2026-05-01 20:19:16
 * @LastEditors: MIS\mike 1255033066@qq.com
 * @LastEditTime: 2026-05-01 22:26:35
 * @FilePath: \RGBBox\src\main\overlayManager.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { OverlayConfig, RgbFrame } from '../shared/types'

const overlayWindows = new Map<number, BrowserWindow>()

let onClosedCallback: ((displayId: number) => void) | null = null

export function setOverlayClosedCallback(cb: (displayId: number) => void): void {
  onClosedCallback = cb
}

export function getOverlayDisplayIds(): number[] {
  return [...overlayWindows.keys()]
}

export function isOverlayOpen(displayId: number): boolean {
  const win = overlayWindows.get(displayId)
  return win !== undefined && !win.isDestroyed()
}

/** Compute the pixel bounds for an overlay window given a region config and display bounds. */
function computeRegionBounds(
  b: { x: number; y: number; width: number; height: number },
  config: OverlayConfig
): { x: number; y: number; width: number; height: number } {
  switch (config.region) {
    case 'top-third':    return { x: b.x, y: b.y,                               width: b.width, height: Math.round(b.height / 3) }
    case 'middle-third': return { x: b.x, y: b.y + Math.round(b.height / 3),    width: b.width, height: Math.round(b.height / 3) }
    case 'bottom-third': return { x: b.x, y: b.y + Math.round(b.height * 2 / 3), width: b.width, height: Math.round(b.height / 3) }
    case 'left-third':   return { x: b.x,                               y: b.y, width: Math.round(b.width / 3),     height: b.height }
    case 'center-third': return { x: b.x + Math.round(b.width / 3),    y: b.y, width: Math.round(b.width / 3),     height: b.height }
    case 'right-third':  return { x: b.x + Math.round(b.width * 2 / 3), y: b.y, width: Math.round(b.width / 3),    height: b.height }
    case 'custom': {
      const c = config.custom ?? { x: 0, y: 0, width: 1, height: 1 }
      return {
        x: Math.round(b.x + c.x * b.width),
        y: Math.round(b.y + c.y * b.height),
        width:  Math.max(1, Math.round(c.width  * b.width)),
        height: Math.max(1, Math.round(c.height * b.height))
      }
    }
    case 'fullscreen':
    default:
      return { x: b.x, y: b.y, width: b.width, height: b.height }
  }
}

export function openOverlay(
  displayId: number,
  isDevelopment: boolean,
  devUrl?: string,
  config?: OverlayConfig
): boolean {
  if (isOverlayOpen(displayId)) return false

  const allDisplays = screen.getAllDisplays()
  const display = allDisplays.find((d) => d.id === displayId)
  if (!display) return false

  const effectiveConfig: OverlayConfig = config ?? { region: 'fullscreen' }
  const bounds = computeRegionBounds(display.bounds, effectiveConfig)
  const isFullscreen = effectiveConfig.region === 'fullscreen'

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    focusable: true,
    resizable: false,
    // Keep hidden until ready-to-show so the loading window cannot
    // steal focus or intercept mouse events in the main window.
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Cover taskbar: defer setAlwaysOnTop until after the window is fully loaded
  // so Windows assigns the correct z-order. screen-saver level sits above the taskbar.
  win.once('ready-to-show', () => {
    win.show()
    // On Windows, HWND_TOPMOST competes with the taskbar (same z-band).
    // setFullScreen moves the window into the exclusive-fullscreen band which is always above the taskbar.
    // Only use fullscreen mode when the region is actually fullscreen.
    if (process.platform === 'win32' && isFullscreen) {
      win.setFullScreen(true)
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
    win.focus()
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return
    event.preventDefault()
    if (win.isFullScreen()) {
      win.setFullScreen(false)
      return
    }
    closeOverlay(displayId)
  })

  const query = `overlay=true&displayId=${displayId}`
  if (isDevelopment && devUrl) {
    win.loadURL(`${devUrl}?${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }

  overlayWindows.set(displayId, win)

  win.on('closed', () => {
    overlayWindows.delete(displayId)
    onClosedCallback?.(displayId)
  })

  return true
}

export function closeOverlay(displayId: number): boolean {
  const win = overlayWindows.get(displayId)
  if (!win || win.isDestroyed()) return false
  win.close()
  return true
}

/**
 * Close an existing overlay and reopen it with a new config without triggering
 * the onClosedCallback (so the renderer keeps the display in its active list).
 * The new window uses show:false so it stays invisible and non-interactive
 * while loading, preventing focus/click theft on the main window.
 */
export function reopenOverlay(
  displayId: number,
  isDevelopment: boolean,
  devUrl?: string,
  config?: OverlayConfig
): boolean {
  const existing = overlayWindows.get(displayId)
  if (existing && !existing.isDestroyed()) {
    // Remove the 'closed' listener BEFORE closing so onClosedCallback is not fired.
    existing.removeAllListeners('closed')
    overlayWindows.delete(displayId)
    existing.close()
  }
  return openOverlay(displayId, isDevelopment, devUrl, config)
}

export function closeAllOverlays(): void {
  for (const [, win] of overlayWindows) {
    if (!win.isDestroyed()) win.close()
  }
}

export function pushFrameToOverlays(frame: RgbFrame): void {
  for (const [, win] of overlayWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('overlay:frame', frame)
    }
  }
}

export function pushFrameToDisplay(displayId: number, frame: RgbFrame): void {
  const win = overlayWindows.get(displayId)
  if (win && !win.isDestroyed()) {
    win.webContents.send('overlay:frame', frame)
  }
}
