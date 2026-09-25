// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { AiLabVoiceTab } from '../../../src/renderer/src/components/AiLabVoiceTab'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => {
  localStorage.clear()
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.ttsEngineStatus = vi.fn().mockResolvedValue({ kokoroInstalled: false, modelHint: 'engine-unavailable' })
  rgbbox.ttsSynthesize = vi.fn().mockResolvedValue({ ok: false, error: 'synthesis' })
  rgbbox.ttsExport = vi.fn().mockResolvedValue({ ok: false, error: 'engine-unavailable' })
  cleanup()
})

describe('AiLabVoiceTab (R173-S1)', () => {
  it('mounts with the text area, engine select and lexicon editor', () => {
    const { container } = render(<AiLabVoiceTab />)
    expect(container.querySelector('textarea[data-field="vs-text"]')).not.toBeNull()
    const engine = container.querySelector('select[data-field="vs-engine"]') as HTMLSelectElement
    expect(engine.value).toBe('system')
    // Kokoro not installed → option disabled
    const kokoro = [...engine.options].find((o) => o.value === 'kokoro') as HTMLOptionElement
    expect(kokoro.disabled).toBe(true)
    expect(container.querySelector('input[data-field="vs-word"]')).not.toBeNull()
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
