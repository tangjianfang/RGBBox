// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabVoiceTab } from '../../../src/renderer/src/components/AiLabVoiceTab'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  localStorage.clear()
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({
    complete: false,
    kokoroInstalled: true,
    bundledVoices: ['af_heart'],
    files: [
      { path: 'config.json', bytes: 5120, present: true },
      { path: 'onnx/model_q4.onnx', bytes: 305_000_000, present: false },
    ],
  })
  rgbbox.ttsModelDownload = vi.fn().mockResolvedValue({ ok: true })
  rgbbox.onTtsModelProgress = vi.fn().mockReturnValue(() => undefined)
  rgbbox.ttsSynthesize = vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' })
  rgbbox.ttsExport = vi.fn().mockResolvedValue({ ok: false, error: 'model-not-ready' })
  cleanup()
})

describe('AiLabVoiceTab (R173-S1)', () => {
  it('mounts with the text area, engine select and lexicon editor', async () => {
    const { container } = render(<AiLabVoiceTab />)
    expect(container.querySelector('textarea[data-field="vs-text"]')).not.toBeNull()
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    expect(engine.value).toBe('system')
    // model incomplete → kokoro option disabled + dependency panel visible
    const kokoro = [...engine.options].find((o) => o.value === 'kokoro') as HTMLOptionElement
    expect(kokoro.disabled).toBe(true)
    await waitFor(() => {
      const panel = container.querySelector('[data-field="vs-models"]')
      expect(panel).not.toBeNull()
      expect(panel!.querySelectorAll('li').length).toBe(2)
      expect(panel!.textContent).toContain('onnx/model_q4.onnx')
    })
    expect(container.querySelector('input[data-field="vs-word"]')).not.toBeNull()
  })

  it('R179: download button invokes ttsModelDownload and shows per-file progress', async () => {
    let progress: ((ev: unknown) => void) | undefined
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.onTtsModelProgress = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { progress = cb; return () => undefined })
    const { container } = render(<AiLabVoiceTab />)
    const btn = await waitFor(() => {
      const el = container.querySelector('[data-action="vs-model-download"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(btn)
    expect(rgbbox.ttsModelDownload).toHaveBeenCalledTimes(1)
    progress?.({ path: 'onnx/model_q4.onnx', receivedBytes: 100_000_000, totalBytes: 305_000_000, done: false })
    await waitFor(() => expect(container.textContent).toContain('33%'))
  })

  it('typing text splits into a clickable sentence preview', () => {
    const { container } = render(<AiLabVoiceTab />)
    const area = container.querySelector('textarea[data-field="vs-text"]') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: '第一句。Second sentence?' } })
    const list = container.querySelectorAll('.vs-sentence-list li')
    expect(list.length).toBe(2)
  })

  it('lexicon add → persists to localStorage; delete removes', () => {
    const { container } = render(<AiLabVoiceTab />)
    fireEvent.change(container.querySelector('input[data-field="vs-word"]')!, { target: { value: 'read' } })
    fireEvent.change(container.querySelector('input[data-field="vs-respell"]')!, { target: { value: 'reed' } })
    fireEvent.click(container.querySelector('[data-action="vs-add"]')!)
    expect(JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!)).toEqual([{ word: 'read', respell: 'reed' }])
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(1)
    fireEvent.click(container.querySelector('[data-action="vs-del"]')!)
    expect(container.querySelectorAll('.vs-lexicon-list li').length).toBe(0)
    expect(JSON.parse(localStorage.getItem('rgbbox:voiceLexicon')!)).toEqual([])
  })
})
