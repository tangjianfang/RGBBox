import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * System-level settings that should survive app restarts but are independent
 * of the working profile (e.g. power-save blocker, future global toggles).
 *
 * R69: 'powerSaveBlock' persists the "阻止屏保/睡眠" switch so it is restored
 * on the next launch.
 */
export interface SystemSettings {
  powerSaveBlock?: boolean
}

const configDir = join(app.getPath('userData'), 'config')
const settingsPath = join(configDir, 'system.json')

export async function loadSystemSettings(): Promise<SystemSettings> {
  try {
    const raw = await readFile(settingsPath, 'utf-8')
    return JSON.parse(raw) as SystemSettings
  } catch {
    // Missing or malformed file is not a fatal error; return defaults.
    return {}
  }
}

export async function saveSystemSettings(settings: SystemSettings): Promise<SystemSettings> {
  await mkdir(configDir, { recursive: true })
  const existing = await loadSystemSettings()
  const merged = { ...existing, ...settings }
  await writeFile(settingsPath, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
