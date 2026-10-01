import { app } from 'electron'
import { join } from 'node:path'
import { preserveBadFile, readJsonSafe, writeJsonAtomic } from './atomicJson'

/**
 * System-level settings that should survive app restarts but are independent
 * of the working profile (e.g. power-save blocker, future global toggles).
 *
 * R69: 'powerSaveBlock' persists the "阻止屏保/睡眠" switch so it is restored
 * on the next launch.
 * R221.1（05 T-C1）: 原子写 + 坏 JSON 拒绝合并默认——原实现「解析失败回 {} +
 * 下次 save 合并写回」会把 AI 密文 profiles/热键/屏保整份清空（评审实测
 * 6 个坏样本触发 5 个）。现在坏文件时保存路径直接以传入 settings 为准
 * 覆盖（用户本次显式保存的内容是可信增量），原坏文件先备份为
 * system.json.bad 以便手工抢救。
 */
export interface SystemSettings {
  powerSaveBlock?: boolean
  /** R73: epoch ms of a pending OS shutdown (informational — the OS timer is authoritative) */
  shutdownDeadline?: number
  /** R74: light-effect screensaver config */
  screensaver?: {
    enabled: boolean
    /** idle threshold in minutes before the effect screensaver takes over */
    idleMinutes: number
  }
  /** R81: global snip hotkey (preset whitelist) */
  snip?: {
    hotkey: string
  }
  /** R83: OCR AI-cleanup (OpenAI-compatible chat API).
   *  R89.3: named profiles — baseUrl/apiKey/model remain as the ACTIVE
   *  profile's mirror so legacy readers keep working; apiKey values inside
   *  profiles are safeStorage-encrypted (enc:v1: prefix). */
  ai?: {
    baseUrl: string
    apiKey: string
    model: string
    profiles?: Array<{ id: string; name: string; baseUrl: string; apiKey: string; model: string }>
    activeProfileId?: string
  }
}

const configDir = () => join(app.getPath('userData'), 'config')
const settingsPath = () => join(configDir(), 'system.json')

export async function loadSystemSettings(): Promise<SystemSettings> {
  const r = await readJsonSafe<SystemSettings>(settingsPath())
  if (r.ok) return r.value
  if (r.reason === 'bad') {
    // 坏文件：返回空默认供读取侧使用，但保存侧会走「覆盖」而非「合并」，
    // 避免把坏文件里的残缺内容当成真值合并。原文件由首次保存前备份。
    return {}
  }
  return {}
}

export async function saveSystemSettings(settings: SystemSettings): Promise<SystemSettings> {
  const r = await readJsonSafe<SystemSettings>(settingsPath())
  // R221.1: 坏文件 → 先备份为 system.json.bad(抢救 AI 密文等),再以本次
  // 显式保存覆盖(不与 {} 合并——那正是清空链);好文件 → 正常浅合并。
  if (!r.ok && r.reason === 'bad') await preserveBadFile(settingsPath())
  const merged = r.ok ? { ...r.value, ...settings } : { ...settings }
  await writeJsonAtomic(settingsPath(), merged)
  return merged
}
