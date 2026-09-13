import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODELS_MANIFEST } from '../../src/shared/modelsManifest'

describe('MODELS_MANIFEST (R90 P1 audio entries)', () => {
  const silero = MODELS_MANIFEST.find((m) => m.name === 'silero_vad')
  const ast = MODELS_MANIFEST.find((m) => m.name === 'ast_audioset')

  it('audio entries exist with https urls and files', () => {
    for (const m of [silero, ast]) {
      expect(m, 'entry missing').toBeDefined()
      expect(m!.file).toMatch(/^[\w.-]+\.onnx$/)
      expect(m!.url).toMatch(/^https:\/\//)
      expect(m!.description).toBeTruthy()
    }
  })

  it('urls are the verified sources (R90.2)', () => {
    expect(silero!.url).toContain('github.com/snakers4/silero-vad')
    expect(ast!.url).toContain('ast-finetuned-audioset-10-10-0.4593-ONNX')
    expect(ast!.url).toContain('model_int8.onnx') // int8 ≈ 90.6MB ≤ 100MB budget
  })

  it('audioset labels asset has 527 contiguous classes', () => {
    const p = join(__dirname, '../../src/renderer/src/assets/audioset-labels.json')
    const labels: Array<{ index: number; label: string }> = JSON.parse(readFileSync(p, 'utf-8'))
    expect(labels.length).toBe(527)
    expect(labels.every((l, i) => l.index === i && typeof l.label === 'string' && l.label !== '')).toBe(true)
    expect(labels[0].label).toBe('Speech')
  })
})
