// R158.3: local-only crash visibility — the "crash-free rate is invisible"
// gap in the Apple-scale rescoring, closed WITHOUT giving up the local-first
// zero-telemetry stance (R157 privacy tier). Everything stays on disk:
//  - crashReporter with uploadToServer:false (native minidumps land under
//    userData/logs/Crashpad next to the app log, nothing is uploaded);
//  - uncaughtException / unhandledRejection from the main process are
//    appended as small JSON records (rotated, KEEP newest);
//  - the Diagnostics view lists them and can export one via a save dialog.
import { app, crashReporter, dialog } from 'electron'
import { getLogger } from '../shared/logger'
import type { CrashRecord } from '../shared/types'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Records kept before rotation prunes the oldest. */
const KEEP = 20

const crashDir = (): string => join(app.getPath('userData'), 'logs')

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** Must be called before app ready (crashReporter requirement). */
export function initCrashLogging(): void {
  // Electron 41 dropped the old `{ submit: false }` shorthand; no submitURL +
  // uploadToServer:false is the local-only shape (dumps under userData/logs).
  crashReporter.start({ uploadToServer: false })
  process.on('uncaughtException', (err) => { void recordCrashEvent('uncaughtException', err) })
  process.on('unhandledRejection', (reason) => { void recordCrashEvent('unhandledRejection', reason) })
}

/** Persist one crash record (exported for unit tests; the process hooks above are the production callers). */
export async function recordCrashEvent(kind: CrashRecord['kind'], err: unknown): Promise<void> {
  // Crash logging must never throw — a failure here would recurse.
  try {
    const dir = crashDir()
    await mkdir(dir, { recursive: true })
    const now = new Date()
    const file = `crash-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}.json`
    const message = err instanceof Error ? err.message : String(err)
    const rec = {
      at: now.toISOString(),
      kind,
      message,
      stack: err instanceof Error ? err.stack ?? null : null,
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron
    }
    await writeFile(join(dir, file), JSON.stringify(rec, null, 2))
    getLogger().warn('Crash', `${kind}: ${message}`)
    await rotate(dir)
  } catch { /* swallow by design */ }
}

async function rotate(dir: string): Promise<void> {
  const files = (await readdir(dir)).filter((f) => f.startsWith('crash-') && f.endsWith('.json')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    await unlink(join(dir, f)).catch(() => {})
  }
}

/** Newest-first crash records (capped — the UI only shows the recent tail). */
export async function listCrashLogs(): Promise<CrashRecord[]> {
  const dir = crashDir()
  let files: string[] = []
  try {
    files = (await readdir(dir)).filter((f) => f.startsWith('crash-') && f.endsWith('.json')).sort().reverse().slice(0, 50)
  } catch {
    return [] // no logs dir yet = clean history
  }
  const out: CrashRecord[] = []
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(join(dir, file), 'utf8')) as Omit<CrashRecord, 'file'>
      out.push({ file, ...raw })
    } catch { /* unreadable record → skip, not crash the diagnostics page */ }
  }
  return out
}

/** Save-dialog export of one record. Resolves to the chosen path, or null when cancelled. */
export async function exportCrashLog(fileName: string): Promise<string | null> {
  const dir = crashDir()
  let content: string
  try {
    content = await readFile(join(dir, fileName), 'utf8')
  } catch {
    return null
  }
  const result = await dialog.showSaveDialog({
    defaultPath: fileName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}
