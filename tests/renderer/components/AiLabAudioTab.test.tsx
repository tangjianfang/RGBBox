// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabAudioTab } from '../../../src/renderer/src/components/AiLabAudioTab'
import { setupRendererMocks } from '../_helpers'

const startAudioRecorder = vi.fn()
vi.mock('../../../src/renderer/src/tools/audioRecorder', () => ({
  startAudioRecorder: (...a: unknown[]) => startAudioRecorder(...a),
}))

/** Recorder mock whose done resolves with `samples` after `delayMs`. */
function mockRecorder(samples = 16000 * 3, delayMs = 0): void {
  startAudioRecorder.mockResolvedValue({
    stop: vi.fn().mockResolvedValue(new Float32Array(samples)),
    done: new Promise<Float32Array>((resolve) => {
      setTimeout(() => resolve(new Float32Array(samples)), delayMs)
    }),
  })
}

beforeEach(() => {
  cleanup()
  startAudioRecorder.mockReset()
})

describe('AiLabAudioTab (R90 P1, review-fixed)', () => {
  it('renders VAD and AST cards with model-cached status', async () => {
    setupRendererMocks()
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => expect(container.textContent).toContain('ai.lab.audio.title.vad'))
    expect(container.textContent).toContain('ai.lab.audio.title.ast')
    await waitFor(() => {
      const buttons = [...container.querySelectorAll('[data-action^="record-"]')] as HTMLButtonElement[]
      expect(buttons.length).toBe(2)
      expect(buttons.every((b) => !b.disabled)).toBe(true)
    })
  })

  it('not-downloaded state shows a download button calling modelDownload; no record button', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiStatus.mockResolvedValue({ sileroCached: false, astCached: false })
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => {
      const dl = [...container.querySelectorAll('[data-action^="download-"]')] as HTMLButtonElement[]
      expect(dl.length).toBe(2)
    })
    fireEvent.click(container.querySelector('[data-action="download-silero_vad"]') as HTMLElement)
    expect(rgbbox.modelDownload).toHaveBeenCalledWith('silero_vad')
    expect(container.querySelector('[data-action="record-vad"]')).toBeNull()
  })

  it('R90 review fix: real download-progress push events flip the card to ready', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiStatus.mockResolvedValue({ sileroCached: false, astCached: false })
    let push: ((p: { name: string; percent: number; done: boolean; error?: string }) => void) | null = null
    rgbbox.onModelDownloadProgress.mockImplementation((cb: (p: never) => void) => {
      push = cb as typeof push
      return () => undefined
    })
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => expect(container.querySelector('[data-action="download-silero_vad"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-action="download-silero_vad"]') as HTMLElement)
    push?.({ name: 'silero_vad', percent: 12, done: false })
    await waitFor(() => expect(container.textContent).toContain('12%'))
    push?.({ name: 'silero_vad', percent: 88, done: false })
    await waitFor(() => expect(container.textContent).toContain('88%'))
    push?.({ name: 'silero_vad', percent: 100, done: true })
    await waitFor(() => expect(container.querySelector('[data-action="record-vad"]')).not.toBeNull())
  })

  it('VAD card: awaits the recorder auto-stop (done), sends full pcm, renders probability', async () => {
    const rgbbox = setupRendererMocks()
    mockRecorder(16000 * 3)
    const { container } = render(<AiLabAudioTab />)
    await waitFor(() => {
      const b = container.querySelector('[data-action="record-vad"]') as HTMLButtonElement
      expect(b.disabled).toBe(false)
    })
    fireEvent.click(container.querySelector('[data-action="record-vad"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.audioAiRunVad).toHaveBeenCalled())
    const sent = (rgbbox.audioAiRunVad.mock.calls[0] as unknown[])[0] as Float32Array
    expect(sent.length).toBe(16000 * 3)
    await waitFor(() => expect(container.querySelector('[data-field="vad-result"]')?.textContent).toContain('97'))
  })

  it('AST card: renders top-5 labels from the labels asset', async () => {
    setupRendererMocks()
    mockRecorder(16000 * 3)
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

  it('inference vs not-downloaded failures render DIFFERENT messages (R90 review fix)', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.audioAiRunVad.mockResolvedValue({ ok: false, hint: 'inference' })
    mockRecorder()
    const { container } = render(<AiLabAudioTab />)
    const record = () => container.querySelector('[data-action="record-vad"]') as HTMLButtonElement
    await waitFor(() => expect(record().disabled).toBe(false))
    fireEvent.click(record())
    await waitFor(() => expect(container.textContent).toContain('ai.lab.audio.errorInference'))

    const rgbbox2 = setupRendererMocks()
    rgbbox2.audioAiRunVad.mockResolvedValue({ ok: false, hint: 'not-downloaded' })
    mockRecorder()
    const second = render(<AiLabAudioTab />)
    const record2 = () => second.container.querySelector('[data-action="record-vad"]') as HTMLButtonElement
    await waitFor(() => expect(record2().disabled).toBe(false))
    fireEvent.click(record2())
    await waitFor(() => expect(second.container.textContent).toContain('ai.lab.audio.needModel'))
    expect(second.container.textContent).not.toContain('ai.lab.audio.errorInference')
    cleanup()
  })
})
