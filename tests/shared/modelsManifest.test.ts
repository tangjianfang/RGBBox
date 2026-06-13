import { describe, it, expect } from 'vitest'
import { MODELS_MANIFEST, type ModelManifestEntry } from '../../src/shared/modelsManifest'

describe('shared/modelsManifest', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(MODELS_MANIFEST)).toBe(true)
    expect(MODELS_MANIFEST.length).toBeGreaterThan(0)
  })

  it('every entry has unique name, file, and url', () => {
    const names = MODELS_MANIFEST.map((m) => m.name)
    const files = MODELS_MANIFEST.map((m) => m.file)
    const urls = MODELS_MANIFEST.map((m) => m.url)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(files).size).toBe(files.length)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('every entry has valid required fields', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.name).toBeTruthy()
      expect(m.file).toBeTruthy()
      expect(m.url).toBeTruthy()
      expect(m.name.length).toBeGreaterThan(0)
      expect(m.file.length).toBeGreaterThan(0)
      expect(m.url.length).toBeGreaterThan(0)
    }
  })

  it('every file ends with .splat', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.file.endsWith('.splat'), `${m.file} should end with .splat`).toBe(true)
    }
  })

  it('every url uses https://', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.url.startsWith('https://'), `${m.url} should be https`).toBe(true)
    }
  })

  it('url filename matches the file field', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.url.endsWith(m.file), `${m.url} should end with ${m.file}`).toBe(true)
    }
  })

  it('every entry has a description', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.description).toBeDefined()
      expect(m.description!.length).toBeGreaterThan(0)
    }
  })

  it('name is the file stem (without extension)', () => {
    for (const m of MODELS_MANIFEST) {
      const expectedStem = m.file.replace(/\.splat$/, '')
      expect(m.name).toBe(expectedStem)
    }
  })

  it('ledMapFile (when present) ends with .json and matches the name', () => {
    for (const m of MODELS_MANIFEST) {
      if (m.ledMapFile) {
        expect(m.ledMapFile.endsWith('.json'), `${m.ledMapFile} should end with .json`).toBe(true)
        const expectedPrefix = m.file.replace(/\.splat$/, '')
        expect(m.ledMapFile.startsWith(expectedPrefix), `${m.ledMapFile} should start with ${expectedPrefix}`).toBe(true)
      }
    }
  })

  it('contains the expected demo scenes (train, garden, bicycle)', () => {
    const names = MODELS_MANIFEST.map((m) => m.name)
    expect(names).toContain('train')
    expect(names).toContain('garden')
    expect(names).toContain('bicycle')
  })

  it('contains the expected RGB hardware models (keyboard_rgb, mouse_rgb)', () => {
    const names = MODELS_MANIFEST.map((m) => m.name)
    expect(names).toContain('keyboard_rgb')
    expect(names).toContain('mouse_rgb')
  })

  it('exposes the ModelManifestEntry type shape correctly', () => {
    const sample: ModelManifestEntry = MODELS_MANIFEST[0]
    // Verify the object satisfies the interface (compile-time check)
    const _check: ModelManifestEntry = sample
    expect(_check).toBeDefined()
  })

  it('demo scenes do not have ledMapFile (only hardware models do)', () => {
    const demos = ['train', 'garden', 'bicycle']
    for (const demo of demos) {
      const entry = MODELS_MANIFEST.find((m) => m.name === demo)
      expect(entry).toBeDefined()
      expect(entry!.ledMapFile, `${demo} should not have ledMapFile`).toBeUndefined()
    }
  })
})
