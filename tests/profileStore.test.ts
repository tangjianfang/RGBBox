import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mock electron's app module before importing profileStore
const TEST_USER_DATA = join('/tmp', 'rgbbox-test-profiles-' + process.pid)
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return TEST_USER_DATA
      return '/tmp'
    }
  }
}))

// Import after mock
const { loadProfile, saveProfile, listProfiles, loadProfileById, saveProfileAs, deleteProfile } = await import('../src/main/profileStore')

const configDir = join(TEST_USER_DATA, 'config')
const profilePath = join(configDir, 'profile.json')
const profilesDir = join(configDir, 'profiles')

describe('profileStore', () => {
  beforeEach(() => {
    mkdirSync(profilesDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_USER_DATA, { recursive: true, force: true })
  })

  describe('loadProfile', () => {
    it('returns default profile when no file exists', async () => {
      const profile = await loadProfile()
      expect(profile).toBeDefined()
      expect(profile.id).toBeDefined()
      expect(profile.name).toBeDefined()
      expect(profile.sampling).toBeDefined()
      expect(profile.scenes).toBeDefined()
    })

    it('loads and merges saved profile with defaults', async () => {
      const saved = {
        id: 'test-id',
        name: 'Test Profile',
        activeSceneId: 'scene-1',
        performanceMode: 'balanced',
        sampling: { columns: 20, rows: 12 },
        scenes: []
      }
      writeFileSync(profilePath, JSON.stringify(saved), 'utf-8')

      const profile = await loadProfile()
      expect(profile.id).toBe('test-id')
      expect(profile.name).toBe('Test Profile')
      // Merged with defaults
      expect(profile.sampling.columns).toBe(20)
      expect(profile.sampling.fps).toBeDefined() // from default
    })

    it('returns default profile on malformed JSON', async () => {
      writeFileSync(profilePath, 'not json{{{', 'utf-8')
      const profile = await loadProfile()
      expect(profile).toBeDefined()
      expect(profile.sampling).toBeDefined()
    })
  })

  describe('saveProfile', () => {
    it('saves profile to disk and returns it', async () => {
      const profile = {
        id: 'save-test',
        name: 'Save Test',
        activeSceneId: 's1',
        performanceMode: 'balanced' as const,
        sampling: { columns: 16, rows: 9, fps: 30, smoothing: 0.3, brightnessLimit: 1, saturationBoost: 1.2, usePerformanceGuard: true, showGap: false },
        scenes: []
      }

      const result = await saveProfile(profile)
      expect(result).toEqual(profile)

      const raw = readFileSync(profilePath, 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed.id).toBe('save-test')
      expect(parsed.name).toBe('Save Test')
    })

    it('creates config directory if it does not exist', async () => {
      rmSync(configDir, { recursive: true, force: true })

      const profile = {
        id: 'dir-test',
        name: 'Dir Test',
        activeSceneId: 's1',
        performanceMode: 'balanced' as const,
        sampling: { columns: 16, rows: 9, fps: 30, smoothing: 0.3, brightnessLimit: 1, saturationBoost: 1.2, usePerformanceGuard: true, showGap: false },
        scenes: []
      }

      await saveProfile(profile)
      const raw = readFileSync(profilePath, 'utf-8')
      expect(JSON.parse(raw).id).toBe('dir-test')
    })
  })

  describe('named profiles (saveProfileAs, listProfiles, loadProfileById, deleteProfile)', () => {
    const testProfile = {
      id: 'named-1',
      name: 'Named Profile 1',
      activeSceneId: 's1',
      performanceMode: 'balanced' as const,
      sampling: { columns: 16, rows: 9, fps: 30, smoothing: 0.3, brightnessLimit: 1, saturationBoost: 1.2, usePerformanceGuard: true, showGap: false },
      scenes: []
    }

    it('saveProfileAs creates a named profile file', async () => {
      const meta = await saveProfileAs(testProfile)
      expect(meta.id).toBe('named-1')
      expect(meta.name).toBe('Named Profile 1')
      expect(meta.savedAt).toBeDefined()

      const raw = readFileSync(join(profilesDir, 'named-1.json'), 'utf-8')
      const parsed = JSON.parse(raw)
      expect(parsed.id).toBe('named-1')
      expect(parsed._savedAt).toBe(meta.savedAt)
    })

    it('listProfiles returns all saved profiles sorted by savedAt', async () => {
      await saveProfileAs({ ...testProfile, id: 'p1', name: 'First' })
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10))
      await saveProfileAs({ ...testProfile, id: 'p2', name: 'Second' })

      const list = await listProfiles()
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('p1')
      expect(list[1].id).toBe('p2')
    })

    it('listProfiles returns empty array when no profiles exist', async () => {
      rmSync(profilesDir, { recursive: true, force: true })
      const list = await listProfiles()
      expect(list).toEqual([])
    })

    it('loadProfileById returns the correct profile', async () => {
      await saveProfileAs(testProfile)
      const loaded = await loadProfileById('named-1')
      expect(loaded).not.toBeNull()
      expect(loaded!.id).toBe('named-1')
      expect(loaded!.name).toBe('Named Profile 1')
    })

    it('loadProfileById returns null for non-existent id', async () => {
      const loaded = await loadProfileById('non-existent')
      expect(loaded).toBeNull()
    })

    it('deleteProfile removes the profile file', async () => {
      await saveProfileAs(testProfile)
      await deleteProfile('named-1')
      const loaded = await loadProfileById('named-1')
      expect(loaded).toBeNull()
    })

    it('deleteProfile does not throw for non-existent id', async () => {
      await expect(deleteProfile('non-existent')).resolves.toBeUndefined()
    })
  })
})
