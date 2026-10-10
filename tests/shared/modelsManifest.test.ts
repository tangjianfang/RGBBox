import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODELS_MANIFEST, isCacheSizeOk } from '../../src/shared/modelsManifest'

describe('MODELS_MANIFEST invariants (restored, R90 review fix)', () => {
  it('names/files/urls are unique across all entries', () => {
    const names = MODELS_MANIFEST.map((m) => m.name)
    const files = MODELS_MANIFEST.map((m) => m.file)
    const urls = MODELS_MANIFEST.map((m) => m.url)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(files).size).toBe(files.length)
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('every entry has https url + non-empty description + valid kind', () => {
    for (const m of MODELS_MANIFEST) {
      expect(m.url).toMatch(/^https:\/\//)
      expect(m.description).toBeTruthy()
      expect(['splat', 'onnx']).toContain(m.kind)
      expect(m.file).toContain('.')
    }
  })

  it('splat entries keep .splat + name-is-stem; onnx entries keep .onnx', () => {
    const splats = MODELS_MANIFEST.filter((m) => m.kind === 'splat')
    const onnx = MODELS_MANIFEST.filter((m) => m.kind === 'onnx')
    expect(splats.length).toBe(5)
    // 2 (R90 audio AI) + 2 (R91.3b DTLN denoise) + 1 (R93 anime super-resolution)
    expect(onnx.length).toBe(5)
    for (const m of splats) {
      expect(m.file.endsWith('.splat')).toBe(true)
      expect(m.file.startsWith(`${m.name}.`)).toBe(true)
    }
    for (const m of onnx) expect(m.file.endsWith('.onnx')).toBe(true)
    expect(splats.map((m) => m.name)).toEqual(
      expect.arrayContaining(['keyboard_rgb', 'mouse_rgb', 'train', 'garden', 'bicycle'])
    )
  })

  it('R93 super-resolution entry: hf-mirror source, verified size within the ≤100MB budget', () => {
    const sr = MODELS_MANIFEST.find((m) => m.name === 'realesr_animevideov3')!
    expect(sr).toBeDefined()
    expect(sr.kind).toBe('onnx')
    expect(sr.file).toBe('realesr_animevideov3_x4.onnx')
    // hf-mirror mirror (GitHub direct times out from the main process — same
    // constraint as every onnx entry since R90)
    expect(sr.url).toContain('hf-mirror.com/skillsafe-ai/realesr-animevideov3')
    // byte size pinned from the verified download (sha256 match, 2026-09-30)
    expect(sr.bytes).toBe(2492908)
    expect(sr.bytes!).toBeLessThanOrEqual(100 * 1024 * 1024)
  })

  it('audio entries use the verified int8 sources within the ≤100MB budget (R90.2)', () => {
    const ast = MODELS_MANIFEST.find((m) => m.name === 'ast_audioset')!
    const silero = MODELS_MANIFEST.find((m) => m.name === 'silero_vad')!
    // R90 review follow-up: GitHub direct connections time out in the Electron
    // main process (no system proxy) — ALL audio models are served via hf-mirror.
    expect(silero.url).toContain('hf-mirror.com/onnx-community/silero-vad')
    expect(ast.url).toContain('hf-mirror.com/onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX')
    expect(ast.url).toContain('model_int8.onnx') // int8 ≈ 90.6MB ≤ 100MB budget
  })

  it('audioset labels asset has 527 contiguous classes with zh translations', () => {
    const p = join(__dirname, '../../src/renderer/src/assets/audioset-labels.json')
    const labels: Array<{ index: number; label: string; labelZh: string }> = JSON.parse(readFileSync(p, 'utf-8'))
    expect(labels.length).toBe(527)
    expect(labels.every((l, i) => l.index === i && typeof l.label === 'string' && l.label !== '')).toBe(true)
    expect(labels[0].label).toBe('Speech')
    // R90.9: every class has a non-empty Chinese label (1:1)
    expect(labels.every((l) => typeof l.labelZh === 'string' && l.labelZh !== '')).toBe(true)
    expect(labels[0].labelZh).toBe('语音')
    expect(labels[140].labelZh).toBe('吉他')
  })
})

describe('R279 W3: splat cache-size validation (±10%, R90.9 pattern)', () => {
  it('Mip-NeRF 360 splat entries pin their canonical upstream bytes', () => {
    // Sizes pinned from the canonical public source (cakewalk/splat-data via
    // hf-mirror X-Linked-Size, probed 2026-10-11) — the manifest URL's own
    // release (models-v1) is 404, so the upstream demos' bytes are the pin.
    const byName = new Map(MODELS_MANIFEST.map((m) => [m.name, m]))
    expect(byName.get('train')!.bytes).toBe(32_848_256)
    expect(byName.get('garden')!.bytes).toBe(186_713_088)
    expect(byName.get('bicycle')!.bytes).toBe(196_222_528)
  })

  it('a half-downloaded partial is NOT cached; the complete file is (every pinned entry)', () => {
    const pinned = MODELS_MANIFEST.filter((m) => m.bytes !== undefined)
    expect(pinned.length).toBeGreaterThanOrEqual(8) // 5 onnx + 3 splat
    for (const m of pinned) {
      expect(isCacheSizeOk(Math.floor(m.bytes! / 2), m.bytes!), `${m.file} half-size must fail`).toBe(false)
      expect(isCacheSizeOk(m.bytes!, m.bytes!), `${m.file} full-size must pass`).toBe(true)
    }
  })

  it('the tolerance band matches R90.9 exactly (±10% inclusive, just outside fails)', () => {
    expect(isCacheSizeOk(1_100_000, 1_000_000)).toBe(true) // exactly +10% — pass
    expect(isCacheSizeOk(900_000, 1_000_000)).toBe(true) // exactly -10% — pass
    expect(isCacheSizeOk(1_100_001, 1_000_000)).toBe(false) // just past +10%
    expect(isCacheSizeOk(899_999, 1_000_000)).toBe(false) // just past -10%
    expect(isCacheSizeOk(0, 1_000_000)).toBe(false) // empty/just-created partial
  })
})
