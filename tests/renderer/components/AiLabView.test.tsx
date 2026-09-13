// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabView } from '../../../src/renderer/src/components/AiLabView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => { localStorage.clear(); cleanup() })

function mount() {
  const rgbbox = setupRendererMocks()
  rgbbox.aiGetSettings.mockResolvedValue({
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: 'sk-x',
    model: 'glm-5.3',
  })
  return { rgbbox, ...render(<AiLabView />) }
}

describe('AiLabView (R88)', () => {
  it('renders four collapsible groups', async () => {
    const { container, findByDisplayValue } = mount()
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    const summaries = container.querySelectorAll('.dash-group > summary')
    expect(summaries.length).toBe(4)
    const titles = [...summaries].map((s) => s.textContent)
    expect(titles[0]).toContain('ai.lab.group.connection')
    expect(titles[1]).toContain('ai.lab.group.config')
    expect(titles[2]).toContain('ai.lab.group.chat')
    expect(titles[3]).toContain('ai.lab.group.ocr')
  })

  it('loads settings and reverse-matches the provider preset', async () => {
    const { container, findByDisplayValue } = mount()
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    const providerSelect = container.querySelector('select[data-field="provider"]') as HTMLSelectElement
    expect(providerSelect.value).toBe('zhipu')
    const modelInput = container.querySelector('input[data-field="model"]') as HTMLInputElement
    expect(modelInput.value).toBe('glm-5.3')
  })

  it('key input is masked with a toggle and the privacy note is shown', async () => {
    const { container, findByDisplayValue } = mount()
    const keyInput = (await findByDisplayValue('sk-x')) as HTMLInputElement
    expect(keyInput.type).toBe('password')
    expect(keyInput.autocomplete).toBe('new-password')
    expect(container.textContent).toContain('ai.privacyNote')
    fireEvent.click(container.querySelector('[data-action="toggle-key"]') as HTMLElement)
    expect(keyInput.type).toBe('text')
  })

  it('picking a provider preset fills baseUrl + first model', async () => {
    const { container, findByDisplayValue } = mount()
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    fireEvent.change(container.querySelector('select[data-field="provider"]') as HTMLSelectElement, {
      target: { value: 'deepseek' },
    })
    expect((container.querySelector('input[data-field="baseUrl"]') as HTMLInputElement).value).toBe('https://api.deepseek.com')
    expect((container.querySelector('input[data-field="model"]') as HTMLInputElement).value).toBe('deepseek-v4-pro')
  })

  it('save persists and auto-runs the connection test', async () => {
    const { rgbbox, container, findByDisplayValue } = mount()
    rgbbox.aiSetSettings.mockResolvedValue({ baseUrl: 'b', apiKey: 'k', model: 'm' })
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    fireEvent.click(container.querySelector('[data-action="save"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSetSettings).toHaveBeenCalled())
    await waitFor(() => expect(rgbbox.aiTestConnection).toHaveBeenCalled())
  })

  it('chat: sends a turn, appends user+assistant with latency, clear wipes', async () => {
    const { rgbbox, container, findByDisplayValue } = mount()
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    const input = container.querySelector('textarea[data-field="chat-input"]') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '你好' } })
    fireEvent.click(container.querySelector('[data-action="send"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiChat).toHaveBeenCalled())
    expect((rgbbox.aiChat.mock.calls[0] as unknown[])[0]).toEqual(
      expect.arrayContaining([{ role: 'user', content: '你好' }])
    )
    await waitFor(() => expect(container.querySelectorAll('.ai-msg').length).toBe(2))
    expect(container.querySelector('.ai-msg-assistant')?.textContent).toMatch(/\(\d+\s*ms\)/)
    fireEvent.click(container.querySelector('[data-action="clear-chat"]') as HTMLElement)
    expect(container.querySelectorAll('.ai-msg').length).toBe(0)
  })

  it('ocr playground: cleanup + translate call the existing IPCs', async () => {
    const { rgbbox, container, findByDisplayValue } = mount()
    rgbbox.aiCleanupText.mockResolvedValue({ ok: true, text: 'cleaned' })
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    const input = container.querySelector('textarea[data-field="ocr-input"]') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'raw text' } })
    fireEvent.click(container.querySelector('[data-action="ocr-cleanup"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiCleanupText).toHaveBeenCalledWith('raw text'))
    await waitFor(() => expect(container.querySelector('.ai-ocr-result')?.textContent).toContain('cleaned'))
  })

  it('shows a nokey hint line when the stored key is empty', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.aiGetSettings.mockResolvedValue({ baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-5.3' })
    const { container, findByDisplayValue } = render(<AiLabView />)
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    expect(container.textContent).toContain('nokey')
  })

  it('no nokey hint for keyless local endpoints (Ollama), and keyUnreadable warns', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.aiGetSettings.mockResolvedValue({ baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'qwen3.6:35b' })
    const { container, findByDisplayValue } = render(<AiLabView />)
    await findByDisplayValue('http://localhost:11434/v1')
    expect(container.querySelector('.ai-hint-line')).toBeNull()

    const rgbbox2 = setupRendererMocks()
    rgbbox2.aiGetSettings.mockResolvedValue({ baseUrl: 'https://x.example/v1', apiKey: '', model: 'm', keyUnreadable: true })
    const second = render(<AiLabView />)
    await second.findByDisplayValue('https://x.example/v1')
    expect(second.container.textContent).toContain('ai.lab.keyUnreadable')
    cleanup()
  })

  it('R88 review fix: error turns are not replayed into subsequent aiChat payloads', async () => {
    const { rgbbox, container, findByDisplayValue } = mount()
    await findByDisplayValue('https://open.bigmodel.cn/api/paas/v4')
    const input = container.querySelector('textarea[data-field="chat-input"]') as HTMLTextAreaElement
    const send = () => fireEvent.click(container.querySelector('[data-action="send"]') as HTMLElement)

    // first turn fails (network) → error turn appended
    rgbbox.aiChat.mockResolvedValueOnce({ ok: false, text: '', hint: 'network', latencyMs: 5 })
    fireEvent.change(input, { target: { value: 'a' } })
    send()
    await waitFor(() => expect(container.querySelectorAll('.ai-msg-error').length).toBe(1))

    // second turn succeeds → payload must NOT contain the failed empty assistant turn
    fireEvent.change(input, { target: { value: 'b' } })
    send()
    await waitFor(() => expect(rgbbox.aiChat).toHaveBeenCalledTimes(2))
    const secondPayload = (rgbbox.aiChat.mock.calls[1] as unknown[])[0] as Array<{ role: string; content: string }>
    expect(secondPayload.filter((m) => m.role === 'assistant')).toHaveLength(0) // error turn excluded
    expect(secondPayload.map((m) => m.content)).toEqual(['a', 'b'])
  })
})
