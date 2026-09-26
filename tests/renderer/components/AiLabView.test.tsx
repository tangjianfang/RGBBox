// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AiLabView } from '../../../src/renderer/src/components/AiLabView'
import { setupRendererMocks } from '../_helpers'

beforeEach(() => { localStorage.clear(); cleanup() })

function mount() {
  const rgbbox = setupRendererMocks()
  return { rgbbox, ...render(<AiLabView />) }
}

async function openTab(container: HTMLElement, tab: 'config' | 'chat' | 'ocr') {
  const btn = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === tab) as HTMLElement
  fireEvent.click(btn)
  await waitFor(() => expect(btn.classList.contains('active')).toBe(true))
  return btn
}

describe('AiLabView (R89)', () => {
  it('renders nine tabs (config/chat/ocr/audio/vision/svg/voice/agent/ai8) and switches between them', { timeout: 15000 }, async () => {
    const { container } = mount()
    const tabs = container.querySelectorAll('.ai-tab')
    expect(tabs.length).toBe(9)
    const audioTab = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === 'audio') as HTMLElement
    fireEvent.click(audioTab)
    await waitFor(() => expect(audioTab.classList.contains('active')).toBe(true))
    expect(container.querySelector('.ai-audio')).not.toBeNull()
    // R144: the vision capability bench mounts its own tab content
    const visionTab = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === 'vision') as HTMLElement
    fireEvent.click(visionTab)
    await waitFor(() => expect(visionTab.classList.contains('active')).toBe(true))
    expect(container.querySelector('.ai-vision-lab')).not.toBeNull()
    // R153: board cards (div) + collapsed rows (tr) both carry data-cap
    expect(container.querySelectorAll('[data-cap]').length).toBe(24)
    // R171: the SVG animation tab mounts the pelican scene
    const svgTab = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === 'svg') as HTMLElement
    fireEvent.click(svgTab)
    await waitFor(() => expect(svgTab.classList.contains('active')).toBe(true))
    expect(container.querySelector('.ai-svg-scene')).not.toBeNull()
    // R173: the VoiceScribe tab mounts the reader
    const voiceTab = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === 'voice') as HTMLElement
    fireEvent.click(voiceTab)
    await waitFor(() => expect(voiceTab.classList.contains('active')).toBe(true))
    expect(container.querySelector('.vs-tab')).not.toBeNull()
    // R172: the agent workbench mounts
    const agentTab = [...container.querySelectorAll('.ai-tab')].find((b) => b.getAttribute('data-tab') === 'agent') as HTMLElement
    fireEvent.click(agentTab)
    await waitFor(() => expect(agentTab.classList.contains('active')).toBe(true))
    expect(container.querySelector('.agent-tab')).not.toBeNull()
  })

  it('renders the legacy three core tabs and switches between them', async () => {
    const { container } = mount()
    const tabs = container.querySelectorAll('.ai-tab')
    expect(tabs.length).toBe(9)
    expect(tabs[0].classList.contains('active')).toBe(true) // config default
    await openTab(container, 'chat')
    expect(container.querySelector('textarea[data-field="chat-input"]')).not.toBeNull()
    await openTab(container, 'ocr')
    expect(container.querySelector('textarea[data-field="ocr-input"]')).not.toBeNull()
    await openTab(container, 'config')
    expect(container.querySelector('select[data-field="provider"]')).not.toBeNull()
  })

  it('config tab: profile dropdown lists profiles, editor loads the active one', async () => {
    const { container } = mount()
    await waitFor(() => expect((container.querySelector('select[data-field="profile"]') as HTMLSelectElement).value).toBe('p1'))
    expect((container.querySelector('input[data-field="baseUrl"]') as HTMLInputElement).value).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect((container.querySelector('input[data-field="model"]') as HTMLInputElement).value).toBe('glm-5.3')
    expect((container.querySelector('input[data-field="apiKey"]') as HTMLInputElement).value).toBe('sk-x')
    expect((container.querySelector('select[data-field="provider"]') as HTMLSelectElement).value).toBe('zhipu')
  })

  it('key input is masked with a toggle and the privacy note is shown', async () => {
    const { container } = mount()
    await waitFor(() => expect(container.querySelector('input[data-field="apiKey"]')).not.toBeNull())
    const keyInput = container.querySelector('input[data-field="apiKey"]') as HTMLInputElement
    expect(keyInput.type).toBe('password')
    expect(keyInput.autocomplete).toBe('new-password')
    expect(container.textContent).toContain('ai.privacyNote')
    fireEvent.click(container.querySelector('[data-action="toggle-key"]') as HTMLElement)
    expect(keyInput.type).toBe('text')
  })

  it('picking a provider preset fills baseUrl + first model', async () => {
    const { container } = mount()
    await waitFor(() => expect((container.querySelector('select[data-field="provider"]') as HTMLSelectElement).value).toBe('zhipu'))
    fireEvent.change(container.querySelector('select[data-field="provider"]') as HTMLSelectElement, {
      target: { value: 'deepseek' },
    })
    expect((container.querySelector('input[data-field="baseUrl"]') as HTMLInputElement).value).toBe('https://api.deepseek.com')
    expect((container.querySelector('input[data-field="model"]') as HTMLInputElement).value).toBe('deepseek-v4-pro')
  })

  it('test button calls aiTestConnection WITH the edited profile (no save/switch needed)', async () => {
    const { rgbbox, container } = mount()
    await waitFor(() => expect(container.querySelector('[data-action="test"]')).not.toBeNull())
    fireEvent.change(container.querySelector('input[data-field="model"]') as HTMLInputElement, { target: { value: 'glm-5.3-flash' } })
    fireEvent.click(container.querySelector('[data-action="test"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiTestConnection).toHaveBeenCalled())
    expect((rgbbox.aiTestConnection.mock.calls[0] as unknown[])[0]).toEqual({
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'sk-x',
      model: 'glm-5.3-flash',
    })
    await waitFor(() => expect(container.querySelector('.ai-status')?.textContent).toContain('ms'))
  })

  it('save persists the profile; “use this profile” activates it', async () => {
    const { rgbbox, container } = mount()
    await waitFor(() => expect(container.querySelector('[data-action="save"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-action="save"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    expect(((rgbbox.aiSaveProfile.mock.calls[0] as unknown[])[0] as { id: string }).id).toBe('p1')
    fireEvent.click(container.querySelector('[data-action="set-active"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSetActiveProfile).toHaveBeenCalledWith('p1'))
  })

  it('switching profiles auto-saves the edited one, then loads the target', async () => {
    const { rgbbox, container } = mount()
    await waitFor(() => expect((container.querySelector('select[data-field="profile"]') as HTMLSelectElement).value).toBe('p1'))
    fireEvent.change(container.querySelector('input[data-field="name"]') as HTMLInputElement, { target: { value: '我的主力' } })
    fireEvent.change(container.querySelector('select[data-field="profile"]') as HTMLSelectElement, { target: { value: 'p2' } })
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    expect(((rgbbox.aiSaveProfile.mock.calls[0] as unknown[])[0] as { name: string }).name).toBe('我的主力')
    await waitFor(() => expect((container.querySelector('input[data-field="model"]') as HTMLInputElement).value).toBe('deepseek-v4-pro'))
  })

  it('new profile creates one and switches the editor to it', async () => {
    const { rgbbox, container } = mount()
    await waitFor(() => expect(container.querySelector('[data-action="new-profile"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-action="new-profile"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    // the first call is the auto-save of the previously edited profile; the
    // creation call is the one with an empty id + fresh zhipu defaults
    const calls = (rgbbox.aiSaveProfile.mock.calls as unknown[]).map((c) => c[0] as { id: string; baseUrl: string })
    expect(calls.some((c) => c.id === '' && c.baseUrl === 'https://open.bigmodel.cn/api/paas/v4')).toBe(true)
  })

  it('chat tab: active banner + send/clear roundtrip + error turns excluded from replay', async () => {
    const { rgbbox, container } = mount()
    await openTab(container, 'chat')
    expect(container.querySelector('.ai-active-banner')?.textContent).toContain('智谱 GLM · glm-5.3')
    const input = container.querySelector('textarea[data-field="chat-input"]') as HTMLTextAreaElement
    const send = () => fireEvent.click(container.querySelector('[data-action="send"]') as HTMLElement)

    rgbbox.aiChat.mockResolvedValueOnce({ ok: false, text: '', hint: 'network', latencyMs: 5 })
    fireEvent.change(input, { target: { value: 'a' } })
    send()
    await waitFor(() => expect(container.querySelectorAll('.ai-msg-error').length).toBe(1))

    fireEvent.change(input, { target: { value: 'b' } })
    send()
    await waitFor(() => expect(rgbbox.aiChat).toHaveBeenCalledTimes(2))
    const secondPayload = (rgbbox.aiChat.mock.calls[1] as unknown[])[0] as Array<{ role: string; content: string }>
    expect(secondPayload.filter((m) => m.role === 'assistant')).toHaveLength(0)
    expect(secondPayload.map((m) => m.content)).toEqual(['a', 'b'])
    await waitFor(() => {
      // error turns share .ai-msg-assistant — the SUCCESS turn is the last one
      const turns = [...container.querySelectorAll('.ai-msg-assistant')]
      expect(turns[turns.length - 1]?.textContent).toMatch(/\(\d+\s*ms\)/)
    })

    fireEvent.click(container.querySelector('[data-action="clear-chat"]') as HTMLElement)
    expect(container.querySelectorAll('.ai-msg').length).toBe(0)
  })

  it('chat tab: switching the banner profile activates it globally', async () => {
    const { rgbbox, container } = mount()
    await openTab(container, 'chat')
    fireEvent.change(container.querySelector('.ai-active-banner select') as HTMLSelectElement, { target: { value: 'p2' } })
    await waitFor(() => expect(rgbbox.aiSetActiveProfile).toHaveBeenCalledWith('p2'))
  })

  it('ocr tab: cleanup + translate call the existing IPCs', async () => {
    const { rgbbox, container } = mount()
    await openTab(container, 'ocr')
    rgbbox.aiCleanupText.mockResolvedValue({ ok: true, text: 'cleaned' })
    const input = container.querySelector('textarea[data-field="ocr-input"]') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'raw text' } })
    fireEvent.click(container.querySelector('[data-action="ocr-cleanup"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiCleanupText).toHaveBeenCalledWith('raw text'))
    await waitFor(() => expect(container.querySelector('.ai-ocr-result')?.textContent).toContain('cleaned'))
  })

  it('chat tab: nokey hint only for keyless REMOTE profiles', async () => {
    const rgbbox = setupRendererMocks()
    rgbbox.aiGetProfiles.mockResolvedValue({
      profiles: [{ id: 'p1', name: 'Local · ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'qwen3.6:35b' }],
      activeId: 'p1', unreadableIds: [], encryptionAvailable: true,
    })
    const { container } = render(<AiLabView />)
    await openTab(container, 'chat')
    expect(container.querySelector('.ai-hint-line')).toBeNull() // local endpoint → no nokey nag

    const rgbbox2 = setupRendererMocks()
    rgbbox2.aiGetProfiles.mockResolvedValue({
      profiles: [{ id: 'p1', name: 'X · m', baseUrl: 'https://x.example/v1', apiKey: '', model: 'm' }],
      activeId: 'p1', unreadableIds: ['p1'], encryptionAvailable: true,
    })
    const second = render(<AiLabView />)
    await openTab(second.container, 'config')
    await waitFor(() => expect(second.container.textContent).toContain('ai.lab.keyUnreadable'))
    cleanup()
  })

  it('R89 review fix: unmounting the view (nav rail switch) commits pending edits', async () => {
    const rgbbox = setupRendererMocks()
    const { container, unmount } = render(<AiLabView />)
    await waitFor(() => expect(container.querySelector('input[data-field="apiKey"]')).not.toBeNull())
    fireEvent.change(container.querySelector('input[data-field="apiKey"]') as HTMLInputElement, {
      target: { value: 'sk-brand-new' },
    })
    unmount()
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    expect(((rgbbox.aiSaveProfile.mock.calls[0] as unknown[])[0] as { apiKey: string }).apiKey).toBe('sk-brand-new')
  })

  it('R89 review fix: a draft with an empty baseUrl is NOT auto-saved (main would rewrite it to zhipu)', async () => {
    const rgbbox = setupRendererMocks()
    const { container } = render(<AiLabView />)
    await waitFor(() => expect((container.querySelector('select[data-field="provider"]') as HTMLSelectElement).value).toBe('zhipu'))
    fireEvent.change(container.querySelector('select[data-field="provider"]') as HTMLSelectElement, { target: { value: 'custom' } })
    fireEvent.change(container.querySelector('input[data-field="model"]') as HTMLInputElement, { target: { value: 'my-model' } })
    await openTab(container, 'chat') // tab switch triggers the auto-save path
    await openTab(container, 'config')
    expect(rgbbox.aiSaveProfile).not.toHaveBeenCalled()
    // and the test button is disabled while baseUrl is blank
    expect((container.querySelector('[data-action="test"]') as HTMLButtonElement).disabled).toBe(true)
  })
})

// ── R145: AWS Bedrock provider form ────────────────────────────────────────
describe('AiLabView AWS Bedrock form (R145)', () => {
  async function toBedrock(container: HTMLElement): Promise<void> {
    await waitFor(() => expect((container.querySelector('select[data-field="provider"]') as HTMLSelectElement).value).toBe('zhipu'))
    fireEvent.change(container.querySelector('select[data-field="provider"]') as HTMLSelectElement, { target: { value: 'bedrock' } })
  }

  it('swaps the Bearer key row for region/AK/SK/STS and locks the pseudo-protocol baseUrl', async () => {
    const { container } = mount()
    await toBedrock(container)
    expect((container.querySelector('[data-field="baseUrl"]') as HTMLInputElement).value).toBe('bedrock://openai')
    expect((container.querySelector('[data-field="baseUrl"]') as HTMLInputElement).readOnly).toBe(true)
    expect(container.querySelector('[data-field="apiKey"]')).toBeNull()
    expect(container.querySelector('select[data-field="aws-region"]')).not.toBeNull()
    expect((container.querySelector('[data-field="aws-ak"]') as HTMLInputElement).value).toBe('')
    const sk = container.querySelector('[data-field="aws-sk"]') as HTMLInputElement
    expect(sk.type).toBe('password')
    expect(container.querySelector('[data-field="aws-sts"]')).not.toBeNull()
    // eye toggle flips SK visibility
    fireEvent.click(container.querySelector('[data-action="toggle-key"]') as HTMLElement)
    expect((container.querySelector('[data-field="aws-sk"]') as HTMLInputElement).type).toBe('text')
  })

  it('saves with the trimmed aws payload (empty session token dropped)', async () => {
    const { rgbbox, container } = mount()
    await toBedrock(container)
    fireEvent.change(container.querySelector('[data-field="aws-ak"]') as HTMLInputElement, { target: { value: 'AKID123' } })
    fireEvent.change(container.querySelector('[data-field="aws-sk"]') as HTMLInputElement, { target: { value: 'SECRET ' } })
    fireEvent.change(container.querySelector('[data-field="aws-sts"]') as HTMLInputElement, { target: { value: '  ' } })
    fireEvent.click(container.querySelector('[data-action="save"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    const arg = rgbbox.aiSaveProfile.mock.calls[0][0] as { aws?: { region: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string } }
    expect(arg.aws).toEqual({ region: 'us-east-1', accessKeyId: 'AKID123', secretAccessKey: 'SECRET' })
    expect(arg.baseUrl).toBe('bedrock://openai')
  })

  it('test button gates on the secret being filled; explicit test carries aws', async () => {
    const { rgbbox, container } = mount()
    await toBedrock(container)
    const testBtn = () => container.querySelector('[data-action="test"]') as HTMLButtonElement
    expect(testBtn().disabled).toBe(true)
    fireEvent.change(container.querySelector('[data-field="aws-sk"]') as HTMLInputElement, { target: { value: 'SECRET' } })
    expect(testBtn().disabled).toBe(false)
    fireEvent.click(testBtn())
    await waitFor(() => expect(rgbbox.aiTestConnection).toHaveBeenCalled())
    const arg = rgbbox.aiTestConnection.mock.calls[0][0] as { aws?: { secretAccessKey: string } }
    expect(arg.aws?.secretAccessKey).toBe('SECRET')
  })

  it('switching away from bedrock drops the aws payload from saves', async () => {
    const { rgbbox, container } = mount()
    await toBedrock(container)
    fireEvent.change(container.querySelector('[data-field="aws-sk"]') as HTMLInputElement, { target: { value: 'SECRET' } })
    fireEvent.change(container.querySelector('select[data-field="provider"]') as HTMLSelectElement, { target: { value: 'openai' } })
    expect(container.querySelector('[data-field="apiKey"]')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-action="save"]') as HTMLElement)
    await waitFor(() => expect(rgbbox.aiSaveProfile).toHaveBeenCalled())
    const arg = rgbbox.aiSaveProfile.mock.calls[0][0] as { aws?: unknown }
    expect(arg.aws).toBeUndefined()
  })
})
