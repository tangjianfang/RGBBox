import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODELS_MANIFEST } from '../../src/shared/modelsManifest'

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
    expect(onnx.length).toBe(2)
    for (const m of splats) {
      expect(m.file.endsWith('.splat')).toBe(true)
      expect(m.file.startsWith(`${m.name}.`)).toBe(true)
    }
    for (const m of onnx) expect(m.file.endsWith('.onnx')).toBe(true)
    expect(splats.map((m) => m.name)).toEqual(
      expect.arrayContaining(['keyboard_rgb', 'mouse_rgb', 'train', 'garden', 'bicycle'])
    )
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

  it('audioset labels asset has 527 contiguous classes', () => {
    const p = join(__dirname, '../../src/renderer/src/assets/audioset-labels.json')
    const labels: Array<{ index: number; label: string }> = JSON.parse(readFileSync(p, 'utf-8'))
    expect(labels.length).toBe(527)
    expect(labels.every((l, i) => l.index === i && typeof l.label === 'string' && l.label !== '')).toBe(true)
    expect(labels[0].label).toBe('Speech')
  })
})
