// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabAgentTab } from '../../../src/renderer/src/components/AiLabAgentTab'
import { setupRendererMocks } from '../_helpers'

// R174.6: the public chat template fetch — stubbed (no network in tests)
vi.mock('../../../src/shared/ai8Client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/shared/ai8Client')>()
  return {
    ...actual,
    Ai8Client: class {
      async getChatTemplate() {
        return {
          models: [
            { label: 'GPT-5.4', value: 'openai_chat::gpt-5.4', attr: { modelType: 'chat', providerKey: 'openai' } },
            { label: 'GPT-5.4 Mini', value: 'openai_chat::gpt-5.4-mini', attr: { modelType: 'chat', providerKey: 'openai' } },
            { label: 'Claude 4.6', value: 'anthropic_chat::claude-4.6', attr: { modelType: 'chat', providerKey: 'anthropic' } },
          ],
        }
      }
    },
  }
})

beforeEach(() => {
  const rgbbox = setupRendererMocks() as unknown as Record<string, unknown>
  rgbbox.aiGetProfiles = vi.fn().mockResolvedValue({
    profiles: [
      { id: 'p1', name: 'Zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-5.3' },
      { id: 'p2', name: 'AI8', baseUrl: 'ai8://chat', apiKey: '', model: 'openai_chat::gpt-5.4' },
    ],
    activeId: 'p1',
  })
  rgbbox.agentSessionsList = vi.fn().mockResolvedValue([])
  rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([])
  rgbbox.agentPickWorkspace = vi.fn().mockResolvedValue('C:\\tmp\\ws')
  rgbbox.agentSend = vi.fn().mockResolvedValue({ ok: true, sessionId: 's-1' })
  rgbbox.agentCancel = vi.fn().mockResolvedValue({ ok: true })
  rgbbox.agentApprovalRespond = vi.fn().mockResolvedValue({ ok: true })
  rgbbox.onAgentEvent = vi.fn().mockReturnValue(() => undefined)
  cleanup()
})

describe('AiLabAgentTab (R172-S2)', () => {
  it('mounts the workbench: profile select, workspace picker, mode select', async () => {
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect((container.querySelector('select[data-field="agent-profile"]') as HTMLSelectElement).value).toBe('p1'))
    // ai8 profile carries the experimental suffix
    const options = [...(container.querySelector('select[data-field="agent-profile"]') as HTMLSelectElement).options]
    expect(options[1].textContent).toContain('experimental')
    expect(container.querySelector('select[data-field="agent-mode"]')).not.toBeNull()
    expect(container.querySelector('[data-action="agent-pick"]')).not.toBeNull()
  })

  it('picking a workspace enables send; send posts agentSend with the config', async () => {
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(container.querySelector('select[data-field="agent-profile"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-action="agent-pick"]')!)
    await waitFor(() => expect((container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).toBe('C:\\tmp\\ws'))
    const area = container.querySelector('textarea[data-field="agent-input"]') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'create a readme' } })
    const sendBtn = container.querySelector('[data-action="agent-send"]') as HTMLButtonElement
    expect(sendBtn.disabled).toBe(false)
    fireEvent.click(sendBtn)
    await waitFor(() => expect(vi.mocked((window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>).agentSend)).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'create a readme', profileId: 'p1', workspace: 'C:\\tmp\\ws', mode: 'standard' }),
    ))
  })

  it('R174.6: no ai8 profile + stored token → auto-creates one', async () => {
    localStorage.setItem('rgbbox:ai8Token', 'tk-xyz')
    const rgbbox = setupRendererMocks() as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.aiGetProfiles = vi.fn().mockResolvedValue({
      profiles: [{ id: 'p1', name: 'Zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKey: '', model: 'glm-5.3' }],
      activeId: 'p1',
    })
    rgbbox.aiSaveProfile = vi.fn().mockResolvedValue({ id: 'p9', name: 'AI8', baseUrl: 'ai8://chat', apiKey: 'tk-xyz', model: 'openai_chat::gpt-5.4' })
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([])
    rgbbox.agentPickWorkspace = vi.fn().mockResolvedValue(null)
    rgbbox.onAgentEvent = vi.fn().mockReturnValue(() => undefined)
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'ai8://chat', apiKey: 'tk-xyz' })))
    const options = [...(container.querySelector('select[data-field="agent-profile"]') as HTMLSelectElement).options]
    expect(options.some((o) => o.value === 'p9')).toBe(true)
    localStorage.removeItem('rgbbox:ai8Token')
  })

  it('R174.6: selecting the ai8 profile shows the grouped model picker and sends modelOverride', async () => {
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect((container.querySelector('select[data-field="agent-profile"]') as HTMLSelectElement).value).toBe('p1'))
    // ai8 picker hidden on a non-ai8 profile
    expect(container.querySelector('select[data-field="agent-ai8-model"]')).toBeNull()
    fireEvent.change(container.querySelector('select[data-field="agent-profile"]')!, { target: { value: 'p2' } })
    const modelSel = await waitFor(() => {
      const el = container.querySelector('select[data-field="agent-ai8-model"]') as HTMLSelectElement
      expect(el).not.toBeNull()
      return el
    })
    await waitFor(() => expect(modelSel.options.length).toBeGreaterThan(1))
    expect([...modelSel.options].some((o) => o.value === 'anthropic_chat::claude-4.6')).toBe(true)
    fireEvent.change(modelSel, { target: { value: 'anthropic_chat::claude-4.6' } })
    // pick workspace + send
    fireEvent.click(container.querySelector('[data-action="agent-pick"]')!)
    await waitFor(() => expect((container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).not.toBe(''))
    fireEvent.change(container.querySelector('textarea[data-field="agent-input"]')!, { target: { value: 'go' } })
    fireEvent.click(container.querySelector('[data-action="agent-send"]')!)
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    await waitFor(() => expect(rgbbox.agentSend).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'p2', modelOverride: 'anthropic_chat::claude-4.6' })))
  })

  it('renders a streamed tool call and approval bar from events', async () => {
    let subscriber: ((ev: unknown) => void) | undefined
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.onAgentEvent = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { subscriber = cb; return () => undefined })
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.aiGetProfiles).toHaveBeenCalled())

    subscriber?.({ kind: 'user', text: 'do it' })
    subscriber?.({ kind: 'session-meta', sessionId: 's-9', model: 'glm-5.3' })
    subscriber?.({ kind: 'tool-start', call: { id: 'c1', name: 'write', args: '{"path":"a.txt"}', result: '', status: 'running' } })
    subscriber?.({ kind: 'approval', approval: { id: 'ap1', kind: 'write', summary: 'write a.txt (3 bytes)', path: 'a.txt', after: 'hi\n' } })

    await waitFor(() => expect(container.querySelector('.agent-approval-bar')).not.toBeNull())
    expect(container.querySelectorAll('.agent-tool').length).toBe(1)
    expect(container.querySelector('.agent-msg-user')?.textContent).toBe('do it')

    fireEvent.click(container.querySelector('[data-action="agent-deny"]')!)
    await waitFor(() => expect(rgbbox.agentApprovalRespond).toHaveBeenCalledWith('ap1', 'deny'))
    expect(container.querySelector('.agent-approval-bar')).toBeNull()

    subscriber?.({ kind: 'tool-result', call: { id: 'c1', name: 'write', args: '{"path":"a.txt"}', result: 'DENIED by user', status: 'denied' } })
    subscriber?.({ kind: 'text', text: 'user denied; nothing written' })
    subscriber?.({ kind: 'done', reason: 'completed' })
    await waitFor(() => expect(container.querySelector('.agent-msg-assistant')?.textContent).toContain('denied'))
    expect(container.querySelector('.agent-tool .status-denied, .agent-tool.status-denied')).not.toBeNull()
  })
})
