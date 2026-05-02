import { app } from 'electron'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultProfile } from '../shared/defaultProfile'
import type { Profile, ProfileMeta } from '../shared/types'

const configDir = join(app.getPath('userData'), 'config')
const profilePath = join(configDir, 'profile.json')
const profilesDir = join(configDir, 'profiles')

// ── Working profile (current session) ─────────────────────────────────────

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await readFile(profilePath, 'utf-8')
    const parsed: Profile = JSON.parse(raw)
    return {
      ...defaultProfile,
      ...parsed,
      sampling: { ...defaultProfile.sampling, ...parsed.sampling }
    }
  } catch {
    return defaultProfile
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  await mkdir(configDir, { recursive: true })
  await writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8')
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
  await mkdir(profilesDir, { recursive: true })
  const savedAt = new Date().toISOString()
  const stored = { ...profile, _savedAt: savedAt }
  await writeFile(join(profilesDir, `${profile.id}.json`), JSON.stringify(stored, null, 2), 'utf-8')
  return { id: profile.id, name: profile.name, savedAt }
}

export async function deleteProfile(id: string): Promise<void> {
  try {
    await unlink(join(profilesDir, `${id}.json`))
  } catch {
    // ignore if already gone
  }
}

