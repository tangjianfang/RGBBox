// @vitest-environment happy-dom
// R307: the AGENT tab's AI8 model list recovers — a failed template fetch
// parks a real 重试 button beside the picker; clicking it (and only then)
// refetches. Separate file so the module-level cache box starts EMPTY (the
// sibling suite's always-resolving mock would pre-fill it).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { AiLabAgentTab } from '../../../src/renderer/src/components/AiLabAgentTab'
import { setupRendererMocks } from '../_helpers'

const getChatTemplate = vi.fn()

vi.mock('../../../src/shared/ai8Client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/shared/ai8Client')>()
  return {
    ...actual,
    Ai8Client: class {
      async getChatTemplate() { return getChatTemplate() }
    },
  }
})

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.aiGetProfiles = vi.fn().mockResolvedValue({
    profiles: [
      { id: 'p2', name: 'AI8', baseUrl: 'ai8://chat', apiKey: '', model: 'openai_chat::gpt-5.4' },
    ],
    activeId: 'p2',
  })
  rgbbox.agentSessionsList = vi.fn().mockResolvedValue([])
  rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([])
  rgbbox.agentPickWorkspace = vi.fn().mockResolvedValue('C:\\tmp\\ws')
  rgbbox.agentSend = vi.fn().mockResolvedValue({ ok: true, sessionId: 's-1' })
  rgbbox.agentCancel = vi.fn().mockResolvedValue({ ok: true })
  getChatTemplate.mockRejectedValueOnce(new Error('network down'))
})
afterEach(() => cleanup())

describe('AiLabAgentTab AI8 model retry (R307)', () => {
  it('failure → error placeholder + retry button; manual retry refetches and fills the picker', async () => {
    getChatTemplate.mockResolvedValueOnce({
      models: [
        { label: 'GPT-5.4', value: 'openai_chat::gpt-5.4', attr: { modelType: 'chat', providerKey: 'openai' } },
      ],
    })
    const { container } = render(<AiLabAgentTab />)
    // first fetch failed → the error placeholder + the retry button appear
    const retryBtn = await waitFor(() => {
      const b = container.querySelector('[data-action="agent-ai8-models-retry"]') as HTMLButtonElement
      expect(b).toBeTruthy()
      return b
    })
    expect(container.textContent).toContain('ai8ModelsError')
    expect(getChatTemplate).toHaveBeenCalledTimes(1)
    // manual retry → second fetch succeeds → picker fills, button disappears
    await act(async () => { fireEvent.click(retryBtn) })
    await waitFor(() => {
      expect(container.querySelector('[data-action="agent-ai8-models-retry"]')).toBeNull()
    })
    expect(getChatTemplate).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('GPT-5.4')
  })
})
