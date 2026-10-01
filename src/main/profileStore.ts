import { app } from 'electron'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultProfile } from '../shared/defaultProfile'
import type { Profile, ProfileMeta } from '../shared/types'
import { preserveBadFile, readJsonSafe, writeJsonAtomic } from './atomicJson'

const configDir = join(app.getPath('userData'), 'config')
const profilePath = join(configDir, 'profile.json')
const profilesDir = join(configDir, 'profiles')

// ── Working profile (current session) ─────────────────────────────────────
// R221.1（05 T-C1）: 原子写 + 坏 JSON 防清空。loadProfile 对坏文件返回
// defaultProfile 供会话使用，但 saveProfile 直接以传入 profile 覆盖
// （不经「默认合并」把坏残文件当真值）；临时文件 + rename 保证写一半
// 崩溃不再产生截断 JSON。

export async function loadProfile(): Promise<Profile> {
  const r = await readJsonSafe<Profile>(profilePath)
  if (!r.ok) return defaultProfile
  return {
    ...defaultProfile,
    ...r.value,
    sampling: { ...defaultProfile.sampling, ...r.value.sampling }
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  // R221.1: 坏文件先抢救备份,再原子覆盖(免截断/免坏值合并)
  const r = await readJsonSafe<Profile>(profilePath)
  if (!r.ok && r.reason === 'bad') await preserveBadFile(profilePath)
  await writeJsonAtomic(profilePath, profile)
  return profile
}

// ── Named profile slots ────────────────────────────────────────────────────

export async function listProfiles(): Promise<ProfileMeta[]> {
  try {
    await mkdir(profilesDir, { recursive: true })
    const files = await readdir(profilesDir)
    const metas: ProfileMeta[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(profilesDir, file), 'utf-8')
        const p: Profile & { _savedAt?: string } = JSON.parse(raw)
        metas.push({ id: p.id, name: p.name, savedAt: p._savedAt ?? '' })
      } catch {
        // skip malformed files
      }
    }
    return metas.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
  } catch {
    return []
  }
}

export async function loadProfileById(id: string): Promise<Profile | null> {
  try {
    const raw = await readFile(join(profilesDir, `${id}.json`), 'utf-8')
    return JSON.parse(raw) as Profile
  } catch {
    return null
  }
}

export async function saveProfileAs(profile: Profile): Promise<ProfileMeta> {
  // R222.3: 坏文件先抢救备份再原子覆盖——与 saveProfile 对称(T3 缺口)
  const slotPath = join(profilesDir, `${profile.id}.json`)
  const r = await readJsonSafe<Profile>(slotPath)
  if (!r.ok && r.reason === 'bad') await preserveBadFile(slotPath)
  const savedAt = new Date().toISOString()
  const stored = { ...profile, _savedAt: savedAt }
  await writeJsonAtomic(slotPath, stored) // R221.1: 原子写
  return { id: profile.id, name: profile.name, savedAt }
}

export async function deleteProfile(id: string): Promise<void> {
  try {
    await unlink(join(profilesDir, `${id}.json`))
  } catch {
    // ignore if already gone
  }
}

