import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultProfile } from '../shared/defaultProfile'
import type { Profile } from '../shared/types'

const configDirectory = join(app.getPath('userData'), 'config')
const profilePath = join(configDirectory, 'profile.json')

export async function loadProfile(): Promise<Profile> {
  try {
    const rawProfile = await readFile(profilePath, 'utf-8')
    return { ...defaultProfile, ...JSON.parse(rawProfile) }
  } catch {
    return defaultProfile
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  await mkdir(configDirectory, { recursive: true })
  await writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8')
  return profile
}
