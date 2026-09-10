import { execFile } from 'node:child_process'
import { loadSystemSettings, saveSystemSettings } from './systemSettingsStore'
import { getLogger, type Logger } from '../shared/logger'

/**
 * R73: OS-level scheduled shutdown.
 *
 * Windows `shutdown /s /t <seconds>` arms the OS shutdown timer; `shutdown /a`
 * aborts it. The OS timer is intentionally independent of this app's lifetime:
 * if the user quits RGBBox while armed, the machine still shuts down at the
 * deadline (that is the point of the feature). The deadline is persisted to
 * system.json (R69 store) purely so a relaunched app can show the countdown
 * again — the persistence is informational, not authoritative.
 *
 * macOS is not implemented (returns `unsupported`); the R-N defers it.
 */

// The app-wide file logger is initialized in src/main/index.ts — but module
// imports are hoisted, so this module's body runs BEFORE that init line.
// Fetch the singleton lazily (getLogger throws if called before init).
function log(): Logger {
  return getLogger()
}

export interface ShutdownStatus {
  armed: boolean
  /** epoch ms — present when armed */
  deadlineMs?: number
}

export interface ShutdownResult extends ShutdownStatus {
  ok: boolean
  error?: 'unsupported' | 'spawn-failed' | 'invalid-seconds'
}

/** Pure: Windows args for arming a shutdown N seconds from now (test-covered). */
export function buildShutdownArgs(seconds: number, comment = 'RGBBox scheduled shutdown'): string[] {
  return ['/s', '/f', '/t', String(Math.max(1, Math.floor(seconds))), '/c', comment]
}

/** Pure: Windows args for aborting a pending shutdown (test-covered). */
export function buildCancelArgs(): string[] {
  return ['/a']
}

/** Pure: validate an arm request (test-covered). */
export function validateArmSeconds(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 24 * 3600
}

function runShutdown(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('shutdown', args, { windowsHide: true }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function armShutdown(secondsFromNow: number): Promise<ShutdownResult> {
  if (process.platform !== 'win32') {
    return { ok: false, armed: false, error: 'unsupported' }
  }
  if (!validateArmSeconds(secondsFromNow)) {
    return { ok: false, armed: false, error: 'invalid-seconds' }
  }
  try {
    await runShutdown(buildShutdownArgs(secondsFromNow))
  } catch (err) {
    log().error('Arm', `shutdown /s failed: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, armed: false, error: 'spawn-failed' }
  }
  const deadlineMs = Date.now() + secondsFromNow * 1000
  try {
    await saveSystemSettings({ shutdownDeadline: deadlineMs })
  } catch (err) {
    log().warn('Arm', `deadline persistence failed (timer still armed): ${err instanceof Error ? err.message : String(err)}`)
  }
  log().info('Arm', `OS shutdown armed in ${secondsFromNow}s (deadline ${new Date(deadlineMs).toISOString()})`)
  return { ok: true, armed: true, deadlineMs }
}

export async function cancelShutdown(): Promise<ShutdownResult> {
  if (process.platform !== 'win32') {
    return { ok: false, armed: false, error: 'unsupported' }
  }
  try {
    await runShutdown(buildCancelArgs())
  } catch (err) {
    log().error('Cancel', `shutdown /a failed: ${err instanceof Error ? err.message : String(err)}`)
    return { ok: false, armed: false, error: 'spawn-failed' }
  }
  try {
    await saveSystemSettings({ shutdownDeadline: undefined })
  } catch { /* informational only */ }
  log().info('Cancel', 'OS shutdown cancelled')
  return { ok: true, armed: false }
}

export async function getShutdownStatus(): Promise<ShutdownStatus> {
  try {
    const settings = await loadSystemSettings()
    const deadline = settings.shutdownDeadline
    if (typeof deadline === 'number' && deadline > Date.now()) {
      return { armed: true, deadlineMs: deadline }
    }
    // Past deadline means the machine should already have shut down; stale
    // entries (e.g. shutdown /a issued outside the app) are cleared lazily.
    if (typeof deadline === 'number') {
      try { await saveSystemSettings({ shutdownDeadline: undefined }) } catch { /* ignore */ }
    }
  } catch { /* unreadable settings → treat as disarmed */ }
  return { armed: false }
}
