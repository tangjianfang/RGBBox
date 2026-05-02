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
import type { RgbFrame } from '../shared/types'

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

export function openOverlay(
  displayId: number,
  isDevelopment: boolean,
  devUrl?: string
): boolean {
  if (isOverlayOpen(displayId)) return false

  const allDisplays = screen.getAllDisplays()
  const display = allDisplays.find((d) => d.id === displayId)
  if (!display) return false

  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    focusable: true,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
    if (process.platform === 'win32') {
      win.setFullScreen(true)
    }
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
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
