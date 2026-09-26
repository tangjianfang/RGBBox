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

function loadHistoryDirect(): string[] {
  try { return JSON.parse(localStorage.getItem('rgbbox:agentInputHistory') ?? '[]') as string[] } catch { return [] }
}

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

  it('R174.9: prefs persist across remount; discontinued model gets marked', async () => {
    localStorage.setItem('rgbbox:agentPrefs', JSON.stringify({ profileId: 'p1', workspace: 'C:\kept\ws', mode: 'plan', ai8Model: 'anthropic_chat::claude-4.6', disabledModels: [] }))
    // profileId from prefs must survive when it exists in the list
    const first = render(<AiLabAgentTab />)
    await waitFor(() => expect((first.container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).toBe('C:\kept\ws'))
    await waitFor(() => expect((first.container.querySelector('select[data-field="agent-mode"]') as HTMLSelectElement).value).toBe('plan'))
    first.unmount()

    // failure carrying 停用 marks the model locally
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.agentSend = vi.fn().mockResolvedValue({ ok: false, sessionId: '', error: 'ai8: network — 当前对话选择的模型已停用，请重新选择' })
    const second = render(<AiLabAgentTab />)
    // async profile load must settle first (one-time init sets p1 from prefs)
    await waitFor(() => expect((second.container.querySelector('select[data-field="agent-profile"]') as HTMLSelectElement).value).toBe('p1'))
    fireEvent.change(second.container.querySelector('select[data-field="agent-profile"]')!, { target: { value: 'p2' } })
    // pick workspace FIRST (its re-render replaces nodes captured earlier)
    fireEvent.click(second.container.querySelector('[data-action="agent-pick"]')!)
    await waitFor(() => expect((second.container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).not.toBe(''))
    const modelSel = await waitFor(() => {
      const el = second.container.querySelector('select[data-field="agent-ai8-model"]') as HTMLSelectElement
      expect(el).not.toBeNull()
      return el
    })
    await waitFor(() => expect(modelSel.options.length).toBeGreaterThan(1))
    fireEvent.change(modelSel, { target: { value: 'anthropic_chat::claude-4.6' } })
    fireEvent.change(second.container.querySelector('textarea[data-field="agent-input"]')!, { target: { value: 'go' } })
    fireEvent.click(second.container.querySelector('[data-action="agent-send"]')!)
    await waitFor(() => {
      const prefs = JSON.parse(localStorage.getItem('rgbbox:agentPrefs')!) as { disabledModels?: string[] }
      expect(prefs.disabledModels).toContain('anthropic_chat::claude-4.6')
    })
    // the option is disabled in the picker
    const opt = [...(second.container.querySelector('select[data-field="agent-ai8-model"]') as HTMLSelectElement).options]
      .find((o) => o.value === 'anthropic_chat::claude-4.6') as HTMLOptionElement
    expect(opt.disabled).toBe(true)
    second.unmount()
    localStorage.removeItem('rgbbox:agentPrefs')
  })

  it('R175: streaming deltas accumulate into one bubble; history cache recalls with ↑', async () => {
    let subscriber: ((ev: unknown) => void) | undefined
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.onAgentEvent = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { subscriber = cb; return () => undefined })
    rgbbox.agentSend = vi.fn().mockResolvedValue({ ok: true, sessionId: 's-2' })
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.aiGetProfiles).toHaveBeenCalled())

    // pick workspace + type
    fireEvent.click(container.querySelector('[data-action="agent-pick"]')!)
    await waitFor(() => expect((container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).not.toBe(''))
    const area = container.querySelector('textarea[data-field="agent-input"]') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'prompt one' } })
    fireEvent.click(container.querySelector('[data-action="agent-send"]')!)

    // streamed deltas accumulate into a SINGLE streaming bubble
    subscriber?.({ kind: 'text-delta', text: 'Hel' })
    subscriber?.({ kind: 'text-delta', text: 'lo w' })
    await waitFor(() => expect(container.querySelectorAll('.agent-msg-assistant').length).toBe(1))
    subscriber?.({ kind: 'text', text: 'Hello world' })
    await waitFor(() => expect(container.querySelector('.agent-msg-assistant')?.textContent).toContain('Hello world'))

    // send finished → prompt cached
    await waitFor(() => expect(loadHistoryDirect().includes('prompt one')).toBe(true))

    // second prompt via ↑ recall: empty input + ArrowUp at caret 0 → last prompt
    const area2 = container.querySelector('textarea[data-field="agent-input"]') as HTMLTextAreaElement
    fireEvent.keyDown(area2, { key: 'ArrowUp', selectionStart: 0 })
    expect(area2.value).toBe('prompt one')
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

  it('R183: restoring a session marks it active and surfaces the stored error end-state', async () => {
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([
      { id: 's-bad', title: '跑一下测试', updatedAt: 2, events: 5 },
    ])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([
      { kind: 'session-meta', sessionId: 's-bad', model: 'glm-5.3', workspace: 'C:\\tmp\\ws' },
      { kind: 'user', text: '跑一下测试' },
      { kind: 'text', text: '我来运行测试。' },
      { kind: 'tool-start', call: { id: 't1', name: 'bash', args: '{"command":"yarn test"}', result: '', status: 'running' } },
      { kind: 'tool-result', call: { id: 't1', name: 'bash', args: '{"command":"yarn test"}', result: 'Error: exit 1', status: 'error' } },
      { kind: 'done', reason: 'error', error: '模型响应解析失败' },
    ])
    const { container } = render(<AiLabAgentTab />)
    const btn = await waitFor(() => {
      const el = container.querySelector('[data-action="agent-load"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    expect(btn.className).not.toContain('active')
    fireEvent.click(btn)
    await waitFor(() => expect(rgbbox.agentSessionLoad).toHaveBeenCalledWith('s-bad'))
    // selected session is highlighted in the sidebar
    await waitFor(() => expect((container.querySelector('[data-action="agent-load"]') as HTMLButtonElement).className).toContain('active'))
    // transcript restored + the run's FAILURE is visible as a banner, not silence
    await waitFor(() => expect(container.querySelectorAll('.agent-tool').length).toBe(1))
    await waitFor(() => expect(container.querySelector('.agent-error-banner')).not.toBeNull())
    expect(container.querySelector('.agent-error-banner')?.textContent).toContain('模型响应解析失败')
  })

  it('R184: long tool results fold past 12 lines; toggle expands; duration badge renders', async () => {
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    const longResult = Array.from({ length: 30 }, (_, i) => `line-${i + 1}`).join('\n')
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([{ id: 's-fold', title: '长输出', updatedAt: 3, events: 4 }])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([
      { kind: 'session-meta', sessionId: 's-fold', model: 'glm-5.3', workspace: 'C:\\tmp\\ws' },
      { kind: 'user', text: '读大文件' },
      { kind: 'tool-start', call: { id: 't1', name: 'read', args: '{"path":"big.txt"}', result: '', status: 'running' }, ts: 1000 },
      { kind: 'tool-result', call: { id: 't1', name: 'read', args: '{"path":"big.txt"}', result: longResult, status: 'done' }, ts: 2500 },
      { kind: 'done', reason: 'completed' },
    ])
    const { container } = render(<AiLabAgentTab />)
    const btn = await waitFor(() => {
      const el = container.querySelector('[data-action="agent-load"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(btn)
    await waitFor(() => expect(rgbbox.agentSessionLoad).toHaveBeenCalledWith('s-fold'))
    // folded by default: only the first 12 lines render + the fold toggle
    // (i18n mock returns the key as-is, so the {n} count is asserted via the
    // rendered line window instead)
    await waitFor(() => expect(container.querySelector('.agent-tool-fold')).not.toBeNull())
    expect(container.querySelector('.agent-tool-fold')?.textContent).toContain('ai.agent.expandLines')
    const pre = container.querySelector('.agent-tool-result') as HTMLPreElement
    expect(pre.textContent).toContain('line-12')
    expect(pre.textContent).not.toContain('line-13')
    // duration badge from JSONL ts delta (2500-1000 = 1.5s)
    expect(container.querySelector('.agent-tool-duration')?.textContent).toBe('1.5s')
    // expand → all lines; collapse → back to the fold window
    fireEvent.click(container.querySelector('.agent-tool-fold')!)
    expect((container.querySelector('.agent-tool-result') as HTMLPreElement).textContent).toContain('line-30')
    expect(container.querySelector('.agent-tool-fold')?.textContent).toContain('ai.agent.collapse')
    fireEvent.click(container.querySelector('.agent-tool-fold')!)
    expect((container.querySelector('.agent-tool-result') as HTMLPreElement).textContent).not.toContain('line-13')
  })

  it('R191: auto-restores the last session on mount; meta line carries events count', async () => {
    localStorage.setItem('rgbbox:agentPrefs', JSON.stringify({ lastSessionId: 's-last' }))
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([
      { id: 's-last', title: '上次会话', updatedAt: Date.now() - 120_000, events: 7 },
    ])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([{ kind: 'user', text: '上次的问题' }])
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.agentSessionLoad).toHaveBeenCalledWith('s-last'))
    await waitFor(() => expect(container.querySelector('.agent-msg-user')?.textContent).toBe('上次的问题'))
    // meta: relative time (2 min ago) + event count
    await waitFor(() => expect(container.querySelector('.agent-session-meta')?.textContent).toContain('7'))
    localStorage.removeItem('rgbbox:agentPrefs')
  })

  it('R191: new-session resets the workbench; rename and delete hit the lifecycle IPC', async () => {
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([
      { id: 's-a', title: '会话甲', updatedAt: Date.now(), events: 3 },
    ])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([{ kind: 'user', text: '甲的内容' }])
    const { container } = render(<AiLabAgentTab />)
    const loadBtn = await waitFor(() => {
      const el = container.querySelector('[data-action="agent-load"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(loadBtn)
    await waitFor(() => expect(rgbbox.agentSessionLoad).toHaveBeenCalledWith('s-a'))
    await waitFor(() => expect(container.querySelector('.agent-msg-user')).not.toBeNull())

    // rename flow: pencil → inline input → Enter
    fireEvent.click(container.querySelector('[data-action="agent-rename"]')!)
    const input = await waitFor(() => {
      const el = container.querySelector('input[data-field="agent-rename"]') as HTMLInputElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(rgbbox.agentSessionRename).toHaveBeenCalledWith('s-a', '新名字'))

    // delete flow (confirm stubbed — happy-dom has no native confirm)
    const confirmMock = vi.fn().mockReturnValue(true)
    window.confirm = confirmMock as unknown as typeof window.confirm
    fireEvent.click(container.querySelector('[data-action="agent-delete"]')!)
    await waitFor(() => expect(rgbbox.agentSessionDelete).toHaveBeenCalledWith('s-a'))
    // deleting the OPEN conversation resets to the empty state
    await waitFor(() => expect(container.querySelector('[data-field="agent-empty"]')).not.toBeNull())
    expect(confirmMock).toHaveBeenCalled()

    // new-session button lands on the empty state too and clears the pref
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([{ kind: 'user', text: 'again' }])
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([{ id: 's-b', title: '乙', updatedAt: Date.now(), events: 1 }])
    fireEvent.click(container.querySelector('[data-action="agent-load"]')!)
    await waitFor(() => expect(container.querySelector('.agent-msg-user')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-action="agent-new"]')!)
    await waitFor(() => expect(container.querySelector('[data-field="agent-empty"]')).not.toBeNull())
    expect(JSON.parse(localStorage.getItem('rgbbox:agentPrefs')!).lastSessionId).toBeUndefined()
  })

  it('R191: while running, load/new/rename are disabled (no stream cross-contamination)', async () => {
    let subscriber: ((ev: unknown) => void) | undefined
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([{ id: 's-x', title: 'X', updatedAt: Date.now(), events: 1 }])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([])
    rgbbox.agentSend = vi.fn().mockResolvedValue({ ok: true, sessionId: 's-run' })
    rgbbox.onAgentEvent = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { subscriber = cb; return () => undefined })
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.aiGetProfiles).toHaveBeenCalled())
    // workspace + prompt → send puts the workbench into the running state
    fireEvent.click(container.querySelector('[data-action="agent-pick"]')!)
    await waitFor(() => expect((container.querySelector('input[data-field="agent-workspace"]') as HTMLInputElement).value).not.toBe(''))
    fireEvent.change(container.querySelector('textarea[data-field="agent-input"]')!, { target: { value: 'go' } })
    fireEvent.click(container.querySelector('[data-action="agent-send"]')!)
    subscriber?.({ kind: 'session-meta', sessionId: 's-run', model: 'm' })
    await waitFor(() => expect((container.querySelector('[data-action="agent-new"]') as HTMLButtonElement).disabled).toBe(true))
    expect((container.querySelector('[data-action="agent-load"]') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('[data-action="agent-rename"]') as HTMLButtonElement).disabled).toBe(true)
    // the running session is remembered as the last session
    await waitFor(() => expect(JSON.parse(localStorage.getItem('rgbbox:agentPrefs')!).lastSessionId).toBe('s-run'))
    localStorage.removeItem('rgbbox:agentPrefs')
  })

  it('R184: run end closes the streaming bubble (no caret on a dead run); approval card restores', async () => {
    let subscriber: ((ev: unknown) => void) | undefined
    const rgbbox = window.rgbbox as unknown as Record<string, ReturnType<typeof vi.fn>>
    rgbbox.onAgentEvent = vi.fn().mockImplementation((cb: (ev: unknown) => void) => { subscriber = cb; return () => undefined })
    const { container } = render(<AiLabAgentTab />)
    await waitFor(() => expect(rgbbox.aiGetProfiles).toHaveBeenCalled())
    subscriber?.({ kind: 'user', text: 'go' })
    subscriber?.({ kind: 'text-delta', text: 'partial answer…' })
    await waitFor(() => expect(container.querySelector('.agent-streaming')).not.toBeNull())
    // error end: bubble closes, banner shows, no streaming element remains
    subscriber?.({ kind: 'done', reason: 'error', error: 'boom' })
    await waitFor(() => expect(container.querySelector('.agent-streaming')).toBeNull())
    await waitFor(() => expect(container.querySelector('.agent-error-banner')).not.toBeNull())
    expect(container.querySelector('.agent-msg-assistant')?.textContent).toContain('partial answer')

    // approval card restoration (resolved, with unified diff labels)
    rgbbox.agentSessionsList = vi.fn().mockResolvedValue([{ id: 's-ap', title: '审批会话', updatedAt: 4, events: 3 }])
    rgbbox.agentSessionLoad = vi.fn().mockResolvedValue([
      { kind: 'user', text: '改文件' },
      { kind: 'approval', approval: { id: 'ap1', kind: 'edit', summary: 'edit a.txt', before: 'old', after: 'new' } },
      { kind: 'done', reason: 'completed' },
    ])
    const second = render(<AiLabAgentTab />)
    const loadBtn = await waitFor(() => {
      const el = second.container.querySelector('[data-action="agent-load"]') as HTMLButtonElement
      expect(el).toBeTruthy()
      return el
    })
    fireEvent.click(loadBtn)
    await waitFor(() => expect(second.container.querySelector('.agent-approval.resolved')).not.toBeNull())
    expect(second.container.querySelectorAll('.agent-diff-label').length).toBe(2)
    expect(second.container.querySelector('.agent-diff-label.before')?.textContent).toContain('Before')
    expect(second.container.querySelector('.agent-diff.before')).not.toBeNull()
    expect(second.container.querySelector('.agent-diff.after')).not.toBeNull()
    second.unmount()
  })
})
