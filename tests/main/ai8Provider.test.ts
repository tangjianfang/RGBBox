// R118: ai8://chat provider dispatch — tool-session creation (contextCount:0),
// prompt mapping (system→systemPrompt, last user→text), <think> stripping,
// probe via getBalance, and hint taxonomy. fetch is stubbed with real
// Response objects (node 18+ globals) — no network.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ai8ChatCompletion, isAi8Settings, resetAi8ToolSession } from '../../src/main/ai8Provider'

// wraps data in the site's {code, data, msg} envelope — unwrap() rejects bare payloads
const json = (data: unknown) => new Response(JSON.stringify({ code: 0, data, msg: '' }), { status: 200, headers: { 'content-type': 'application/json' } })
const sse = (text: string) => new Response(`data: ${JSON.stringify({ code: 0, data: text })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })

const calls: { method: string; url: string; body?: string }[] = []
const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const u = String(url)
  calls.push({ method: init?.method ?? 'GET', url: u, body: typeof init?.body === 'string' ? init.body : undefined })
  if (u.endsWith('/frequency/balance')) return json({ balance: 1 })
  if (u.endsWith('/api/chat/session')) return json({ id: 909 })
  if (u.endsWith('/chat/completions')) return sse('<think>internal</think>好的')
  return json({})
})
// stub at module level — vitest's restore cycle between tests must not leave
// a window where Ai8Client sees the real global fetch
vi.stubGlobal('fetch', fetchMock)

describe('main/ai8Provider (R118)', () => {
  beforeEach(() => {
    calls.length = 0
    resetAi8ToolSession()
  })

  it('detects the ai8 pseudo-protocol baseUrl', () => {
    expect(isAi8Settings({ baseUrl: 'ai8://chat' })).toBe(true)
    expect(isAi8Settings({ baseUrl: ' ai8://chat ' })).toBe(true)
    expect(isAi8Settings({ baseUrl: 'https://open.bigmodel.cn/api/paas/v4' })).toBe(false)
  })

  it('returns nokey without a token', async () => {
    const out = await ai8ChatCompletion([{ role: 'user', content: 'hi' }], { apiKey: ' ', model: 'm' })
    expect(out.ok).toBe(false)
    expect(out.hint).toBe('nokey')
  })

  it('probes via getBalance instead of a full chat round', async () => {
    const out = await ai8ChatCompletion([{ role: 'user', content: 'ping' }], { apiKey: 'tk', model: 'm' }, { probe: true })
    expect(out.ok).toBe(true)
    expect(calls.some((c) => c.url.includes('/frequency/balance'))).toBe(true)
    expect(calls.some((c) => c.url.includes('/chat/completions'))).toBe(false)
  })

  it('maps prompts to the site protocol and reuses the session (R193: site-default create body)', async () => {
    const messages = [
      { role: 'system', content: '你是整理助手' },
      { role: 'user', content: '原文' },
    ] as const
    const out = await ai8ChatCompletion([...messages], { apiKey: 'tk', model: 'openai_chat::gpt-5.4' })
    expect(out.ok).toBe(true)
    expect(out.text).toBe('好的') // <think> stripped
    const create = calls.find((c) => c.url.endsWith('/api/chat/session'))
    // R193: contextCount:0 dropped — empirically the site keeps session history
    // either way, and the agent bridge now isolates per conversation instead
    expect(JSON.parse(create?.body ?? '{}')).toEqual({ model: 'openai_chat::gpt-5.4' })
    const chat = JSON.parse(calls.find((c) => c.url.endsWith('/chat/completions'))?.body ?? '{}')
    expect(chat.sessionId).toBe(909)
    expect(chat.text).toBe('原文')
    expect(chat.systemPrompt).toBe('你是整理助手')
    expect('model' in chat).toBe(false) // live-site protocol: model lives on the session
    expect(chat.messages).toBeUndefined()
    // second call reuses the session — no third create
    await ai8ChatCompletion([{ role: 'user', content: '再来' }], { apiKey: 'tk', model: 'openai_chat::gpt-5.4' })
    expect(calls.filter((c) => c.url.endsWith('/api/chat/session')).length).toBe(1)
  })
})
