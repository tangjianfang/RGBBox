// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabAudioTab } from '../../../src/renderer/src/components/AiLabAudioTab'
import { setupRendererMocks } from '../_helpers'

const startAudioRecorder = vi.fn()
vi.mock('../../../src/renderer/src/tools/audioRecorder', () => ({
  startAudioRecorder: (...a: unknown[]) => startAudioRecorder(...a),
}))

beforeEach(() => {
  cleanup()
  startAudioRecorder.mockReset()
})

describe('AiLabAudioTab (R90 P1)', () => {
  it('renders VAD and AST cards with model-cached status', async () => {
    setupRendererMocks()
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => expect(container.textContent).toContain('ai.lab.audio.title.vad'))
    expect(container.textContent).toContain('ai.lab.audio.title.ast')
    // both ready → record buttons enabled
    await waitFor(() => {
      const buttons = [...container.querySelectorAll('[data-action^="record-"]')] as HTMLButtonElement[]
      expect(buttons.length).toBe(2)
      expect(buttons.every((b) => !b.disabled)).toBe(true)
    })
  })

  it('not-downloaded state shows a download button calling modelDownload', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiStatus.mockResolvedValue({ sileroCached: false, astCached: false })
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => {
      const dl = [...container.querySelectorAll('[data-action^="download-"]')] as HTMLButtonElement[]
      expect(dl.length).toBe(2)
    })
    fireEvent.click(container.querySelector('[data-action="download-silero_vad"]') as HTMLElement)
    expect(rgbbox.modelDownload).toHaveBeenCalledWith('silero_vad')
    // not cached → no record button at all (download gate)
    expect(container.querySelector('[data-action="record-vad"]')).toBeNull()
  })

  it('VAD card: recording 3s runs inference and renders the probability', async () => {
    const rgbbox = setupRendererMocks()
    const stop = vi.fn().mockResolvedValue(new Float32Array(16000 * 3))
    startAudioRecorder.mockResolvedValue({ stop })
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => {
      const b = container.querySelector('[data-action="record-vad"]') as HTMLButtonElement
      expect(b.disabled).toBe(false)
    })
    fireEvent.click(container.querySelector('[data-action="record-vad"]') as HTMLElement)
    await waitFor(() => expect(startAudioRecorder).toHaveBeenCalled())
    await waitFor(() => expect(rgbbox.audioAiRunVad).toHaveBeenCalled())
    const sent = (rgbbox.audioAiRunVad.mock.calls[0] as unknown[])[0] as Float32Array
    expect(sent.length).toBe(16000 * 3)
    await waitFor(() => expect(container.querySelector('[data-field="vad-result"]')?.textContent).toContain('97'))
    expect(stop).toHaveBeenCalled()
  })

  it('AST card: renders top-5 labels from the labels asset', async () => {
    setupRendererMocks()
    startAudioRecorder.mockResolvedValue({ stop: vi.fn().mockResolvedValue(new Float32Array(16000 * 3)) })
    const { container } = render(<AiLabAudioTab />)
    const record = () => container.querySelector('[data-action="record-ast"]') as HTMLButtonElement
    await waitFor(() => expect(record().disabled).toBe(false))
    fireEvent.click(record())
    await waitFor(() => {
      const items = container.querySelectorAll('[data-field="ast-result"] .ai-ast-row')
      expect(items.length).toBe(5)
      expect(items[0].textContent).toContain('Speech')
    })
  })

  it('inference failure with not-downloaded hint flips the card back to download state', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiRunVad.mockResolvedValue({ ok: false, hint: 'not-downloaded' })
    startAudioRecorder.mockResolvedValue({ stop: vi.fn().mockResolvedValue(new Float32Array(16000 * 3)) })
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => {
      const b = container.querySelector('[data-action="record-vad"]') as HTMLButtonElement
      expect(b.disabled).toBe(false)
    })
    fireEvent.click(container.querySelector('[data-action="record-vad"]') as HTMLElement)
    await waitFor(() => expect(container.textContent).toContain('ai.lab.audio.needModel'))
  })
})
