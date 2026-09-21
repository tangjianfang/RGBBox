import { app, BrowserWindow, nativeImage, powerMonitor, powerSaveBlocker, screen } from 'electron'
import { join } from 'node:path'
import { loadSystemSettings, saveSystemSettings } from './systemSettingsStore'
import { getLogger, type Logger } from '../shared/logger'

/**
 * R74: light-effect screensaver.
 *
 * Windows' secure lock screen (Win+L / system lock) runs on the secure
 * desktop and cannot be intercepted or replaced by any app — the equivalent
 * achievable behaviour is: once the system has been idle past the configured
 * threshold, open a fullscreen OPAQUE effect window on every display and hold
 * a `prevent-display-sleep` blocker, so instead of a blanked/locked screen
 * the displays keep showing the user's configured lighting effect. Any real
 * user input resets the system idle timer → the next poll closes everything.
 * `lock-screen` also closes the windows (they would be invisible behind the
 * secure desktop anyway — free the GPU while locked).
 *
 * Window creation mirrors R31's `openAudioVizWindow` (frameless, opaque,
 * screen-saver z-level, ESC to exit, backgroundThrottling off).
 */

// Lazy: module imports are hoisted ahead of index.ts's initLogger call, and
// getLogger() throws before initialization.
function log(): Logger {
  return getLogger()
}

export interface ScreensaverSettings {
  enabled: boolean
  idleMinutes: number
}

const DEFAULT_SETTINGS: ScreensaverSettings = { enabled: false, idleMinutes: 5 }

/** Idle poll cadence — well below human perception of "a few minutes late". */
const POLL_INTERVAL_MS = 20_000
/**
 * R146: while screensaver windows are showing, poll for ANY user input this
 * often. The screensaver opens from a background (idle) process — Windows'
 * foreground lock silently rejects `win.focus()`, leaving the window without
 * keyboard focus, so ESC via before-input-event never fires and the old 20s
 * fallback made the screensaver feel impossible to exit.
 */
const ACTIVE_POLL_INTERVAL_MS = 1_000
/** Input within the last N seconds counts as "the user is back". */
const ACTIVITY_GRACE_SECONDS = 1

export interface PollPlan {
  intervalMs: number
  idleThresholdSeconds: number
}

/**
 * R146 poll cadence: nothing open → the original slow idle threshold; any
 * window open → 1s cadence with a 1s threshold, so ANY real keyboard/mouse
 * input closes all windows within ~a second — independent of focus and
 * z-order (the fullscreen topmost window also hides the Start menu and
 * taskbar context menus, so "any input exits" is the only reliable path).
 */
export function getPollPlan(isScreensaverOpen: boolean, idleMinutes: number): PollPlan {
  return isScreensaverOpen
    ? { intervalMs: ACTIVE_POLL_INTERVAL_MS, idleThresholdSeconds: ACTIVITY_GRACE_SECONDS }
    : { intervalMs: POLL_INTERVAL_MS, idleThresholdSeconds: idleMinutes * 60 }
}

export type IdleState = 'active' | 'idle' | 'locked' | 'unknown'
export type ScreensaverAction = 'open' | 'close' | 'none'

/**
 * Pure transition decision (test-covered). `suppressed` is set when the user
 * manually closed a screensaver window (ESC) — the poll cadence would
 * otherwise re-open them before the idle state is sampled as active again.
 */
export function decideScreensaverAction(
  idleState: IdleState,
  isOpen: boolean,
  suppressed: boolean
): ScreensaverAction {
  if (idleState === 'locked') return 'close' // invisible behind secure desktop; free the GPU
  if (idleState === 'idle') return isOpen || suppressed ? 'none' : 'open'
  // 'active' / 'unknown'
  if (idleState === 'active') return isOpen ? 'close' : 'none'
  return 'none'
}

const screensaverWindows = new Map<number, BrowserWindow>()

let pollTimer: NodeJS.Timeout | null = null
/** Cadence of the current pollTimer — see schedulePolling (R146). */
let pollIntervalMs: number | null = null
let settings: ScreensaverSettings = { ...DEFAULT_SETTINGS }
/** Set when a window is closed by the user; cleared once the system is active again. */
let suppressedUntilActive = false
/** Scoped prevent-display-sleep blocker so the effect is actually visible. */
let displaySleepBlockerId: number | null = null

function applyWindowIcon(win: BrowserWindow): void {
  const isDev = !app.isPackaged
  const iconPath = process.platform === 'win32'
    ? (isDev ? join(__dirname, '../../build/icon.ico') : join(process.resourcesPath, 'icon.ico'))
    : (isDev ? join(__dirname, '../../build/icon.png') : join(process.resourcesPath, 'icon.png'))
  const img = nativeImage.createFromPath(iconPath)
  if (!img.isEmpty()) win.setIcon(img)
}

export function isScreensaverWindowOpen(displayId: number): boolean {
  const win = screensaverWindows.get(displayId)
  return win !== undefined && !win.isDestroyed()
}

export function getScreensaverWindowCount(): number {
  return screensaverWindows.size
}

function openScreensaverWindow(displayId: number, isDevelopment: boolean, devUrl?: string): boolean {
  if (isScreensaverWindowOpen(displayId)) return true
  const display = screen.getAllDisplays().find((d) => d.id === displayId)
  if (!display) return false
  const b = display.bounds

  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,   // R30.2: hasShadow is a no-op on Windows
    roundedCorners: false,
    backgroundColor: '#05080a',
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
    // R146: the screensaver opens while this app is in the background (idle
    // machine) — the Windows foreground lock silently rejects a plain
    // `win.focus()`, which left the window focusless and ESC dead. Steal
    // app-level focus first; if the OS still refuses, the 1s any-input poll
    // (getPollPlan) closes everything regardless.
    app.focus({ steal: true })
    win.focus()
  })

  // ESC exits immediately (real input also resets the system idle timer, but
  // don't wait up to a full poll interval for that to be noticed).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape') return
    event.preventDefault()
    win.close()
  })

  const query = `screensaver=1&displayId=${displayId}`
  if (isDevelopment && devUrl) {
    win.loadURL(`${devUrl}?${query}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query })
  }

  screensaverWindows.set(displayId, win)
  win.on('closed', () => {
    screensaverWindows.delete(displayId)
    // Manual close (ESC/Alt+F4) while the system is still idle → don't let the
    // next poll re-open the windows in the user's face.
    suppressedUntilActive = true
  })
  return true
}

function openAll(isDevelopment: boolean, devUrl?: string): void {
  for (const display of screen.getAllDisplays()) {
    openScreensaverWindow(display.id, isDevelopment, devUrl)
  }
  // Scoped blocker — independent of R69's manual "block screensaver" toggle:
  // stopped again the moment the screensaver closes, never touching the
  // user-facing switch state.
  if (displaySleepBlockerId === null) {
    displaySleepBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    log().info('Screensaver', 'display-sleep blocker started (screensaver active)')
  }
}

export function closeAllScreensaverWindows(): void {
  for (const [, win] of screensaverWindows) {
    if (!win.isDestroyed()) win.close()
  }
  screensaverWindows.clear()
  if (displaySleepBlockerId !== null) {
    powerSaveBlocker.stop(displaySleepBlockerId)
    displaySleepBlockerId = null
    log().info('Screensaver', 'display-sleep blocker stopped (screensaver closed)')
  }
}

function evaluate(isDevelopment: boolean, devUrl?: string): void {
  const isOpen = screensaverWindows.size > 0
  const plan = getPollPlan(isOpen, settings.idleMinutes)
  const idleState = powerMonitor.getSystemIdleState(plan.idleThresholdSeconds) as IdleState
  const action = decideScreensaverAction(idleState, isOpen, suppressedUntilActive)
  if (idleState === 'active') suppressedUntilActive = false
  if (action === 'open') {
    log().info('Screensaver', `idle ≥ ${settings.idleMinutes}min — opening effect screensaver`)
    openAll(isDevelopment, devUrl)
  } else if (action === 'close') {
    closeAllScreensaverWindows()
  }
  // R146: match the poll cadence to the (possibly changed) state — just
  // opened → fast any-input poll; all closed → back to the slow idle poll.
  schedulePolling(isDevelopment, devUrl)
}

export async function getScreensaverSettings(): Promise<ScreensaverSettings> {
  return { ...settings }
}

export async function setScreensaverSettings(
  next: Partial<ScreensaverSettings>,
  isDevelopment: boolean,
  devUrl?: string
): Promise<ScreensaverSettings> {
  settings = {
    enabled: next.enabled ?? settings.enabled,
    idleMinutes: Math.min(240, Math.max(1, Math.floor(next.idleMinutes ?? settings.idleMinutes))),
  }
  try {
    await saveSystemSettings({ screensaver: { ...settings } })
  } catch (err) {
    log().error('Screensaver', `settings persistence failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  restartPolling(isDevelopment, devUrl)
  if (!settings.enabled) closeAllScreensaverWindows()
  return { ...settings }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  pollIntervalMs = null
}

/**
 * (Re)create the poll timer only when the required cadence changed. evaluate()
 * calls this after every tick, so opening/closing windows switches between the
 * slow idle poll and the R146 fast any-input poll exactly once, not per tick.
 */
function schedulePolling(isDevelopment: boolean, devUrl?: string): void {
  const { intervalMs } = getPollPlan(screensaverWindows.size > 0, settings.idleMinutes)
  if (pollTimer && pollIntervalMs === intervalMs) return
  stopPolling()
  pollTimer = setInterval(() => evaluate(isDevelopment, devUrl), intervalMs)
  pollIntervalMs = intervalMs
}

let powerListenersBound = false

/**
 * Bind once per process — Node's EventEmitter does NOT dedupe re-adding the
 * same listener reference, and polling can now be rescheduled mid-flight, so
 * a per-restart `powerMonitor.on(...)` would stack duplicate handlers.
 */
function ensurePowerEventListeners(): void {
  if (powerListenersBound) return
  powerListenersBound = true
  powerMonitor.on('lock-screen', onLockScreen)
  powerMonitor.on('unlock-screen', onUnlockScreen)
}

function restartPolling(isDevelopment: boolean, devUrl?: string): void {
  stopPolling()
  if (!settings.enabled) return
  ensurePowerEventListeners()
  schedulePolling(isDevelopment, devUrl)
  log().info('Screensaver', `polling started (threshold ${settings.idleMinutes}min)`)
}

function onLockScreen(): void {
  // The secure lock screen hides our windows regardless — close them so the
  // engine loop + GL contexts don't burn GPU while the machine is locked.
  log().info('Screensaver', 'lock-screen — closing effect windows')
  closeAllScreensaverWindows()
}

function onUnlockScreen(): void {
  // After unlock the user is active; just make sure nothing lingers and the
  // suppression flag is clear so a later idle period can trigger again.
  suppressedUntilActive = false
  closeAllScreensaverWindows()
}

/**
 * Restore persisted settings at app start. Does NOT auto-open windows even if
 * the machine happens to already be idle — the first poll decides.
 */
export async function initScreensaver(isDevelopment: boolean, devUrl?: string): Promise<void> {
  try {
    const stored = (await loadSystemSettings()).screensaver
    if (stored && typeof stored.idleMinutes === 'number' && stored.idleMinutes > 0) {
      settings = {
        enabled: !!stored.enabled,
        idleMinutes: Math.min(240, Math.max(1, Math.floor(stored.idleMinutes))),
      }
    }
  } catch { /* unreadable settings → defaults */ }
  if (settings.enabled) restartPolling(isDevelopment, devUrl)
}

export function disposeScreensaver(): void {
  stopPolling()
  powerMonitor.removeListener('lock-screen', onLockScreen)
  powerMonitor.removeListener('unlock-screen', onUnlockScreen)
  closeAllScreensaverWindows()
}
