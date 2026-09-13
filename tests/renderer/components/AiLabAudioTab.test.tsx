// @vitest-environment happy-dom
// The streaming pipeline itself is covered by tests/main/audio/audioAiService
// (9 cases against mocked ONNX sessions); here we assert the tab's state→UI
// mapping only, mocking the capture hook (happy-dom has no media stack, and
// full App-level integration tests are skipped in this repo).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

const streamState = { running: false, error: null as string | null, vadProb: null as number | null, astTop: null as Array<{ index: number; score: number }> | null }
vi.mock('../../../src/renderer/src/hooks/useAiAudioStream', () => ({
  useAiAudioStream: () => streamState,
}))

import { AiLabAudioTab } from '../../../src/renderer/src/components/AiLabAudioTab'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  cleanup()
  streamState.running = false
  streamState.error = null
  streamState.vadProb = null
  streamState.astTop = null
})

describe('AiLabAudioTab state→UI mapping (R90.8)', () => {
  it('idle: shows hints and both source options; no live results', () => {
    const rgbbox = setupRendererMocks()
    expect(rgbbox).toBeDefined()
    const { container } = render(<AiLabAudioTab />)
    expect(container.textContent).toContain('ai.lab.audio.vad.hint')
    expect(container.textContent).toContain('ai.lab.audio.ast.hint')
    expect(container.querySelectorAll('.ai-source-row input[type="radio"]').length).toBe(2)
    expect(container.querySelector('[data-field="vad-result"]')).toBeNull()
  })

  it('running with results: renders VAD probability bar and AST top-5 labels', () => {
    streamState.running = true
    streamState.vadProb = 0.97
    streamState.astTop = [
      { index: 0, score: 0.5 }, { index: 66, score: 0.2 }, { index: 137, score: 0.1 },
      { index: 315, score: 0.05 }, { index: 493, score: 0.03 },
    ]
    const { container } = render(<AiLabAudioTab />)
    expect(container.textContent).toContain('ai.lab.audio.liveOn')
    const bar = container.querySelector('[data-field="vad-result"] .ai-prob-bar span') as HTMLElement
    expect(bar.style.width).toBe('97%')
    expect(container.querySelector('[data-field="vad-result"]')?.textContent).toContain('ai.lab.audio.vad.speech')
    const rows = container.querySelectorAll('[data-field="ast-result"] .ai-ast-row')
    expect(rows.length).toBe(5)
    expect(rows[0].textContent).toContain('Speech')
  })

  it('low probability renders the quiet label; errors render the error line', () => {
    streamState.running = true
    streamState.vadProb = 0.1
    streamState.error = 'source-unavailable'
    const { container } = render(<AiLabAudioTab />)
    expect(container.querySelector('[data-field="vad-result"]')?.textContent).toContain('ai.lab.audio.vad.quiet')
    expect(container.querySelector('.ai-hint-line')?.textContent).toBe('source-unavailable')
  })

  it('picking a source radio flips the checked state', () => {
    const { container } = render(<AiLabAudioTab />)
    const radios = container.querySelectorAll('.ai-source-row input[type="radio"]')
    fireEvent.click(radios[0])
    expect((radios[0] as HTMLInputElement).checked).toBe(true)
  })
})
