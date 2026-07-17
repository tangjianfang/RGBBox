/*
 * @Author: MIS\mike 1255033066@qq.com
 * @Date: 2026-05-01 20:19:16
 * @LastEditors: MIS\mike 1255033066@qq.com
 * @LastEditTime: 2026-05-01 22:26:35
 * @FilePath: \RGBBox\src\main\overlayManager.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { app, BrowserWindow, nativeImage, screen } from 'electron'
import { join } from 'node:path'
import { regionToNormalizedRect, isFullscreenRegion } from '../engine/overlayRegionFrame'
import type { OverlayConfig, RgbFrame } from '../shared/types'

const overlayWindows = new Map<number, BrowserWindow>()

let onClosedCallback: ((displayId: number) => void) | null = null

export function setOverlayClosedCallback(cb: (displayId: number) => void): void {
  onClosedCallback = cb
}

export function getOverlayDisplayIds(): number[] {
  return [...overlayWindows.keys()]
}

// R48.1: used by the --perf-selftest harness to reach a specific overlay
// window's webContents (to send a frame-timing collect request and receive
// the report). Returns undefined if no overlay is open for that display.
export function getOverlayWindow(displayId: number): BrowserWindow | undefined {
  return overlayWindows.get(displayId)
}

export function isOverlayOpen(displayId: number): boolean {
  const win = overlayWindows.get(displayId)
  return win !== undefined && !win.isDestroyed()
}

/**
 * Compute the pixel bounds for an overlay window given a region config and
 * display bounds. R63: shares the exact same region-fraction math as
 * `cropFrameToRegion()` (via `regionToNormalizedRect()`) so a window's
 * physical position/size and the frame content pushed into it can never
 * drift apart into two different "cropping rules".
 */
function computeRegionBounds(
  b: { x: number; y: number; width: number; height: number },
  config: OverlayConfig
): { x: number; y: number; width: number; height: number } {
  const r = regionToNormalizedRect(config)
  return {
    x: Math.round(b.x + r.x * b.width),
    y: Math.round(b.y + r.y * b.height),
    width:  Math.max(1, Math.round(r.width  * b.width)),
    height: Math.max(1, Math.round(r.height * b.height))
  }
}

/** Apply the RGBBox app icon to a BrowserWindow (dev path vs packaged resourcesPath). */
function applyWindowIcon(win: BrowserWindow): void {
  const isDev = !app.isPackaged
  const iconPath = process.platform === 'win32'
    ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
    : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
  const img = nativeImage.createFromPath(iconPath)
  if (!img.isEmpty()) win.setIcon(img)
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
  const isFullscreen = isFullscreenRegion(effectiveConfig)

  // R65: a fullscreen overlay's content always covers 100% of its own window
  // (R30.1's "always stretch to fill") — there is nothing behind it that
  // ever needs to show through, so it uses the exact same OPAQUE rendering
  // path as the in-app "RGB 画布预览" (see OverlayCanvas.tsx's `opaque` prop
  // / `PreviewGl(overlay=false)`), instead of the transparent/alpha-blended
  // window this overlay type has historically always used. Only non-
  // fullscreen regions (preset thirds / custom, letterboxed via R63) still
  // need a transparent window so their letterbox bars show the desktop.
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: !isFullscreen,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    // R30.2: `hasShadow:false` is a no-op on Windows (Electron docs: "On Windows
    // and Linux does nothing"). The visible 1px edge some users see around a
    // frameless+transparent overlay on Windows comes from DWM's thick-frame /
    // rounded-corner rendering, not from `hasShadow`. Disable both explicitly.
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: isFullscreen ? '#05080a' : '#00000000',
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

  // R25: keep overlay icons consistent with the main window. Even though
  // skipTaskbar=true hides them from the taskbar, the Alt-Tab thumbnail and
  // window-grouping heuristics still fall back to the PE icon when the
  // runtime override is missing.
  applyWindowIcon(win)

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

  const query = `overlay=true&displayId=${displayId}&opaque=${isFullscreen ? '1' : '0'}`
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

// ─── R29.3 (revised): audio visualizer projector windows ────────────────────
// Deliberately separate from `overlayWindows` above: those exist to render
// LED-grid `RgbFrame`s (coarse, block-sampled, meant for physical LED strip
// simulation). Audio visualizer projection instead shows the exact same
// smooth canvas animation as the studio view at full display resolution —
// conflating the two caused the "effect极差/无动感" (poor quality / no
// motion) complaint when frames were force-downsampled into the LED pipeline.
// Frame *data* (frequency/time-domain arrays) is streamed renderer→renderer
// via a same-origin `BroadcastChannel` (see AudioVizProjector.tsx), not IPC —
// only window open/close needs the main process.
const audioVizWindows = new Map<number, BrowserWindow>()

export function getAudioVizWindowIds(): number[] {
  return [...audioVizWindows.keys()]
}

export function isAudioVizWindowOpen(displayId: number): boolean {
  const win = audioVizWindows.get(displayId)
  return win !== undefined && !win.isDestroyed()
}

export function openAudioVizWindow(displayId: number, isDevelopment: boolean, devUrl?: string): boolean {
  if (isAudioVizWindowOpen(displayId)) return true

  const display = screen.getAllDisplays().find((d) => d.id === displayId)
  if (!display) return false
  const b = display.bounds

  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    backgroundColor: '#080d11',
    focusable: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  applyWindowIcon(win)

  win.once('ready-to-show', () => {
    win.show()
    if (process.platform === 'win32') win.setFullScreen(true)
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
    closeAudioVizWindow(displayId)
  })

  const query = `audioviz=true&displayId=${displayId}`
  if (isDevelopment && devUrl) {
    win.loadURL(`${devUrl}?${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }

  audioVizWindows.set(displayId, win)
  win.on('closed', () => { audioVizWindows.delete(displayId) })
  return true
}

export function closeAudioVizWindow(displayId: number): boolean {
  const win = audioVizWindows.get(displayId)
  if (!win || win.isDestroyed()) return false
  win.close()
  return true
}

export function closeAllAudioVizWindows(): void {
  for (const [, win] of audioVizWindows) {
    if (!win.isDestroyed()) win.close()
  }
}
