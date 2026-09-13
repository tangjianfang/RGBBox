// @vitest-environment happy-dom
// R90.9: the pipeline itself is covered at L1 (tools/pcm tests), L2 tools are
// injected via startPcmSource (mocked here), and the ONNX service has its own
// 9-case suite. This file asserts the single-card pipeline UI's state mapping.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'

const streamState = {
  stage: 'idle' as 'idle' | 'capturing' | 'inferring' | 'results' | 'error',
  actualRate: null as number | null,
  error: null as string | null,
  level: 0,
  vadProb: null as number | null,
  astTop: null as Array<{ index: number; score: number }> | null,
  astState: null as 'running' | 'waiting-audio' | 'cadence' | null,
  batches: 0,
}
vi.mock('../../../src/renderer/src/hooks/useAiAudioStream', () => ({
  useAiAudioStream: () => streamState,
}))

import { AiLabAudioTab } from '../../../src/renderer/src/components/AiLabAudioTab'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  cleanup()
  streamState.stage = 'idle'
  streamState.actualRate = null
  streamState.error = null
  streamState.level = 0
  streamState.vadProb = null
  streamState.astTop = null
  streamState.astState = null
  streamState.batches = 0
})

describe('AiLabAudioTab pipeline UI (R90.9)', () => {
  it('tone source is the default; intro + stage lamps + self-test render', () => {
    setupRendererMocks()
    const { container } = render(<AiLabAudioTab />)
    expect(container.textContent).toContain('ai.lab.audio.intro')
    const radios = container.querySelectorAll('.ai-source-row input[type="radio"]')
    expect(radios.length).toBe(3)
    expect((radios[0] as HTMLInputElement).checked).toBe(true) // test tone default
    expect(container.textContent).toContain('ai.lab.audio.stage1')
    expect(container.textContent).toContain('ai.lab.audio.stage4')
    expect(container.querySelector('[data-action="self-test"]')).not.toBeNull()
  })

  it('live results: stages light up, VAD bar + AST rows render with real rate display', () => {
    setupRendererMocks()
    streamState.stage = 'results'
    streamState.actualRate = 48000
    streamState.level = 0.42
    streamState.vadProb = 0.13
    streamState.astTop = [
      { index: 0, score: 0.5 }, { index: 66, score: 0.2 }, { index: 137, score: 0.1 },
      { index: 315, score: 0.05 }, { index: 493, score: 0.03 },
    ]
    const { container } = render(<AiLabAudioTab />)
    expect(container.textContent).toContain('ai.lab.audio.stage.results')
    expect(container.textContent).toContain('48k→16k') // resample display
    const bar = container.querySelector('[data-field="vad-result"] .ai-prob-bar span') as HTMLElement
    expect(bar.style.width).toBe('13%')
    expect(container.querySelector('[data-field="vad-result"]')?.textContent).toContain('ai.lab.audio.vad.quiet')
    expect(container.querySelectorAll('[data-field="ast-result"] .ai-ast-row').length).toBe(5)
    expect(container.querySelectorAll('[data-field="ast-result"] .ai-ast-row')[0].textContent).toContain('Speech')
  })

  it('error stage shows the error message inline', () => {
    setupRendererMocks()
    streamState.stage = 'error'
    streamState.error = 'source-unavailable'
    const { container } = render(<AiLabAudioTab />)
    expect(container.textContent).toContain('source-unavailable')
  })

  it('self-test drives the stream IPC with synthetic tone batches and reports ✅/❌', { timeout: 15000 }, async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiStreamFeed.mockImplementation(async (pcm: Float32Array) => ({
      ok: true,
      prob: 0.02,
      rms: pcm.some((v) => v !== 0) ? 0.35 : 0.0,
      astState: 'cadence' as const,
      top: pcm.some((v) => v !== 0) ? [{ index: 102, score: 0.6 }, { index: 1, score: 0.2 }, { index: 2, score: 0.1 }, { index: 3, score: 0.05 }, { index: 4, score: 0.05 }] : undefined,
    }))
    const { container } = render(<AiLabAudioTab />)
    // the button is disabled until the cached-model status resolves — wait for it
    const btn = await waitFor(() => {
      const b = container.querySelector('[data-action="self-test"]') as HTMLButtonElement
      expect(b.disabled).toBe(false)
      return b
    }, { timeout: 3000 })
    fireEvent.click(btn)
    await waitFor(() => {
      const rows = container.querySelectorAll('.ai-selftest-row')
      expect(rows.length).toBe(5)
    }, { timeout: 5000 })
    expect(rgbbox.audioAiStreamStart).toHaveBeenCalled()
    expect(rgbbox.audioAiStreamFeed.mock.calls.length).toBeGreaterThanOrEqual(9) // 3s @300ms
    expect(rgbbox.audioAiStreamStop).toHaveBeenCalled()
    const passFlags = [...container.querySelectorAll('.ai-selftest-row')].map((r) => r.getAttribute('data-pass'))
    expect(passFlags.every((f) => f === 'true')).toBe(true)
  })
})
